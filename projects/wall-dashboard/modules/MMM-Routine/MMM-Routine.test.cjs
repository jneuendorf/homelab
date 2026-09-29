const assert = require("node:assert");

const leaderOf = (state) => {
  const finished = Object.entries(state).filter(([, childState]) => childState.completedAt);
  finished.sort((first, second) => first[1].completedAt - second[1].completedAt);
  return finished[0]?.[0] ?? null;
};
assert.equal(leaderOf({ A: { completedAt: 200 }, B: { completedAt: 100 } }), "B");
assert.equal(leaderOf({ A: { completedAt: 200 }, B: {} }), "A");
assert.equal(leaderOf({ A: {}, B: {} }), null);

const dayKeyOf = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
assert.equal(dayKeyOf(new Date(2026, 7, 25, 0, 0)), dayKeyOf(new Date(2026, 7, 25, 23, 59)));
assert.notEqual(dayKeyOf(new Date(2026, 7, 25, 23, 59)), dayKeyOf(new Date(2026, 7, 26, 0, 1)));

// calendar metadata survives normalization so a callback can filter by source color
const mapEvent = (event) => ({ title: event.title, start: new Date(Number(event.startDate)), color: event.color });
const events = [{ title: "Ausflug", startDate: Date.now(), color: "#2ecc71" },
                { title: "Zahnarzt", startDate: Date.now(), color: "#3498db" }].map(mapEvent);
const myEvents = events.filter((event) => event.color === "#2ecc71");
assert.equal(myEvents.length, 1);
assert.equal(myEvents[0].title, "Ausflug");

const beatDeadline = (completedAt, deadlineMs) => deadlineMs != null && completedAt <= deadlineMs;
assert.ok(beatDeadline(100, 200));
assert.ok(!beatDeadline(300, 200));

// badges: object or (ctx) => object, missing keys fall back to defaults
const resolveBadges = (configured, context) => {
  const overrides = typeof configured === "function" ? configured(context) : (configured || {});
  return { leader: "🏆", done: "⭐", beatDeadline: "✨", ...overrides };
};
assert.equal(resolveBadges(undefined).leader, "🏆");
assert.equal(resolveBadges({ leader: "🥇" }).leader, "🥇");
assert.equal(resolveBadges({ leader: "🥇" }).done, "⭐"); // unspecified key keeps default
assert.equal(resolveBadges((context) => ({ leader: context.dayOfWeek === 6 ? "🎉" : "🥇" }), { dayOfWeek: 6 }).leader, "🎉");

// items: fixed array or (ctx) => array
const resolveItems = (child, context) =>
  typeof child.items === "function" ? child.items(context) : (child.items || []);
assert.deepEqual(resolveItems({ items: [{ icon: "a", label: "x" }] }), [{ icon: "a", label: "x" }]);
const itemsForDay = (context) => resolveItems(
  { items: (ctx) => (ctx.dayOfWeek === 0 || ctx.dayOfWeek === 6
    ? [{ icon: "z", label: "frei" }] : [{ icon: "s", label: "Schule" }]) },
  context,
);
assert.equal(itemsForDay({ dayOfWeek: 1 })[0].label, "Schule");
assert.equal(itemsForDay({ dayOfWeek: 6 })[0].label, "frei");

// done-state keyed by label: stale keys (item no longer present) don't inflate the count
const doneCount = (items, done) => items.filter((item) => done[item.label]).length;
const complete = (items, done) => items.every((item) => done[item.label]);
assert.equal(doneCount([{ label: "a" }, { label: "b" }], { a: true }), 1);
assert.equal(doneCount([{ label: "a" }], { a: true, gone: true }), 1);
assert.ok(complete([{ label: "a" }, { label: "b" }], { a: true, b: true }));
assert.ok(!complete([{ label: "a" }, { label: "b" }], { a: true }));

console.log("MMM-Routine self-check OK");
