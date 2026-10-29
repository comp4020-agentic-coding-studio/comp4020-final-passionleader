import "./mute.css";

// Mute someone: their chat lines, speech bubbles and sticky notes disappear
// from your own screen only. Nothing goes to the server; the list stays in
// this browser (localStorage). Opened from the settings dialog.

const KEY = "campus.muted";

function load(): Set<string> {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === "string").map((x) => x.toLowerCase()) : []);
  } catch {
    return new Set();
  }
}

export function mountMute(opts: {
  /** The list changed: redraw what's on screen. */
  changed(): void;
}): { open(): void; isOpen(): boolean; isMuted(name: string): boolean } {
  let muted = load();
  const save = (): void => {
    try {
      localStorage.setItem(KEY, JSON.stringify([...muted]));
    } catch {
      // Private mode: the list lasts until the tab closes.
    }
    opts.changed();
  };

  const root = document.createElement("div");
  root.id = "mute-dialog";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.dataset.keep = "";
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "mute-title");
  const card = document.createElement("form");
  card.className = "settings-card mute-card";
  const title = document.createElement("h2");
  title.id = "mute-title";
  title.textContent = "🔇 Mute someone";
  const hint = document.createElement("p");
  hint.className = "mute-hint";
  hint.textContent = "Their chat, speech bubbles and sticky notes disappear from your screen only. They aren't told, and it stays in this browser.";
  const row = document.createElement("div");
  row.className = "mute-row";
  const input = document.createElement("input");
  input.maxLength = 12;
  input.autocomplete = "off";
  input.placeholder = "their name";
  input.setAttribute("aria-label", "Name to mute");
  const add = document.createElement("button");
  add.type = "submit";
  add.textContent = "Mute";
  row.append(input, add);
  const list = document.createElement("ul");
  list.className = "mute-list";
  list.setAttribute("aria-label", "Muted");
  const actions = document.createElement("div");
  actions.className = "settings-actions";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close";
  actions.append(close);
  card.append(title, hint, row, list, actions);
  root.append(card);
  document.body.append(root);

  function render(): void {
    list.replaceChildren();
    if (!muted.size) {
      const empty = document.createElement("li");
      empty.className = "mute-empty";
      empty.textContent = "Nobody is muted.";
      list.append(empty);
      return;
    }
    for (const name of [...muted].sort()) {
      const li = document.createElement("li");
      const who = document.createElement("span");
      who.textContent = name;
      const un = document.createElement("button");
      un.type = "button";
      un.textContent = "Unmute";
      un.setAttribute("aria-label", `Unmute ${name}`);
      un.addEventListener("click", () => {
        muted.delete(name);
        save();
        render();
        input.focus();
      });
      li.append(who, un);
      list.append(li);
    }
  }

  const hide = (): void => {
    root.hidden = true;
  };
  card.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = input.value.normalize("NFKC").trim().toLowerCase();
    if (!name) return;
    muted.add(name);
    input.value = "";
    save();
    render();
  });
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
      muted = load();
      render();
      root.hidden = false;
      input.focus();
    },
    isOpen: () => !root.hidden,
    isMuted: (name) => muted.has(name.toLowerCase()),
  };
}
