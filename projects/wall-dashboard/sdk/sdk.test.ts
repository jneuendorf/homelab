import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultAdmin, defineApp, defineDashboard, forUser, membersOf } from './index.ts';
import { html, raw } from './utils.ts';

test('app defaults → instance config → sparse per-user override', () => {
  const app = defineApp<{ deadline: string; sound: boolean }>({
    id: 'x',
    defaults: { deadline: '07:35', sound: true },
  })({ sound: false, perUser: { kid: { deadline: '07:50' } } });
  assert.deepEqual(forUser(app.config, 'kid'), { deadline: '07:50', sound: false });
  assert.deepEqual(forUser(app.config, 'other'), { deadline: '07:35', sound: false });
  assert.deepEqual(forUser(app.config, null), { deadline: '07:35', sound: false });
});

test('per-user overrides merge objects deeply, replace arrays and functions', () => {
  const fn = () => 1;
  const app = defineApp<{ r: Record<string, { from?: string; items: string[] | (() => number) }> }>(
    {
      id: 'x',
      defaults: { r: {} },
    },
  )({
    r: { a: { from: '06:00', items: ['x', 'y'] }, b: { from: '18:00', items: ['z'] } },
    perUser: { kid: { r: { a: { items: ['q'] }, c: { items: fn } } } },
  });
  assert.deepEqual(forUser(app.config, 'kid').r, {
    a: { from: '06:00', items: ['q'] },
    b: { from: '18:00', items: ['z'] },
    c: { items: fn },
  });
  assert.deepEqual(forUser(app.config, 'other').r?.a?.items, ['x', 'y']);
});

test('html escapes interpolations, raw() opts out', () => {
  assert.equal(html`<b>${'<i>"x"</i>'}</b>`, '<b>&lt;i&gt;&quot;x&quot;&lt;/i&gt;</b>');
  // prettier-ignore
  assert.equal(html`<ul>${['a&b', raw('<li>c</li>')]}</ul>`, '<ul>a&amp;b<li>c</li></ul>');
  assert.equal(html`${null}${undefined}${0}`, '0');
});

test('defineDashboard adds the default admin unless one is configured', () => {
  const kid = { id: 'kid', name: 'Kid', color: '#000' };
  const mama = { id: 'mama', name: 'Mama', color: '#fff' };
  const added = defineDashboard({ users: [kid, mama], apps: [] }).users;
  assert.deepEqual(added, [kid, mama, defaultAdmin]);
  assert.deepEqual(membersOf(added), [kid, mama]);
  const own = { ...mama, admin: true };
  assert.deepEqual(defineDashboard({ users: [kid, own], apps: [] }).users, [kid, own]);
});
