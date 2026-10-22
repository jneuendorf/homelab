import { randomUUID } from 'node:crypto';
import { type Handler, secret } from '#sdk';
import type { AwardsConfig } from './index.ts';
import { apply, emptyState, parentActions, type State } from './logic.ts';

// A 4-digit PIN falls to brute force in minutes without this: 5 misses lock it for a minute.
const maxMisses = 5;
const lockMs = 60_000;
let misses = 0;
let lockedUntil = 0;

const checkPin = (pin: string | null) => {
  const expected = secret('AWARDS_PIN');
  if (!expected) return 'AWARDS_PIN not set';
  if (Date.now() < lockedUntil) return 'locked';
  if (pin === expected) {
    misses = 0;
    return null;
  }
  if (++misses >= maxMisses) {
    misses = 0;
    lockedUntil = Date.now() + lockMs;
  }
  return 'wrong pin';
};

const handler: Handler<AwardsConfig> = async (req, ctx) => {
  const state = ctx.store.get<State>('state') ?? emptyState(ctx.config.missions);
  if (ctx.path === 'state' && req.method === 'GET') return Response.json(state);
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  if (parentActions.has(ctx.path)) {
    const denied = checkPin(req.headers.get('x-pin'));
    if (denied) return new Response(denied, { status: 403 });
  }
  const userIds = ctx.users.map((u) => u.id);
  const next = apply(state, ctx.path, await req.json(), userIds, randomUUID);
  if (next !== state) ctx.store.set('state', next); // pushes topic "state" to every screen
  return new Response(null, { status: 204 });
};
export default handler;
