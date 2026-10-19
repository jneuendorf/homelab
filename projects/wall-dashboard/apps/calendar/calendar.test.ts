import assert from 'node:assert/strict';
import { test } from 'node:test';
import { expand } from './server.ts';

const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:test
BEGIN:VEVENT
UID:fussball
DTSTART:20261006T160000
DTEND:20261006T173000
RRULE:FREQ=WEEKLY;BYDAY=TU
EXDATE:20261027T160000
SUMMARY:Fußball
LOCATION:Sportplatz
END:VEVENT
BEGIN:VEVENT
UID:fussball
RECURRENCE-ID:20261020T160000
DTSTART:20261020T170000
DTEND:20261020T183000
SUMMARY:Fußball (später)
END:VEVENT
BEGIN:VEVENT
UID:ferien
DTSTART;VALUE=DATE:20261019
DTEND;VALUE=DATE:20261031
SUMMARY:Herbstferien
END:VEVENT
BEGIN:VEVENT
UID:alt
DTSTART;VALUE=DATE:20260101
SUMMARY:Längst vorbei
END:VEVENT
END:VCALENDAR`;

test('expands recurrences, exceptions, EXDATE and multi-day all-day events', () => {
  const events = expand(ics, new Date(2026, 9, 18), new Date(2026, 10, 1));
  const byTitle = (t: string) => events.filter((e) => e.title === t);

  // weekly on Tuesdays: 20th moved (exception), 27th excluded → none left as plain "Fußball"
  assert.equal(byTitle('Fußball').length, 0);
  const moved = byTitle('Fußball (später)');
  assert.equal(moved.length, 1);
  assert.equal(new Date(moved[0].start).getHours(), 17);

  // all-day spanning the window start; dates stay timezone-free
  assert.deepEqual(
    byTitle('Herbstferien').map((e) => [e.start, e.end, e.allDay]),
    [['2026-10-19', '2026-10-31', true]],
  );
  assert.equal(byTitle('Längst vorbei').length, 0);
});

test('keeps location and timed occurrences inside the window', () => {
  const events = expand(ics, new Date(2026, 9, 12), new Date(2026, 9, 19));
  assert.deepEqual(
    events.map((e) => [e.title, e.location]),
    [['Fußball', 'Sportplatz']],
  );
});
