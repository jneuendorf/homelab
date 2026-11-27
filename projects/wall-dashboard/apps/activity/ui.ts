import dashboard from '#config';
import type { LogEntry, Mount } from '#sdk';
import { adoptStyle, everyMinute, html, pad, raw } from '#sdk/utils';
import type { ActivityConfig } from './index.ts';
import css from './ui.css';

const hm = (at: number) => {
  const d = new Date(at);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const mount: Mount<ActivityConfig> = (el, ctx) => {
  adoptStyle('activity', css);
  let entries: LogEntry[] = [];
  let filter: string | null = null; // a user id

  const day = (at: number) => {
    const d = new Date(at);
    const today = new Date();
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) {
      return 'Heute';
    }
    if (d.toDateString() === yesterday.toDateString()) {
      return 'Gestern';
    }
    return d.toLocaleDateString(ctx.locale, { weekday: 'long', day: 'numeric', month: 'long' });
  };
  const who = (id: string | null) => dashboard.users.find((u) => u.id === id);
  const app = (id: string) => dashboard.apps.find((a) => a.id === id);

  const render = () => {
    const shown = entries.filter((e) => filter === null || e.user === filter);
    let lastDay = '';
    el.innerHTML = html`<div class="activity">
      <div class="activity-filter">
        <button class="ui-chip" data-filter="" aria-pressed="${filter === null}">Alle</button>
        ${dashboard.users.map((u) =>
          raw(
            html`<button class="ui-chip" data-filter="${u.id}" aria-pressed="${filter === u.id}">
              ${u.avatar ?? ''} ${u.name}
            </button>`,
          ),
        )}
      </div>
      ${shown.length
        ? ''
        : raw(html`<p class="activity-empty">Nichts in den letzten ${ctx.config.days} Tagen.</p>`)}
      <ul>
        ${shown.map((e) => {
          const heading = day(e.at);
          const head = heading === lastDay ? '' : html`<li class="activity-day">${heading}</li>`;
          lastDay = heading;
          const u = who(e.user);
          return raw(
            head +
              html`<li style="--user:${u?.color ?? 'var(--dim)'}">
                <span class="activity-time">${hm(e.at)}</span>
                <span class="activity-who">${u ? `${u.avatar ?? ''} ${u.name}` : '👪 Alle'}</span>
                <span class="activity-app">${app(e.app)?.icon ?? '▫️'}</span>
                <span>${e.text}</span>
              </li>`,
          );
        })}
      </ul>
    </div>`;
  };

  const load = async () => {
    const res = await ctx.api(`log?days=${ctx.config.days}`);
    if (res.ok) {
      entries = await res.json();
    }
    render();
  };

  el.onclick = (event) => {
    const id = (event.target as Element).closest<HTMLElement>('[data-filter]')?.dataset.filter;
    if (id === undefined) {
      return;
    }
    filter = id || null;
    render();
  };

  load();
  return everyMinute(load);
};
