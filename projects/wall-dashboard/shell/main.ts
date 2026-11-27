// Menubar (left), user switcher (top-right), and the mount/unmount lifecycle for one app at a time.
import dashboard from '#config';
import { type AppContext, forUser, membersOf, type User } from '#sdk';
import { $, html, raw } from '#sdk/utils';

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
// an admin is never restored: the PIN lives only in memory
let user: User | null = users.find((u) => u.id === remembered('wall:user') && !u.admin) ?? null;
let pin: string | null = null;

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

// admin-only apps (the Protokoll) are listed while an admin is unlocked
const listed = () => apps.filter((app) => !app.admin || (user?.admin && pin));

const renderChrome = () => {
  nav.innerHTML = listed()
    .map(
      (app) =>
        html`<button data-app="${app.id}" aria-current="${app === current ? 'page' : 'false'}">
          <span class="icon">${app.icon ?? '▫️'}</span><span>${app.label ?? app.id}</span>
        </button>`,
    )
    .join('');
  const family = html`<button data-user="" aria-pressed="${user === null}">
    <span class="avatar ui-tint">👪</span><span>Alle</span>
  </button>`;
  who.innerHTML =
    family +
    users
      .map(
        (u) =>
          html`<button data-user="${u.id}" aria-pressed="${u === user}" style="--user:${u.color}">
            <span class="avatar ui-tint">${u.avatar ?? u.name[0]}</span><span>${u.name}</span>
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
  if (!listed().includes(current)) current = listed()[0];
  const app = current;
  renderChrome();

  const subscriptions: [string, (data: unknown) => void][] = [];
  const kv = (key: string) => `/api/${app.id}/kv/${encodeURIComponent(key)}`;
  // every request says who is selected (for the activity log) and, while unlocked, the PIN
  const headers = (init?: HeadersInit) => {
    const all = new Headers(init);
    if (user) all.set('x-user', user.id);
    if (pin) all.set('x-pin', pin);
    return all;
  };
  const json = { 'content-type': 'application/json' };
  const ctx: AppContext<unknown> = {
    config: forUser(app.config, user?.id),
    user: user?.admin ? null : user,
    admin: !!user?.admin,
    users: membersOf(users),
    locale,
    configFor: (userId) => forUser(app.config, userId),
    api: async (path, init) => {
      const res = await fetch(`/api/${app.id}/${path}`, {
        ...init,
        headers: headers(init?.headers),
      });
      if (res.status === 403 && pin) lock(); // PIN changed on the server or locked out
      return res;
    },
    store: {
      get: async (key) => {
        const res = await fetch(kv(key));
        return res.ok ? res.json() : null;
      },
      set: async (key, value) => {
        const body = JSON.stringify(value);
        ownWrites.set(`${app.id}:${key}`, body);
        await fetch(kv(key), { method: 'PUT', headers: headers(json), body });
      },
    },
    log: (text) => {
      fetch(`/api/${app.id}/log`, {
        method: 'POST',
        headers: headers(json),
        body: JSON.stringify({ text }),
      }).catch(() => {});
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
  const next = listed().find((app) => app.id === id);
  if (!next || next === current) return;
  current = next;
  remember('wall:app', next.id);
  show();
};
const selectUser = (next: User | null) => {
  if (!next?.admin) pin = null; // leaving the admin locks it
  user = next;
  remember('wall:user', next?.admin ? null : (next?.id ?? null));
  show();
};

// ── admin lock: picking an admin asks for the PIN; 5 idle minutes lock it again ──────────────
const idleMs = 5 * 60_000;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
const lock = () => {
  clearTimeout(idleTimer);
  if (user?.admin) selectUser(null);
};
document.addEventListener('pointerdown', () => {
  if (!pin) return;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(lock, idleMs);
});

const keypad = document.createElement('dialog');
keypad.className = 'ui-dialog keypad';
document.body.append(keypad);
let entry = '';
let pending: User | null = null;
const showEntry = (text = '●'.repeat(entry.length) || '•••') => {
  $(keypad, '.keypad-entry').textContent = text;
};
const askPin = (admin: User) => {
  pending = admin;
  entry = '';
  keypad.innerHTML = html`<h2>${admin.avatar ?? ''} ${admin.name}</h2>
    <div class="keypad-keys">
      <div class="keypad-entry"></div>
      ${['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'].map((k) =>
        raw(html`<button class="ui-btn" data-key="${k}">${k}</button>`),
      )}
      <button class="ui-btn keypad-wide" data-key="">Abbrechen</button>
    </div>`;
  showEntry();
  keypad.showModal();
};
keypad.onclick = async (event) => {
  const key = (event.target as Element).closest<HTMLElement>('[data-key]')?.dataset.key;
  if (key === undefined) return;
  if (key === '') return keypad.close();
  if (key !== 'OK') {
    entry = key === '⌫' ? entry.slice(0, -1) : (entry + key).slice(0, 8);
    return showEntry();
  }
  const res = await fetch('/api/unlock', { method: 'POST', headers: { 'x-pin': entry } });
  if (!res.ok) {
    entry = '';
    return showEntry(`✕ ${await res.text()}`);
  }
  pin = entry;
  keypad.close();
  idleTimer = setTimeout(lock, idleMs);
  if (pending) selectUser(pending);
};

who.onclick = (event) => {
  const id = (event.target as Element).closest<HTMLElement>('[data-user]')?.dataset.user;
  if (id === undefined) return;
  const next = users.find((u) => u.id === id) ?? null;
  if (next === user) return;
  if (next?.admin && !pin) return askPin(next);
  selectUser(next);
};

show();
