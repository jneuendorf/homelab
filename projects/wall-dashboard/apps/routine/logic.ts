// Pure routine rules (tested without a browser).
import type { Badges, Item } from './index.ts';

export type UserState = { done: Record<string, true>; completedAt?: number | null };
export type DayState = Record<string, UserState>;

export const defaultBadges: Badges = { leader: '🏆', done: '⭐', beatDeadline: '✨' };

export const resolve = <T, C>(value: T | ((ctx: C) => T), ctx: C): T =>
  typeof value === 'function' ? (value as (ctx: C) => T)(ctx) : value;

export const leaderOf = (state: DayState) =>
  Object.entries(state)
    .flatMap(([id, s]) => (s.completedAt ? [{ id, at: s.completedAt }] : []))
    .sort((a, b) => a.at - b.at)[0]?.id ?? null;

export const deadlineAt = (deadline: string | null, day = new Date()) => {
  if (!deadline) return null;
  const [h, m] = deadline.split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m).getTime();
};

/** Toggles one item; returns the new user state and whether it just completed/uncompleted. */
export const toggle = (prev: UserState | undefined, label: string, items: Item[], now: number) => {
  const done = { ...prev?.done };
  if (done[label]) delete done[label];
  else done[label] = true;
  const complete = items.every((item) => done[item.label]);
  const completedAt = complete ? (prev?.completedAt ?? now) : null;
  const change = complete && !prev?.completedAt ? 'completed' : !complete ? 'progress' : 'none';
  return { state: { done, completedAt }, change } as const;
};

export const doneCount = (items: Item[], state?: UserState) =>
  items.filter((item) => state?.done[item.label]).length;
