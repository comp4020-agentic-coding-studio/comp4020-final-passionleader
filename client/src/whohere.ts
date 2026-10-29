import "./whohere.css";

// "Who's here" (RICE v2 #1, 10/30): the HUD's online line opens a small
// list of the people in this space (their name tags are already on screen
// for everyone here, so nothing new leaves the space) and, for elsewhere,
// head counts only, as the server sends them (never names: CLAUDE.md).
// A member's name starts a whisper ("/w name ") in the chat.

export interface WhoHereDeps {
  /** The people in this space now: name and whether they're staff. */
  here(): { name: string; staff: boolean }[];
  /** Head counts per place, labelled ("Hub", 3). */
  counts(): [string, number][];
  me(): string;
  /** Whether you may whisper (members only). */
  mayWhisper(): boolean;
  whisper(name: string): void;
}

export function mountWhoHere(trigger: HTMLElement, deps: WhoHereDeps): { close(): void; isOpen(): boolean } {
  const panel = document.createElement("section");
  panel.id = "who-here";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Who's here");
  document.body.append(panel);

  function draw(): void {
    panel.replaceChildren();
    const head = document.createElement("div");
    head.className = "who-head";
    const h = document.createElement("strong");
    const people = deps.here();
    h.textContent = `Here now (${people.length + 1})`;
    const x = document.createElement("button");
    x.type = "button";
    x.textContent = "✕";
    x.setAttribute("aria-label", "Close");
    x.addEventListener("click", close);
    head.append(h, x);
    const list = document.createElement("ul");
    const meLi = document.createElement("li");
    meLi.textContent = `${deps.me()} (you)`;
    meLi.className = "who-me";
    list.append(meLi);
    for (const p of people.sort((a, b) => a.name.localeCompare(b.name))) {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = p.name;
      if (p.staff) {
        const tag = document.createElement("span");
        tag.className = "who-staff";
        tag.textContent = "staff";
        b.append(" ", tag);
      }
      const can = deps.mayWhisper() && !/^guest/i.test(p.name);
      b.disabled = !can;
      b.title = can ? `Whisper to ${p.name}` : deps.mayWhisper() ? "Guests can't get whispers" : "Sign up to whisper";
      b.addEventListener("click", () => {
        close();
        deps.whisper(p.name);
      });
      li.append(b);
      list.append(li);
    }
    if (!people.length) {
      const li = document.createElement("li");
      li.className = "who-empty";
      li.textContent = "Nobody else here right now.";
      list.append(li);
    }
    const elsewhere = document.createElement("p");
    elsewhere.className = "who-elsewhere";
    const counts = deps.counts().filter(([, n]) => n > 0);
    elsewhere.textContent = counts.length ? `Online: ${counts.map(([l, n]) => `${l} ${n}`).join(" · ")}` : "";
    const hint = document.createElement("p");
    hint.className = "who-hint";
    hint.textContent = deps.mayWhisper() ? "Press a name to whisper to them." : "Members can press a name to whisper.";
    panel.append(head, list, elsewhere, hint);
  }

  function open(): void {
    draw();
    panel.hidden = false;
  }
  function close(): void {
    panel.hidden = true;
  }
  trigger.classList.add("who-trigger");
  trigger.setAttribute("role", "button");
  trigger.tabIndex = 0;
  trigger.addEventListener("click", () => (panel.hidden ? open() : close()));
  trigger.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (panel.hidden) open();
      else close();
    }
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) close();
  });
  return { close, isOpen: () => !panel.hidden };
}
