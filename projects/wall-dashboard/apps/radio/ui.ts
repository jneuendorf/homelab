import type { Mount } from '#sdk';
import { $, adoptStyle, html, raw } from '#sdk/utils';
import type { RadioConfig } from './index.ts';
import type { Station } from './logic.ts';
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

const stopButton = document.createElement('button');
stopButton.className = 'radio-stop ui-btn';
stopButton.onclick = () => stop();

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
  stopButton.textContent = `⏹ ${playing?.icon ?? '📻'}`;
  if (playing && status !== 'error') document.body.append(stopButton);
  else stopButton.remove();
  rerender();
};

const disconnect = () => {
  audio.pause();
  audio.removeAttribute('src');
  audio.load(); // drops the connection; a paused live stream would keep buffering
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

  const render = () => {
    el.innerHTML = html`<div class="radio">
      <div class="radio-grid">
        ${stations.map((s) =>
          raw(
            html`<div class="radio-tile">
              <button class="ui-tint" data-play="${s.id}" aria-pressed="${playing?.id === s.id}">
                <span class="radio-icon">${s.icon}</span>
                <span>${s.label}</span>
                <span class="radio-status">
                  ${playing?.id === s.id
                    ? { idle: '', loading: 'Verbinde …', playing: '🔊', error: '⚠️ nicht erreichbar' }[
                        status
                      ]
                    : ''}
                </span>
              </button>
              ${ctx.admin
                ? raw(
                    html`<button class="ui-chip radio-remove" data-remove="${s.id}" aria-label="${s.label} entfernen">
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
              ⚠️ ${playing?.label} leitet auf eine Adresse weiter, die nicht freigegeben
              ist (welche, zeigt der Netzwerk-Tab der Browser-Entwicklertools). Die Domain-Prüfung ist vereinfacht (nur die übergeordnete Domain der
              Weiterleitung wird freigegeben, siehe <code>wildcard()</code> in
              <code>apps/radio/logic.ts</code>) und ist hier zu streng. Abhilfe: eine andere
              Stream-Adresse des Senders probieren oder <code>wildcard()</code> auf das Paket
              <code>tldts</code> (Public Suffix List) umstellen.
            </p>`,
          )
        : ''}
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
    if (retry && !playing) play(retry);
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
    if (station) return playing?.id === station.id && status !== 'error' ? stop() : play(station);
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

  ctx.subscribe('stations', (data) => {
    stations = data as Station[];
    render();
  });

  rerender = render;
  load();
  return () => {
    rerender = () => {};
  };
};
