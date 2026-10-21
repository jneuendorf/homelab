// Menubar (left), user switcher (top-right), and the mount/unmount lifecycle for one app at a time.
import dashboard from '#config';
import { forUser, type AppContext, type User } from '#sdk';
import { $, html } from '#sdk/utils';

const { users, locale = 'de-DE' } = dashboard;
const apps = dashboard.apps.flatMap((app) => (app.ui ? [{ ...app, ui: app.ui }] : []));
document.title = dashboard.title ?? 'Wall';
document.documentElement.dataset.theme = dashboard.theme ?? 'kids';

const remembered = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const remember = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
};

let current = apps.find((app) => app.id === remembered('wall:app')) ?? apps[0];
let user: User | null = users.find((u) => u.id === remembered('wall:user')) ?? null;

// One EventSource for all apps; topics are "<app>:<key>".
const listeners = new Map<string, Set<(data: unknown) => void>>();
// The server echoes every write to all screens; skip the echo of our own (it would re-render
// and steal focus from inputs).
const ownWrites = new Map<string, string>();
const source = new EventSource('/api/events');
source.onmessage = (event) => {
  const { topic, data } = JSON.parse(event.data);
  const json = JSON.stringify(data);
  if (ownWrites.get(topic) === json) return void ownWrites.delete(topic);
  for (const cb of listeners.get(topic) ?? []) cb(data);
};
// A reconnect means the server restarted (deploy) or the tablet woke up: reload code + data.
let connected = false;
source.onopen = () => {
  if (connected) location.reload();
  connected = true;
};

const nav = $(document, '#nav');
const who = $(document, '#users');
const main = $(document, '#main');

const renderChrome = () => {
  nav.innerHTML = apps
    .map(
      (app) =>
        html`<button data-app="${app.id}" aria-current="${app === current ? 'page' : 'false'}">
          <span class="icon">${app.icon ?? '▫️'}</span><span>${app.label ?? app.id}</span>
        </button>`,
    )
    .join('');
  const family = html`<button data-user="" aria-pressed="${user === null}">
    <span class="avatar">👪</span><span>Alle</span>
  </button>`;
  who.innerHTML =
    family +
    users
      .map(
        (u) =>
          html`<button data-user="${u.id}" aria-pressed="${u === user}" style="--user:${u.color}">
            <span class="avatar">${u.avatar ?? u.name[0]}</span><span>${u.name}</span>
          </button>`,
      )
      .join('');
};

let unmount = () => {};
let generation = 0;

// ponytail: switching user remounts the app; add an onUserChange hook if a remount ever flickers
const show = async () => {
  unmount();
  unmount = () => {};
  const mine = ++generation;
  const app = current;
  renderChrome();

  const subscriptions: [string, (data: unknown) => void][] = [];
  const kv = (key: string) => `/api/${app.id}/kv/${encodeURIComponent(key)}`;
  const ctx: AppContext<unknown> = {
    config: forUser(app.config, user?.id),
    user,
    users,
    locale,
    configFor: (userId) => forUser(app.config, userId),
    api: (path, init) => fetch(`/api/${app.id}/${path}`, init),
    store: {
      get: async (key) => {
        const res = await fetch(kv(key));
        return res.ok ? res.json() : null;
      },
      set: async (key, value) => {
        const body = JSON.stringify(value);
        ownWrites.set(`${app.id}:${key}`, body);
        await fetch(kv(key), {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body,
        });
      },
    },
    subscribe: (topic, cb) => {
      const full = `${app.id}:${topic}`;
      const set = listeners.get(full) ?? new Set();
      listeners.set(full, set.add(cb));
      subscriptions.push([full, cb]);
    },
  };

  const el = document.createElement('div');
  el.className = `app app-${app.id}`;
  try {
    const { mount } = await app.ui();
    if (mine !== generation) return; // tapped something else while the chunk loaded
    main.replaceChildren(el);
    const cleanup = mount(el, ctx);
    unmount = () => {
      cleanup();
      for (const [topic, cb] of subscriptions) listeners.get(topic)?.delete(cb);
    };
  } catch (error) {
    console.error(error);
    if (mine === generation) main.innerHTML = html`<p class="app-error">⚠️ ${app.label} n/a</p>`;
  }
};

nav.onclick = (event) => {
  const id = (event.target as Element).closest<HTMLElement>('[data-app]')?.dataset.app;
  const next = apps.find((app) => app.id === id);
  if (!next || next === current) return;
  current = next;
  remember('wall:app', next.id);
  show();
};
who.onclick = (event) => {
  const id = (event.target as Element).closest<HTMLElement>('[data-user]')?.dataset.user;
  if (id === undefined) return;
  const next = users.find((u) => u.id === id) ?? null;
  if (next === user) return;
  user = next;
  remember('wall:user', next?.id ?? null);
  show();
};

show();
