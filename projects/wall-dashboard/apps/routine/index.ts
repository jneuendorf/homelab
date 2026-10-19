// Morning checklist per user. Rows = users whose resolved `items` are non-empty, so parents
// without items simply don't get a row. Done-state lives in the server store (syncs devices).
import { defineApp, type User } from '#sdk';
import type { CalendarEvent } from '../calendar/index.ts';
import type { Weather } from '../weather/index.ts';

export type Item = {
  icon: string;
  /** Must be unique per user: it keys the done-state. */
  label: string;
};

export type Badges = {
  /** First to finish. */
  leader: string;
  /** Finished, not first. */
  done: string;
  /** Appended when finished before the deadline. */
  beatDeadline: string;
};

export type RoutineCtx = {
  user: User;
  date: Date;
  /** 0 = Sun … 6 = Sat */
  dayOfWeek: number;
  /** "HH:mm" */
  time: string;
  /** Today's events: this user's + family-wide ones. */
  calendar: CalendarEvent[];
  weather: Weather | null;
};

export type RoutineConfig = {
  /** "HH:mm", or null for no deadline. */
  deadline: string | null;
  sound: boolean;
  items: Item[] | ((ctx: RoutineCtx) => Item[]);
  badges: Partial<Badges> | ((ctx: RoutineCtx) => Partial<Badges>);
};

export const routine = defineApp<RoutineConfig>({
  id: 'routine',
  label: 'Routine',
  icon: '✅',
  defaults: { deadline: '07:35', sound: true, items: [], badges: {} },
  ui: () => import('./ui.ts'),
});
