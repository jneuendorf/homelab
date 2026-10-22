import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apply, emptyState, FAMILY, type Goal, progress, type Star, weekOf } from './logic.ts';

const star = (day: string, over: Partial<Star> = {}): Star => ({
  id: day,
  user: 'a',
  icon: '⭐',
  label: 'x',
  stars: 1,
  counts: 'ich',
  day,
  confirmed: true,
  ...over,
});
const goal = (over: Partial<Goal> = {}): Goal => ({
  owner: 'a',
  target: 10,
  start: '2026-10-01',
  end: '2026-10-10',
  reward: { icon: '🍦', label: 'Eis' },
  checkpoints: [],
  streak: null,
  ...over,
});

test('progress counts confirmed stars in the window that credit the owner', () => {
  const stars = [
    star('2026-10-02', { stars: 2 }),
    star('2026-10-03', { confirmed: false }),
    star('2026-09-30'),
    star('2026-10-04', { user: 'b' }),
    star('2026-10-05', { counts: 'familie', user: null }),
    star('2026-10-06', { counts: 'beide' }),
  ];
  assert.equal(progress(goal(), stars, '2026-10-06').earned, 3);
  assert.equal(progress(goal({ owner: FAMILY }), stars, '2026-10-06').earned, 2);
});

test('streak bonus every N consecutive days; today without a star keeps the streak', () => {
  const stars = ['01', '02', '03', '05', '06', '07'].map((d) => star(`2026-10-${d}`));
  const p = progress(goal({ streak: { days: 3, bonus: 5 } }), stars, '2026-10-08');
  assert.equal(p.bonus, 10);
  assert.equal(p.streak, 3);
  assert.equal(p.earned, 16);
  assert.equal(p.reached, true);
});

test('weekOf starts on Monday', () => {
  assert.deepEqual(weekOf('2026-10-22').slice(0, 1), ['2026-10-19']);
  assert.equal(weekOf('2026-10-25')[6], '2026-10-25');
});

test('apply: claim → confirm, new goal archives the old one', () => {
  let n = 0;
  const id = () => `id${n++}`;
  const missions = [{ id: 'm', icon: '🧹', label: 'Wischen', stars: 2, counts: 'beide' as const }];
  let s = emptyState(missions);
  s = apply(s, 'claim', { user: 'a', mission: 'm', day: '2026-10-02' }, ['a'], id);
  assert.equal(s.stars[0].confirmed, false);
  s = apply(s, 'confirm', { ids: ['id0'] }, ['a'], id);
  s = apply(s, 'goal', { goal: goal(), today: '2026-10-02' }, ['a'], id);
  s = apply(s, 'goal', { goal: goal({ target: 15 }), today: '2026-10-03' }, ['a'], id);
  assert.equal(s.history.length, 0, 'editing a running goal does not archive it');
  s = apply(
    s,
    'goal',
    { goal: goal({ target: 20 }), archive: true, today: '2026-10-03' },
    ['a'],
    id,
  );
  assert.equal(s.goals.length, 1);
  assert.equal(s.goals[0].target, 20);
  assert.deepEqual([s.history[0].earned, s.history[0].reached], [2, false]);
  const next = goal({ start: '2026-10-02', end: '2026-10-09' });
  s = apply(s, 'goal', { goal: next, archive: true, today: '2026-10-02' }, ['a'], id);
  assert.equal(progress(s.goals[0], s.stars, '2026-10-02').earned, 0, 'stars count for one goal');
  assert.throws(() => apply(s, 'claim', { user: 'evil', mission: 'm', day: 'x' }, ['a'], id));
  assert.throws(() =>
    apply(s, 'goal', { goal: goal({ target: 0 }), today: '2026-10-03' }, ['a'], id),
  );
});
