# Wall Dashboard — design notes

Goal: a Daely-style family screen (left app menubar, top-right user switcher) that can **read and
write** data, with typed per-app config, per-user overrides, and apps in any frontend tech. It runs
24/7, so idle CPU/RAM/energy matters.

## Options compared: Home Assistant vs. own shell

| Use case                         | Home Assistant                                                                                                                                                                                                                                                                                  | Own shell                                                |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **Calendar (read)**              | Native calendar card + family-wall cards ([Week Planner](https://github.com/FamousWolf/week-planner-card), [Daylight, ex-Skylight](https://community.home-assistant.io/t/skylight-calendar-card-a-family-friendly-schedule-card/981221))                                                        | `ical.js` + own agenda view                              |
| **Calendar (write)**             | Yes via CalDAV (iCloud) / Google integrations; click-to-add needs community card variants ([forum build](https://community.home-assistant.io/t/diy-family-calendar-skylight/844830))                                                                                                            | Real work (CalDAV auth, recurrence, conflicts)           |
| **Lists**                        | Native, writable: To-do integration, shopping list; Mealie/Grocy for meals                                                                                                                                                                                                                      | Own store + UI per list type                             |
| **Routine**                      | Chore/points integrations exist ([KidsChores](https://www.howtogeek.com/home-assistant-interactive-chore-tracker), [TaskMate](https://community.home-assistant.io/t/taskmate-family-chore-rewards-integration-now-in-hacs-default/1023281)); dynamic items = Jinja/automations or a custom card | Port MMM-Routine, callbacks stay TS                      |
| **User switcher (shared kiosk)** | Weak: HA users are logins ([user condition](https://www.home-assistant.io/dashboards/conditional/) = who's logged in). Fake it with an `input_select` + visibility conditions per card → users × cards, unless every card reads the helper                                                      | Native: `forUser()` + sparse overrides                   |
| **Left menubar**                 | HA's sidebar already is one (dashboards); touch-styling via theme/card-mod                                                                                                                                                                                                                      | Own, small                                               |
| **Phones / notifications**       | Companion app, push, presence for free                                                                                                                                                                                                                                                          | None (PWA + Web Push = extra work)                       |
| **Config**                       | YAML or UI-stored, untyped; `!include` for splitting; per-app cohesion only inside custom cards                                                                                                                                                                                                 | Typed TS, app owns its config, per-user overrides        |
| **Extending**                    | Custom cards = web components (any framework, own build); backend logic = Python integration                                                                                                                                                                                                    | Same `mount()` idea; server code stays TS                |
| **Upkeep**                       | Monthly core releases occasionally break community cards (e.g. reports on 26.4.0 → fixed 26.4.1)                                                                                                                                                                                                | We own everything, incl. bugs                            |
| **Footprint (24/7)**             | HA OS VM, ~2 GB RAM, constant background activity (recorder, integrations polling)                                                                                                                                                                                                              | Node in the existing LXC, tens of MB, ~0 % CPU when idle |

**Decision:** own shell. Typed config with per-app cohesion and a real user switcher were explicit
goals, and the idle footprint is an order of magnitude smaller. Revisit HA (or use it as a data
backend behind this shell) if calendar _writes_ or phone notifications become must-haves.

## Architecture

```
dashboard.config.ts    users + enabled apps (sanitized sample, in git)
dashboard.local.ts     the real one, gitignored, lives only in the CT — wins if present
sdk/index.ts           defineApp, defineDashboard, forUser, secret, html, adoptStyle
shell/                 index.html + shell.css + main.ts: menubar, user menu, mount/unmount
server/main.ts         static files, /api/events (SSE), /api/<app>/kv/<key>, /api/<app>/* handlers
apps/<id>/             index.ts (factory: config type + defaults), ui.ts, server.ts, *.test.ts
build.ts               per-app `npm run build` (if any) → esbuild shell bundle
```

- **An app = one folder.** `index.ts` exports a typed factory (`routine({...})`); registering an
  app = calling it in `dashboard.config.ts`. `ui` and `server` are lazy imports, so the server never
  loads UI code and the browser only loads the active app's chunk.
- **UI contract:** `mount(el, ctx) → unmount`. Vanilla, React (`createRoot(el)`), Svelte
  (`mount(C, {target: el})`) all fit. TS/TSX needs no per-app build (esbuild bundles it); an app with
  its own toolchain adds a `package.json` `build` script and points `ui` at its output.
- **Server contract:** `(req: Request, ctx) => Response` — web standard, framework-free.
- **Generic store:** every app gets `ctx.store.get/set` (sqlite via `node:sqlite`) over
  `/api/<app>/kv/<key>`; a `set` is pushed to all screens over SSE (`ctx.subscribe(key)`). Apps
  needing validation/atomic ops add a `server.ts`.
- **Config layers:** app defaults → instance config → `perUser[id]` (sparse). Size grows with
  users + apps, never users × apps.
- **No login, three guards** (`server/net.ts`): LAN source IP, Host allowlist against DNS
  rebinding (IP literals, localhost, `WALL_HOSTS`), same-Origin for writes against CSRF; plus a
  strict CSP. Any LAN device may read/write all app data by design.
- **Secrets:** `secret('NAME')` reads `process.env` on the server and is `undefined` in the browser
  bundle — only the variable name ships to the client.

## Low-power choices

- No server timers: weather/calendar are fetched on request and cached (30 / 10 min).
- Push, not poll, for writes (SSE); clients only refresh the _visible_ app's data.
- Clock re-renders once per minute (aligned to the minute), not per second.
- No frameworks in the shell, no CSS animations at rest; dark themes (OLED/backlight friendly).
- Node with type stripping: no server build, no dev server, no watcher in production.

Measured on macOS (Node 26): ~100 MB RSS after serving all apps, 0 CPU ticks over 20 s idle.
Precompiling the server or shrinking V8's heap saved ≤ 6 % → not done. Re-measure in the CT.

## Run & deploy

```bash
# (Mac) dev: build + serve on :8090; tests; typecheck
npm --prefix projects/wall-dashboard run dev
npm --prefix projects/wall-dashboard test
npm --prefix projects/wall-dashboard run check

# (Mac) sync repo to the host, then (host) push into CT 101, build there, start the service
scripts/deploy.sh root@192.168.1.10
/opt/homelab/projects/wall-dashboard/install-shell.sh 101
```

First deploy, inside the CT: copy `dashboard.config.ts` → `dashboard.local.ts` (real names), put
secrets in `/opt/wall-dashboard/.env` (`CAL_KIND1=https://…`, `chmod 600`), re-run
`install-shell.sh`. Runs beside MagicMirror (:8080) until parity; then retire `config/`,
`modules/` and `install.sh`.
