// Sanitized sample. On the host: copy to dashboard.local.ts (gitignored, wins if present) and put
// real names there; secrets go in .env (see secret()). Apps appear in the menubar in this order.
import { defineDashboard, secret } from '#sdk';
import { awards } from './apps/awards/index.ts';
import { calendar } from './apps/calendar/index.ts';
import { lists } from './apps/lists/index.ts';
import { routine } from './apps/routine/index.ts';
import { today } from './apps/today/index.ts';
import { weather } from './apps/weather/index.ts';

export default defineDashboard({
  title: 'Familie',
  locale: 'de-DE',
  theme: 'kids',
  users: [
    { id: 'kind1', name: 'Kind 1', color: '#2ecc71', avatar: '🦊' },
    { id: 'kind2', name: 'Kind 2', color: '#3498db', avatar: '🐉' },
    { id: 'eltern', name: 'Eltern', color: '#e67e22', avatar: '☕' },
  ],
  apps: [
    today(),
    calendar({
      feeds: [
        // iCloud: Mac Calendar → right-click → Share Calendar → Public → copy the https link
        { user: 'kind1', url: secret('CAL_KIND1') },
        { user: 'kind2', url: secret('CAL_KIND2') },
        {
          color: '#95a5a6',
          url: 'https://calendar.google.com/calendar/ical/de.german%23holiday%40group.v.calendar.google.com/public/basic.ics',
        },
      ],
    }),
    routine({
      deadline: '07:35',
      // per user: plain values or (ctx) => value. Callbacks run in the browser and may import
      // anything (they are bundled), e.g. shared helpers.
      perUser: {
        kind1: {
          badges: { leader: '🥇', done: '😎', beatDeadline: '⚡' },
          items: [
            { icon: '🛏️', label: 'Umziehen' },
            { icon: '🥐', label: 'Frühstück' },
            { icon: '🪥', label: 'Zähne' },
            { icon: '👀', label: 'Stundenplan' },
            { icon: '🥪🧃', label: 'Einpacken' },
            { icon: '👕🧢', label: 'Anziehen' },
          ],
        },
        kind2: {
          // one emoji per badge from a pool, stable for the day
          badges: () => {
            const day = Math.floor(Date.now() / 86_400_000);
            const pick = (choices: string[], salt: number) =>
              choices[(day + salt) % choices.length];
            return {
              leader: pick(['🏆', '🐉', '🦖', '👑'], 0),
              done: pick(['⭐', '🙌', '⚽'], 1),
              beatDeadline: pick(['✨', '🔥', '🚀'], 2),
            };
          },
          items: (ctx) => {
            // ctx.calendar = this child's + family events today
            const away = ctx.calendar.some(
              (e) => e.location && !/schule|kita|zuhause/i.test(e.location),
            );
            const trip = ctx.calendar.some((e) => /ausflug/i.test(`${e.title} ${e.location}`));
            const cold = (ctx.weather?.parts[0]?.temp ?? 20) < 8;
            return [
              { icon: '🛏️', label: 'Umziehen' },
              { icon: '🧇', label: 'Frühstück' },
              { icon: '👀', label: 'Stundenplan' },
              ...(ctx.dayOfWeek === 2 ? [{ icon: '🎽', label: 'Sportzeug' }] : []),
              ...(trip ? [{ icon: '🎒', label: 'Rucksack' }] : []),
              ...(away ? [{ icon: '🚰', label: 'Trinkflasche' }] : []),
              { icon: '🍱🥤', label: 'Einpacken' },
              { icon: '🪥', label: 'Zähne' },
              ...(cold ? [{ icon: '🧥', label: 'Jacke' }] : []),
              { icon: '👕👟', label: 'Anziehen' },
            ];
          },
        },
      },
    }),
    lists({
      lists: [
        { id: 'einkauf', label: 'Einkauf', icon: '🛒' },
        { id: 'packen', label: 'Packliste', icon: '🧳' },
      ],
    }),
    awards(),
    weather({ lat: 52.52, lon: 13.41 }),
  ],
});
