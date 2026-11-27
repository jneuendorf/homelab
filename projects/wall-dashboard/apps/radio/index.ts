// Kids radio: big station tiles, tap to play/stop; keeps playing while you switch apps. Admins add
// and remove stations on the tablet; `stations` here only seeds an empty store. Only the stored
// stations' hosts are allowed as media sources (CSP), so each needs its redirect hosts in `hosts`.
import { defineApp } from '#sdk';
import type { Limits } from './limits.ts';
import { mediaSources, type Station } from './logic.ts';

export type RadioConfig = { stations: Station[]; limits?: Limits };

const teddy = 'streamtdy.ir-media-tec.com';

export const radio = defineApp<RadioConfig>({
  id: 'radio',
  label: 'Radio',
  icon: '📻',
  defaults: {
    stations: [
      {
        id: 'teddy',
        icon: '🧸',
        label: 'Radio Teddy',
        url: `https://${teddy}/live/mp3-128/web/play.mp3`,
        hosts: [teddy, '*.streamabc.net'],
      },
      {
        id: 'maus',
        icon: '🐭',
        label: 'Die Maus',
        url: 'https://wdr-diemaus-live.icecastssl.wdr.de/wdr/diemaus/live/mp3/128/stream.mp3',
        hosts: ['wdr-diemaus-live.icecastssl.wdr.de', '*.rndfnk.com'],
      },
      {
        id: 'toggo',
        icon: '📺',
        label: 'TOGGO Radio',
        url: 'https://radio.toggo.de/live/mp3-192',
        hosts: ['radio.toggo.de', '*.streamabc.net'],
      },
      {
        id: 'teddy-gutenacht',
        icon: '🌙',
        label: 'Gute Nacht',
        url: `https://${teddy}/gutenacht/mp3-128/web/play.mp3`,
        hosts: [teddy, '*.streamabc.net'],
      },
    ],
  },
  ui: () => import('./ui.ts'),
  server: () => import('./server.ts'),
  csp: ({ config, store }) => ({
    'media-src': mediaSources(store.get<Station[]>('stations') ?? config.stations),
  }),
});
