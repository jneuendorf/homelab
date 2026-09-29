/**
 * @typedef {Object} RoutineItem
 * @property {string} icon   Emoji or Font-Awesome markup shown on the chip.
 * @property {string} label  Short task text. Must be unique within a child (it keys the done-state).
 */

/**
 * @typedef {Object} RoutineCtx
 * @property {string} child       Child's `name`.
 * @property {string} color       Child's `color` — matches the source calendar's `color`, so
 *                                `calendar.filter(e => e.color === color)` = this child's events.
 * @property {Date}   date        Now, local time.
 * @property {number} dayOfWeek   0=Sun … 6=Sat.
 * @property {string} time        "HH:mm" now.
 * @property {Array<{title:string,start:Date,fullDayEvent:boolean,color:string,calendarName:string,symbol:(string|string[])}>} calendar
 *   Today's events across all calendars, each carrying its source `color`/`calendarName`/`symbol`.
 * @property {Array<{label:string,temp:number,code:number}>|null} weather
 *   Day-parts from MMM-DayParts (label/temp/WMO-code), or null until it reports.
 */

/**
 * @typedef {Object} RoutineChild
 * @property {string} name
 * @property {string} color
 * @property {RoutineItem[] | ((ctx: RoutineCtx) => RoutineItem[])} items
 *   A fixed list, or a callback that builds today's list from `ctx`.
 */

/**
 * @typedef {Object} RoutineBadges  Emojis for a completed child. Missing keys fall back to defaults.
 * @property {string} [leader]       First child to finish. Default 🏆. See emojis.wiki/success for ideas.
 * @property {string} [done]         Any other child that finished. Default ⭐.
 * @property {string} [beatDeadline] Appended when they finished before the deadline. Default ✨.
 */

Module.register("MMM-Routine", {
  defaults: {
    deadline: "07:35",
    sound: true,
    /** @type {RoutineChild[]} */
    children: [],
    /** @type {RoutineBadges | ((ctx: RoutineCtx) => RoutineBadges)} */
    badges: { leader: "🏆", done: "⭐", beatDeadline: "✨" },
  },

  start() {
    this.dayKey = this.todayKey();
    this.state = this.load();
    this._calendar = [];
    this._weather = null;
    setInterval(() => {
      const currentDayKey = this.todayKey();
      if (currentDayKey !== this.dayKey) {
        this.dayKey = currentDayKey; this.state = {}; this.updateDom();
      } else if (this._deadlineEl) {
        this._deadlineEl.textContent = this.deadlineText();
      }
    }, 30 * 1000);
  },

  getStyles() { return [this.file("MMM-Routine.css")]; },

  notificationReceived(notification, payload) {
    if (notification === "DAYPARTS_WEATHER") { this._weather = payload; this.updateDom(); }
    else if (notification === "CALENDAR_EVENTS") { this._calendar = this.todayEvents(payload); this.updateDom(); }
  },

  todayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  },
  load() { try { return JSON.parse(localStorage.getItem(`MMM-Routine:${this.dayKey}`)) || {}; } catch { return {}; } },
  save() { localStorage.setItem(`MMM-Routine:${this.dayKey}`, JSON.stringify(this.state)); },

  todayEvents(events) {
    if (!Array.isArray(events)) return [];
    const now = new Date();
    const isToday = (date) => date.getFullYear() === now.getFullYear()
      && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
    return events
      .map((event) => ({
        title: event.title,
        start: new Date(Number(event.startDate)),
        fullDayEvent: !!event.fullDayEvent,
        color: event.color,
        calendarName: event.calendarName,
        symbol: event.symbol,
      }))
      .filter((event) => event.fullDayEvent || isToday(event.start));
  },

  /** @param {RoutineChild} child @returns {RoutineCtx} */
  buildContext(child) {
    const now = new Date();
    return {
      child: child.name,
      color: child.color,
      date: now,
      dayOfWeek: now.getDay(),
      time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
      calendar: this._calendar,
      weather: this._weather,
    };
  },

  /** @param {RoutineChild} child @returns {RoutineItem[]} */
  resolveItems(child) {
    return typeof child.items === "function" ? child.items(this.buildContext(child)) : (child.items || []);
  },

  /** @param {RoutineChild} child @returns {Required<RoutineBadges>} */
  resolveBadges(child) {
    const configured = this.config.badges;
    const overrides = typeof configured === "function" ? configured(this.buildContext(child)) : (configured || {});
    return { leader: "🏆", done: "⭐", beatDeadline: "✨", ...overrides };
  },

  deadlineAt() {
    if (!this.config.deadline) return null;
    const [hours, minutes] = this.config.deadline.split(":").map(Number);
    const deadline = new Date(); deadline.setHours(hours, minutes, 0, 0); return deadline.getTime();
  },
  beatDeadline(completedAt) { const deadlineMs = this.deadlineAt(); return deadlineMs != null && completedAt <= deadlineMs; },
  deadlineText() {
    const deadlineMs = this.deadlineAt(); if (deadlineMs == null) return "";
    const minutesLeft = Math.round((deadlineMs - Date.now()) / 60000);
    return minutesLeft >= 0
      ? `⏰ noch ${minutesLeft} min bis ${this.config.deadline}`
      : `⏰ ${this.config.deadline} vorbei`;
  },

  leader() {
    const finished = Object.entries(this.state).filter(([, childState]) => childState.completedAt);
    finished.sort((first, second) => first[1].completedAt - second[1].completedAt);
    return finished[0]?.[0] ?? null;
  },

  toggle(child, toggledItem, items) {
    const childState = this.state[child.name] || (this.state[child.name] = { done: {} });
    if (childState.done[toggledItem.label]) delete childState.done[toggledItem.label];
    else childState.done[toggledItem.label] = true;
    const complete = items.every((item) => childState.done[item.label]);
    if (complete && !childState.completedAt) { childState.completedAt = Date.now(); this.ding(true); }
    else if (!complete) { childState.completedAt = null; this.ding(false); }
    this.save();
    this.updateDom();
  },

  ding(fanfare) {
    if (!this.config.sound) return;
    try {
      const audioContext = this._audioContext
        || (this._audioContext = new (window.AudioContext || window.webkitAudioContext)());
      const frequencies = fanfare ? [523, 659, 784, 1047] : [880];
      frequencies.forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
        oscillator.type = "sine"; oscillator.frequency.value = frequency;
        oscillator.connect(gain); gain.connect(audioContext.destination);
        const startTime = audioContext.currentTime + index * 0.12;
        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.exponentialRampToValueAtTime(0.25, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.26);
        oscillator.start(startTime); oscillator.stop(startTime + 0.27);
      });
    } catch (err) { /* audio not allowed yet */ }
  },

  getDom() {
    const container = document.createElement("div");
    container.className = "routine";
    const leaderName = this.leader();

    for (const child of this.config.children) {
      const items = this.resolveItems(child);
      const childState = this.state[child.name] || { done: {} };
      const total = items.length;
      const doneCount = items.filter((item) => childState.done[item.label]).length;

      const row = document.createElement("div");
      row.className = "routine-row" + (childState.completedAt ? " done" : "");
      row.style.setProperty("--child", child.color);

      const label = document.createElement("div");
      label.className = "routine-label";
      label.innerHTML = `<span class="routine-name">${child.name}</span>`
        + `<span class="routine-progress">${doneCount}/${total}</span>`;
      row.appendChild(label);

      const itemsContainer = document.createElement("div");
      itemsContainer.className = "routine-items";
      items.forEach((item) => {
        const chip = document.createElement("button");
        chip.className = "routine-item" + (childState.done[item.label] ? " checked" : "");
        chip.innerHTML = `<span class="ri-icon">${item.icon}</span><span class="ri-label">${item.label}</span>`;
        chip.onclick = () => this.toggle(child, item, items);
        itemsContainer.appendChild(chip);
      });
      row.appendChild(itemsContainer);

      const badge = document.createElement("span");
      badge.className = "routine-badge";
      if (childState.completedAt) {
        const badges = this.resolveBadges(child);
        badge.textContent = (child.name === leaderName ? badges.leader : badges.done)
          + (this.beatDeadline(childState.completedAt) ? badges.beatDeadline : "");
      } else {
        badge.style.visibility = "hidden";
      }
      row.appendChild(badge);

      container.appendChild(row);
    }

    if (this.config.deadline) {
      const footer = document.createElement("div");
      footer.className = "routine-deadline";
      footer.textContent = this.deadlineText();
      this._deadlineEl = footer;
      container.appendChild(footer);
    }
    return container;
  },
});
