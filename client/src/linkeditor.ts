import "./linkeditor.css";

// What a classroom's whiteboard, or the board to its right, opens. Everyone
// presses E and goes straight to the page the staff set (main.ts). The admin
// gets this dialog instead: open the page, or set or clear the address. The
// server checks it's the admin and that the address is https.

export interface LinkEditorTarget {
  /** e.g. "COMP6300 whiteboard". */
  title: string;
  url: string | null;
}

export function mountLinkEditor(opts: {
  /** Saves the address (null clears it); resolves to an error message, or null when saved. */
  save(url: string | null): Promise<string | null>;
  /** Opens the page (in the in-app window). */
  visit(url: string): void;
}): { open(target: LinkEditorTarget): void; isOpen(): boolean } {
  const root = document.createElement("div");
  root.id = "link-editor";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "link-editor-title");

  const card = document.createElement("form");
  card.className = "settings-card link-card";
  const title = document.createElement("h2");
  title.id = "link-editor-title";
  const hint = document.createElement("p");
  hint.className = "link-hint";
  hint.textContent = "Students press E here and go straight to this page, in a window over the campus.";
  const input = document.createElement("input");
  input.type = "url";
  input.placeholder = "https://…";
  input.maxLength = 500;
  input.setAttribute("aria-label", "Page address");
  const error = document.createElement("p");
  error.className = "link-error";
  error.setAttribute("role", "alert");
  const actions = document.createElement("div");
  actions.className = "settings-actions";
  const visit = document.createElement("button");
  visit.type = "button";
  visit.textContent = "Open page";
  const clear = document.createElement("button");
  clear.type = "button";
  clear.textContent = "Clear";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close";
  const save = document.createElement("button");
  save.type = "submit";
  save.className = "link-save";
  save.textContent = "Save";
  actions.append(visit, clear, close, save);
  card.append(title, hint, input, error, actions);
  root.append(card);
  document.body.append(root);

  let current: string | null = null;
  const hide = (): void => {
    root.hidden = true;
  };
  const sync = (): void => {
    visit.disabled = !current;
    clear.disabled = !current;
  };
  async function store(url: string | null): Promise<void> {
    save.disabled = true;
    error.textContent = "";
    const failed = await opts.save(url);
    save.disabled = false;
    if (failed) {
      error.textContent = failed;
      return;
    }
    current = url;
    input.value = url ?? "";
    error.textContent = url ? "Saved." : "Cleared.";
    sync();
  }

  card.addEventListener("submit", (e) => {
    e.preventDefault();
    void store(input.value.trim() || null);
  });
  clear.addEventListener("click", () => void store(null));
  close.addEventListener("click", hide);
  visit.addEventListener("click", () => {
    if (!current) return;
    hide();
    opts.visit(current);
  });
  root.addEventListener("click", (e) => {
    if (e.target === root) hide();
  });
  root.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") hide();
  });

  return {
    open(target) {
      current = target.url;
      title.textContent = target.title;
      input.value = target.url ?? "";
      error.textContent = "";
      sync();
      root.hidden = false;
      input.focus();
    },
    isOpen: () => !root.hidden,
  };
}
