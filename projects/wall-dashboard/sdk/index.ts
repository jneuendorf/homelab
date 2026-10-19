// The whole app contract. Isomorphic: imported by the server (config, handlers) and the browser
// bundle (ui). Nothing here touches the DOM at import time.

export type User = { id: string; name: string; color: string; avatar?: string };

/** Sparse per-user overrides, merged over the app's config by `forUser`. */
export type PerUser<C> = { perUser?: Record<string, Partial<C>> };

export type Store = {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
};

export type AppContext<C> = {
  /** Config resolved for `user` (or the base config in the family view). */
  config: C;
  /** Selected user, or null for the family view. */
  user: User | null;
  users: User[];
  locale: string;
  /** Config resolved for any user — for apps that show several users at once (e.g. routine). */
  configFor(userId: string): C;
  /** fetch() scoped to this app's server handler: api('events') → /api/<app>/events */
  api(path: string, init?: RequestInit): Promise<Response>;
  /** Per-app key/value store; every set() is pushed to all screens as topic `<key>`. */
  store: Store;
  /** Listen to this app's pushes (store keys or server publish() topics). Auto-removed on unmount. */
  subscribe(topic: string, cb: (data: unknown) => void): void;
};

/** Draw into `el`; return a cleanup that stops timers etc. */
export type Mount<C> = (el: HTMLElement, ctx: AppContext<C>) => () => void;

export type ServerStore = {
  get<T = unknown>(key: string): T | null;
  set(key: string, value: unknown): void;
};

export type ServerContext<C> = {
  config: C & PerUser<C>;
  users: User[];
  store: ServerStore;
  publish(topic: string, data: unknown): void;
  /** Path below /api/<app>/, e.g. "events". */
  path: string;
};

export type Handler<C> = (req: Request, ctx: ServerContext<C>) => Response | Promise<Response>;

export type AppDef<C> = {
  id: string;
  /** Omit label/ui for a server-only app (no menubar entry). */
  label?: string;
  icon?: string;
  defaults: C;
  ui?: () => Promise<{ mount: Mount<C> }>;
  server?: () => Promise<{ default: Handler<C> }>;
};

// biome-ignore lint/suspicious/noExplicitAny: dashboard.apps mixes apps with different config types
export type App<C = any> = AppDef<C> & { config: C & PerUser<C> };

/** Turns an app definition into a typed factory: `routine({ deadline: '07:40' })`. */
export const defineApp =
  <C extends object>(def: AppDef<C>) =>
  (config: Partial<C> & PerUser<C> = {}): App<C> => ({
    ...def,
    config: { ...def.defaults, ...config },
  });

export type Dashboard = {
  title?: string;
  locale?: string;
  theme?: 'kids' | 'night' | 'contrast';
  users: User[];
  apps: App[];
};

export const defineDashboard = (dashboard: Dashboard) => dashboard;

// ponytail: shallow merge — a per-user value replaces the whole key, which is what lists want
export const forUser = <C>(config: C & PerUser<C>, userId?: string | null): C => {
  const { perUser, ...base } = config;
  return { ...base, ...(userId ? perUser?.[userId] : undefined) } as C;
};

/** Server: the env var's value. Browser bundle: undefined — only the name ships to the client. */
export const secret = (name: string): string | undefined =>
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env[name];

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
  if (!found) throw new Error(`missing element: ${selector}`);
  return found;
};

/** Injects an app's CSS once (apps import their .css as text). */
export const adoptStyle = (id: string, css: string) => {
  if (document.getElementById(`style-${id}`)) return;
  const style = document.createElement('style');
  style.id = `style-${id}`;
  style.textContent = css;
  document.head.append(style);
};

export const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** setTimeout aligned to the next full minute, repeating; returns a stop function. */
export const everyMinute = (fn: () => void) => {
  let timer: ReturnType<typeof setTimeout>;
  const tick = () => {
    timer = setTimeout(
      () => {
        fn();
        tick();
      },
      60_000 - (Date.now() % 60_000) + 50,
    );
  };
  tick();
  return () => clearTimeout(timer);
};
