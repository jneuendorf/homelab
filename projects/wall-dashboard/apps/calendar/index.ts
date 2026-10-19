import { defineApp } from '#sdk';

export type Feed = {
  /** ICS URL (https, not webcal). Use secret('NAME') for private feeds. */
  url?: string;
  /** Owner's user id; omit for family-wide feeds (holidays …), shown to everyone. */
  user?: string;
  /** Defaults to the owner's color. */
  color?: string;
};

export type CalendarConfig = { feeds: Feed[]; days: number; refreshMinutes: number };

export type CalendarEvent = {
  title: string;
  /** All-day: "YYYY-MM-DD" (end exclusive). Timed: ISO timestamp. */
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  user: string | null;
  color: string;
};

export const calendar = defineApp<CalendarConfig>({
  id: 'calendar',
  label: 'Kalender',
  icon: '📅',
  defaults: { feeds: [], days: 7, refreshMinutes: 15 },
  ui: () => import('./ui.ts'),
  server: () => import('./server.ts'),
});

/** Events from today on; with a user: theirs + family-wide ones. */
export const fetchEvents = async (days: number, user?: string | null) => {
  const res = await fetch(`/api/calendar/events?days=${days}`).catch(() => null);
  const events: CalendarEvent[] = res?.ok ? await res.json() : [];
  return user ? events.filter((e) => !e.user || e.user === user) : events;
};

/** Local Date for an event's start (all-day dates are local midnight, not UTC). */
export const startOf = (event: CalendarEvent) => {
  if (!event.allDay) return new Date(event.start);
  const [y, m, d] = event.start.split('-').map(Number);
  return new Date(y, m - 1, d);
};
