// Radio limits: pure rules over the household's usage (one speaker = one budget for everyone).
// Server-side state, so a reload or another screen can't reset it.

export type Day = 'mo' | 'tu' | 'we' | 'th' | 'fr' | 'sa' | 'su';
/** 'HH:MM', optionally shifted by minutes: '07:35-10' = 07:25. Share a const with routine's
 *  deadline to end radio time before it. */
export type Time = `${number}:${number}` | `${number}:${number}${'+' | '-'}${number}`;
/** until ≤ from crosses midnight: { from: '19:00', until: '07:00' }. No days = every day. */
export type Window = { days?: Day | `${Day}-${Day}` | Day[]; from: Time; until: Time };

export type Limits = {
  /** Radio plays only inside one of these (they add up). None = any time. */
  windows?: Window[];
  /** Minutes per day, for the whole household. */
  perDay?: number;
  /** Minutes of one listening run; a pause shorter than `cooldown` doesn't start a new run. */
  perSession?: number;
  /** Minutes of forced pause after a full run (default 10). */
  cooldown?: number;
  /** Minutes before a forced stop that the tile counts down (default 2). */
  warnBefore?: number;
  /** Extra windows per station id, on top of the global ones (both must allow). */
  stations?: Record<string, { windows: Window[] }>;
};

export type Play = { station: string; user: string | null; start: number; last: number };
export type LogEntry = { at: number; user: string | null; station: string; ms: number };
export type Usage = {
  day: string;
  /** ms played today */
  used: number;
  /** minutes added by a parent today */
  extra: number;
  /** a parent lifted all limits for today */
  free: boolean;
  play: Play | null;
  /** current listening run (spans pauses shorter than the cooldown) */
  run: { start: number; end: number } | null;
  pauseUntil: number;
  /** Plays ended since the last save; the server moves them to the activity log. */
  ended: LogEntry[];
};
export type Block = { reason: 'window' | 'day' | 'pause'; until: number | null };

const minute = 60_000;
/** A play without a heartbeat for this long ended at its last beat (tab closed, reload). */
export const staleMs = 90_000;
const days: Day[] = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'];

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const emptyUsage = (now: number): Usage => ({
  day: dayKey(new Date(now)),
  used: 0,
  extra: 0,
  free: false,
  play: null,
  run: null,
  pauseUntil: 0,
  ended: [],
});

const dayMatches = (spec: Window['days'], day: number) => {
  if (!spec) {
    return true;
  }
  if (Array.isArray(spec)) {
    return spec.some((d) => days.indexOf(d) === day);
  }
  const [from, until = from] = spec.split('-').map((d) => days.indexOf(d as Day));
  return from <= until ? day >= from && day <= until : day >= from || day <= until;
};

const timeAt = (time: Time, date: Date) => {
  const [, h, m, sign, shift] = /^(\d+):(\d+)(?:([+-])(\d+))?$/.exec(time) ?? [];
  const offset = shift ? (sign === '-' ? -1 : 1) * Number(shift) : 0;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), +h, +m + offset).getTime();
};

/** The windows as [start, end] ms intervals from yesterday to a week ahead. */
const intervals = (windows: Window[], now: number) => {
  const today = new Date(now);
  return windows.flatMap((w) =>
    [-1, 0, 1, 2, 3, 4, 5, 6, 7].flatMap((offset) => {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
      if (!dayMatches(w.days, date.getDay())) {
        return [];
      }
      const start = timeAt(w.from, date);
      let end = timeAt(w.until, date);
      if (end <= start) {
        end = timeAt(w.until, new Date(date.getTime() + 86_400_000));
      }
      return [[start, end] as const];
    }),
  );
};

/** null = inside a window (or none set), else when the next one opens. */
const windowBlock = (windows: Window[] | undefined, now: number): Block | null => {
  if (!windows?.length) {
    return null;
  }
  const all = intervals(windows, now);
  if (all.some(([start, end]) => start <= now && now < end)) {
    return null;
  }
  const next = Math.min(...all.map(([start]) => start).filter((start) => start > now));
  return { reason: 'window', until: Number.isFinite(next) ? next : null };
};

/** When the current window(s) close, or Infinity. ponytail: overlapping windows that chain
 *  (06:00–07:00 + 07:00–08:00) end at the first one's end. Merge them in the config. */
const windowEnd = (windows: Window[] | undefined, now: number) => {
  if (!windows?.length) {
    return Infinity;
  }
  const ends = intervals(windows, now)
    .filter(([start, end]) => start <= now && now < end)
    .map(([, end]) => end);
  return ends.length ? Math.max(...ends) : now;
};

const tomorrow = (now: number) => {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
};

/** Why `station` (or the radio at all, without one) can't start now; null = it can. */
export const check = (
  limits: Limits,
  today: Usage,
  now: number,
  station?: string,
): Block | null => {
  const usage = forToday(today, now);
  if (usage.free) {
    return null;
  }
  if (usage.pauseUntil > now) {
    return { reason: 'pause', until: usage.pauseUntil };
  }
  if (limits.perDay != null && usage.used >= (limits.perDay + usage.extra) * minute) {
    return { reason: 'day', until: tomorrow(now) };
  }
  return (
    windowBlock(limits.windows, now) ??
    (station ? windowBlock(limits.stations?.[station]?.windows, now) : null)
  );
};

/** When the playing station must stop (Infinity = never), for the countdown and the heartbeat. */
export const stopAt = (limits: Limits, usage: Usage, now: number) => {
  if (usage.free || !usage.play) {
    return Infinity;
  }
  const dayLeft =
    limits.perDay == null ? Infinity : (limits.perDay + usage.extra) * minute - usage.used;
  const runEnd =
    limits.perSession == null || !usage.run
      ? Infinity
      : usage.run.start + limits.perSession * minute;
  return Math.min(
    now + dayLeft,
    runEnd,
    windowEnd(limits.windows, now),
    windowEnd(limits.stations?.[usage.play.station]?.windows, now),
  );
};

const forToday = (usage: Usage, now: number): Usage =>
  usage.day === dayKey(new Date(now))
    ? usage
    : { ...usage, day: dayKey(new Date(now)), used: 0, extra: 0, free: false };

/** Counts time since the last beat (a gap longer than staleMs ended the play at its last beat). */
export const account = (usage: Usage, now: number): Usage => {
  const { play } = usage;
  if (!play) {
    return forToday(usage, now);
  }
  const stale = now - play.last > staleMs;
  const at = stale ? play.last : now;
  const next = forToday(
    {
      ...usage,
      used: usage.used + (at - play.last),
      play: { ...play, last: at },
      run: usage.run && { ...usage.run, end: at },
    },
    now,
  );
  return stale ? end(next) : next;
};

/** Closes the current play into the log. */
export const end = (usage: Usage): Usage => {
  const { play } = usage;
  if (!play) {
    return usage;
  }
  const entry = {
    at: play.start,
    user: play.user,
    station: play.station,
    ms: play.last - play.start,
  };
  return { ...usage, play: null, ended: [...usage.ended, entry] };
};

export const start = (
  limits: Limits,
  usage: Usage,
  now: number,
  station: string,
  user: string | null,
): Usage => {
  const ended = end(account(usage, now));
  const gap = (limits.cooldown ?? 10) * minute;
  const run = ended.run && now - ended.run.end < gap ? ended.run : { start: now, end: now };
  return { ...ended, run, play: { station, user, start: now, last: now } };
};

/** Heartbeat while playing: count, and stop when a limit is reached (a full run → pause). */
export const beat = (limits: Limits, usage: Usage, now: number) => {
  const next = account(usage, now);
  if (!next.play) {
    return { usage: next, stop: true };
  }
  if (now < stopAt(limits, next, now)) {
    return { usage: next, stop: false };
  }
  const runOver =
    !next.free &&
    limits.perSession != null &&
    next.run != null &&
    now >= next.run.start + limits.perSession * minute;
  const pauseUntil = runOver ? now + (limits.cooldown ?? 10) * minute : next.pauseUntil;
  return { usage: { ...end(next), run: runOver ? null : next.run, pauseUntil }, stop: true };
};

/** Parent: more minutes today; also ends a forced pause. */
export const extend = (usage: Usage, now: number, minutes: number): Usage => {
  const next = account(usage, now);
  return { ...next, extra: next.extra + minutes, pauseUntil: 0, run: null };
};
