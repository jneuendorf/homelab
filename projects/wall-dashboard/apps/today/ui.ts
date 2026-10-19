import { $, adoptStyle, everyMinute, html, raw, type Mount } from '#sdk';
import { fetchEvents } from '../calendar/index.ts';
import { agenda, useCalendarStyle } from '../calendar/view.ts';
import { fetchWeather, icon, type Weather } from '../weather/index.ts';
import type { TodayConfig } from './index.ts';
import css from './ui.css';

export const mount: Mount<TodayConfig> = (el, ctx) => {
  adoptStyle('today', css);
  useCalendarStyle();
  el.innerHTML = html`<div class="today">
    <div class="today-side">
      <div class="clock"></div>
      <div class="weather"></div>
    </div>
    <div class="today-events"></div>
  </div>`;
  const clock = $(el, '.clock');
  const weatherEl = $(el, '.weather');
  const eventsEl = $(el, '.today-events');

  const tick = () => {
    const now = new Date();
    clock.innerHTML = html`<div class="time">
        ${now.toLocaleTimeString(ctx.locale, {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </div>
      <div class="date">
        ${now.toLocaleDateString(ctx.locale, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
      </div>`;
  };
  const showWeather = (w: Weather | null) => {
    weatherEl.innerHTML = w
      ? html`<div class="now">${icon(w.current.code)} ${w.current.temp}°</div>
          ${w.parts.map((p) =>
            raw(
              html`<div class="part">
                <span>${p.label}</span><span>${icon(p.code)}</span>
                <b>${p.temp == null ? '–' : `${p.temp}°`}</b>
              </div>`,
            ),
          )}`
      : '⚠️ Wetter n/a';
  };
  const refresh = async () => {
    const [w, events] = await Promise.all([
      fetchWeather(),
      fetchEvents(ctx.config.days, ctx.user?.id),
    ]);
    showWeather(w);
    eventsEl.innerHTML = agenda(events, ctx.locale);
  };

  tick();
  refresh();
  const stopClock = everyMinute(tick);
  const timer = setInterval(refresh, ctx.config.refreshMinutes * 60_000);
  return () => {
    stopClock();
    clearInterval(timer);
  };
};
