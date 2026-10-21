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
