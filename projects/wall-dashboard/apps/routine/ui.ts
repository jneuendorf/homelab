import type { Mount, User } from '#sdk';
import { $, adoptStyle, chime, everyMinute, html, pad, raw } from '#sdk/utils';
import { fetchEvents, type CalendarEvent } from '../calendar/index.ts';
import { fetchWeather, type Weather } from '../weather/index.ts';
import type { RoutineConfig, RoutineCtx } from './index.ts';
import {
  dayKey,
  deadlineAt,
  defaultBadges,
  doneCount,
  leaderOf,
  resolve,
  toggle,
  type DayState,
} from './logic.ts';
import css from './ui.css';

export const mount: Mount<RoutineConfig> = (el, ctx) => {
  adoptStyle('routine', css);
  let key = `day:${dayKey()}`;
  let state: DayState = {};
  let calendar: CalendarEvent[] = [];
  let weather: Weather | null = null;

  const rows = () => {
    const now = new Date();
    return (ctx.user ? [ctx.user] : ctx.users)
      .map((user: User) => {
        const config = ctx.configFor(user.id);
        const rctx: RoutineCtx = {
          user,
          date: now,
          dayOfWeek: now.getDay(),
          time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
          calendar: calendar.filter((e) => !e.user || e.user === user.id),
          weather,
        };
        const items = resolve(config.items, rctx);
        const badges = { ...defaultBadges, ...resolve(config.badges, rctx) };
        return { user, config, items, badges };
      })
      .filter((row) => row.items.length);
  };

  const deadlineText = () => {
    const at = deadlineAt(ctx.config.deadline);
    if (at == null) return '';
    const left = Math.round((at - Date.now()) / 60_000);
    return left >= 0
      ? `⏰ noch ${left} min bis ${ctx.config.deadline}`
      : `⏰ ${ctx.config.deadline} vorbei`;
  };

  const render = () => {
    const leader = leaderOf(state);
    el.innerHTML = html`<div class="routine">
      ${rows().map(({ user, config, items, badges }) => {
        const s = state[user.id];
        const at = deadlineAt(config.deadline);
        const badge = s?.completedAt
          ? (user.id === leader ? badges.leader : badges.done) +
            (at != null && s.completedAt <= at ? badges.beatDeadline : '')
          : '';
        return raw(
          html`<div
            class="routine-row ${s?.completedAt ? 'done' : ''}"
            style="--child:${user.color}"
          >
            <div class="routine-label">
              <span class="routine-name">${user.name}</span>
              <span class="routine-progress">${doneCount(items, s)}/${items.length}</span>
            </div>
            <div class="routine-items">
              ${items.map((item) =>
                raw(
                  html`<button
                    class="ui-btn routine-item ${s?.done[item.label] ? 'checked' : ''}"
                    data-user="${user.id}"
                    data-label="${item.label}"
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
      <div class="routine-deadline">${deadlineText()}</div>
    </div>`;
  };

  el.onclick = (event) => {
    const button = (event.target as Element).closest<HTMLElement>('[data-label]');
    const row = rows().find((r) => r.user.id === button?.dataset.user);
    const label = button?.dataset.label;
    if (!label || !row) return;
    const { state: next, change } = toggle(state[row.user.id], label, row.items, Date.now());
    state = { ...state, [row.user.id]: next };
    if (row.config.sound) chime(change === 'completed' ? [523, 659, 784, 1047] : [880]);
    render();
    ctx.store.set(key, state);
  };

  const load = async () => {
    const [saved, events, w] = await Promise.all([
      ctx.store.get<DayState>(key),
      fetchEvents(1),
      fetchWeather(),
    ]);
    calendar = events; // the 1-day window is today only
    weather = w;
    state = saved ?? {};
    render();
  };

  // another screen (or a phone) checked something off
  const follow = (topic: string) =>
    ctx.subscribe(topic, (data) => {
      if (topic !== key) return;
      state = (data as DayState) ?? {};
      render();
    });

  follow(key);
  load();
  const stop = everyMinute(() => {
    const today = `day:${dayKey()}`;
    if (today === key) {
      $(el, '.routine-deadline').textContent = deadlineText();
      return;
    }
    key = today; // midnight: fresh day
    follow(key);
    load();
  });
  return stop;
};
