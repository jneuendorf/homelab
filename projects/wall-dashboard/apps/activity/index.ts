// Protokoll: what happened in all apps, and who was selected on the screen at the time. For the
// parents only (listed while unlocked; the server checks the PIN). Apps write with ctx.log().
import { defineApp } from '#sdk';

export type ActivityConfig = { days: number };

export const activity = defineApp<ActivityConfig>({
  id: 'activity',
  label: 'Protokoll',
  icon: '📜',
  admin: true,
  defaults: { days: 7 },
  ui: () => import('./ui.ts'),
});
