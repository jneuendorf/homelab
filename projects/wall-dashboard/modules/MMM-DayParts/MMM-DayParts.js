Module.register("MMM-DayParts", {
  defaults: {
    lat: 52.52, lon: 13.41,
    hours: [8, 13, 19],
    labels: ["Morgen", "Mittag", "Abend"],
    updateInterval: 30 * 60 * 1000,
  },

  start() {
    this.parts = null;
    this.error = null;
    this.fetch();
    setInterval(() => this.fetch(), this.config.updateInterval);
  },

  fetch() { this.sendSocketNotification("DAYPARTS_FETCH", this.config); },
  getStyles() { return [this.file("MMM-DayParts.css")]; },

  socketNotificationReceived(notification, payload) {
    if (notification === "DAYPARTS_DATA")  { this.parts = payload; this.error = null; this.sendNotification("DAYPARTS_WEATHER", payload); }
    if (notification === "DAYPARTS_ERROR") { this.error = payload; }
    this.updateDom(300);
  },

  icon(weatherCode) {
    if (weatherCode == null) return "";
    if (weatherCode === 0)  return "☀️";
    if (weatherCode <= 2)   return "🌤️";
    if (weatherCode === 3)  return "☁️";
    if (weatherCode <= 48)  return "🌫️";
    if (weatherCode <= 67)  return "🌧️";
    if (weatherCode <= 77)  return "❄️";
    if (weatherCode <= 82)  return "🌦️";
    if (weatherCode <= 86)  return "🌨️";
    return "⛈️";
  },

  getDom() {
    const container = document.createElement("div");
    container.className = "dayparts";
    if (this.error)  { container.textContent = "⚠️ Wetter n/a"; return container; }
    if (!this.parts) { container.textContent = "…"; return container; }
    for (const part of this.parts) {
      const row = document.createElement("div");
      row.className = "daypart-row";
      row.innerHTML =
        `<span class="daypart-label">${part.label}</span>` +
        `<span class="daypart-icon">${this.icon(part.code)}</span>` +
        `<span class="daypart-temp">${part.temp == null ? "–" : part.temp + "°"}</span>`;
      container.appendChild(row);
    }
    return container;
  },
});
