import { randomUUID } from 'node:crypto';
import { type Handler, membersOf } from '#sdk';
import type { AwardsConfig } from './index.ts';
import { apply, emptyState, parentActions, type State } from './logic.ts';

/** The activity log line for an applied action. */
const describe = (
  action: string,
  body: Record<string, unknown>,
  state: State,
  name: (id: unknown) => string,
) => {
  const star = state.stars.find((s) => s.id === body.id);
  const mission = state.missions.find((m) => m.id === body.mission);
  return (
    {
      claim: `⭐ ${mission?.icon} ${mission?.label} für ${name(body.user)}`,
      withdraw: `↩️ ${star?.icon} ${star?.label} zurückgenommen`,
      remove: `✕ ${star?.icon} ${star?.label} (${name(star?.user)}) entfernt`,
      confirm: `✔️ ${Array.isArray(body.ids) ? body.ids.length : 0} Sterne bestätigt`,
      bonus: `🌟 ${body.stars} Bonus für ${name(body.user)}: ${body.label}`,
      missions: '✏️ Missionen geändert',
      goal: `🎯 Ziel ${body.archive === true ? 'abgeschlossen' : 'geändert'}`,
    }[action] ?? action
  );
};

const handler: Handler<AwardsConfig> = async (req, ctx) => {
  const state = ctx.store.get<State>('state') ?? emptyState(ctx.config.missions);
  if (ctx.path === 'state' && req.method === 'GET') {
    return Response.json(state);
  }
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  if (parentActions.has(ctx.path) && !ctx.admin) {
    return new Response('nur Eltern', { status: 403 });
  }
  const userIds = membersOf(ctx.users).map((u) => u.id);
  const body = await req.json();
  const next = apply(state, ctx.path, body, userIds, randomUUID);
  if (next === state) {
    return new Response(null, { status: 204 });
  }
  ctx.store.set('state', next); // pushes topic "state" to every screen
  const name = (id: unknown) => ctx.users.find((u) => u.id === id)?.name ?? 'Familie';
  ctx.log(describe(ctx.path, body ?? {}, state, name));
  return new Response(null, { status: 204 });
};
export default handler;
