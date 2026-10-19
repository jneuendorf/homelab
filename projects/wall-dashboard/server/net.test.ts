import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isLan } from './net.ts';

test('only loopback and private ranges may talk to the API', () => {
  for (const ip of [
    '127.0.0.1',
    '::1',
    '192.168.1.42',
    '::ffff:192.168.1.42',
    '10.1.2.3', // gitleaks:allow (test address)
    '172.20.0.1', // gitleaks:allow (test address)
    'fd00::1',
  ])
    assert.ok(isLan(ip), ip);
  for (const ip of ['8.8.8.8', '172.32.0.1', '2a00:1450::1', '::ffff:1.2.3.4', ''])
    assert.ok(!isLan(ip), ip);
});
