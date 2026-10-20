// One process, no timers: static files, SSE push, a per-app key/value store, and app handlers.
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Handler, ServerStore } from '#sdk';
import { loadConfig } from './config.ts';
import { isAllowedHost, isLan, isSameOrigin } from './net.ts';

const port = Number(process.env.PORT ?? 8090);
const host = process.env.HOST ?? '0.0.0.0';
const dbPath = process.env.WALL_DATA ?? join(import.meta.dirname, '../data/wall.db');
const publicDir = join(import.meta.dirname, '../dist/public');
const maxBody = 256 * 1024;
const hostNames = (process.env.WALL_HOSTS ?? '')
  .split(',')
  .map((name) => name.trim().toLowerCase())
  .filter(Boolean);
const securityHeaders = {
  'content-security-policy':
    "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
    "base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

const dashboard = await loadConfig();

mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS kv (
  app TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (app, key))`);
const getRow = db.prepare('SELECT value FROM kv WHERE app = ? AND key = ?');
const setRow = db.prepare(
  'INSERT INTO kv (app, key, value) VALUES (?, ?, ?) ON CONFLICT (app, key) DO UPDATE SET value = excluded.value',
);

const clients = new Set<ServerResponse>();
const publish = (app: string, topic: string, data: unknown) => {
  const message = `data: ${JSON.stringify({ topic: `${app}:${topic}`, data })}\n\n`;
  for (const client of clients) client.write(message);
};

const storeFor = (app: string): ServerStore => ({
  get: (key) => {
    const row = getRow.get(app, key) as { value: string } | undefined;
    return row ? JSON.parse(row.value) : null;
  },
  set: (key, value) => {
    setRow.run(app, key, JSON.stringify(value));
    publish(app, key, value);
  },
});

const apps = new Map(dashboard.apps.map((app) => [app.id, app]));
// biome-ignore lint/suspicious/noExplicitAny: one map for handlers of every app's config type
const handlers = new Map<string, Handler<any>>();
for (const app of dashboard.apps)
  if (app.server) handlers.set(app.id, (await app.server()).default);

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

const send = (res: ServerResponse, status: number, body: string | Buffer, type = 'text/plain') => {
  res.writeHead(status, { 'content-type': type });
  res.end(body);
};

const readBody = async (req: IncomingMessage) => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBody) throw Object.assign(new Error('body too large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

const events = (req: IncomingMessage, res: ServerResponse) => {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  res.write(': connected\n\n');
  clients.add(res);
  req.on('close', () => clients.delete(res));
};

const api = async (req: IncomingMessage, res: ServerResponse, appId: string, path: string) => {
  const app = apps.get(appId);
  if (!app) return send(res, 404, 'unknown app');

  if (path.startsWith('kv/')) {
    const key = decodeURIComponent(path.slice(3));
    if (!/^[\w:.-]{1,200}$/.test(key)) return send(res, 400, 'bad key');
    const store = storeFor(appId);
    if (req.method === 'GET') return send(res, 200, JSON.stringify(store.get(key)), types['.json']);
    if (req.method === 'PUT') {
      store.set(key, JSON.parse((await readBody(req)).toString('utf8')));
      return send(res, 204, '');
    }
    return send(res, 405, 'method not allowed');
  }

  const handler = handlers.get(appId);
  if (!handler) return send(res, 404, 'not found');
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers))
    if (typeof value === 'string') headers.set(name, value);
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const request = new Request(
    new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`),
    {
      method: req.method,
      headers,
      body: hasBody ? await readBody(req) : undefined,
    },
  );
  const response = await handler(request, {
    config: app.config,
    users: dashboard.users,
    store: storeFor(appId),
    publish: (topic, data) => publish(appId, topic, data),
    path,
  });
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
};

const serveStatic = async (res: ServerResponse, pathname: string) => {
  const file = normalize(join(publicDir, decodeURIComponent(pathname)));
  if (!file.startsWith(publicDir + sep)) return send(res, 404, 'not found');
  const target = extname(file) ? file : join(publicDir, 'index.html'); // SPA fallback
  try {
    const body = await readFile(target);
    res.writeHead(200, {
      'content-type': types[extname(target)] ?? 'application/octet-stream',
      // chunk names carry a content hash; everything else must revalidate after a deploy
      'cache-control': pathname.startsWith('/chunks/')
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    });
    res.end(body);
  } catch {
    send(res, 404, 'not found');
  }
};

createServer(async (req, res) => {
  if (!isLan(req.socket.remoteAddress)) return send(res, 403, 'forbidden');
  if (!isAllowedHost(req.headers.host, hostNames)) return send(res, 403, 'unknown host');
  const write = req.method !== 'GET' && req.method !== 'HEAD';
  if (write && !isSameOrigin(req.headers.origin, req.headers.host))
    return send(res, 403, 'cross-origin write');
  for (const [name, value] of Object.entries(securityHeaders)) res.setHeader(name, value);
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  try {
    if (pathname === '/api/events') return events(req, res);
    const route = pathname.match(/^\/api\/([\w-]+)\/(.*)$/);
    if (route) return await api(req, res, route[1], route[2]);
    return await serveStatic(res, pathname === '/' ? '/index.html' : pathname);
  } catch (error) {
    const status =
      (error as { status?: number }).status ??
      (error instanceof SyntaxError || error instanceof URIError ? 400 : 500);
    if (status === 500) console.error(error);
    if (!res.headersSent)
      send(res, status, status === 500 ? 'internal error' : (error as Error).message);
    else res.end();
  }
}).listen(port, host, () => console.log(`wall-dashboard on http://${host}:${port}`));
