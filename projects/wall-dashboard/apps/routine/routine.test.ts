import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Routine } from './index.ts';
import { doneCount, focusOf, leaderOf, phaseOf, resolve, slotsFor, toggle } from './logic.ts';

const items = [
  { icon: 'a', label: 'Zähne' },
  { icon: 'b', label: 'Anziehen' },
];

test('leader = earliest completion', () => {
  assert.equal(
    leaderOf({ a: { done: {}, completedAt: 200 }, b: { done: {}, completedAt: 100 } }),
    'b',
  );
  assert.equal(leaderOf({ a: { done: {}, completedAt: 200 }, b: { done: {} } }), 'a');
  assert.equal(leaderOf({}), null);
});

test('toggle completes, keeps first completion time, and un-completes', () => {
  const one = toggle(undefined, 'Zähne', items, 1);
  assert.equal(one.change, 'progress');
  const two = toggle(one.state, 'Anziehen', items, 2);
  assert.deepEqual([two.change, two.state.completedAt], ['completed', 2]);
  const undo = toggle(two.state, 'Zähne', items, 3);
  assert.deepEqual([undo.change, undo.state.completedAt], ['progress', null]);
});

test('stale labels (item removed by a callback) do not count', () => {
  assert.equal(doneCount(items, { done: { Zähne: true, Weg: true } }), 1);
});

test('value or (ctx) => value', () => {
  assert.equal(resolve('x', {}), 'x');
  assert.equal(
    resolve((ctx: { dayOfWeek: number }) => (ctx.dayOfWeek === 6 ? 'frei' : 'Schule'), {
      dayOfWeek: 6,
    }),
    'frei',
  );
});

test('routines of a day: sorted, ends inferred, empty ones dropped but still end the previous', () => {
  const friday = new Date(2026, 10, 27, 12, 0);
  const at = (h: number, m = 0) => new Date(2026, 10, 27, h, m).getTime();
  const routines = {
    evening: { label: 'Abend', icon: '🌙', from: '18:00', deadline: '19:30' },
    morning: { label: 'Morgen', icon: '🌅', days: 'mo-fr', from: '06:00', deadline: '07:35-5' },
    after: { label: 'Nachmittag', icon: '🎒', from: '13:00' },
    weekend: { label: 'Wochenende', icon: '🏖️', days: ['sa', 'su'], from: '08:00' },
  } satisfies Record<string, Routine>;
  const slots = slotsFor(routines, friday, (r) => (r.label === 'Nachmittag' ? [] : items));
  assert.deepEqual(
    slots.map((s) => [s.id, s.start, s.end, s.deadline]),
    [
      ['morning', at(6), at(13), at(7, 30)],
      ['evening', at(18), at(24), at(19, 30)],
    ],
  );
  assert.deepEqual(
    [at(5), at(7), at(14), at(20)].map((now) => [focusOf(slots, now)?.id, phaseOf(slots[0], now)]),
    [
      ['morning', 'next'],
      ['morning', 'now'],
      ['evening', 'past'],
      ['evening', 'past'],
    ],
  );
  assert.equal(focusOf([], at(7)), null);
});
