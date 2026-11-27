import { randomUUID } from 'node:crypto';
import { type Handler, membersOf } from '#sdk';
import type { AwardsConfig } from './index.ts';
import { apply, emptyState, parentActions, type State } from './logic.ts';

const handler: Handler<AwardsConfig> = async (req, ctx) => {
  const state = ctx.store.get<State>('state') ?? emptyState(ctx.config.missions);
  if (ctx.path === 'state' && req.method === 'GET') return Response.json(state);
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  if (parentActions.has(ctx.path) && !ctx.admin) return new Response('nur Eltern', { status: 403 });
  const userIds = membersOf(ctx.users).map((u) => u.id);
  const next = apply(state, ctx.path, await req.json(), userIds, randomUUID);
  if (next !== state) ctx.store.set('state', next); // pushes topic "state" to every screen
  return new Response(null, { status: 204 });
};
export default handler;
