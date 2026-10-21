import type { Mount } from '#sdk';
import { $, adoptStyle, every, html, pad, raw } from '#sdk/utils';
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

  clock.innerHTML = html`<div class="time"><span></span><span class="seconds"></span></div>
    <div class="date"></div>`;
  const [hmEl, secondsEl] = $(clock, '.time').children;
  const dateEl = $(clock, '.date');
  // per second only the seconds text changes; the rest is rewritten when it differs
  const tick = () => {
    const now = new Date();
    secondsEl.textContent = pad(now.getSeconds());
    const hm = now.toLocaleTimeString(ctx.locale, { hour: '2-digit', minute: '2-digit' });
    if (hmEl.textContent !== hm) hmEl.textContent = hm;
    const date = now.toLocaleDateString(ctx.locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    if (dateEl.textContent !== date) dateEl.textContent = date;
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
  const stopClock = every(1000, tick);
  const timer = setInterval(refresh, ctx.config.refreshMinutes * 60_000);
  return () => {
    stopClock();
    clearInterval(timer);
  };
};
