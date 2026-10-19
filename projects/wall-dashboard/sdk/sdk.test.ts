import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defineApp, forUser, html, raw } from './index.ts';

test('app defaults → instance config → sparse per-user override', () => {
  const app = defineApp<{ deadline: string; sound: boolean }>({
    id: 'x',
    defaults: { deadline: '07:35', sound: true },
  })({ sound: false, perUser: { kid: { deadline: '07:50' } } });
  assert.deepEqual(forUser(app.config, 'kid'), { deadline: '07:50', sound: false });
  assert.deepEqual(forUser(app.config, 'other'), { deadline: '07:35', sound: false });
  assert.deepEqual(forUser(app.config, null), { deadline: '07:35', sound: false });
});

test('html escapes interpolations, raw() opts out', () => {
  assert.equal(html`<b>${'<i>"x"</i>'}</b>`, '<b>&lt;i&gt;&quot;x&quot;&lt;/i&gt;</b>');
  // prettier-ignore
  assert.equal(html`<ul>${['a&b', raw('<li>c</li>')]}</ul>`, '<ul>a&amp;b<li>c</li></ul>');
  assert.equal(html`${null}${undefined}${0}`, '0');
});
