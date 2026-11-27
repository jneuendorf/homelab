import { randomUUID } from 'node:crypto';
import type { Handler } from '#sdk';
import { icyTitle } from './icy.ts';
import type { RadioConfig } from './index.ts';
import * as rules from './limits.ts';
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

// The radio's limits view: what's blocked and when the playing station stops. Screens re-read it
// on every 'usage' push and every heartbeat.
const view = (config: RadioConfig, usage: rules.Usage, stations: Station[]) => {
  const limits = config.limits ?? {};
  const now = Date.now();
  const stop = rules.stopAt(limits, usage, now);
  return {
    configured: Object.keys(limits).length > 0,
    blocked: rules.check(limits, usage, now),
    stations: Object.fromEntries(
      stations.map((s) => [s.id, rules.check(limits, usage, now, s.id)]),
    ),
    playing: usage.play?.station ?? null,
    stopAt: Number.isFinite(stop) ? stop : null,
    warnBefore: limits.warnBefore ?? 2,
    leftToday:
      limits.perDay == null
        ? null
        : Math.max(0, (limits.perDay + usage.extra) * 60_000 - usage.used),
    free: usage.free,
  };
};
export type LimitsView = ReturnType<typeof view>;

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
  const limits = ctx.config.limits ?? {};
  const now = Date.now();
  const stored = ctx.store.get<rules.Usage>('usage');
  const usage = rules.account({ ...rules.emptyUsage(now), ...stored }, now);
  const named = (id: string) => {
    const s = stations.find((x) => x.id === id);
    return s ? `${s.icon} ${s.label}` : '📻';
  };
  const save = (next: rules.Usage) => {
    for (const p of next.ended)
      ctx.log(
        `${named(p.station)} · ${p.ms < 60_000 ? '< 1' : Math.round(p.ms / 60_000)} Min`,
        p.user,
      );
    ctx.store.set('usage', { ...next, ended: [] }); // pushes 'usage' to all screens
  };
  const json = (next: rules.Usage, extra = {}) =>
    Response.json({ ...view(ctx.config, next, stations), ...extra });
  if (ctx.path === 'limits' && req.method === 'GET') return json(usage);

  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const body = (await req.json()) as Record<string, unknown>;

  // Playing is for everyone; the server counts it, so a reload or another screen can't reset it.
  if (ctx.path === 'play') {
    const station = stations.find((s) => s.id === body.station);
    if (!station) return new Response('not found', { status: 404 });
    const blocked = rules.check(limits, usage, now, station.id);
    if (blocked) return Response.json(view(ctx.config, usage, stations), { status: 403 });
    // the budget is shared; who was selected only goes into the activity log
    const next = rules.start(limits, usage, now, station.id, ctx.user?.id ?? null);
    save(next);
    return json(next);
  }
  if (ctx.path === 'beat') {
    const { usage: next, stop } = rules.beat(limits, usage, now);
    save(next);
    return json(next, { stop });
  }
  if (ctx.path === 'stop') {
    const next = rules.end(usage);
    save(next);
    return json(next);
  }

  if (!ctx.admin) return new Response('nur Eltern', { status: 403 });
  if (ctx.path === 'extend') {
    const next = rules.extend(usage, now, 15);
    ctx.log('⏳ ＋15 Min Radio');
    save(next);
    return json(next);
  }
  if (ctx.path === 'free') {
    const next = { ...usage, free: !usage.free };
    ctx.log(next.free ? '🔓 Radio heute ohne Limit' : '🔒 Radio-Limits wieder an');
    save(next);
    return json(next);
  }
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
    ctx.log(`＋ Sender ${station.icon} ${label}`);
    return new Response(null, { status: 204 });
  }
  if (ctx.path === 'remove') {
    if (stations.some((s) => s.id === body.id)) ctx.log(`✕ Sender ${named(body.id as string)}`);
    ctx.store.set(
      'stations',
      stations.filter((s) => s.id !== body.id),
    );
    return new Response(null, { status: 204 });
  }
  return new Response('not found', { status: 404 });
};
export default handler;
