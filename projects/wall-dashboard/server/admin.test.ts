import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pinCheck } from './admin.ts';

test('5 wrong PINs lock even the right one for a minute', () => {
  let now = 0;
  const check = pinCheck(
    () => '1234',
    () => now,
  );
  assert.equal(check('1234'), null);
  for (let i = 0; i < 5; i++) assert.equal(check('0000'), 'falsche PIN');
  assert.match(check('1234') ?? '', /gesperrt/);
  now = 60_000;
  assert.equal(check('1234'), null);
});

test('no PIN configured means no admin at all', () => {
  assert.match(pinCheck(() => undefined)('') ?? '', /nicht gesetzt/);
});
