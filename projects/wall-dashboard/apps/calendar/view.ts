// Agenda rendering shared by the calendar and today apps (browser only).
import { adoptStyle, html, raw } from '#sdk/utils';
import css from './view.css';
import { startOf, type CalendarEvent } from './index.ts';

export const useCalendarStyle = () => adoptStyle('calendar', css);

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

export const dayLabel = (date: Date, locale: string) => {
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (sameDay(date, today)) return 'Heute';
  if (sameDay(date, tomorrow)) return 'Morgen';
  return date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
};

const row = (e: CalendarEvent, locale: string) => {
  const time = e.allDay
    ? 'ganztägig'
    : new Date(e.start).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  return html`<li class="event" style="--event:${e.color}">
    <span class="event-time">${time}</span>
    <span class="event-title">${e.title}</span>
    ${e.location ? raw(html`<span class="event-location">📍 ${e.location}</span>`) : ''}
  </li>`;
};

/** Events grouped under day headings; multi-day all-day events show on the first visible day. */
export const agenda = (events: CalendarEvent[], locale: string, empty = 'Nichts geplant 🎈') => {
  if (!events.length) return html`<p class="ui-dim">${empty}</p>`;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = new Map<string, { date: Date; events: CalendarEvent[] }>();
  for (const e of events) {
    const start = startOf(e);
    const date = start < today ? today : start;
    const key = date.toDateString();
    const day = days.get(key) ?? { date, events: [] };
    day.events.push(e);
    days.set(key, day);
  }
  return [...days.values()]
    .map(
      ({ date, events }) =>
        html`<section class="agenda-day">
          <h2>${dayLabel(date, locale)}</h2>
          <ul>
            ${events.map((e) => raw(row(e, locale)))}
          </ul>
        </section>`,
    )
    .join('');
};
