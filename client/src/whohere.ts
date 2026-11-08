import "./whohere.css";

// "Who's here" (RICE v2 #1, 10/30): the HUD's online line opens a small
// list of the people in this space (their name tags are already on screen
// for everyone here, so nothing new leaves the space) and, for elsewhere,
// head counts only, as the server sends them (never names: CLAUDE.md).
// A member's name starts a whisper ("/w name ") in the chat.

export interface WhoHereDeps {
  /** The people in this space now: name and whether they're staff. */
  here(): { name: string; icon?: string; staff: boolean; tags?: string[] }[];
  /** Head counts per place, labelled ("Hub", 3). */
  counts(): [string, number][];
  me(): string;
  /** Whether you may whisper (members only). */
  mayWhisper(): boolean;
  whisper(name: string): void;
  /** Who you follow now (lower-case names), and a way to follow or unfollow; null if you can't (a guest). */
  /** Staff in the Student Hub with office hours open now (empty anywhere else), and whether you may knock (a signed-up student). */
  officeNow(): { name: string; room: number | null }[];
  mayKnock(): boolean;
  knock(name: string): void;
  followed(): Set<string>;
  toggleFollow(name: string): Promise<void>;
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
    // Once each: someone with the campus open in two tabs (or a phone and a computer) has two sockets.
    const me = deps.me().toLowerCase();
    const people = [...new Map(deps.here().filter((p) => p.name.toLowerCase() !== me).map((p) => [p.name.toLowerCase(), p])).values()];
    h.textContent = `Here now (${people.length + 1})`;
    const x = document.createElement("button");
    x.type = "button";
    x.textContent = "Close";
    x.classList.add("ui-close"); // one Close for every window (11/4 UI pass)
    x.setAttribute("aria-label", "Close");
    x.addEventListener("click", close);
    head.append(h, x);
    // Office hours (Student Hub): who is open now, and a Knock for students.
    const open = deps.officeNow().filter((o) => o.name.toLowerCase() !== me);
    const hours = document.createElement("div");
    hours.className = "who-office";
    for (const o of open) {
      const row = document.createElement("p");
      row.textContent = `Office hours now: ${o.name}${o.room ? ` (room ${o.room})` : ""} `;
      if (deps.mayKnock()) {
        const k = document.createElement("button");
        k.type = "button";
        k.textContent = "Knock";
        k.title = `Ask ${o.name} to invite you in`;
        k.addEventListener("click", () => {
          deps.knock(o.name);
          k.disabled = true;
        });
        row.append(k);
      }
      hours.append(row);
    }
    const list = document.createElement("ul");
    const meLi = document.createElement("li");
    meLi.textContent = `${deps.me()} (you)`;
    meLi.className = "who-me";
    list.append(meLi);
    for (const p of people.sort((a, b) => a.name.localeCompare(b.name))) {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = p.icon ? `${p.icon} ${p.name}` : p.name;
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
      // Follow: be told once when they come onto the campus (members, and only members to follow).
      if (deps.mayWhisper() && !/^guest/i.test(p.name)) {
        const on = deps.followed().has(p.name.toLowerCase());
        const f = document.createElement("button");
        f.type = "button";
        f.className = "who-follow";
        f.textContent = on ? "🔔 Following" : "🔔 Follow";
        f.setAttribute("aria-pressed", String(on));
        f.title = on ? `Stop being told when ${p.name} comes on` : `Tell me when ${p.name} is on the campus`;
        f.addEventListener("click", () => {
          void deps.toggleFollow(p.name).then(draw);
        });
        li.append(f);
      }
      // Their interest tags, small, only for the people already in your space.
      if (p.tags?.length) {
        const t = document.createElement("span");
        t.className = "who-tags";
        t.textContent = p.tags.join(" · ");
        li.append(t);
      }
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
    panel.append(head, hours, list, elsewhere, hint);
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
