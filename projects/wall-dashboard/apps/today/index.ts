// Home screen: clock, weather, today's + tomorrow's events. UI only; reads the weather and
// calendar apps' APIs.
import { defineApp } from '#sdk';

export type TodayConfig = { days: number; refreshMinutes: number };

export const today = defineApp<TodayConfig>({
  id: 'today',
  label: 'Heute',
  icon: '🏠',
  defaults: { days: 2, refreshMinutes: 15 },
  ui: () => import('./ui.ts'),
});
