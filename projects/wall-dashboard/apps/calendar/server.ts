import ICAL from 'ical.js';
import type { Handler } from '#sdk';
import type { CalendarConfig, CalendarEvent } from './index.ts';

type Occurrence = Omit<CalendarEvent, 'user' | 'color'>;

const pad = (n: number) => String(n).padStart(2, '0');
const toEventTime = (time: ICAL.Time) =>
  time.isDate ? `${time.year}-${pad(time.month)}-${pad(time.day)}` : time.toJSDate().toISOString();

/** All occurrences overlapping [from, to), recurrences and their exceptions expanded. */
export const expand = (ics: string, from: Date, to: Date): Occurrence[] => {
  const root = new ICAL.Component(ICAL.parse(ics));
  for (const tz of root.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(tz);
  const events = root.getAllSubcomponents('vevent').map((c) => new ICAL.Event(c));
  const masters = new Map(events.filter((e) => !e.isRecurrenceException()).map((e) => [e.uid, e]));
  for (const e of events) if (e.isRecurrenceException()) masters.get(e.uid)?.relateException(e);
  const orphans = events.filter((e) => e.isRecurrenceException() && !masters.has(e.uid));

  const out: Occurrence[] = [];
  for (const event of [...masters.values(), ...orphans]) {
    const it = event.iterator();
    // ponytail: walks from DTSTART; cap guards ancient daily series, add a seek if one ever hits it
    for (let n = 0; n < 5000; n++) {
      const next = it.next();
      if (!next) break;
      const { startDate, endDate, item } = event.isRecurrenceException()
        ? { startDate: event.startDate, endDate: event.endDate, item: event }
        : event.getOccurrenceDetails(next);
      const start = startDate.toJSDate();
      if (start >= to) break;
      if (endDate.toJSDate() > from || start >= from)
        out.push({
          title: item.summary ?? '',
          start: toEventTime(startDate),
          end: toEventTime(endDate),
          allDay: startDate.isDate,
          location: item.location ?? '',
        });
      if (event.isRecurrenceException()) break;
    }
  }
  return out;
};

// Feeds are fetched on demand and cached; a failing feed serves its last good copy.
const ttl = 10 * 60 * 1000;
const cache = new Map<string, { at: number; ics: string }>();
const load = async (url: string) => {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < ttl) return hit.ics;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ics = await res.text();
    cache.set(url, { at: Date.now(), ics });
    return ics;
  } catch (error) {
    console.warn(`calendar: ${new URL(url).host}: ${error}`); // host only, the path is the token
    return hit?.ics ?? '';
  }
};

const handler: Handler<CalendarConfig> = async (req, { config, users, path }) => {
  if (path !== 'events') return new Response('not found', { status: 404 });
  const asked = Number(new URL(req.url).searchParams.get('days'));
  const days = Math.min(31, Math.max(1, asked || config.days));
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + days);

  const perFeed = await Promise.all(
    config.feeds.map(async ({ url, ...feed }) => {
      if (!url) return [];
      const color = feed.color ?? users.find((u) => u.id === feed.user)?.color ?? '#95a5a6';
      try {
        const ics = await load(url);
        return ics
          ? expand(ics, from, to).map((e) => ({ ...e, user: feed.user ?? null, color }))
          : [];
      } catch (error) {
        console.warn(`calendar: unparsable feed ${new URL(url).host}: ${error}`);
        return [];
      }
    }),
  );
  const sortKey = (e: CalendarEvent) =>
    e.allDay ? new Date(`${e.start}T00:00`).getTime() - 1 : Date.parse(e.start);
  return Response.json(perFeed.flat().sort((a, b) => sortKey(a) - sortKey(b)));
};
export default handler;
