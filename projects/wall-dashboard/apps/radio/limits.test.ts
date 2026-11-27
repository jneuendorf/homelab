import assert from 'node:assert/strict';
import { test } from 'node:test';
import { beat, check, emptyUsage, extend, type Limits, start, stopAt } from './limits.ts';

const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m).getTime(); // 23 = Mon
const min = 60_000;

const limits: Limits = {
  windows: [
    { days: 'mo-fr', from: '06:30', until: '07:35-10' },
    { days: ['sa', 'su'], from: '08:00', until: '20:00' },
  ],
  perDay: 30,
  perSession: 20,
  cooldown: 10,
  stations: { night: { windows: [{ from: '19:00', until: '06:00' }] } },
};

test('windows: weekday morning with offset, weekend day, next opening', () => {
  const u = emptyUsage(at(23, 7));
  assert.equal(check(limits, u, at(23, 7)), null);
  assert.deepEqual(check(limits, u, at(23, 7, 25)), { reason: 'window', until: at(24, 6, 30) });
  assert.equal(check(limits, u, at(28, 9)), null); // Saturday
  assert.deepEqual(check(limits, u, at(27, 20)), { reason: 'window', until: at(28, 8) }); // Fri
});

test('station windows intersect the global ones, also across midnight', () => {
  const u = emptyUsage(at(28, 19));
  assert.equal(check(limits, u, at(28, 19, 30), 'night'), null);
  assert.deepEqual(check(limits, u, at(28, 9), 'night'), { reason: 'window', until: at(28, 19) });
  assert.equal(check({ stations: limits.stations }, u, at(29, 5), 'night'), null);
});

test('a full run forces a pause; a parent ends it and adds minutes', () => {
  let u = start(limits, emptyUsage(at(28, 9)), at(28, 9), 'maus', 'kind1');
  assert.equal(stopAt(limits, u, at(28, 9)), at(28, 9, 20));
  for (let t = at(28, 9); t < at(28, 9, 20); t += 0.5 * min) {
    const next = beat(limits, u, t);
    assert.equal(next.stop, false);
    u = next.usage;
  }
  const stopped = beat(limits, u, at(28, 9, 20));
  assert.equal(stopped.stop, true);
  u = stopped.usage;
  assert.deepEqual(check(limits, u, at(28, 9, 25)), { reason: 'pause', until: at(28, 9, 30) });
  assert.equal(u.log.length, 1);
  assert.equal(u.log[0].user, 'kind1');
  assert.equal(u.log[0].ms, 20 * min);
  assert.equal(check(limits, extend(u, at(28, 9, 25), 15), at(28, 9, 25)), null);
});

test('the daily budget is shared; a short pause keeps the run, stale plays end at the last beat', () => {
  let u = start(limits, emptyUsage(at(28, 9)), at(28, 9), 'maus', 'kind1');
  u = beat(limits, u, at(28, 9, 1)).usage;
  // tab closed: no beats for 5 min → counted only up to 09:01
  u = start(limits, u, at(28, 9, 6), 'teddy', 'kind2');
  assert.equal(u.used, 1 * min);
  assert.equal(u.run?.start, at(28, 9)); // 5 min gap < cooldown: same run
  assert.equal(stopAt({ perDay: 30 }, u, at(28, 9, 6)), at(28, 9, 35));
  u = { ...u, used: 30 * min, play: null };
  assert.deepEqual(check(limits, u, at(28, 10)), { reason: 'day', until: at(29, 0) });
  assert.equal(check(limits, u, at(29, 9)), null); // a new day starts over
});
