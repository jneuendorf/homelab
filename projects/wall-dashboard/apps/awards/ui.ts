import type { Mount, User } from '#sdk';
import { $, adoptStyle, chime, everyMinute, html, raw } from '#sdk/utils';
import { dayKey } from '../routine/logic.ts';
import type { AwardsConfig } from './index.ts';
import {
  addDays,
  type Checkpoint,
  type Counts,
  daysBetween,
  emptyState,
  FAMILY,
  type Goal,
  type Mission,
  progress,
  type State,
  weekOf,
} from './logic.ts';
import css from './ui.css';

// Parent mode locks itself again; the PIN lives only in this closure, never in storage.
const unlockMs = 5 * 60_000;
const countsLabel: Record<Counts, string> = {
  ich: '🙋 ich',
  beide: '🙋+🏠 beide',
  familie: '🏠 Familie',
};
const party = {
  star: { pieces: 8, ms: 1800, notes: [880, 1175] },
  checkpoint: { pieces: 24, ms: 3500, notes: [523, 659, 784] },
  goal: { pieces: 60, ms: 6000, notes: [523, 659, 784, 1047, 1319] },
};
type Level = keyof typeof party;

export const mount: Mount<AwardsConfig> = (el, ctx) => {
  adoptStyle('awards', css);
  el.innerHTML = '<div class="aw"></div><dialog class="ui-dialog aw-dialog"></dialog>';
  const main = $(el, '.aw');
  const dialog = $<HTMLDialogElement>(el, '.aw-dialog');
  let state: State = emptyState([]);
  let today = dayKey();
  let pin: string | null = null;
  let entry = ''; // keypad input
  let picking: string | null = null; // mission waiting for "who?" in the family view
  let earnedBefore: Map<string, number> | null = null;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (ms: number, fn: () => void) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
    return t;
  };
  let lockTimer: ReturnType<typeof setTimeout> | undefined;

  const family: User = { id: FAMILY, name: 'Familie', color: '#ffcc33', avatar: '🏠' };
  const who = (id: string | null) =>
    id === FAMILY || id === null ? family : ctx.users.find((u) => u.id === id);
  const owners = () => [...ctx.users, family];
  const fmt = (day: string) =>
    new Date(`${day}T12:00`).toLocaleDateString(ctx.locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'numeric',
    });
  const visibleGoals = () =>
    state.goals
      .filter((g) => !ctx.user || g.owner === ctx.user.id || g.owner === FAMILY)
      .sort(
        (a, b) =>
          owners().findIndex((u) => u.id === a.owner) - owners().findIndex((u) => u.id === b.owner),
      );

  const post = async (action: string, body: unknown) => {
    const res = await ctx.api(action, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(pin ? { 'x-pin': pin } : {}) },
      body: JSON.stringify(body),
    });
    if (res.status === 403) lock();
    return res;
  };

  const lock = () => {
    pin = null;
    clearTimeout(lockTimer);
    render();
  };

  // ── main view ────────────────────────────────────────────────────────────────────────────────

  const track = (goal: Goal) => {
    const owner = who(goal.owner);
    if (!owner) return '';
    const p = progress(goal, state.stars, today);
    const pct = (n: number) => Math.min(100, (n / goal.target) * 100);
    const next = goal.checkpoints.find((c) => c.at > p.earned) ?? {
      ...goal.reward,
      at: goal.target,
    };
    const left = daysBetween(today, goal.end);
    const status = p.reached
      ? `🏆 geschafft: ${goal.reward.icon} ${goal.reward.label}`
      : p.ended
        ? '⌛ Zeit vorbei'
        : `${next.icon} ${next.label} in ${next.at - p.earned} ⭐ · ${left ? `noch ${left} Tage` : 'letzter Tag'}`;
    return raw(
      html`<div class="aw-track ${p.reached ? 'reached' : ''}" style="--child:${owner.color}">
        <div class="aw-who">
          <span class="aw-avatar">${owner.avatar ?? ''}</span>${owner.name}
          ${p.streak > 1
            ? raw(html`<span class="aw-streak" title="Tage am Stück">🔥${p.streak}</span>`)
            : ''}
        </div>
        <div class="aw-lane">
          <div class="aw-fill" style="width:${pct(p.earned)}%"></div>
          ${goal.checkpoints.map((c) =>
            raw(
              html`<span
                class="aw-planet ${p.earned >= c.at ? 'got' : ''}"
                style="left:${pct(c.at)}%"
                >${c.icon}<small>${c.at}</small></span
              >`,
            ),
          )}
          <span class="aw-planet aw-goal ${p.reached ? 'got' : ''}" style="left:100%"
            >${goal.reward.icon}<small>${goal.target}</small></span
          >
          <span class="aw-rocket" style="left:${pct(p.earned)}%">🚀</span>
        </div>
        <div class="aw-meta"><b>${p.earned}</b>/${goal.target} ⭐ · ${status}</div>
      </div>`,
    );
  };

  const missions = () =>
    raw(
      html`<div class="aw-missions">
          ${state.missions.map((m) =>
            raw(
              html`<button
                class="ui-btn aw-mission ${picking === m.id ? 'picking' : ''}"
                data-mission="${m.id}"
              >
                <span class="aw-icon">${m.icon}</span><span>${m.label}</span>
                <small>${'⭐'.repeat(m.stars)}${m.counts === 'ich' ? '' : ' 🏠'}</small>
              </button>`,
            ),
          )}
        </div>
        ${picking
          ? raw(
              html`<div class="aw-pick">
                Wer war's?
                ${ctx.users.map((u) =>
                  raw(
                    html`<button class="ui-btn" data-claim="${u.id}" style="--child:${u.color}">
                      ${u.avatar ?? ''} ${u.name}
                    </button>`,
                  ),
                )}
                <button class="ui-btn" data-claim="">✕</button>
              </div>`,
            )
          : ''}`,
    );

  const pending = () => {
    const list = state.stars.filter((s) => !s.confirmed && (!ctx.user || s.user === ctx.user.id));
    if (!list.length) return '';
    return raw(
      html`<div class="aw-pending">
        <span class="ui-dim">${pin ? 'Bestätigen:' : '⏳ wartet auf Eltern:'}</span>
        ${list.map((s) =>
          raw(
            html`<span class="ui-chip aw-chip" style="--child:${who(s.user)?.color ?? '#999'}">
              ${who(s.user)?.avatar ?? ''} ${s.icon} ${s.label} +${s.stars}
              ${pin ? raw(html`<button class="ui-btn" data-confirm="${s.id}">✓</button>`) : ''}
              <button class="ui-btn" data-drop="${s.id}">✕</button>
            </span>`,
          ),
        )}
        ${pin && list.length > 1
          ? raw(html`<button class="ui-btn" data-confirm-all>✓ alle</button>`)
          : ''}
      </div>`,
    );
  };

  const week = (user: User) => {
    const days = weekOf(today);
    const mine = state.stars.filter((s) => s.user === user.id && days.includes(s.day));
    const labels = [
      ...new Set([...state.missions.map((m) => m.label), ...mine.map((s) => s.label)]),
    ];
    const rows = labels
      .map((label) => ({
        icon: state.missions.find((m) => m.label === label)?.icon ?? '🌟',
        label,
        cells: days.map((day) => mine.filter((s) => s.label === label && s.day === day)),
      }))
      .filter(
        (row) =>
          row.cells.some((c) => c.length) || state.missions.some((m) => m.label === row.label),
      );
    return raw(
      html`<table class="aw-week">
        <tr>
          <th></th>
          ${days.map((d) =>
            raw(html`<th class="${d === today ? 'today' : ''}">${fmt(d).split(',')[0]}</th>`),
          )}
        </tr>
        ${rows.map((row) =>
          raw(
            html`<tr>
              <th>${row.icon} ${row.label}</th>
              ${row.cells.map((stars, i) =>
                raw(
                  html`<td class="${days[i] === today ? 'today' : ''}">
                    ${stars.map((s) =>
                      s.confirmed
                        ? '⭐'.repeat(s.stars)
                        : raw(html`<span class="ui-dim">${'☆'.repeat(s.stars)}</span>`),
                    )}
                  </td>`,
                ),
              )}
            </tr>`,
          ),
        )}
      </table>`,
    );
  };

  const parentBar = () =>
    raw(
      html`<div class="aw-bar">
        <button class="ui-chip" data-open="trophies">🏆 Trophäen</button>
        ${pin
          ? raw(
              html`<button class="ui-chip" data-open="bonus">🌟 Bonus</button>
                <button class="ui-chip" data-open="goal">🎯 Ziele</button>
                <button class="ui-chip" data-open="missions">📝 Missionen</button>
                <button class="ui-chip" data-lock>🔓 sperren</button>`,
            )
          : raw(html`<button class="ui-chip" data-open="keypad">🔒 Eltern</button>`)}
      </div>`,
    );

  const render = () => {
    const goals = visibleGoals();
    main.innerHTML = html`
      ${goals.length
        ? goals.map(track)
        : raw(html`<p class="ui-dim">Noch kein Ziel — Eltern: 🔒 → 🎯 Ziele.</p>`)}
      ${missions()} ${pending()} ${ctx.user ? week(ctx.user) : ''} ${parentBar()}
    `;
  };

  // ── celebrations: DOM nodes that remove themselves; nothing animates at rest ───────────────

  const celebrate = (level: Level, message: string) => {
    const { pieces, ms, notes } = party[level];
    if (ctx.config.sound) chime(notes);
    const layer = document.createElement('div');
    layer.className = `aw-party ${level}`;
    layer.innerHTML =
      (level === 'star' ? '' : html`<div class="aw-banner">${message}</div>`) +
      Array.from({ length: pieces }, () => {
        const angle = Math.random() * Math.PI * 2;
        const dist = 20 + Math.random() * (level === 'goal' ? 60 : 30);
        const emoji = ['⭐', '✨', '🌟', level === 'goal' ? '🎉' : '💫'][
          Math.floor(Math.random() * 4)
        ];
        return `<span style="--dx:${Math.cos(angle) * dist}vmin;--dy:${Math.sin(angle) * dist}vmin;--ms:${ms}ms">${emoji}</span>`;
      }).join('');
    el.append(layer);
    later(ms, () => layer.remove());
  };

  const update = (next: State) => {
    state = next;
    const earned = new Map(
      state.goals.map((g) => [`${g.owner}:${g.start}`, progress(g, state.stars, today).earned]),
    );
    const order: Level[] = ['star', 'checkpoint', 'goal'];
    let best: { level: Level; message: string } | null = null;
    for (const goal of state.goals) {
      const before = earnedBefore?.get(`${goal.owner}:${goal.start}`);
      const now = earned.get(`${goal.owner}:${goal.start}`) ?? 0;
      if (before === undefined || now <= before) continue;
      const name = who(goal.owner)?.name ?? '';
      const crossed = goal.checkpoints.find((c) => before < c.at && now >= c.at);
      const hit: { level: Level; message: string } =
        before < goal.target && now >= goal.target
          ? {
              level: 'goal',
              message: `🎉 ${name}: Ziel erreicht! ${goal.reward.icon} ${goal.reward.label}`,
            }
          : crossed
            ? { level: 'checkpoint', message: `${name}: ${crossed.icon} ${crossed.label}!` }
            : { level: 'star', message: '' };
      if (!best || order.indexOf(hit.level) > order.indexOf(best.level)) best = hit;
    }
    earnedBefore = earned;
    render();
    if (best) celebrate(best.level, best.message);
  };

  // ── dialogs ──────────────────────────────────────────────────────────────────────────────────

  const ownerOptions = (selected: string) =>
    owners().map((u) =>
      raw(
        html`<option value="${u.id}" ${u.id === selected ? 'selected' : ''}>
          ${u.avatar ?? ''} ${u.name}
        </option>`,
      ),
    );

  const checkpointRow = (c?: Checkpoint) =>
    html`<div class="aw-row">
      <input
        class="ui-input"
        name="cp-at"
        type="number"
        min="1"
        placeholder="⭐"
        value="${c?.at ?? ''}"
      />
      <input class="ui-input" name="cp-icon" placeholder="🎁" value="${c?.icon ?? ''}" />
      <input class="ui-input" name="cp-label" placeholder="Belohnung" value="${c?.label ?? ''}" />
      <button class="ui-btn" type="button" data-remove-row>✕</button>
    </div>`;

  const missionRow = (m?: Mission) =>
    html`<div class="aw-row">
      <input class="ui-input" name="m-id" type="hidden" value="${m?.id ?? ''}" />
      <input class="ui-input" name="m-icon" placeholder="🧹" value="${m?.icon ?? ''}" required />
      <input
        class="ui-input"
        name="m-label"
        placeholder="Mission"
        value="${m?.label ?? ''}"
        required
      />
      <input
        class="ui-input"
        name="m-stars"
        type="number"
        min="1"
        max="5"
        value="${m?.stars ?? 1}"
      />
      <select class="ui-input" name="m-counts">
        ${(Object.keys(countsLabel) as Counts[]).map((c) =>
          raw(
            html`<option value="${c}" ${c === (m?.counts ?? 'ich') ? 'selected' : ''}>
              ${countsLabel[c]}
            </option>`,
          ),
        )}
      </select>
      <button class="ui-btn" type="button" data-remove-row>✕</button>
    </div>`;

  const freshGoal = (owner: string): Goal => ({
    owner,
    target: 30,
    start: today,
    end: addDays(today, 6),
    reward: { icon: '🍦', label: 'Eis essen' },
    checkpoints: [],
    streak: null,
  });
  const activeGoal = (owner: string) => {
    const goal = state.goals.find((g) => g.owner === owner);
    if (!goal) return null;
    const p = progress(goal, state.stars, today);
    return p.reached || p.ended ? null : goal;
  };
  /** The owner's last goal (active or archived), moved to start today with the same length. */
  const previousGoal = (owner: string): Goal | null => {
    const last =
      state.goals.find((g) => g.owner === owner) ?? state.history.find((g) => g.owner === owner);
    if (!last) return null;
    const { target, reward, checkpoints, streak } = last;
    const end = addDays(today, daysBetween(last.start, last.end));
    return { owner, target, reward, checkpoints, streak, start: today, end };
  };

  const goalForm = (goal: Goal) => {
    const editing = activeGoal(goal.owner) !== null;
    return html`<form data-form="goal">
      <h2>🎯 ${editing ? 'Ziel ändern' : 'Neues Ziel'}</h2>
      <label
        >Für
        <select class="ui-input" name="owner">
          ${ownerOptions(goal.owner)}
        </select></label
      >
      <label
        >Ziel
        <input
          class="ui-input"
          name="target"
          type="number"
          min="1"
          max="1000"
          value="${goal.target}"
          required
        />
        ⭐</label
      >
      <label
        >von <input class="ui-input" name="start" type="date" value="${goal.start}" required
      /></label>
      <label
        >bis <input class="ui-input" name="end" type="date" value="${goal.end}" required />
        <button class="ui-btn" type="button" data-span="7">1 Woche</button>
        <button class="ui-btn" type="button" data-span="14">2 Wochen</button>
        <button class="ui-btn" type="button" data-span="30">1 Monat</button>
      </label>
      <label
        >Belohnung
        <input class="ui-input aw-emoji" name="r-icon" value="${goal.reward.icon}" required />
        <input class="ui-input" name="r-label" value="${goal.reward.label}" required
      /></label>
      <fieldset>
        <legend>Etappen (Planeten unterwegs)</legend>
        <div data-rows>${goal.checkpoints.map((c) => raw(checkpointRow(c)))}</div>
        <button class="ui-btn" type="button" data-add="checkpoint">＋ Etappe</button>
      </fieldset>
      <label
        >Serie: alle
        <input
          class="ui-input"
          name="s-days"
          type="number"
          min="1"
          max="60"
          value="${goal.streak?.days ?? ''}"
          placeholder="–"
        />
        Tage am Stück → +<input
          class="ui-input"
          name="s-bonus"
          type="number"
          min="1"
          max="50"
          value="${goal.streak?.bonus ?? ''}"
          placeholder="–"
        />
        ⭐</label
      >
      <footer>
        <button class="ui-btn" type="button" data-reuse>↺ Wie letztes Ziel</button>
        <button class="ui-btn" type="button" data-close>Abbrechen</button>
        <button class="ui-btn ui-btn--primary">${editing ? 'Speichern' : 'Starten'}</button>
      </footer>
    </form>`;
  };

  const dialogs: Record<string, () => string> = {
    keypad: () =>
      html`<div class="aw-keypad">
        <div class="aw-entry">${'●'.repeat(entry.length) || '•••'}</div>
        ${['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'].map((k) =>
          raw(html`<button class="ui-btn" data-key="${k}">${k}</button>`),
        )}
        <button class="ui-btn aw-wide" data-close>Abbrechen</button>
      </div>`,
    bonus: () =>
      html`<form data-form="bonus">
        <h2>🌟 Bonus-Sterne</h2>
        <label
          >Für
          <select class="ui-input" name="owner">
            ${ownerOptions(ctx.user?.id ?? ctx.users[0]?.id ?? FAMILY)}
          </select></label
        >
        <label
          >Sterne
          <input class="ui-input" name="stars" type="number" min="1" max="20" value="1" required
        /></label>
        <label>Wofür <input class="ui-input" name="label" value="Anderes" required /></label>
        <footer>
          <button class="ui-btn" type="button" data-close>Abbrechen</button
          ><button class="ui-btn ui-btn--primary">Geben</button>
        </footer>
      </form>`,
    goal: () => {
      const owner = ctx.user?.id ?? ctx.users[0]?.id ?? FAMILY;
      return goalForm(activeGoal(owner) ?? freshGoal(owner));
    },
    missions: () =>
      html`<form data-form="missions">
        <h2>📝 Missionen</h2>
        <p class="ui-dim">
          🙋 ich = nur für mich · 🙋+🏠 beide = für mich und das Familienziel · 🏠 Familie = nur
          Familienziel
        </p>
        <div data-rows>${state.missions.map((m) => raw(missionRow(m)))}</div>
        <button class="ui-btn" type="button" data-add="mission">＋ Mission</button>
        <footer>
          <button class="ui-btn" type="button" data-close>Abbrechen</button
          ><button class="ui-btn ui-btn--primary">Speichern</button>
        </footer>
      </form>`,
    trophies: () =>
      html`<div>
        <h2>🏆 Trophäen</h2>
        ${state.history.length
          ? state.history.map((t) =>
              raw(
                html`<div class="aw-trophy ${t.reached ? '' : 'ui-dim'}">
                  <span class="aw-icon">${t.reached ? t.reward.icon : '⌛'}</span>
                  ${who(t.owner)?.avatar ?? ''} ${who(t.owner)?.name ?? ''}: ${t.reward.label}
                  <small>${t.earned}/${t.target} ⭐ · ${fmt(t.start)} – ${fmt(t.end)}</small>
                </div>`,
              ),
            )
          : raw(html`<p class="ui-dim">Noch keine — bald!</p>`)}
        <footer><button class="ui-btn" data-close>Schließen</button></footer>
      </div>`,
  };

  const open = (name: string, content = dialogs[name]()) => {
    dialog.innerHTML = content;
    if (!dialog.open) dialog.showModal();
  };

  const submitKeypad = async () => {
    pin = entry;
    entry = '';
    const res = await post('unlock', {});
    if (!res.ok) {
      pin = null;
      $(dialog, '.aw-entry').textContent = res.status === 403 ? `✕ ${await res.text()}` : '✕';
      return;
    }
    dialog.close();
    clearTimeout(lockTimer);
    lockTimer = setTimeout(lock, unlockMs);
    render();
  };

  const readGoal = (form: FormData): Goal => {
    const s = (name: string) => String(form.get(name) ?? '').trim();
    const n = (name: string) => Number(form.get(name));
    const ats = form.getAll('cp-at');
    const icons = form.getAll('cp-icon');
    const labels = form.getAll('cp-label');
    return {
      owner: s('owner'),
      target: n('target'),
      start: s('start'),
      end: s('end'),
      reward: { icon: s('r-icon'), label: s('r-label') },
      checkpoints: labels.flatMap((label, i) =>
        String(label).trim()
          ? [
              {
                at: Number(ats[i]),
                icon: String(icons[i]).trim() || '🎁',
                label: String(label).trim(),
              },
            ]
          : [],
      ),
      streak: s('s-days') && s('s-bonus') ? { days: n('s-days'), bonus: n('s-bonus') } : null,
    };
  };

  dialog.onsubmit = async (event) => {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const data = new FormData(form);
    const kind = form.dataset.form;
    let res: Response | undefined;
    if (kind === 'bonus')
      res = await post('bonus', {
        user: data.get('owner'),
        stars: Number(data.get('stars')),
        label: String(data.get('label')),
        day: today,
      });
    if (kind === 'goal') {
      const goal = readGoal(data);
      // a running goal is edited in place; a finished one goes to the trophy shelf
      const archive = state.goals.some((g) => g.owner === goal.owner) && !activeGoal(goal.owner);
      res = await post('goal', { goal, archive, today });
    }
    if (kind === 'missions') {
      const icons = data.getAll('m-icon');
      const labels = data.getAll('m-label');
      const stars = data.getAll('m-stars');
      const counts = data.getAll('m-counts');
      const missions = data.getAll('m-id').map((id, i) => ({
        id: String(id) || undefined,
        icon: String(icons[i]),
        label: String(labels[i]),
        stars: Number(stars[i]),
        counts: String(counts[i]),
      }));
      res = await post('missions', { missions });
    }
    if (res?.ok) dialog.close();
    else if (res) alert(await res.text());
  };

  dialog.onclick = (event) => {
    const target = event.target as HTMLElement;
    const d = target.closest<HTMLElement>('button')?.dataset;
    if (!d) return;
    if (d.close !== undefined) dialog.close();
    if (d.key) {
      if (d.key === 'OK') return submitKeypad();
      entry = d.key === '⌫' ? entry.slice(0, -1) : (entry + d.key).slice(0, 8);
      $(dialog, '.aw-entry').textContent = '●'.repeat(entry.length) || '•••';
    }
    if (d.removeRow !== undefined) target.closest('.aw-row')?.remove();
    if (d.add)
      $(dialog, '[data-rows]').insertAdjacentHTML(
        'beforeend',
        d.add === 'mission' ? missionRow() : checkpointRow(),
      );
    const form = target.closest('form');
    if (d.span && form) {
      const start = form.elements.namedItem('start') as HTMLInputElement;
      (form.elements.namedItem('end') as HTMLInputElement).value = addDays(
        start.value,
        Number(d.span) - 1,
      );
    }
    if (d.reuse !== undefined && form) {
      const owner = (form.elements.namedItem('owner') as HTMLSelectElement).value;
      const previous = previousGoal(owner);
      if (previous) open('goal', goalForm(previous));
    }
  };
  // switching the owner loads that owner's running goal (or a fresh one)
  dialog.onchange = (event) => {
    const target = event.target as HTMLSelectElement;
    if (target.name !== 'owner' || target.form?.dataset.form !== 'goal') return;
    open('goal', goalForm(activeGoal(target.value) ?? freshGoal(target.value)));
  };

  main.onclick = (event) => {
    const d = (event.target as Element).closest<HTMLElement>('button')?.dataset;
    if (!d) return;
    if (d.mission) {
      if (ctx.user) post('claim', { user: ctx.user.id, mission: d.mission, day: today });
      else {
        picking = picking === d.mission ? null : d.mission;
        render();
      }
      if (ctx.config.sound && ctx.user) chime([660]);
    }
    if (d.claim !== undefined) {
      if (d.claim && picking) {
        post('claim', { user: d.claim, mission: picking, day: today });
        if (ctx.config.sound) chime([660]);
      }
      picking = null;
      render();
    }
    if (d.confirm) post('confirm', { ids: [d.confirm] });
    if (d.confirmAll !== undefined)
      post('confirm', {
        ids: state.stars.filter((s) => !s.confirmed).map((s) => s.id),
      });
    if (d.drop) post(pin ? 'remove' : 'withdraw', { id: d.drop });
    if (d.lock !== undefined) lock();
    if (d.open) {
      entry = '';
      open(d.open);
    }
  };

  ctx.subscribe('state', (data) => update(data as State));
  ctx.api('state').then(async (res) => update(await res.json()));
  const stop = everyMinute(() => {
    if (dayKey() === today) return;
    today = dayKey(); // midnight: new column, maybe ended goals
    render();
  });
  return () => {
    stop();
    clearTimeout(lockTimer);
    for (const t of timers) clearTimeout(t);
    if (dialog.open) dialog.close();
  };
};
