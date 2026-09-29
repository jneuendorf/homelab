const NodeHelper = require("node_helper");

module.exports = NodeHelper.create({
  socketNotificationReceived(notification, config) {
    if (notification !== "DAYPARTS_FETCH") return;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${config.lat}&longitude=${config.lon}`
      + `&hourly=temperature_2m,weathercode&timezone=auto&forecast_days=1`;
    fetch(url)
      .then((response) => response.json())
      .then((forecast) => {
        const { time: timestamps, temperature_2m: temperatures, weathercode: weatherCodes } = forecast.hourly;
        const dayPrefix = timestamps[0].slice(0, 10);
        const parts = config.hours.map((hour, index) => {
          const hourIndex = timestamps.indexOf(`${dayPrefix}T${String(hour).padStart(2, "0")}:00`);
          return {
            label: config.labels[index],
            temp: hourIndex < 0 ? null : Math.round(temperatures[hourIndex]),
            code: hourIndex < 0 ? null : weatherCodes[hourIndex],
          };
        });
        this.sendSocketNotification("DAYPARTS_DATA", parts);
      })
      .catch((error) => this.sendSocketNotification("DAYPARTS_ERROR", String(error)));
  },
});
