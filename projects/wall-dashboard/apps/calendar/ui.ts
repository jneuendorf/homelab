import type { Mount } from '#sdk';
import { fetchEvents, type CalendarConfig } from './index.ts';
import { agenda, useCalendarStyle } from './view.ts';

export const mount: Mount<CalendarConfig> = (el, ctx) => {
  useCalendarStyle();
  const render = async () => {
    el.innerHTML = agenda(await fetchEvents(ctx.config.days, ctx.user?.id), ctx.locale);
  };
  render();
  const timer = setInterval(render, ctx.config.refreshMinutes * 60_000);
  return () => clearInterval(timer);
};
