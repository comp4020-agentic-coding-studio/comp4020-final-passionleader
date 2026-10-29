import "./quests.css";
import { fanfare, ding } from "./sfx.ts";

// A short tutorial of small quests (plan 72): seven things to try, ticked off
// as you do them (a ding and a puff of confetti; all six, a fanfare),
// skippable at any point. Kept in this browser only; once
// done or skipped it stays out of the way. main calls `done(id)` when one
// happens. On a phone (plan 87) it's one line: the next thing to try and
// Skip, top centre, clear of the pad and the buttons. A quest done while the
// list isn't on screen is ticked quietly (no ding for something unseen).

export type QuestId = "walk" | "wave" | "chat" | "npc" | "library" | "room" | "look";

const QUESTS: { id: QuestId; text: string }[] = [
  { id: "walk", text: "Walk around (WASD, or the pad)" },
  { id: "wave", text: "Wave to someone (hold Q, then Wave)" },
  { id: "chat", text: "Say hello in the chat (Enter)" },
  { id: "npc", text: "Ask an AI assistant something (follow the arrow)" },
  { id: "library", text: "Go into Chifley Library (follow the arrow)" },
  { id: "room", text: "Step into a team room (follow the arrow)" },
  { id: "look", text: "Change your look (the hanger)" },
];
const KEY = "campus.quests";

function load(): { done: QuestId[]; skipped: boolean } {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as { done?: unknown; skipped?: unknown };
    return { done: Array.isArray(v.done) ? (v.done.filter((x) => typeof x === "string") as QuestId[]) : [], skipped: v.skipped === true };
  } catch {
    return { done: [], skipped: false };
  }
}

const COLOURS = ["#e84a5f", "#ffb400", "#2fb380", "#3d8bfd", "#a55eea", "#ff7f50"];
/** Bits of paper falling from `from`; gone by themselves (none if motion is reduced). */
function confetti(from: DOMRect, count: number): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (let i = 0; i < count; i++) {
    const bit = document.createElement("i");
    bit.className = "confetti";
    bit.style.left = `${from.left + Math.random() * from.width}px`;
    bit.style.top = `${from.top + Math.random() * Math.min(from.height, 40)}px`;
    bit.style.background = COLOURS[i % COLOURS.length]!;
    bit.style.setProperty("--dx", `${(Math.random() - 0.5) * 220}px`);
    bit.style.setProperty("--dy", `${120 + Math.random() * 260}px`);
    bit.style.setProperty("--spin", `${(Math.random() - 0.5) * 1080}deg`);
    bit.style.animationDuration = `${1.1 + Math.random() * 0.9}s`;
    document.body.append(bit);
    bit.addEventListener("animationend", () => bit.remove());
  }
}

export function mountQuests(): { show(on: boolean): void; done(id: QuestId): void; current(): QuestId | null } {
  let state = load();
  const root = document.createElement("section");
  root.id = "quests";
  root.setAttribute("aria-label", "Things to try");
  root.hidden = true;
  const head = document.createElement("div");
  head.className = "quests-head";
  const title = document.createElement("button");
  title.type = "button";
  title.className = "quests-title";
  title.setAttribute("aria-expanded", "true");
  const skip = document.createElement("button");
  skip.type = "button";
  skip.className = "quests-skip";
  skip.textContent = "Skip";
  skip.setAttribute("aria-label", "Skip the tutorial");
  head.append(title, skip);
  const list = document.createElement("ul");
  list.className = "quests-list";
  // The phone's one line: the next quest.
  const next = document.createElement("p");
  next.className = "quests-next";
  root.append(head, next, list);
  document.body.append(root);

  let wanted = false;
  let open = true;
  const save = (): void => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // Private mode: it lasts this visit.
    }
  };
  const finished = (): boolean => state.skipped || QUESTS.every((q) => state.done.includes(q.id));

  function render(): void {
    const n = QUESTS.filter((q) => state.done.includes(q.id)).length;
    title.textContent = `${open ? "▾" : "▸"} Things to try · ${n}/${QUESTS.length}`;
    title.setAttribute("aria-expanded", String(open));
    list.hidden = !open;
    list.replaceChildren(
      ...QUESTS.map((q) => {
        const li = document.createElement("li");
        const ok = state.done.includes(q.id);
        li.className = ok ? "is-done" : "";
        li.textContent = `${ok ? "✔" : "○"} ${q.text}`;
        return li;
      }),
    );
    const todo = QUESTS.find((q) => !state.done.includes(q.id));
    next.textContent = todo ? `Try: ${todo.text} (${n + 1}/${QUESTS.length})` : "";
    root.hidden = !wanted || finished();
  }
  /** True if the list can be seen right now (not hidden by a phone's width, a room's window or a closed list). */
  const onScreen = (): boolean => !root.hidden && root.offsetParent !== null;

  title.addEventListener("click", () => {
    open = !open;
    render();
  });
  skip.addEventListener("click", () => {
    state.skipped = true;
    save();
    render();
  });

  render();
  return {
    /** The next quest not yet done, while the list is up (for main's arrow); null when finished, skipped or hidden. */
    current: () => (!wanted || finished() ? null : (QUESTS.find((q) => !state.done.includes(q.id))?.id ?? null)),
    show(on) {
      wanted = on;
      state = load();
      render();
    },
    done(id) {
      if (state.done.includes(id) || state.skipped) return;
      const seen = onScreen();
      state.done.push(id);
      save();
      render();
      if (!seen) return;
      const li = list.children[QUESTS.findIndex((q) => q.id === id)] as HTMLElement | undefined;
      li?.classList.add("just-done");
      if (!finished()) {
        ding();
        if (li) confetti(li.getBoundingClientRect(), 18);
        return;
      }
      // All six: a fanfare, confetti over the screen and a cheer; then it goes.
      fanfare();
      confetti(new DOMRect(0, 0, window.innerWidth, window.innerHeight * 0.3), 120);
      const cheer = document.createElement("div");
      cheer.className = "quests-cheer";
      cheer.textContent = "🎉 All done! Welcome to ANU Crossing.";
      document.body.append(cheer);
      window.setTimeout(() => cheer.remove(), 3600);
      window.setTimeout(render, 1500);
    },
  };
}
