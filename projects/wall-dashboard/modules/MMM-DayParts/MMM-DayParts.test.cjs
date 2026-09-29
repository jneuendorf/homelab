const assert = require("node:assert");

// WMO code -> emoji buckets
const icon = (weatherCode) =>
  weatherCode == null ? "" : weatherCode === 0 ? "☀️" : weatherCode <= 2 ? "🌤️" : weatherCode === 3 ? "☁️"
  : weatherCode <= 48 ? "🌫️" : weatherCode <= 67 ? "🌧️" : weatherCode <= 77 ? "❄️"
  : weatherCode <= 82 ? "🌦️" : weatherCode <= 86 ? "🌨️" : "⛈️";
assert.equal(icon(0), "☀️");
assert.equal(icon(3), "☁️");
assert.equal(icon(61), "🌧️");
assert.equal(icon(95), "⛈️");
assert.equal(icon(null), "");

// pick-by-hour against a fake Open-Meteo payload
const timestamps = Array.from({ length: 24 }, (_, hour) => `2026-08-25T${String(hour).padStart(2, "0")}:00`);
const temperatures = Array.from({ length: 24 }, (_, hour) => hour);
const dayPrefix = timestamps[0].slice(0, 10);
const pickTemperatureAt = (hour) => {
  const hourIndex = timestamps.indexOf(`${dayPrefix}T${String(hour).padStart(2, "0")}:00`);
  return hourIndex < 0 ? null : temperatures[hourIndex];
};
assert.deepEqual([pickTemperatureAt(8), pickTemperatureAt(13), pickTemperatureAt(19)], [8, 13, 19]);
console.log("MMM-DayParts self-check OK");
