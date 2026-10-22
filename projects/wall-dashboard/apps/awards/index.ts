// Star chart with goals and rewards, like the paper "Superhelden" sheet: kids tap a mission, a
// parent confirms with the PIN (AWARDS_PIN in .env, checked on the server). Missions, goals and
// rewards are edited on the tablet; `missions` here only seeds an empty store.
import { defineApp } from '#sdk';
import type { Mission } from './logic.ts';

export type AwardsConfig = { sound: boolean; missions: Mission[] };

export const awards = defineApp<AwardsConfig>({
  id: 'awards',
  label: 'Sterne',
  icon: '⭐',
  defaults: {
    sound: true,
    missions: [
      { id: 'tisch-decken', icon: '🍽️', label: 'Tisch decken', stars: 1, counts: 'beide' },
      { id: 'abraeumen', icon: '🧽', label: 'Tisch abräumen', stars: 1, counts: 'beide' },
      { id: 'wischen', icon: '🧹', label: 'Wischen', stars: 2, counts: 'beide' },
      { id: 'broetchen', icon: '🥖', label: 'Brötchen holen', stars: 2, counts: 'beide' },
      { id: 'gs-aus', icon: '🍴', label: 'Spülmaschine ausräumen', stars: 1, counts: 'beide' },
      { id: 'gs-ein', icon: '🫧', label: 'Spülmaschine einräumen', stars: 1, counts: 'beide' },
      { id: 'zimmer', icon: '🧸', label: 'Zimmer aufräumen', stars: 1, counts: 'ich' },
      { id: 'alles-sauber', icon: '✨', label: 'Alles aufgeräumt', stars: 2, counts: 'familie' },
    ],
  },
  ui: () => import('./ui.ts'),
  server: () => import('./server.ts'),
});
