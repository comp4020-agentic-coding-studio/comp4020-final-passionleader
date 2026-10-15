// Choosing a classroom: the door in building 155 opens this list instead of
// one fixed room. Every classroom is the same room (COMMON and the course
// codes only differ in name, and in whose notes they hold). An admin also sees
// a form to open a new classroom and a Close button beside each one. That is
// only a convenience: the server checks who is an admin on every create and
// remove, and this just hides the controls from everyone else.

import "./classpicker.css";

export interface ClassroomItem {
  code: string;
  space: string;
}

const COMMON = "COMMON";

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
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "class-picker-title");

  const card = document.createElement("div");
  card.className = "class-card";
  const title = document.createElement("h2");
  title.id = "class-picker-title";
  title.textContent = "Building 155: pick a classroom";
  const list = document.createElement("ul");
  list.className = "class-list";

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

  card.append(title, list, form, error, actions);
  root.append(card);
  document.body.append(root);

  let items: ClassroomItem[] = [];
  let admin = false;
  let open = false;
  // The classroom whose Close button is waiting for a Yes or No, and any
  // request in flight, so a double click can't send two.
  let confirming: string | null = null;
  let busy = false;

  const pickButtons = (): HTMLButtonElement[] => [...list.querySelectorAll<HTMLButtonElement>(".class-pick")];

  function render(): void {
    const focusedEl = document.activeElement as HTMLElement | null;
    const focusedCode = focusedEl?.classList.contains("class-pick") ? focusedEl.closest<HTMLElement>("[data-code]")?.dataset.code : undefined;
    if (confirming && !items.some((c) => c.code === confirming)) confirming = null;
    list.replaceChildren(
      ...items.map((item) => {
        const li = document.createElement("li");
        li.className = "class-row";
        li.dataset.code = item.code;
        const pick = document.createElement("button");
        pick.type = "button";
        pick.className = "class-pick";
        pick.textContent = item.code;
        pick.addEventListener("click", () => {
          hide();
          h.pick(item);
        });
        li.append(pick);

        if (admin && item.code !== COMMON) {
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
      buttons[next]!.focus();
    }
  });

  return {
    open(next, isAdmin) {
      items = next;
      admin = isAdmin;
      confirming = null;
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
