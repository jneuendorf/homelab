// Pure model + reducer, shared by server (validates and applies actions) and UI (progress, week).
// Days are local "YYYY-MM-DD" strings from the tablet (dayKey); the server never reads its clock.

/** Who a mission's stars count for: the doer, the doer and the family goal, or the family only. */
export type Counts = 'ich' | 'beide' | 'familie';
export type Mission = { id: string; icon: string; label: string; stars: number; counts: Counts };
export type Reward = { icon: string; label: string };
export type Checkpoint = Reward & { at: number };
/** Every `days` consecutive days with at least one star adds `bonus` stars. */
export type Streak = { days: number; bonus: number };
export type Goal = {
  /** A user id, or FAMILY. */
  owner: string;
  target: number;
  start: string;
  end: string;
  reward: Reward;
  checkpoints: Checkpoint[];
  streak: Streak | null;
  /** Stars already spent on the previous goal (same day as this one's start), not counted again. */
  spent?: string[];
};
/** A snapshot of the mission at claim time, so editing missions never rewrites history. */
export type Star = {
  id: string;
  user: string | null;
  icon: string;
  label: string;
  stars: number;
  counts: Counts;
  day: string;
  confirmed: boolean;
};
export type Trophy = Goal & { earned: number; reached: boolean };
export type State = { missions: Mission[]; goals: Goal[]; stars: Star[]; history: Trophy[] };

export const FAMILY = 'family';
export const emptyState = (missions: Mission[]): State => ({
  missions,
  goals: [],
  stars: [],
  history: [],
});

export const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00Z`) - Date.parse(`${from}T00:00Z`)) / 86_400_000);
/** Monday … Sunday of `day`'s week. */
export const weekOf = (day: string) => {
  const monday = addDays(day, -((new Date(`${day}T00:00Z`).getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
};

export const credits = (star: Star, owner: string) =>
  owner === FAMILY ? star.counts !== 'ich' : star.user === owner && star.counts !== 'familie';

export const progress = (goal: Goal, stars: Star[], today: string) => {
  const own = stars.filter(
    (s) =>
      s.confirmed &&
      s.day >= goal.start &&
      s.day <= goal.end &&
      credits(s, goal.owner) &&
      !goal.spent?.includes(s.id),
  );
  const days = new Set(own.map((s) => s.day));
  let streak = 0;
  let bonus = 0;
  const last = today < goal.end ? today : goal.end;
  for (let day = goal.start; day <= last; day = addDays(day, 1)) {
    if (days.has(day)) {
      streak++;
      if (goal.streak && streak % goal.streak.days === 0) bonus += goal.streak.bonus;
    } else if (day < today) streak = 0; // today without a star yet keeps yesterday's streak
  }
  const earned = own.reduce((sum, s) => sum + s.stars, 0) + bonus;
  return { earned, bonus, streak, reached: earned >= goal.target, ended: today > goal.end };
};

// Validation at the trust boundary: anything on the LAN can POST.
const fail = (message: string): never => {
  throw Object.assign(new Error(message), { status: 400 });
};
const str = (v: unknown, max = 60) =>
  typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : fail('bad text');
const int = (v: unknown, min: number, max: number) =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max
    ? (v as number)
    : fail('bad number');
const day = (v: unknown) =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fail('bad day');
const list = (v: unknown, max: number) =>
  Array.isArray(v) && v.length <= max ? (v as unknown[]) : fail('bad list');
const obj = (v: unknown) =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : fail('bad object');
const counts = (v: unknown): Counts =>
  v === 'ich' || v === 'beide' || v === 'familie' ? v : fail('bad counts');
const reward = (v: unknown): Reward => {
  const r = obj(v);
  return { icon: str(r.icon, 16), label: str(r.label) };
};

export const parentActions = new Set(['unlock', 'confirm', 'remove', 'bonus', 'missions', 'goal']);

/** Applies one action; throws (status 400) on invalid input. `id` makes new ids. */
export const apply = (
  state: State,
  action: string,
  input: unknown,
  userIds: string[],
  id: () => string,
): State => {
  const body = obj(input);
  const user = (v: unknown) => (userIds.includes(v as string) ? (v as string) : fail('bad user'));
  switch (action) {
    case 'unlock':
      return state;
    case 'claim': {
      const mission = state.missions.find((m) => m.id === body.mission) ?? fail('bad mission');
      const { id: _, ...snapshot } = mission;
      const star = { ...snapshot, id: id(), user: user(body.user), day: day(body.day) };
      return { ...state, stars: [...state.stars, { ...star, confirmed: false }] };
    }
    case 'withdraw': // kids may take back their own unconfirmed tap
      return { ...state, stars: state.stars.filter((s) => s.id !== body.id || s.confirmed) };
    case 'remove':
      return { ...state, stars: state.stars.filter((s) => s.id !== body.id) };
    case 'confirm': {
      const ids = new Set(list(body.ids, 500));
      return {
        ...state,
        stars: state.stars.map((s) => (ids.has(s.id) ? { ...s, confirmed: true } : s)),
      };
    }
    case 'bonus': {
      const family = body.user === FAMILY;
      const star: Star = {
        id: id(),
        user: family ? null : user(body.user),
        icon: '🌟',
        label: str(body.label),
        stars: int(body.stars, 1, 20),
        counts: family ? 'familie' : 'ich',
        day: day(body.day),
        confirmed: true,
      };
      return { ...state, stars: [...state.stars, star] };
    }
    case 'missions': {
      const missions = list(body.missions, 30).map((v) => {
        const m = obj(v);
        return {
          id: typeof m.id === 'string' && /^[\w-]{1,40}$/.test(m.id) ? m.id : id(),
          icon: str(m.icon, 16),
          label: str(m.label),
          stars: int(m.stars, 1, 5),
          counts: counts(m.counts),
        };
      });
      return { ...state, missions };
    }
    case 'goal': {
      const g = obj(body.goal);
      const owner = g.owner === FAMILY ? FAMILY : user(g.owner);
      const target = int(g.target, 1, 1000);
      const start = day(g.start);
      const end = day(g.end);
      if (end < start) fail('end before start');
      const streak = g.streak == null ? null : obj(g.streak);
      const goal: Goal = {
        owner,
        target,
        start,
        end,
        reward: reward(g.reward),
        checkpoints: list(g.checkpoints, 10)
          .map((v) => ({ ...reward(v), at: int(obj(v).at, 1, target - 1) }))
          .sort((a, b) => a.at - b.at),
        streak: streak && { days: int(streak.days, 1, 60), bonus: int(streak.bonus, 1, 50) },
      };
      // archive: the owner's finished goal moves to the trophy shelf; otherwise it is edited
      const old = state.goals.find((x) => x.owner === owner);
      const p = old && body.archive === true && progress(old, state.stars, day(body.today));
      const history = old && p ? [{ ...old, earned: p.earned, reached: p.reached }] : [];
      goal.spent = p
        ? state.stars
            .filter((s) => s.confirmed && s.day >= start && credits(s, owner))
            .map((s) => s.id)
        : old?.spent;
      const goals = [...state.goals.filter((x) => x !== old), goal];
      // stars are only needed for active goals and the weekly grid
      const keepFrom = [addDays(day(body.today), -14), ...goals.map((x) => x.start)].sort()[0];
      return {
        ...state,
        goals,
        history: [...history, ...state.history].slice(0, 100),
        stars: state.stars.filter((s) => s.day >= keepFrom),
      };
    }
  }
  return fail('unknown action');
};
