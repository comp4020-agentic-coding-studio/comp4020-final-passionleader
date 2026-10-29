// Choosing a classroom: the door in building 155 opens this list instead of
// one fixed room. Entering is two steps: a click or tap on a row only selects
// it (COMP8020 is selected to begin with), and the "Enter classroom" button, the
// Enter key or a double click goes in, so a stray tap can't send you anywhere.
// Every classroom is the same room (the course codes only differ in name,
// and in whose notes they hold). An admin also sees
// a form to open a new classroom and a Close button beside each one. That is
// only a convenience: the server checks who is an admin on every create and
// remove, and this just hides the controls from everyone else.

import "./classpicker.css";

export interface ClassroomItem {
  code: string;
  space: string;
  /** How many are in it now, if known. */
  online?: number;
}

export function mountClassPicker(h: {
  /** The visitor chose a classroom to enter. */
  pick(item: ClassroomItem): void;
  /** Admin only: open a new one. Resolves to an error message, or null on success. */
  create(code: string): Promise<string | null>;
  /** Admin only: close one. Resolves to an error message, or null on success. */
  remove(code: string): Promise<string | null>;
}): { open(list: ClassroomItem[], isAdmin: boolean): void; update(list: ClassroomItem[]): void; close(): void; isOpen(): boolean } {
  const root = document.createElement("div");
  root.id = "class-picker";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.dataset.keep = "";
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "class-picker-title");

  const card = document.createElement("div");
  card.className = "class-card";
  const title = document.createElement("h2");
  title.id = "class-picker-title";
  title.textContent = "Building 155: pick a classroom";
  const list = document.createElement("ul");
  list.className = "class-list";

  const enter = document.createElement("button");
  enter.type = "button";
  enter.className = "class-enter";
  enter.textContent = "Enter classroom";
  enter.disabled = true;

  const form = document.createElement("form");
  form.className = "class-form";
  form.hidden = true;
  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = 8;
  input.placeholder = "COMP6300";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("aria-label", "New classroom code");
  const create = document.createElement("button");
  create.type = "submit";
  create.textContent = "Open classroom";
  form.append(input, create);

  const error = document.createElement("p");
  error.className = "class-error";
  error.setAttribute("role", "alert");

  const actions = document.createElement("div");
  actions.className = "class-actions";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "Close";
  actions.append(closeBtn);

  card.append(title, list, enter, form, error, actions);
  root.append(card);
  document.body.append(root);

  let items: ClassroomItem[] = [];
  let admin = false;
  let open = false;
  // The classroom whose Close button is waiting for a Yes or No, and any
  // request in flight, so a double click can't send two.
  let confirming: string | null = null;
  let busy = false;
  // The code of the highlighted row; "Enter classroom" goes into this one.
  let selected: string | null = null;

  const pickButtons = (): HTMLButtonElement[] => [...list.querySelectorAll<HTMLButtonElement>(".class-pick")];

  /** Keeps the selection if its classroom still exists, otherwise falls back to the first. */
  function settleSelection(): void {
    if (!items.some((c) => c.code === selected)) selected = items[0]?.code ?? null;
    enter.disabled = selected === null;
  }

  function select(code: string): void {
    selected = code;
    enter.disabled = false;
    for (const b of pickButtons()) {
      const on = b.closest<HTMLElement>("[data-code]")?.dataset.code === code;
      b.classList.toggle("is-selected", on);
      b.setAttribute("aria-pressed", String(on));
    }
  }

  function enterSelected(): void {
    const item = items.find((c) => c.code === selected);
    if (!item) return;
    hide();
    h.pick(item);
  }

  function render(): void {
    const focusedEl = document.activeElement as HTMLElement | null;
    const focusedCode = focusedEl?.classList.contains("class-pick") ? focusedEl.closest<HTMLElement>("[data-code]")?.dataset.code : undefined;
    if (confirming && !items.some((c) => c.code === confirming)) confirming = null;
    settleSelection();
    list.replaceChildren(
      ...items.map((item) => {
        const li = document.createElement("li");
        li.className = "class-row";
        li.dataset.code = item.code;
        const pick = document.createElement("button");
        pick.type = "button";
        pick.className = "class-pick";
        pick.textContent = item.code;
        if (item.online) {
          const here = document.createElement("span");
          here.className = "class-online";
          here.textContent = ` · ${item.online} here`;
          pick.append(here);
        }
        const on = item.code === selected;
        pick.classList.toggle("is-selected", on);
        pick.setAttribute("aria-pressed", String(on));
        pick.addEventListener("click", () => select(item.code));
        pick.addEventListener("dblclick", () => {
          select(item.code);
          enterSelected();
        });
        li.append(pick);

        // COMP8020 is the course's own room: always open.
        if (admin && item.code !== "COMP8020") {
          if (confirming === item.code) {
            const ask = document.createElement("div");
            ask.className = "class-confirm";
            const text = document.createElement("span");
            text.textContent = `Close ${item.code}? Notes in it are deleted.`;
            const yes = document.createElement("button");
            yes.type = "button";
            yes.className = "class-small is-danger";
            yes.textContent = "Yes";
            yes.disabled = busy;
            const no = document.createElement("button");
            no.type = "button";
            no.className = "class-small";
            no.textContent = "No";
            yes.addEventListener("click", () => void run(() => h.remove(item.code), () => (confirming = null)));
            no.addEventListener("click", () => {
              confirming = null;
              render();
              list.querySelector<HTMLButtonElement>(`[data-code="${item.code}"] .class-small`)?.focus();
            });
            ask.append(text, yes, no);
            li.append(ask);
          } else {
            const closeRoom = document.createElement("button");
            closeRoom.type = "button";
            closeRoom.className = "class-small";
            closeRoom.textContent = "Close";
            closeRoom.setAttribute("aria-label", `Close ${item.code}`);
            closeRoom.addEventListener("click", () => {
              confirming = item.code;
              error.textContent = "";
              render();
              list.querySelector<HTMLButtonElement>(`[data-code="${item.code}"] .is-danger`)?.focus();
            });
            li.append(closeRoom);
          }
        }
        return li;
      }),
    );
    // A re-render (a classroom opened or closed by someone) shouldn't drop the
    // keyboard focus the visitor had on a row.
    if (focusedCode && open) {
      const same = list.querySelector<HTMLButtonElement>(`[data-code="${focusedCode}"] .class-pick`);
      if (same && !list.contains(document.activeElement)) same.focus();
    }
  }

  async function run(request: () => Promise<string | null>, before?: () => void): Promise<void> {
    if (busy) return;
    busy = true;
    error.textContent = "";
    create.disabled = true;
    try {
      const message = await request();
      before?.();
      if (message) error.textContent = message;
      else input.value = "";
    } catch {
      error.textContent = "Something went wrong. Try again.";
    } finally {
      busy = false;
      create.disabled = false;
      if (open) render();
    }
  }

  function hide(): void {
    if (!open) return;
    open = false;
    confirming = null;
    root.hidden = true;
    error.textContent = "";
    (document.activeElement as HTMLElement | null)?.blur();
  }

  closeBtn.addEventListener("click", hide);
  root.addEventListener("click", (e) => {
    if (e.target === root) hide();
  });
  input.addEventListener("input", () => {
    input.value = input.value.toUpperCase();
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const code = input.value.trim().toUpperCase();
    if (!code) return;
    void run(() => h.create(code));
  });
  root.addEventListener("keydown", (e) => {
    // Keep game keys (WASD, E, Q) out of the scene while the dialog is open.
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      hide();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const buttons = pickButtons();
      const at = buttons.findIndex((b) => b === document.activeElement || b.parentElement?.contains(document.activeElement));
      if (at === -1 || document.activeElement === input) return;
      e.preventDefault();
      const next = (at + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      const code = buttons[next]!.closest<HTMLElement>("[data-code]")?.dataset.code;
      if (code) select(code);
      buttons[next]!.focus();
      return;
    }
    // Enter on a row goes straight in (the button's own Enter does the same
    // through its click, so only rows are handled here).
    if (e.key === "Enter" && !e.repeat && (document.activeElement as HTMLElement | null)?.classList.contains("class-pick")) {
      e.preventDefault();
      const code = (document.activeElement as HTMLElement).closest<HTMLElement>("[data-code]")?.dataset.code;
      if (code) select(code);
      enterSelected();
    }
  });
  enter.addEventListener("click", enterSelected);

  return {
    open(next, isAdmin) {
      items = next;
      admin = isAdmin;
      confirming = null;
      // COMP8020 (the server sends it first) is selected to begin with.
      selected = items[0]?.code ?? null;
      form.hidden = !isAdmin;
      error.textContent = "";
      input.value = "";
      open = true;
      root.hidden = false;
      render();
      pickButtons()[0]?.focus();
    },
    update(next) {
      items = next;
      if (open) render();
    },
    close: hide,
    isOpen: () => open,
  };
}
