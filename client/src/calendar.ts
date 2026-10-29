import "./calendar.css";
import data from "./academic-calendar.json";

// The Student Hub's wall calendar (plan 103): E opens ANU's academic dates for
// 2026 and 2027 in a window of our own, a month at a time (semester and
// session dates, census dates, exams, breaks, public holidays), each month
// listed under a grid with the days marked. The dates were read from ANU's
// University Calendar into academic-calendar.json; the window says so and
// links the source, since dates can change.

interface CalEvent {
  date: string;
  end?: string;
  title: string;
  kind: "teaching" | "census" | "exam" | "break" | "holiday" | "other";
}
const EVENTS = (data.events as CalEvent[]).slice().sort((a, b) => a.date.localeCompare(b.date));
const FIRST = { y: 2026, m: 0 };
const LAST = { y: 2027, m: 11 };
const KIND_LABEL: Record<CalEvent["kind"], string> = { teaching: "Teaching", census: "Census", exam: "Exams", break: "Break", holiday: "Public holiday", other: "Other" };

const iso = (y: number, m: number, d: number): string => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
/** Events touching a day (a range counts on each of its days). */
const on = (day: string): CalEvent[] => EVENTS.filter((e) => e.date === day || (e.end && e.date <= day && day <= e.end));

export function mountCalendar(): { open(): void; isOpen(): boolean } {
  const root = document.createElement("div");
  root.id = "hub-calendar";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "cal-title");
  const card = document.createElement("div");
  card.className = "settings-card cal-card";
  const head = document.createElement("div");
  head.className = "cal-head";
  const prev = document.createElement("button");
  prev.type = "button";
  prev.textContent = "‹";
  prev.setAttribute("aria-label", "Previous month");
  const title = document.createElement("h2");
  title.id = "cal-title";
  const next = document.createElement("button");
  next.type = "button";
  next.textContent = "›";
  next.setAttribute("aria-label", "Next month");
  const close = document.createElement("button");
  close.type = "button";
  close.className = "cal-close";
  close.textContent = "✕";
  close.setAttribute("aria-label", "Close");
  head.append(prev, title, next, close);
  const grid = document.createElement("div");
  grid.className = "cal-grid";
  grid.setAttribute("role", "grid");
  const list = document.createElement("ul");
  list.className = "cal-list";
  const note = document.createElement("p");
  note.className = "settings-note";
  note.append(`ANU's academic dates for 2026 and 2027, read from ANU's University Calendar on ${data.fetched}. Dates can change: check `);
  const src = document.createElement("a");
  src.href = data.source[0]!;
  src.target = "_blank";
  src.rel = "noopener";
  src.textContent = "ANU's calendar ↗";
  note.append(src, ". Not an official ANU page.");
  card.append(head, grid, list, note);
  root.append(card);
  document.body.append(root);

  let y = 2026;
  let m = 0;
  function render(): void {
    title.textContent = new Date(y, m, 1).toLocaleDateString("en-AU", { month: "long", year: "numeric" });
    prev.disabled = y === FIRST.y && m === FIRST.m;
    next.disabled = y === LAST.y && m === LAST.m;
    const cells: HTMLElement[] = [];
    for (const d of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
      const h = document.createElement("span");
      h.className = "cal-dow";
      h.textContent = d;
      cells.push(h);
    }
    const startDay = (new Date(y, m, 1).getDay() + 6) % 7;
    for (let i = 0; i < startDay; i++) cells.push(document.createElement("span"));
    const days = new Date(y, m + 1, 0).getDate();
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Canberra" });
    for (let d = 1; d <= days; d++) {
      const day = iso(y, m, d);
      const cell = document.createElement("span");
      cell.className = "cal-day";
      cell.textContent = String(d);
      const evs = on(day);
      if (evs.length) {
        cell.classList.add(`is-${evs[0]!.kind}`);
        cell.title = evs.map((e) => e.title).join("\n");
      }
      if (day === today) cell.classList.add("is-today");
      cells.push(cell);
    }
    grid.replaceChildren(...cells);
    const monthStart = iso(y, m, 1);
    const monthEnd = iso(y, m, days);
    const here = EVENTS.filter((e) => e.date <= monthEnd && (e.end ?? e.date) >= monthStart);
    list.replaceChildren(
      ...(here.length
        ? here.map((e) => {
            const li = document.createElement("li");
            li.className = `is-${e.kind}`;
            const when = document.createElement("strong");
            const fmt = (s: string): string => new Date(`${s}T00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
            when.textContent = e.end ? `${fmt(e.date)} – ${fmt(e.end)}` : fmt(e.date);
            const tag = document.createElement("small");
            tag.textContent = KIND_LABEL[e.kind];
            li.append(when, ` ${e.title} `, tag);
            return li;
          })
        : [Object.assign(document.createElement("li"), { textContent: "Nothing on the academic calendar this month." })]),
    );
  }
  const step = (by: number): void => {
    const t = y * 12 + m + by;
    if (t < FIRST.y * 12 + FIRST.m || t > LAST.y * 12 + LAST.m) return;
    y = Math.floor(t / 12);
    m = t % 12;
    render();
  };
  prev.addEventListener("click", () => step(-1));
  next.addEventListener("click", () => step(1));
  const hide = (): void => void (root.hidden = true);
  close.addEventListener("click", hide);
  root.addEventListener("click", (e) => {
    if (e.target === root) hide();
  });
  root.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") hide();
    else if (e.key === "ArrowLeft" || e.key === "PageUp") step(-1);
    else if (e.key === "ArrowRight" || e.key === "PageDown") step(1);
  });

  return {
    open() {
      // This month, if it's in 2026–2027.
      const now = new Date();
      const t = Math.min(LAST.y * 12 + LAST.m, Math.max(FIRST.y * 12 + FIRST.m, now.getFullYear() * 12 + now.getMonth()));
      y = Math.floor(t / 12);
      m = t % 12;
      render();
      root.hidden = false;
      close.focus();
    },
    isOpen: () => !root.hidden,
  };
}
