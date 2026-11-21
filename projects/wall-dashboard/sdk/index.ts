// The whole app contract. Isomorphic: imported by the server (config, handlers) and the browser
// bundle (ui). Nothing here touches the DOM at import time.

export type User = {
  id: string;
  name: string;
  color: string;
  avatar?: string;
  /** Configures apps (behind a PIN where it matters); not a member in routine, stars … */
  admin?: boolean;
};

/** Added by defineDashboard when no user is `admin`. */
export const defaultAdmin: User = {
  id: 'eltern',
  name: 'Eltern',
  color: '#e67e22',
  avatar: '☕',
  admin: true,
};

/** Sparse per-user overrides, merged over the app's config by `forUser`. */
export type PerUser<C> = { perUser?: Record<string, Partial<C>> };

export type Store = {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
};

export type AppContext<C> = {
  /** Config resolved for `user` (or the base config in the family view). */
  config: C;
  /** Selected member, or null for the family view and for the admin (both see everyone). */
  user: User | null;
  /** An admin (e.g. Eltern) is selected and unlocked with the PIN: show the app's settings.
   *  While true, api() sends the PIN, so the server's ctx.admin is true as well. */
  admin: boolean;
  /** Members only — admins are never in here. */
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
  /** The request carries the right admin PIN: allow parent-only actions. */
  admin: boolean;
  config: C & PerUser<C>;
  /** All users, incl. the admin — membersOf(users) for the members. */
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

export const defineDashboard = (dashboard: Dashboard): Dashboard => ({
  ...dashboard,
  users: dashboard.users.some((u) => u.admin)
    ? dashboard.users
    : [...dashboard.users, defaultAdmin],
});

/** Members = everyone but the admins: the people apps track (routine rows, star goals …). */
export const membersOf = (users: User[]) => users.filter((u) => !u.admin);

// ponytail: shallow merge — a per-user value replaces the whole key, which is what lists want
export const forUser = <C>(config: C & PerUser<C>, userId?: string | null): C => {
  const { perUser, ...base } = config;
  return { ...base, ...(userId ? perUser?.[userId] : undefined) } as C;
};

/** Server: the env var's value. Browser bundle: undefined — only the name ships to the client. */
export const secret = (name: string): string | undefined =>
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env[name];
