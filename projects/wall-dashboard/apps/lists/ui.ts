import { $, adoptStyle, html, raw, type Mount } from '#sdk';
import type { Entry, ListsConfig } from './index.ts';
import css from './ui.css';

// ponytail: whole-list last-write-wins; add a server.ts with per-item ops if two people edit at once
export const mount: Mount<ListsConfig> = (el, ctx) => {
  adoptStyle('lists', css);
  const { lists } = ctx.config;
  let active = lists[0];
  let entries: Entry[] = [];
  const key = () => `list:${active.id}`;

  const render = () => {
    const open = entries.filter((e) => !e.done);
    const done = entries.filter((e) => e.done);
    el.innerHTML = html`<div class="lists">
      ${lists.length > 1
        ? raw(
            html`<div class="list-tabs">
              ${lists.map((l) =>
                raw(
                  html`<button data-list="${l.id}" aria-pressed="${l === active}">
                    ${l.icon ?? ''} ${l.label}
                  </button>`,
                ),
              )}
            </div>`,
          )
        : ''}
      <form class="list-add">
        <input
          name="text"
          maxlength="200"
          autocomplete="off"
          placeholder="${active.icon ?? ''} ${active.label} …"
        />
        <button>＋</button>
      </form>
      <ul>
        ${[...open, ...done].map((e) =>
          raw(
            html`<li>
              <button data-entry="${e.id}" class="${e.done ? 'done' : ''}">
                ${e.done ? '☑️' : '⬜'} ${e.text}
              </button>
            </li>`,
          ),
        )}
      </ul>
      ${done.length
        ? raw(html`<button class="list-clear">Erledigte löschen (${done.length})</button>`)
        : ''}
    </div>`;
  };

  const save = (next: Entry[]) => {
    entries = next;
    render();
    ctx.store.set(key(), entries);
  };

  const load = async () => {
    entries = (await ctx.store.get<Entry[]>(key())) ?? [];
    render();
  };

  el.onsubmit = (event) => {
    event.preventDefault();
    const input = (event.target as HTMLFormElement).elements.namedItem('text') as HTMLInputElement;
    const text = input.value.trim();
    if (!text) return;
    // not crypto.randomUUID(): it needs a secure context, and the tablet talks plain http on the LAN
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    save([...entries, { id, text, done: false }]);
    $(el, '.list-add input').focus(); // render() replaced the form
  };

  el.onclick = (event) => {
    const target = (event.target as Element).closest<HTMLElement>('button');
    if (!target) return;
    if (target.dataset.list) {
      active = lists.find((l) => l.id === target.dataset.list) ?? active;
      return void load();
    }
    if (target.dataset.entry)
      save(entries.map((e) => (e.id === target.dataset.entry ? { ...e, done: !e.done } : e)));
    if (target.classList.contains('list-clear')) save(entries.filter((e) => !e.done));
  };

  for (const list of lists)
    ctx.subscribe(`list:${list.id}`, (data) => {
      if (list !== active) return;
      entries = (data as Entry[]) ?? [];
      render();
    });

  load();
  return () => {};
};
