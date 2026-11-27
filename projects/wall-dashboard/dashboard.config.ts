// Sanitized sample. On the host: copy to dashboard.local.ts (gitignored, wins if present) and put
// real names there; secrets go in .env (see secret()). Apps appear in the menubar in this order.
import { defineDashboard, secret } from '#sdk';
import { activity } from './apps/activity/index.ts';
import { awards } from './apps/awards/index.ts';
import { calendar } from './apps/calendar/index.ts';
import { lists } from './apps/lists/index.ts';
import { radio } from './apps/radio/index.ts';
import { routine } from './apps/routine/index.ts';
import { today } from './apps/today/index.ts';
import { weather } from './apps/weather/index.ts';

// shared by routine (deadline) and radio (morning radio ends 10 min before it)
const schoolStart = '07:35';

export default defineDashboard({
  title: 'Familie',
  locale: 'de-DE',
  theme: 'kids',
  users: [
    { id: 'kind1', name: 'Kind 1', color: '#2ecc71', avatar: '🦊' },
    { id: 'kind2', name: 'Kind 2', color: '#3498db', avatar: '🐉' },
    // + the default admin 'Eltern' (defaultAdmin); list a user with admin: true to replace it
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
      deadline: schoolStart,
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
            // ctx.calendar = this user's + family events today
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
    radio({
      // one budget for the household; parents can add 15 min or lift the limits for today
      limits: {
        windows: [
          { days: 'mo-fr', from: '06:30', until: `${schoolStart}-10` },
          { days: 'mo-fr', from: '14:00', until: '19:30' },
          { days: ['sa', 'su'], from: '08:00', until: '19:30' },
        ],
        perDay: 60,
        perSession: 30,
        cooldown: 15,
        warnBefore: 2,
        stations: { 'teddy-gutenacht': { windows: [{ from: '18:30', until: '19:30' }] } },
      },
    }),
    weather({ lat: 52.52, lon: 13.41 }),
    activity(), // Protokoll: who did what, for parents
  ],
});
