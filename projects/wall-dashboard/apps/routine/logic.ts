// Pure routine rules (tested without a browser).
import { dayMatches, timeAt } from '#sdk/utils';
import type { Badges, Item, Routine } from './index.ts';

export type UserState = { done: Record<string, true>; completedAt?: number | null };
export type DayState = Record<string, UserState>;

export const defaultBadges: Badges = { leader: '🏆', done: '⭐', beatDeadline: '✨' };

export const resolve = <T, C>(value: T | ((ctx: C) => T), ctx: C): T =>
  typeof value === 'function' ? (value as (ctx: C) => T)(ctx) : value;

export const leaderOf = (state: DayState) =>
  Object.entries(state)
    .flatMap(([id, s]) => (s.completedAt ? [{ id, at: s.completedAt }] : []))
    .sort((a, b) => a.at - b.at)[0]?.id ?? null;

/** One routine of one user on one day, with its times in ms. */
export type Slot = {
  id: string;
  label: string;
  icon: string;
  start: number;
  end: number;
  deadline: number | null;
  items: Item[];
};

/** The routines on `day` in time order, without those whose `items` resolve to none. Each ends
 *  at its `until`, else at the next routine's start (with or without items), else at midnight. */
export const slotsFor = (
  routines: Record<string, Routine>,
  day: Date,
  itemsOf: (routine: Routine) => Item[],
): Slot[] => {
  const today = Object.entries(routines)
    .filter(([, r]) => r.from && dayMatches(r.days, day.getDay()))
    .map(([id, r]) => ({ id, r, start: timeAt(r.from, day) }))
    .sort((a, b) => a.start - b.start);
  const midnight = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
  return today
    .map(({ id, r, start }, i) => ({
      id,
      label: r.label ?? id,
      icon: r.icon ?? '',
      start,
      end: r.until ? timeAt(r.until, day) : (today[i + 1]?.start ?? midnight),
      deadline: r.deadline ? timeAt(r.deadline, day) : null,
      items: itemsOf(r),
    }))
    .filter((slot) => slot.items.length);
};

/** Only the running routine can be checked; past and upcoming ones are read-only. */
export const phaseOf = (slot: Slot, now: number) =>
  now < slot.start ? 'next' : now < slot.end ? 'now' : 'past';

/** The routine to show: the running one, else the next one, else the last one. */
export const focusOf = (slots: Slot[], now: number) =>
  slots.find((s) => phaseOf(s, now) === 'now') ??
  slots.find((s) => now < s.start) ??
  slots.at(-1) ??
  null;

/** Toggles one item; returns the new user state and whether it just completed/uncompleted. */
export const toggle = (prev: UserState | undefined, label: string, items: Item[], now: number) => {
  const done = { ...prev?.done };
  if (done[label]) {
    delete done[label];
  } else {
    done[label] = true;
  }
  const complete = items.every((item) => done[item.label]);
  const completedAt = complete ? (prev?.completedAt ?? now) : null;
  const change = complete && !prev?.completedAt ? 'completed' : !complete ? 'progress' : 'none';
  return { state: { done, completedAt }, change } as const;
};

export const doneCount = (items: Item[], state?: UserState) =>
  items.filter((item) => state?.done[item.label]).length;
