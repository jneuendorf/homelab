// Checklists through the day (morning, afternoon, evening …), per user. Rows = users whose
// resolved `items` are non-empty, so a routine without items for anyone is skipped that day.
// Done-state lives in the server store (syncs devices).
import { defineApp, type User } from '#sdk';
import type { Days, Time } from '#sdk/utils';
import type { CalendarEvent } from '../calendar/index.ts';
import type { Weather } from '../weather/index.ts';

export type Item = {
  icon: string;
  /** Must be unique per user and routine: it keys the done-state. */
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

export type Routine = {
  label: string;
  icon: string;
  /** No days = every day. */
  days?: Days;
  from: Time;
  /** Default: the next routine's `from` that day, or midnight. Afterwards it is read-only. */
  until?: Time;
  /** Finishing before it adds the `beatDeadline` badge. */
  deadline?: Time;
  items?: Item[] | ((ctx: RoutineCtx) => Item[]);
};

export type RoutineConfig = {
  sound: boolean;
  /** Keyed by id (it keys the done-state); perUser entries merge into these key by key. */
  routines: Record<string, Routine>;
  badges: Partial<Badges> | ((ctx: RoutineCtx) => Partial<Badges>);
};

export const routine = defineApp<RoutineConfig>({
  id: 'routine',
  label: 'Routine',
  icon: '✅',
  defaults: { sound: true, routines: {}, badges: {} },
  ui: () => import('./ui.ts'),
});
