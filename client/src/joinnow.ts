import "./joinnow.css";
import { getActivity, type Activity, type ActivityItem } from "./api.ts";

// "Join now" (RICE v3 #18): one small panel, opened from a button beside your
// status, that lists what's open to join or answer right now: study groups
// with places left, "Ask the Hub" questions nobody has answered, and the
// newest ads. The server decides what you may see (a private question only
// reaches its writer and staff); this only draws it, and pressing an item
// opens its board at that post.

export function mountJoinNow(
  after: HTMLElement,
  deps: {
    token(): string | undefined;
    /** Opens the board `board` (a space's id, or "hub-desk"/"study-groups") at one post. */
    openPost(board: string, postId: number): void;
  },
): { close(): void; isOpen(): boolean } {
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.id = "join-now-btn";
  trigger.textContent = "Join now";
  trigger.title = "Study groups with places, unanswered questions, new ads";
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-expanded", "false");
  after.after(trigger);

  const panel = document.createElement("section");
  panel.id = "join-now";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Join now");
  document.body.append(panel);

  let loadToken = 0;

  function section<T extends ActivityItem>(title: string, items: T[], line: (i: T) => string, empty: string): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "jn-section";
    const h = document.createElement("h3");
    h.textContent = title;
    wrap.append(h);
    if (!items.length) {
      const p = document.createElement("p");
      p.className = "jn-empty";
      p.textContent = empty;
      wrap.append(p);
      return wrap;
    }
    const ul = document.createElement("ul");
    for (const i of items) {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      const t = document.createElement("span");
      t.className = "jn-title";
      t.textContent = i.title;
      const m = document.createElement("small");
      m.textContent = line(i);
      b.append(t, m);
      b.addEventListener("click", () => {
        close();
        deps.openPost(i.board, i.id);
      });
      li.append(b);
      ul.append(li);
    }
    wrap.append(ul);
    return wrap;
  }

  function draw(a: Activity): void {
    const head = document.createElement("div");
    head.className = "jn-head";
    const h = document.createElement("strong");
    h.textContent = "Join now";
    const x = document.createElement("button");
    x.type = "button";
    x.textContent = "Close";
    x.classList.add("ui-close");
    x.setAttribute("aria-label", "Close");
    x.addEventListener("click", close);
    head.append(h, x);
    const note = document.createElement("p");
    note.className = "jn-note";
    note.textContent = "Not an official ANU service. Posters' identities aren't verified.";
    panel.replaceChildren(
      head,
      section("Study groups with places", a.groups, (g) => `${g.left} ${g.left === 1 ? "place" : "places"} left · ${g.joined}/${g.capacity} · by ${g.author}`, "No group has a place left."),
      section("Questions nobody has answered", a.questions, (q) => `${q.private ? "🔒 Private · " : ""}asked by ${q.author}`, "Every question has an answer."),
      section("Newest ads", a.ads, (p) => `by ${p.author}`, "No ads up."),
      note,
    );
  }

  async function open(): Promise<void> {
    const token = ++loadToken;
    // One panel in that corner at a time: the Events panel sits in the same place (helper QA, 11/9).
    const other = document.getElementById("events-panel");
    if (other && !other.hidden) document.getElementById("events-btn")?.click();
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    panel.replaceChildren(Object.assign(document.createElement("p"), { className: "jn-empty", textContent: "Loading…" }));
    try {
      const a = await getActivity(deps.token());
      if (token === loadToken && !panel.hidden) draw(a);
    } catch {
      if (token === loadToken && !panel.hidden) panel.replaceChildren(Object.assign(document.createElement("p"), { className: "jn-empty", textContent: "Could not load. Try again." }));
    }
  }
  function close(): void {
    loadToken++;
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }

  trigger.addEventListener("click", () => (panel.hidden ? void open() : close()));
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) close();
  });
  return { close, isOpen: () => !panel.hidden };
}
