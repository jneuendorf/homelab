let config = {
  address: "0.0.0.0",
  port: 8080,
  ipWhitelist: ["192.168.1.0/24"],
  language: "de",
  locale: "de-DE",
  timeFormat: 24,
  modules: [
    { module: "clock", position: "top_left" },
    {
      module: "weather", position: "top_right",
      config: {
        weatherProvider: "openmeteo", type: "current",
        lat: 52.52, lon: 13.41,
      },
    },
    {
      module: "MMM-DayParts", position: "top_right",
      config: {
        lat: 52.52, lon: 13.41,
        hours: [8, 13, 19],
        labels: ["Morgen", "Mittag", "Abend"],
      },
    },
    {
      module: "calendar", position: "top_left",
      config: {
        coloredText: true,
        coloredSymbol: true,
        timeFormat: "absolute",
        urgency: 0,
        dateFormat: "dd, HH:mm",
        fullDayEventDateFormat: "dd, DD.MM.",
        fetchInterval: 5 * 60 * 1000,
        maximumNumberOfDays: 3,
        maximumEntries: 8,
        calendars: [
          // Replace YOUR_TOKEN with the real token from
          // Mac Calendar > right-click > Share Calendar > Public Calendar > copy link.
          // Use the https scheme, not the webcal one.
          { symbol: "headphones", color: "#2ecc71", url: "https://p149-caldav.icloud.com/published/2/YOUR_TOKEN_1" },
          { symbol: "futbol",     color: "#3498db", url: "https://p149-caldav.icloud.com/published/2/YOUR_TOKEN_2" },
          { symbol: "mountain-sun", color: "#95a5a6",
            url: "https://calendar.google.com/calendar/ical/de.german%23holiday%40group.v.calendar.google.com/public/basic.ics" },
        ],
      },
    },
    {
      module: "MMM-Routine", position: "bottom_bar",
      config: {
        deadline: "07:35",
        sound: true,
        // Reward emojis when a child finishes. Object (or (ctx) => object).
        // Let the kids pick from https://emojis.wiki/success/
        badges: { leader: "🏆", done: "⭐", beatDeadline: "✨" },
        children: [
          {
            name: "Kind 1", color: "#2ecc71",
            items: [
              { icon: "🛏️", label: "Umziehen" },
              { icon: "🥐", label: "Frühstück" },
              { icon: "🪥", label: "Zähne" },
              { icon: "👀", label: "Stundenplan" },
              { icon: "🥪🧃", label: "Einpacken" },
              { icon: "👕🧢", label: "Anziehen" },
            ],
          },
          {
            name: "Kind 2", color: "#3498db",
            items: [
              { icon: "🛏️", label: "Umziehen" },
              { icon: "🧇", label: "Frühstück" },
              { icon: "👀", label: "Stundenplan" },
              { icon: "🍱🥤", label: "Einpacken" },
              { icon: "🪥", label: "Zähne" },
              { icon: "👕👟", label: "Anziehen" },
            ],
          },
        ],
      },
    },
  ],
};
if (typeof module !== "undefined") { module.exports = config; }
