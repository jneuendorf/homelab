// Shared lists (shopping, packing …), editable from any screen; stored in the generic app store.
import { defineApp } from '#sdk';

export type ListDef = { id: string; label: string; icon?: string };
export type ListsConfig = { lists: ListDef[] };
export type Entry = { id: string; text: string; done: boolean };

export const lists = defineApp<ListsConfig>({
  id: 'lists',
  label: 'Listen',
  icon: '📝',
  defaults: { lists: [{ id: 'einkauf', label: 'Einkauf', icon: '🛒' }] },
  ui: () => import('./ui.ts'),
});
