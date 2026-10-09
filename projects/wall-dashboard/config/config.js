let config = {
  address: '0.0.0.0',
  port: 8080,
  ipWhitelist: ['192.168.1.0/24'],
  language: 'de',
  locale: 'de-DE',
  timeFormat: 24,
  modules: [
    { module: 'clock', position: 'top_left' },
    {
      module: 'weather',
      position: 'top_right',
      config: {
        weatherProvider: 'openmeteo',
        type: 'current',
        lat: 52.52,
        lon: 13.41,
      },
    },
    {
      module: 'MMM-DayParts',
      position: 'top_right',
      config: {
        lat: 52.52,
        lon: 13.41,
        hours: [8, 13, 19],
        labels: ['Morgen', 'Mittag', 'Abend'],
      },
    },
    {
      module: 'calendar',
      position: 'top_left',
      config: {
        coloredText: true,
        coloredSymbol: true,
        timeFormat: 'absolute',
        urgency: 0,
        dateFormat: 'dd, HH:mm',
        fullDayEventDateFormat: 'dd, DD.MM.',
        fetchInterval: 5 * 60 * 1000,
        maximumNumberOfDays: 3,
        maximumEntries: 8,
        calendars: [
          // Replace YOUR_TOKEN with the real token from
          // Mac Calendar > right-click > Share Calendar > Public Calendar > copy link.
          // Use the https scheme, not the webcal one.
          {
            symbol: 'headphones',
            color: '#2ecc71',
            url: 'https://p149-caldav.icloud.com/published/2/YOUR_TOKEN_1',
          },
          {
            symbol: 'futbol',
            color: '#3498db',
            url: 'https://p149-caldav.icloud.com/published/2/YOUR_TOKEN_2',
          },
          {
            symbol: 'mountain-sun',
            color: '#95a5a6',
            url: 'https://calendar.google.com/calendar/ical/de.german%23holiday%40group.v.calendar.google.com/public/basic.ics',
          },
        ],
      },
    },
    {
      module: 'MMM-Routine',
      position: 'bottom_bar',
      config: {
        deadline: '07:35',
        sound: true,
        // Per child: `items` (checklist) and `badges` (reward emojis, default 🏆/⭐/✨; let the kids
        // pick from https://emojis.wiki/success/) are each a plain value OR a (ctx) => value callback.
        // Kind 1 shows the simple form, Kind 2 the dynamic one.
        children: [
          {
            name: 'Kind 1',
            color: '#2ecc71',
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
          {
            name: 'Kind 2',
            color: '#3498db',
            // Callbacks are re-evaluated in the browser: use only `ctx` + built-ins, no outer helpers.
            // One emoji per badge from a pool, stable for the day (no flicker on re-render).
            badges: (ctx) => {
              const day = Math.floor(Date.now() / 86400000);
              const pick = (choices, salt) => choices[(day + salt) % choices.length];
              return {
                leader: pick(['🏆', '🐉', '🦖', '👑'], 0),
                done: pick(['⭐', '🙌', '⚽'], 1),
                beatDeadline: pick(['✨', '🔥', '🚀'], 2),
              };
            },
            items: (ctx) => {
              // this child's events: calendar color === child color (see `calendars` above)
              const mine = ctx.calendar.filter((e) => e.color === ctx.color);
              // an event somewhere other than home/school: a plain free-text test, no coordinates
              const away = mine.some((e) => e.location && !/schule|kita|zuhause/i.test(e.location));
              return [
                { icon: '🛏️', label: 'Umziehen' },
                { icon: '🧇', label: 'Frühstück' },
                { icon: '👀', label: 'Stundenplan' },
                // Tuesday = Sport → pack the gym bag
                ...(ctx.dayOfWeek === 2 ? [{ icon: '🎽', label: 'Sportzeug' }] : []),
                // school trip on this child's calendar today (title or location)
                ...(mine.some((e) => /ausflug/i.test(e.title + ' ' + e.location))
                  ? [{ icon: '🎒', label: 'Rucksack' }]
                  : []),
                // out-of-house appointment today → pack a water bottle
                ...(away ? [{ icon: '🚰', label: 'Trinkflasche' }] : []),
                { icon: '🍱🥤', label: 'Einpacken' },
                { icon: '🪥', label: 'Zähne' },
                // cold morning → jacket
                ...((ctx.weather?.[0]?.temp ?? 20) < 8 ? [{ icon: '🧥', label: 'Jacke' }] : []),
                { icon: '👕👟', label: 'Anziehen' },
              ];
            },
          },
        ],
      },
    },
  ],
};
if (typeof module !== 'undefined') {
  module.exports = config;
}
