import "./quests.css";

// A short tutorial of small quests (plan 72): six things to try, ticked off
// as you do them, skippable at any point. Kept in this browser only; once
// done or skipped it stays out of the way. main calls `done(id)` when one
// happens.

export type QuestId = "walk" | "wave" | "note" | "library" | "room" | "look";

const QUESTS: { id: QuestId; text: string }[] = [
  { id: "walk", text: "Walk around (WASD, or the pad)" },
  { id: "wave", text: "Wave to someone (hold Q, then Wave)" },
  { id: "note", text: "Stick a sticky note (Q, then 1)" },
  { id: "library", text: "Go into Chifley Library" },
  { id: "room", text: "Step into a team room" },
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

export function mountQuests(): { show(on: boolean): void; done(id: QuestId): void } {
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
  root.append(head, list);
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
    root.hidden = !wanted || finished();
  }

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
    show(on) {
      wanted = on;
      state = load();
      render();
    },
    done(id) {
      if (state.done.includes(id) || state.skipped) return;
      state.done.push(id);
      save();
      render();
      // All done: a moment to see the last tick, then it goes.
      if (finished()) window.setTimeout(render, 1500);
    },
  };
}
