import "./events.css";
import { ApiError, createEvent, getEvents, removeEvent, type EventList, type EventView } from "./api.ts";
import type { SpaceId } from "./world.ts";

// The events timetable: a member puts on an event (title, place, start in Canberra time, length)
// and everyone sees it as "Coming up" on the join screen and in the Campus Guide, as a banner in
// its space while it's on, as a small marker on the minimap, and in a list from the "Events"
// button. The server owns every rule (server/events.ts); this only asks and draws. Nothing is
// pushed to other screens: the list is fetched again every minute.

const TIME_ZONE = "Australia/Canberra";
const COMING_UP = 5;

const hhmm = new Intl.DateTimeFormat("en-AU", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dayName = new Intl.DateTimeFormat("en-AU", { timeZone: TIME_ZONE, weekday: "short", day: "numeric", month: "short" });
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE });
const localParts = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

/** "14:30", Canberra's clock. */
export const clock = (epoch: number): string => hhmm.format(epoch * 1000);
/** "Today 14:30", "Tomorrow 09:00" or "Thu 12 Nov 14:30". */
export function when(epoch: number, now: number): string {
  const day = dayKey.format(epoch * 1000);
  if (day === dayKey.format(now * 1000)) return `Today ${clock(epoch)}`;
  if (day === dayKey.format((now + 86400) * 1000)) return `Tomorrow ${clock(epoch)}`;
  return `${dayName.format(epoch * 1000)} ${clock(epoch)}`;
}
/** Canberra's wall clock now, as a datetime-local value ("2026-11-09T14:30"). */
export function canberraNowLocal(epoch: number): string {
  const p = Object.fromEntries(localParts.formatToParts(epoch * 1000).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

// --- the shared list ----------------------------------------------------------------

let list: EventList = { now: Math.floor(Date.now() / 1000), events: [], spaces: [] };
let skew = 0; // server clock minus this computer's, in seconds
let loaded = false;
const listeners = new Set<() => void>();
let inFlight: Promise<void> | null = null;

/** The server's idea of now, in epoch seconds. */
export const nowSeconds = (): number => Math.floor(Date.now() / 1000) + skew;
export const eventsList = (): EventView[] => list.events;
export const onEventsChanged = (f: () => void): (() => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};

/** Fetches the timetable again; a failure keeps what we had. */
export function refreshEvents(): Promise<void> {
  inFlight ??= getEvents()
    .then((l) => {
      list = l;
      skew = l.now - Math.floor(Date.now() / 1000);
      loaded = true;
      for (const f of listeners) f();
    })
    .catch(() => {})
    .finally(() => (inFlight = null));
  return inFlight;
}

/** The next few events that haven't ended, those on now first. */
export const upcoming = (n = COMING_UP): EventView[] => list.events.filter((e) => e.end > nowSeconds()).slice(0, n);
/** Events on right now in this space. */
export const onNowIn = (space: SpaceId): EventView[] => list.events.filter((e) => e.space === space && e.start <= nowSeconds() && nowSeconds() < e.end);
/** Spaces with an event on now (for the minimap's markers). */
export const onNowSpaces = (): SpaceId[] => [...new Set(list.events.filter((e) => e.start <= nowSeconds() && nowSeconds() < e.end).map((e) => e.space))];

// --- "Coming up" ----------------------------------------------------------------------

/** One event as a line: title, then where and when. */
function line(e: EventView): HTMLLIElement {
  const li = document.createElement("li");
  const t = document.createElement("span");
  t.className = "ev-title";
  t.textContent = e.title;
  const m = document.createElement("small");
  const now = nowSeconds();
  m.textContent = `${e.spaceLabel} · ${e.start <= now ? `on now, until ${clock(e.end)}` : `${when(e.start, now)}–${clock(e.end)}`} · by ${e.author}`;
  li.append(t, m);
  return li;
}

/** A "Coming up" block that keeps itself current while it is on the page (the join screen, the Campus Guide). */
export function comingUpBlock(): HTMLElement {
  const box = document.createElement("section");
  box.className = "ev-coming";
  const draw = (): void => {
    const h = document.createElement("h3");
    h.textContent = "Coming up";
    const next = upcoming();
    if (!next.length) {
      const p = document.createElement("p");
      p.className = "ev-empty";
      p.textContent = loaded ? "Nothing on the timetable yet." : "Loading…";
      box.replaceChildren(h, p);
      return;
    }
    const ul = document.createElement("ul");
    ul.append(...next.map(line));
    box.replaceChildren(h, ul);
  };
  draw();
  // Detached blocks (a closed guide) drop their listener on the next change.
  const off = onEventsChanged(() => (box.isConnected ? draw() : off()));
  void refreshEvents();
  return box;
}

// --- the banner in a space ----------------------------------------------------------------

export function mountEventBanner(): { show(space: SpaceId | null): void } {
  const el = document.createElement("div");
  el.id = "event-banner";
  el.setAttribute("role", "status");
  el.hidden = true;
  document.body.append(el);
  let at: SpaceId | null = null;
  const draw = (): void => {
    const on = at ? onNowIn(at) : [];
    el.hidden = on.length === 0;
    el.replaceChildren(
      ...on.slice(0, 2).map((e) => {
        const p = document.createElement("p");
        p.textContent = `Now: ${e.title} (until ${clock(e.end)})`;
        return p;
      }),
    );
  };
  onEventsChanged(draw);
  // An event starts or ends while someone stands there; the list itself is fetched again every minute.
  window.setInterval(draw, 15_000);
  window.setInterval(() => document.hidden || void refreshEvents(), 60_000);
  return {
    show(space) {
      at = space;
      draw();
    },
  };
}

// --- the Events button and its list ----------------------------------------------------------

export function mountEvents(
  after: HTMLElement,
  deps: {
    token(): string | undefined;
    /** Members may post; guests only read. */
    member(): boolean;
    isAdmin(): boolean;
    name(): string | undefined;
    onOpen(): void;
    say(msg: string): void;
  },
): { close(): void; isOpen(): boolean } {
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.id = "events-btn";
  trigger.textContent = "Events";
  trigger.title = "What's on, and put on your own";
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-expanded", "false");
  after.after(trigger);

  const panel = document.createElement("section");
  panel.id = "events-panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Events");
  document.body.append(panel);

  function mine(e: EventView): boolean {
    return deps.isAdmin() || e.author.toLowerCase() === (deps.name() ?? "").toLowerCase();
  }

  function form(): HTMLElement {
    const f = document.createElement("form");
    f.className = "ev-form";
    f.noValidate = true;
    const h = document.createElement("h3");
    h.textContent = "Put on an event";
    const title = document.createElement("input");
    title.type = "text";
    title.maxLength = 80;
    title.placeholder = "Title (up to 80 characters)";
    title.setAttribute("aria-label", "Title");
    const space = document.createElement("select");
    space.setAttribute("aria-label", "Place");
    space.className = "pretty-select";
    for (const s of list.spaces) space.append(new Option(s.label, s.id));
    const start = document.createElement("input");
    start.type = "datetime-local";
    start.setAttribute("aria-label", "Start, Canberra time");
    const now = nowSeconds();
    start.min = canberraNowLocal(now);
    start.max = canberraNowLocal(now + 30 * 86400);
    start.value = canberraNowLocal(now + 3600).replace(/:\d\d$/, ":00");
    const minutes = document.createElement("select");
    minutes.setAttribute("aria-label", "Length");
    minutes.className = "pretty-select";
    for (const [label, m] of [["15 min", 15], ["30 min", 30], ["45 min", 45], ["1 hour", 60], ["1 h 30", 90], ["2 hours", 120], ["2 h 30", 150], ["3 hours", 180]] as const) minutes.append(new Option(label, String(m)));
    minutes.value = "60";
    const note = document.createElement("small");
    note.textContent = "Canberra time, within the next 30 days. Five events at most coming up per person.";
    const error = document.createElement("p");
    error.className = "ev-error";
    error.setAttribute("role", "alert");
    const go = document.createElement("button");
    go.type = "submit";
    go.textContent = "Add to the timetable";
    f.append(h, title, space, start, minutes, note, error, go);
    f.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const token = deps.token();
      if (!token) return;
      error.textContent = "";
      go.disabled = true;
      createEvent(token, { title: title.value, space: space.value, start: start.value, minutes: Number(minutes.value) })
        .then(async () => {
          await refreshEvents();
          deps.say("Event added.");
          if (!panel.hidden) draw();
        })
        .catch((err) => {
          error.textContent = err instanceof ApiError ? err.message : "Could not add it. Try again.";
        })
        .finally(() => (go.disabled = false));
    });
    return f;
  }

  function draw(): void {
    const head = document.createElement("div");
    head.className = "ev-head";
    const h = document.createElement("strong");
    h.textContent = "Events";
    const x = document.createElement("button");
    x.type = "button";
    x.textContent = "Close";
    x.classList.add("ui-close");
    x.setAttribute("aria-label", "Close");
    x.addEventListener("click", close);
    head.append(h, x);

    const all = list.events.filter((e) => e.end > nowSeconds());
    const body = document.createElement("div");
    if (!all.length) {
      const p = document.createElement("p");
      p.className = "ev-empty";
      p.textContent = "Nothing on the timetable yet.";
      body.append(p);
    } else {
      const ul = document.createElement("ul");
      ul.className = "ev-list";
      for (const e of all) {
        const li = line(e);
        if (mine(e)) {
          const del = document.createElement("button");
          del.type = "button";
          del.className = "ev-remove";
          del.textContent = "Remove";
          del.setAttribute("aria-label", `Remove ${e.title}`);
          del.addEventListener("click", () => {
            const token = deps.token();
            if (!token || !window.confirm(`Remove "${e.title}"?`)) return;
            removeEvent(token, e.id)
              .then(() => refreshEvents())
              .then(() => !panel.hidden && draw())
              .catch((err) => deps.say(err instanceof ApiError ? err.message : "Could not remove it."));
          });
          li.append(del);
        }
        ul.append(li);
      }
      body.append(ul);
    }
    const foot = document.createElement("p");
    foot.className = "ev-note";
    foot.textContent = "Not an official ANU service. Posted by students and staff, not checked.";
    panel.replaceChildren(head, body, deps.member() ? form() : Object.assign(document.createElement("p"), { className: "ev-note", textContent: "Sign up with your ANU email to put on an event." }), foot);
  }

  async function open(): Promise<void> {
    deps.onOpen();
    // One panel in that corner at a time: Join now sits in the same place (helper QA, 11/9).
    const other = document.getElementById("join-now");
    if (other && !other.hidden) document.getElementById("join-now-btn")?.click();
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    draw();
    await refreshEvents();
    if (!panel.hidden && !panel.contains(document.activeElement)) draw();
  }
  function close(): void {
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }
  trigger.addEventListener("click", () => (panel.hidden ? void open() : close()));
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) close();
  });
  return { close, isOpen: () => !panel.hidden };
}
