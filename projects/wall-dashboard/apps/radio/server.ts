import { randomUUID } from 'node:crypto';
import type { Handler } from '#sdk';
import type { RadioConfig } from './index.ts';
import { icyTitle } from './icy.ts';
import { probe, type Station } from './logic.ts';

// Now-playing titles, cached so several screens polling the same station open it once a while.
const titles = new Map<string, { at: number; title: Promise<string> }>();
const titleTtl = 30_000;
const nowPlaying = (station: Station) => {
  const hit = titles.get(station.id);
  if (hit && Date.now() - hit.at < titleTtl) return hit.title;
  const title = icyTitle(station.url).catch(() => '');
  titles.set(station.id, { at: Date.now(), title });
  return title;
};

// Adding and removing stations needs the admin PIN (the shell sends it while unlocked).
// Adding a station makes the server fetch the URL (https only, 5 hops, 5 s) to learn its hosts.
const handler: Handler<RadioConfig> = async (req, ctx) => {
  const stations = ctx.store.get<Station[]>('stations') ?? ctx.config.stations;
  if (ctx.path === 'stations' && req.method === 'GET') return Response.json(stations);
  if (ctx.path === 'now' && req.method === 'GET') {
    const station = stations.find((s) => s.id === new URL(req.url).searchParams.get('id'));
    if (!station) return new Response('not found', { status: 404 });
    return Response.json({ title: await nowPlaying(station) });
  }
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  if (!ctx.admin) return new Response('nur Eltern', { status: 403 });
  const body = (await req.json()) as Record<string, unknown>;
  const text = (key: string, max: number) =>
    typeof body[key] === 'string' ? body[key].trim().slice(0, max) : '';

  if (ctx.path === 'add') {
    const label = text('label', 40);
    const url = text('url', 2000);
    if (!label || !url) return new Response('Name und Adresse fehlen', { status: 400 });
    let hosts: string[];
    try {
      hosts = await probe(url);
    } catch (error) {
      // probe's own errors are plain Errors meant for the screen; fetch/timeout ones are not
      const own = error instanceof Error && error.name === 'Error';
      return new Response(own ? error.message : 'Sender nicht erreichbar', { status: 422 });
    }
    const station = { id: randomUUID(), label, icon: text('icon', 8) || '📻', url, hosts };
    ctx.store.set('stations', [...stations, station]);
    return new Response(null, { status: 204 });
  }
  if (ctx.path === 'remove') {
    ctx.store.set(
      'stations',
      stations.filter((s) => s.id !== body.id),
    );
    return new Response(null, { status: 204 });
  }
  return new Response('not found', { status: 404 });
};
export default handler;
