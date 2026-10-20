import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAllowedHost, isLan, isSameOrigin } from './net.ts';

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

test('Host must be an IP, localhost or a listed name (DNS rebinding)', () => {
  for (const host of ['192.168.1.10:8090', '[::1]:8090', 'localhost:8090', 'wall.home'])
    assert.ok(isAllowedHost(host, ['wall.home']), host);
  for (const host of ['evil.example:8090', 'wall.home.evil.example', '', 'localhost.evil.example'])
    assert.ok(!isAllowedHost(host, ['wall.home']), host);
});

test('writes must be same-origin when a browser sends Origin', () => {
  assert.ok(isSameOrigin(undefined, '192.168.1.10:8090'));
  assert.ok(isSameOrigin('http://192.168.1.10:8090', '192.168.1.10:8090'));
  assert.ok(!isSameOrigin('https://evil.example', '192.168.1.10:8090'));
  assert.ok(!isSameOrigin('null', '192.168.1.10:8090'));
});
