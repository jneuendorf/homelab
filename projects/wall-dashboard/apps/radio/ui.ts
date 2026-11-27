import type { Mount } from '#sdk';
import { $, adoptStyle, html, raw } from '#sdk/utils';
import type { RadioConfig } from './index.ts';
import type { Block } from './limits.ts';
import type { Station } from './logic.ts';
import type { LimitsView } from './server.ts';
import css from './ui.css';

// Module state outlives unmount: the radio keeps playing in other apps, and a floating stop
// button on <body> stays reachable from everywhere.
const audio = new Audio();
audio.preload = 'none';
let playing: Station | null = null;
let status: 'idle' | 'loading' | 'playing' | 'error' = 'idle';
/** The CSP still blocks the station after the reload: the wildcard guess was too strict. */
let blocked = false;
let rerender = () => {};
// set by mount (the radio keeps playing after unmount, so these outlive it)
let api: (path: string, init?: RequestInit) => Promise<Response> = fetch;
let user: string | null = null;
let limits: LimitsView | null = null;

const send = (path: string, body = {}) =>
  api(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
/** Takes the server's limits view from any radio response; null if it wasn't one. */
const sync = async (res: Response) => {
  if (!res.headers.get('content-type')?.includes('json')) return null;
  limits = (await res.json()) as LimitsView & { stop?: boolean };
  updateStopButton();
  rerender();
  return limits as LimitsView & { stop?: boolean };
};
/** Minutes until the forced stop, once inside the warning time; else null. */
const warning = () => {
  if (!limits?.stopAt || !playing) return null;
  const left = Math.max(0, Math.ceil((limits.stopAt - Date.now()) / 60_000));
  return left <= limits.warnBefore ? left : null;
};

const stopButton = document.createElement('button');
stopButton.className = 'radio-stop ui-btn';
stopButton.onclick = () => stop();
const updateStopButton = () => {
  const left = warning();
  stopButton.textContent = `⏹ ${playing?.icon ?? '📻'}${left == null ? '' : ` ⏳ ${left} Min`}`;
};

// The server counts listening time from these beats (and stops us when a limit is reached).
const beatMs = 20_000;
let beatTimer: ReturnType<typeof setInterval> | undefined;
const heartbeat = async () => {
  const view = await send('beat')
    .then(sync)
    .catch(() => null);
  if (view?.stop) stop();
};

// Stuck on "Verbinde …" (a stream server hangs without an error): restart from the station's own
// URL, which redirects to a freshly picked server. After 3 tries, give up and show the error.
const retryMs = 10_000;
const maxRetries = 3;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retries = 0;

const setStatus = (next: typeof status) => {
  status = next;
  clearTimeout(retryTimer);
  if (next === 'loading') retryTimer = setTimeout(retry, retryMs);
  if (next === 'error' || next === 'idle') {
    if (beatTimer)
      send('stop')
        .then(sync)
        .catch(() => {});
    clearInterval(beatTimer);
    beatTimer = undefined;
  }
  updateStopButton();
  if (playing && status !== 'error') document.body.append(stopButton);
  else stopButton.remove();
  rerender();
};

const disconnect = () => {
  audio.pause();
  audio.removeAttribute('src');
  audio.load(); // drops the connection; a paused live stream would keep buffering
};
/** A tap: ask the server first (limits), then play. */
const start = async (station: Station) => {
  const view = await send('play', { station: station.id, user }).then(sync);
  if (!view || view.stations[station.id]) return; // blocked: the tile now says why
  play(station);
  clearInterval(beatTimer);
  beatTimer = setInterval(heartbeat, beatMs);
};
const play = (station: Station, isRetry = false) => {
  playing = station;
  blocked = false;
  if (!isRetry) retries = 0;
  audio.src = station.url;
  setStatus('loading');
  audio.play().catch(() => {}); // failures arrive as an 'error' event
};
const retry = () => {
  if (!playing) return;
  if (++retries <= maxRetries) return play(playing, true);
  disconnect();
  setStatus('error');
};
const stop = () => {
  disconnect();
  playing = null;
  setStatus('idle');
};
audio.onplaying = () => {
  retries = 0;
  sessionStorage.removeItem('radio:csp');
  setStatus('playing');
};
audio.onwaiting = () => setStatus('loading');
audio.onerror = () => {
  if (playing && audio.getAttribute('src')) setStatus('error');
};

// The CSP is fixed at page load; a station added since then (here or on another screen) is
// blocked until a reload picks up the new policy. Reload once per station; blocked again means a
// redirect went somewhere wildcard() didn't foresee.
document.addEventListener('securitypolicyviolation', (event) => {
  if (event.effectiveDirective !== 'media-src' || !playing) return;
  if (sessionStorage.getItem('radio:csp') !== playing.id) {
    sessionStorage.setItem('radio:csp', playing.id);
    return location.reload();
  }
  sessionStorage.removeItem('radio:csp');
  blocked = true; // event.blockedURI is the pre-redirect URL, so it can't name the culprit
  setStatus('error');
});

export const mount: Mount<RadioConfig> = (el, ctx) => {
  adoptStyle('radio', css);
  let stations: Station[] = [];
  let message = '';
  let now = { id: '', title: '' }; // now-playing title of the playing station

  api = ctx.api;
  user = ctx.user?.id ?? null;
  const loadLimits = () => ctx.api('limits').then(sync);

  const refresh = async () => {
    loadLimits(); // windows open and close with the clock
    const id = playing?.id;
    if (!id || status !== 'playing') return;
    const res = await ctx.api(`now?id=${encodeURIComponent(id)}`);
    if (!res.ok || playing?.id !== id) return;
    now = { id, title: ((await res.json()) as { title: string }).title };
    render();
  };
  const timer = setInterval(refresh, 30_000);

  const hm = (ms: number) =>
    new Date(ms).toLocaleTimeString(ctx.locale, { hour: '2-digit', minute: '2-digit' });
  const reasonText = (block: Block) => {
    if (block.reason === 'pause') return `😴 Pause bis ${hm(block.until ?? 0)}`;
    if (block.reason === 'day') return '⏳ morgen wieder';
    if (block.until == null) return '🔒';
    const sameDay = new Date(block.until).toDateString() === new Date().toDateString();
    const day = new Date(block.until).toLocaleDateString(ctx.locale, { weekday: 'short' });
    return `🔒 ${sameDay ? 'ab' : day} ${hm(block.until)}`;
  };
  const summary = () => {
    if (!limits?.configured) return '';
    if (limits.free) return '🎉 Heute ohne Limit';
    if (limits.blocked) return reasonText(limits.blocked);
    if (limits.leftToday != null)
      return `⏳ noch ${Math.ceil(limits.leftToday / 60_000)} Min heute`;
    return '';
  };
  const statusText = (s: Station) => {
    const block = limits?.stations[s.id];
    if (playing?.id !== s.id) return block ? reasonText(block) : '';
    const left = warning();
    if (status === 'playing' && left != null) return `⏳ noch ${left} Min`;
    return { idle: '', loading: 'Verbinde …', playing: '🔊', error: '⚠️ nicht erreichbar' }[status];
  };
  const name = (id: string | null) => ctx.users.find((u) => u.id === id)?.name ?? 'Alle';
  const adminLimits = () =>
    html`<div class="radio-limits">
      <button class="ui-btn" data-limit="extend">＋15 Min</button>
      <button class="ui-btn" data-limit="free">
        ${limits?.free ? 'Limits wieder an' : 'Heute ohne Limit'}
      </button>
      <ul class="radio-log">
        ${[...(limits?.log ?? [])]
          .reverse()
          .map((e) =>
            raw(
              html`<li>
                ${hm(e.at)} · ${name(e.user)} ·
                ${stations.find((s) => s.id === e.station)?.icon ?? '📻'}
                ${Math.round(e.ms / 60_000)} Min
              </li>`,
            ),
          )}
      </ul>
    </div>`;

  const render = () => {
    if (status === 'playing' && playing && now.id !== playing.id) {
      now = { id: playing.id, title: '' };
      refresh();
    }
    el.innerHTML = html`<div class="radio">
      <p class="radio-summary">${summary()}</p>
      <div class="radio-grid">
        ${stations.map((s) =>
          raw(
            html`<div class="radio-tile">
              <button
                class="ui-tint"
                data-play="${s.id}"
                aria-pressed="${playing?.id === s.id}"
                ${playing?.id !== s.id && limits?.stations[s.id] ? raw('disabled') : ''}
              >
                <span class="radio-icon">${s.icon}</span>
                <span>${s.label}</span>
                <span class="radio-status">${statusText(s)}</span>
                ${playing?.id === s.id && status === 'playing' && now.id === s.id && now.title
                  ? raw(html`<span class="radio-now">${now.title}</span>`)
                  : ''}
              </button>
              ${ctx.admin
                ? raw(
                    html`<button
                      class="ui-chip radio-remove"
                      data-remove="${s.id}"
                      aria-label="${s.label} entfernen"
                    >
                      ✕
                    </button>`,
                  )
                : ''}
            </div>`,
          ),
        )}
      </div>
      ${ctx.admin && blocked && status === 'error'
        ? raw(
            html`<p class="radio-message">
              ⚠️ ${playing?.label} leitet auf eine Adresse weiter, die nicht freigegeben ist
              (welche, zeigt der Netzwerk-Tab der Browser-Entwicklertools). Die Domain-Prüfung ist
              vereinfacht (nur die übergeordnete Domain der Weiterleitung wird freigegeben, siehe
              <code>wildcard()</code> in <code>apps/radio/logic.ts</code>) und ist hier zu streng.
              Abhilfe: eine andere Stream-Adresse des Senders probieren oder
              <code>wildcard()</code> auf das Paket <code>tldts</code> (Public Suffix List)
              umstellen.
            </p>`,
          )
        : ''}
      ${ctx.admin && limits?.configured ? raw(adminLimits()) : ''}
      ${ctx.admin
        ? raw(
            html`<form class="radio-add">
              <input class="ui-input radio-add-icon" name="icon" maxlength="8" placeholder="📻" />
              <input class="ui-input" name="label" maxlength="40" required placeholder="Name" />
              <input
                class="ui-input radio-add-url"
                name="url"
                type="url"
                required
                pattern="https://.*"
                placeholder="https://…/stream.mp3"
              />
              <button class="ui-btn ui-btn--primary">＋</button>
              <p class="radio-message">${message}</p>
            </form>`,
          )
        : ''}
    </div>`;
  };

  const load = async () => {
    const res = await ctx.api('stations');
    if (res.ok) stations = await res.json();
    // after a CSP reload: retry the blocked station (may still need a tap if autoplay is off)
    const retry = stations.find((s) => s.id === sessionStorage.getItem('radio:csp'));
    if (retry && !playing) await start(retry);
    render();
  };

  const post = async (path: string, body: unknown) => {
    const res = await ctx.api(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok ? '' : await res.text();
  };

  el.onclick = (event) => {
    const target = (event.target as Element).closest<HTMLElement>('button');
    const station = stations.find((s) => s.id === target?.dataset.play);
    if (station) return playing?.id === station.id && status !== 'error' ? stop() : start(station);
    if (target?.dataset.limit) return send(target.dataset.limit).then(sync);
    const removeId = target?.dataset.remove;
    if (removeId && confirm('Sender entfernen?')) {
      if (playing?.id === removeId) stop();
      post('remove', { id: removeId });
    }
  };

  el.onsubmit = async (event) => {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const button = $<HTMLButtonElement>(form, 'button');
    button.disabled = true;
    $(form, '.radio-message').textContent = 'Prüfe Sender …';
    message = await post('add', Object.fromEntries(new FormData(form)));
    if (message) {
      button.disabled = false;
      $(form, '.radio-message').textContent = message;
    } // success: the 'stations' push re-renders with an empty form
  };

  ctx.subscribe('usage', loadLimits);
  ctx.subscribe('stations', (data) => {
    stations = data as Station[];
    render();
  });

  rerender = render;
  load();
  loadLimits();
  return () => {
    rerender = () => {};
    clearInterval(timer);
  };
};
