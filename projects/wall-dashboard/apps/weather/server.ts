import type { Handler } from '#sdk';
import type { Weather, WeatherConfig } from './index.ts';

type Forecast = {
  current: { temperature_2m: number; weather_code: number };
  hourly: { time: string[]; temperature_2m: number[]; weather_code: number[] };
};

export const parse = (forecast: Forecast, config: WeatherConfig): Weather => {
  const { time, temperature_2m: temps, weather_code: codes } = forecast.hourly;
  const day = time[0].slice(0, 10);
  return {
    current: {
      temp: Math.round(forecast.current.temperature_2m),
      code: forecast.current.weather_code,
    },
    parts: config.hours.map((hour, i) => {
      const at = time.indexOf(`${day}T${String(hour).padStart(2, '0')}:00`);
      return {
        label: config.labels[i],
        temp: at < 0 ? null : Math.round(temps[at]),
        code: at < 0 ? null : codes[at],
      };
    }),
  };
};

// Fetched on demand and cached: no timer runs while nobody looks.
let cache: { at: number; data: Weather } | null = null;
const ttl = 30 * 60 * 1000;

const handler: Handler<WeatherConfig> = async (_req, { config, path }) => {
  if (path !== 'now') return new Response('not found', { status: 404 });
  if (!cache || Date.now() - cache.at > ttl) {
    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${config.lat}&longitude=${config.lon}` +
        '&current=temperature_2m,weather_code&hourly=temperature_2m,weather_code' +
        '&timezone=auto&forecast_days=1';
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`open-meteo ${res.status}`);
      cache = { at: Date.now(), data: parse(await res.json(), config) };
    } catch (error) {
      console.warn(`weather: ${error}`);
      if (!cache) return new Response('weather unavailable', { status: 502 });
    }
  }
  return Response.json(cache.data);
};
export default handler;
