import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deadlineAt, doneCount, leaderOf, resolve, toggle } from './logic.ts';

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

test('deadline on the given day', () => {
  const day = new Date(2026, 9, 18, 6, 0);
  assert.equal(deadlineAt('07:35', day), new Date(2026, 9, 18, 7, 35).getTime());
  assert.equal(deadlineAt(null, day), null);
});
