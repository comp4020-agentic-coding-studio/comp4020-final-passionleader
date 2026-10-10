// Writing a new sticky note: a blank paper card with a textarea, a word
// counter, and Stick/Cancel. Self-mounts to <body>, hidden until open().

import "./notecompose.css";

const MAX_CHARS = 600;
const MAX_WORDS = 100;

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

export function mountNoteComposer(onSubmit: (text: string) => Promise<void>): {
  open(warning?: string): void;
  close(): void;
  isOpen(): boolean;
} {
  const root = document.createElement("div");
  root.id = "note-composer";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "Write a sticky note");

  const card = document.createElement("div");
  card.className = "composer-card";

  const title = document.createElement("h2");
  title.className = "composer-title";
  title.textContent = "Stick a note";

  const warning = document.createElement("p");
  warning.className = "composer-warning";

  const textarea = document.createElement("textarea");
  textarea.maxLength = MAX_CHARS;
  textarea.placeholder = "Write something…";
  textarea.setAttribute("aria-label", "Note text");

  const row = document.createElement("div");
  row.className = "composer-row";
  const counter = document.createElement("span");
  counter.className = "composer-counter";
  row.append(counter);

  const actions = document.createElement("div");
  actions.className = "composer-actions";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "composer-cancel";
  cancelBtn.textContent = "Cancel";
  const stickBtn = document.createElement("button");
  stickBtn.type = "button";
  stickBtn.className = "composer-stick";
  stickBtn.textContent = "Stick";
  actions.append(cancelBtn, stickBtn);

  const error = document.createElement("p");
  error.className = "composer-error";

  card.append(title, warning, textarea, row, actions, error);
  root.append(card);
  document.body.append(root);

  let open = false;

  function updateCounter(): void {
    const words = wordCount(textarea.value);
    counter.textContent = `${words} / ${MAX_WORDS} words`;
    const over = words > MAX_WORDS;
    counter.classList.toggle("is-over", over);
    stickBtn.disabled = over || textarea.value.trim() === "";
  }
  textarea.addEventListener("input", updateCounter);

  function hide(): void {
    if (!open) return;
    open = false;
    root.classList.remove("is-open");
    document.removeEventListener("keydown", onKeydown);
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      hide();
    }
  }

  cancelBtn.addEventListener("click", hide);
  root.addEventListener("pointerdown", (e) => {
    if (e.target === root) hide();
  });

  stickBtn.addEventListener("click", () => {
    const text = textarea.value.trim();
    if (!text) return;
    stickBtn.disabled = true;
    error.textContent = "";
    onSubmit(text)
      .then(() => hide())
      .catch((err: unknown) => {
        error.textContent = err instanceof Error ? err.message : String(err);
      })
      .finally(() => updateCounter());
  });

  return {
    open(warningText?: string): void {
      open = true;
      textarea.value = "";
      error.textContent = "";
      warning.textContent = warningText ?? "";
      updateCounter();
      root.classList.add("is-open");
      document.addEventListener("keydown", onKeydown);
      textarea.focus();
    },
    close(): void {
      hide();
    },
    isOpen(): boolean {
      return open;
    },
  };
}
