// Optional helpers for apps — not part of the contract. Vanilla apps use them; a React/Svelte app
// brings its own. Browser-only ones (`$`, `adoptStyle`) touch the DOM only when called.

const escapes: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
export const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => escapes[c]);

/** Template tag that escapes interpolations; nest with raw() for trusted markup. */
export const html = (strings: TemplateStringsArray, ...values: unknown[]) =>
  strings.reduce((out, s, i) => {
    const v = values[i - 1];
    const part = Array.isArray(v)
      ? v.map((x) => (x instanceof Raw ? x.value : escapeHtml(x))).join('')
      : v instanceof Raw
        ? v.value
        : escapeHtml(v);
    return out + part + s;
  });

class Raw {
  value: string;
  constructor(value: string) {
    this.value = value;
  }
}
export const raw = (value: string) => new Raw(value);

/** querySelector that throws instead of returning null — for markup the caller just rendered. */
export const $ = <E extends Element = HTMLElement>(root: ParentNode, selector: string): E => {
  const found = root.querySelector<E>(selector);
  if (!found) {
    throw new Error(`missing element: ${selector}`);
  }
  return found;
};

/** Injects an app's CSS once (apps import their .css as text). */
export const adoptStyle = (id: string, css: string) => {
  if (document.getElementById(`style-${id}`)) {
    return;
  }
  const style = document.createElement('style');
  style.id = `style-${id}`;
  style.textContent = css;
  document.head.append(style);
};

export const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar day (not UTC), "YYYY-MM-DD" — the usual per-day store key. */
export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Times and days shared by the apps' configs (routine windows, radio limits), so one const in
// dashboard.config.ts can drive several apps.
export type Day = 'mo' | 'tu' | 'we' | 'th' | 'fr' | 'sa' | 'su';
/** 'mo', 'mo-fr' (may wrap: 'fr-mo') or a list. None = every day. */
export type Days = Day | `${Day}-${Day}` | Day[];
/** 'HH:MM', optionally shifted by minutes: '07:35-10' = 07:25. */
export type Time = `${number}:${number}` | `${number}:${number}${'+' | '-'}${number}`;

const weekdays: Day[] = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'];

/** Whether `days` includes weekday `day` (0 = Sunday, as Date.getDay()). */
export const dayMatches = (days: Days | undefined, day: number) => {
  if (!days) {
    return true;
  }
  if (Array.isArray(days)) {
    return days.some((d) => weekdays.indexOf(d) === day);
  }
  const [from, until = from] = days.split('-').map((d) => weekdays.indexOf(d as Day));
  return from <= until ? day >= from && day <= until : day >= from || day <= until;
};

/** `time` on the calendar day of `date`, in ms. */
export const timeAt = (time: Time, date: Date) => {
  const [, h, m, sign, shift] = /^(\d+):(\d+)(?:([+-])(\d+))?$/.exec(time) ?? [];
  const offset = shift ? (sign === '-' ? -1 : 1) * Number(shift) : 0;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), +h, +m + offset).getTime();
};

// Timers run on a monotonic clock, Date.now() on the (NTP-adjusted, privacy-rounded) wall clock:
// a timeout aimed exactly at a boundary can fire a few ms early and render the previous second.
// Firing slightly late is invisible; any value above that drift works.
const boundarySlackMs = 20;

/** setTimeout aligned to the next multiple of `ms` (e.g. full second), repeating; returns a stop function. */
export const every = (ms: number, fn: () => void) => {
  let timer: ReturnType<typeof setTimeout>;
  const tick = () => {
    timer = setTimeout(
      () => {
        fn();
        tick();
      },
      ms - (Date.now() % ms) + boundarySlackMs,
    );
  };
  tick();
  return () => clearTimeout(timer);
};
export const everyMinute = (fn: () => void) => every(60_000, fn);

let audio: AudioContext | undefined;
/** Short sine notes (Hz), 120 ms apart — e.g. [880] for a tick, a rising run for a fanfare. */
export const chime = (frequencies: number[]) => {
  try {
    audio ??= new AudioContext();
    const ac = audio; // narrowed here; the closure below would widen `audio` again
    frequencies.forEach((frequency, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.frequency.value = frequency;
      osc.connect(gain).connect(ac.destination);
      const t = ac.currentTime + i * 0.12;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
      osc.start(t);
      osc.stop(t + 0.27);
    });
  } catch {
    // audio not allowed before the first tap
  }
};
