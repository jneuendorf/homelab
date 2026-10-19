// Server-only app (no menubar entry): Open-Meteo, no API key. Other apps read /api/weather/now.
import { defineApp } from '#sdk';

export type WeatherConfig = { lat: number; lon: number; hours: number[]; labels: string[] };
export type DayPart = { label: string; temp: number | null; code: number | null };
export type Weather = { current: { temp: number; code: number }; parts: DayPart[] };

export const weather = defineApp<WeatherConfig>({
  id: 'weather',
  defaults: { lat: 52.52, lon: 13.41, hours: [8, 13, 19], labels: ['Morgen', 'Mittag', 'Abend'] },
  server: () => import('./server.ts'),
});

export const fetchWeather = async (): Promise<Weather | null> => {
  const res = await fetch('/api/weather/now').catch(() => null);
  return res?.ok ? res.json() : null;
};

/** WMO weather code → emoji. */
export const icon = (code: number | null) => {
  if (code == null) return '';
  if (code === 0) return '☀️';
  if (code <= 2) return '🌤️';
  if (code === 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌦️';
  if (code <= 86) return '🌨️';
  return '⛈️';
};
