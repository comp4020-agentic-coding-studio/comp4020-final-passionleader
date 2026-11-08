import "./mute.css";

// Interest tags: up to three from a fixed list (course codes the server knows, then interests), shown
// small under your name tag and in "Who's here" to the people in your space. Never typed: the
// server sends the list, takes back only names from it and refuses anything else. Opened from
// the settings dialog; members only.

export interface InterestsDeps {
  /** Your tags now, and the list to pick from (asked of the server each time it opens). */
  load(): Promise<{ tags: string[]; courses: string[]; interests: string[]; max: number }>;
  /** Saves the pick; resolves with an error text, or null when it went. */
  save(tags: string[]): Promise<string | null>;
}

export function mountInterests(deps: InterestsDeps): { open(): void; isOpen(): boolean } {
  const root = document.createElement("div");
  root.id = "interests-dialog";
  root.className = "mute-dialog-like";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "interests-title");
  const card = document.createElement("div");
  card.className = "settings-card mute-card";
  const title = document.createElement("h2");
  title.id = "interests-title";
  title.textContent = "🏷️ My interests";
  const hint = document.createElement("p");
  hint.className = "mute-hint";
  const status = document.createElement("p");
  status.className = "mute-hint";
  status.setAttribute("role", "status");
  const chips = document.createElement("div");
  chips.className = "interest-chips";
  const actions = document.createElement("div");
  actions.className = "settings-actions";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close";
  actions.append(close);
  card.append(title, hint, chips, status, actions);
  root.append(card);
  document.body.append(root);

  let picked = new Set<string>();
  let max = 3;

  function draw(groups: [string, string[]][]): void {
    chips.replaceChildren();
    for (const [name, list] of groups) {
      const h = document.createElement("strong");
      h.textContent = name;
      const row = document.createElement("div");
      row.className = "interest-row";
      for (const tag of list) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = tag;
        const on = picked.has(tag);
        b.setAttribute("aria-pressed", String(on));
        b.disabled = !on && picked.size >= max;
        b.addEventListener("click", () => void toggle(tag, groups));
        row.append(b);
      }
      chips.append(h, row);
    }
    hint.textContent = `Pick up to ${max}. They show small under your name tag and in "Who's here" to the people in your space.`;
  }

  async function toggle(tag: string, groups: [string, string[]][]): Promise<void> {
    const next = new Set(picked);
    if (!next.delete(tag)) next.add(tag);
    if (next.size > max) return;
    status.textContent = "Saving…";
    const error = await deps.save([...next]);
    if (error) {
      status.textContent = error;
      return;
    }
    picked = next;
    status.textContent = "Saved.";
    draw(groups);
  }

  const hide = (): void => {
    root.hidden = true;
  };
  close.addEventListener("click", hide);
  root.addEventListener("click", (e) => {
    if (e.target === root) hide();
  });
  root.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") hide();
  });

  return {
    open() {
      status.textContent = "Loading…";
      chips.replaceChildren();
      root.hidden = false;
      void deps
        .load()
        .then((d) => {
          picked = new Set(d.tags);
          max = d.max;
          status.textContent = "";
          draw([
            ["Courses", d.courses],
            ["Interests", d.interests],
          ]);
          (chips.querySelector("button:not(:disabled)") as HTMLElement | null)?.focus();
        })
        .catch(() => (status.textContent = "Couldn't load the list. Try again."));
    },
    isOpen: () => !root.hidden,
  };
}
