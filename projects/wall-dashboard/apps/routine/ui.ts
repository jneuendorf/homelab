import type { Mount, User } from '#sdk';
import { $, adoptStyle, chime, dayKey, everyMinute, html, pad, raw } from '#sdk/utils';
import { type CalendarEvent, fetchEvents } from '../calendar/index.ts';
import { fetchWeather, type Weather } from '../weather/index.ts';
import type { RoutineConfig, RoutineCtx } from './index.ts';
import {
  type DayState,
  defaultBadges,
  doneCount,
  focusOf,
  leaderOf,
  phaseOf,
  resolve,
  type Slot,
  slotsFor,
  toggle,
} from './logic.ts';
import css from './ui.css';

/** A routine opened from the strip returns to the current one after this long without touches. */
const snapBackMs = 60_000;

const clock = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const mount: Mount<RoutineConfig> = (el, ctx) => {
  adoptStyle('routine', css);
  let day = dayKey();
  /** Done-state per routine id, for today. */
  let states: Record<string, DayState> = {};
  let calendar: CalendarEvent[] = [];
  let weather: Weather | null = null;
  /** Routine opened from the strip; null = each row shows its user's current one. */
  let picked: string | null = null;
  let snapTimer: ReturnType<typeof setTimeout> | undefined;
  const keyOf = (routine: string) => `day:${day}:${routine}`;

  /** Each user's routines today (users without any are left out). */
  const users = () => {
    const now = new Date();
    return (ctx.user ? [ctx.user] : ctx.users)
      .map((user: User) => {
        const config = ctx.configFor(user.id);
        const rctx: RoutineCtx = {
          user,
          date: now,
          dayOfWeek: now.getDay(),
          time: clock(now.getTime()),
          calendar: calendar.filter((e) => !e.user || e.user === user.id),
          weather,
        };
        const slots = slotsFor(config.routines, now, (r) => resolve(r.items ?? [], rctx));
        const badges = { ...defaultBadges, ...resolve(config.badges, rctx) };
        return { user, config, slots, badges };
      })
      .filter((u) => u.slots.length);
  };

  /** What is on screen: the strip's routines, and one row per user that has the shown one. */
  const view = () => {
    const now = Date.now();
    const all = users();
    // ponytail: a routine with per-user times shows the first user's times in the strip
    const strip = [
      ...new Map(all.flatMap((u) => u.slots).map((slot) => [slot.id, slot])).values(),
    ].sort((a, b) => a.start - b.start);
    if (picked && !strip.some((s) => s.id === picked)) {
      picked = null;
    }
    const rows = all.flatMap((u) => {
      const slot = picked ? u.slots.find((s) => s.id === picked) : focusOf(u.slots, now);
      return slot ? [{ ...u, slot }] : [];
    });
    return { now, all, strip, rows };
  };

  /** Changes when a routine starts or ends, so the minute tick re-renders only then. */
  const phases = () =>
    users()
      .flatMap((u) => u.slots.map((s) => `${u.user.id}:${s.id}:${phaseOf(s, Date.now())}`))
      .join();
  let lastPhases = '';

  const status = (slot: Slot | undefined, now: number) => {
    if (!slot) {
      return '';
    }
    const phase = phaseOf(slot, now);
    if (phase === 'next') {
      return `${slot.icon} ${slot.label} ab ${clock(slot.start)}`;
    }
    if (phase === 'past') {
      return `${slot.icon} ${slot.label} ist vorbei`;
    }
    if (slot.deadline == null) {
      return '';
    }
    const left = Math.round((slot.deadline - now) / 60_000);
    return left >= 0
      ? `⏰ noch ${left} min bis ${clock(slot.deadline)}`
      : `⏰ ${clock(slot.deadline)} vorbei`;
  };

  const render = () => {
    lastPhases = phases();
    const { now, all, strip, rows } = view();
    const shown = new Set(rows.map((r) => r.slot.id));
    el.innerHTML = html`<div class="routine">
      ${strip.length > 1
        ? raw(
            html`<div class="routine-strip">
              ${strip.map((slot) => {
                const phase = phaseOf(slot, now);
                const marks = all
                  .filter((u) => u.slots.some((s) => s.id === slot.id))
                  .map(({ user }) =>
                    raw(
                      html`<span
                        class="rs-mark ${states[slot.id]?.[user.id]?.completedAt ? 'done' : ''}"
                        style="--user:${user.color}"
                      ></span>`,
                    ),
                  );
                return raw(
                  html`<button
                    class="ui-btn routine-chip ${phase} ${shown.has(slot.id) ? 'on' : ''}"
                    data-routine="${slot.id}"
                  >
                    <span>${slot.icon} ${slot.label}</span>
                    ${phase === 'next' ? raw(html`<small>ab ${clock(slot.start)}</small>`) : ''}
                    <span class="rs-marks">${marks}</span>
                  </button>`,
                );
              })}
            </div>`,
          )
        : ''}
      ${rows.map(({ user, slot, badges }) => {
        const state = states[slot.id] ?? {};
        const s = state[user.id];
        const leader = leaderOf(state);
        const open = phaseOf(slot, now) === 'now';
        const badge = s?.completedAt
          ? (user.id === leader ? badges.leader : badges.done) +
            (slot.deadline != null && s.completedAt <= slot.deadline ? badges.beatDeadline : '')
          : '';
        return raw(
          html`<div
            class="routine-row ${s?.completedAt ? 'done' : ''} ${open ? '' : 'closed'}"
            style="--user:${user.color};--n:${slot.items.length}"
          >
            <div class="routine-label">
              <span class="routine-name">${shown.size > 1 ? `${slot.icon} ` : ''}${user.name}</span>
              <span class="routine-progress">${doneCount(slot.items, s)}/${slot.items.length}</span>
            </div>
            <div class="routine-items">
              ${slot.items.map((item) =>
                raw(
                  html`<button
                    class="ui-btn ui-tint routine-item ${s?.done[item.label] ? 'checked' : ''}"
                    data-user="${user.id}"
                    data-label="${item.label}"
                    ${open ? '' : raw('disabled')}
                  >
                    <span class="ri-icon">${item.icon}</span
                    ><span class="ri-label">${item.label}</span>
                  </button>`,
                ),
              )}
            </div>
            <span class="routine-badge">${badge}</span>
          </div>`,
        );
      })}
      <div class="routine-deadline">${status(rows[0]?.slot, now)}</div>
    </div>`;
  };

  const snapBack = () => {
    clearTimeout(snapTimer);
    if (picked) {
      snapTimer = setTimeout(() => {
        picked = null;
        render();
      }, snapBackMs);
    }
  };
  el.onpointerdown = snapBack;

  el.onclick = (event) => {
    const target = event.target as Element;
    const chip = target.closest<HTMLElement>('[data-routine]');
    if (chip) {
      const { now, rows } = view();
      const id = chip.dataset.routine ?? null;
      // tapping the routine that is running anyway = back to normal
      picked = rows.every((r) => r.slot.id === id && phaseOf(r.slot, now) === 'now') ? null : id;
      snapBack();
      render();
      return;
    }
    const button = target.closest<HTMLElement>('[data-label]');
    const row = view().rows.find((r) => r.user.id === button?.dataset.user);
    const label = button?.dataset.label;
    if (!label || !row || phaseOf(row.slot, Date.now()) !== 'now') {
      return;
    }
    const { slot } = row;
    const state = states[slot.id] ?? {};
    const { state: next, change } = toggle(state[row.user.id], label, slot.items, Date.now());
    states = { ...states, [slot.id]: { ...state, [row.user.id]: next } };
    const icon = slot.items.find((item) => item.label === label)?.icon ?? '';
    const forWhom = ctx.user?.id === row.user.id ? '' : ` (für ${row.user.name})`;
    ctx.log(`${next.done[label] ? '☑️' : '↩️'} ${slot.icon} ${icon} ${label}${forWhom}`);
    if (row.config.sound) {
      chime(change === 'completed' ? [523, 659, 784, 1047] : [880]);
    }
    render();
    ctx.store.set(keyOf(slot.id), states[slot.id]);
  };

  /** Ids of every routine any user has (the store keys to load and follow). */
  const ids = () => [
    ...new Set(
      (ctx.user ? [ctx.user] : ctx.users).flatMap((u) => Object.keys(ctx.configFor(u.id).routines)),
    ),
  ];

  const load = async () => {
    const [saved, events, w] = await Promise.all([
      Promise.all(ids().map(async (id) => [id, await ctx.store.get<DayState>(keyOf(id))] as const)),
      fetchEvents(1),
      fetchWeather(),
    ]);
    calendar = events; // the 1-day window is today only
    weather = w;
    states = Object.fromEntries(saved.map(([id, state]) => [id, state ?? {}]));
    render();
  };

  // another screen (or a phone) checked something off
  const follow = () => {
    for (const id of ids()) {
      const key = keyOf(id);
      ctx.subscribe(key, (data) => {
        if (key !== keyOf(id)) {
          return; // yesterday's subscription
        }
        states = { ...states, [id]: (data as DayState) ?? {} };
        render();
      });
    }
  };

  follow();
  load();
  const stop = everyMinute(() => {
    if (dayKey() !== day) {
      day = dayKey(); // midnight: fresh day
      picked = null;
      follow();
      load();
      return;
    }
    if (phases() !== lastPhases) {
      render(); // a routine started or ended
      return;
    }
    $(el, '.routine-deadline').textContent = status(view().rows[0]?.slot, Date.now());
  });
  return () => {
    stop();
    clearTimeout(snapTimer);
  };
};
