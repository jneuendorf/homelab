import assert from 'node:assert/strict';
import { test } from 'node:test';
import { icon } from './index.ts';
import { parse } from './server.ts';

test('WMO code → emoji buckets', () => {
  assert.equal(icon(0), '☀️');
  assert.equal(icon(3), '☁️');
  assert.equal(icon(61), '🌧️');
  assert.equal(icon(95), '⛈️');
  assert.equal(icon(null), '');
});

test('picks the configured hours from an Open-Meteo payload', () => {
  const time = Array.from({ length: 24 }, (_, h) => `2026-10-18T${String(h).padStart(2, '0')}:00`);
  const weather = parse(
    {
      current: { temperature_2m: 11.6, weather_code: 3 },
      hourly: {
        time,
        temperature_2m: time.map((_, h) => h + 0.4),
        weather_code: time.map(() => 1),
      },
    },
    { lat: 0, lon: 0, hours: [8, 13, 25], labels: ['M', 'N', 'X'] },
  );
  assert.deepEqual(weather.current, { temp: 12, code: 3 });
  assert.deepEqual(
    weather.parts.map((p) => p.temp),
    [8, 13, null],
  );
});
