// Picking one of several sticky notes stuck on the same spot. Notes can land
// on top of each other, and the one underneath would otherwise be
// unreadable: pressing E where more than one is in reach lists them (newest
// first) and you pick one by number, click or tap. Esc closes the list.

export interface NoteChoice {
  id: number;
  author: string;
  text: string;
}

const PREVIEW = 48; // characters of each note shown in the list

export function mountNoteChooser(onPick: (id: number) => void): {
  open(choices: NoteChoice[]): void;
  isOpen(): boolean;
} {
  const root = document.createElement("div");
  root.id = "note-chooser";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "note-chooser-title");

  const card = document.createElement("div");
  card.className = "settings-card";
  const title = document.createElement("h2");
  title.id = "note-chooser-title";
  const list = document.createElement("ol");
  list.className = "chooser-list";
  const actions = document.createElement("div");
  actions.className = "settings-actions";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close";
  actions.append(close);
  card.append(title, list, actions);
  root.append(card);
  document.body.append(root);

  let choices: NoteChoice[] = [];
  const hide = (): void => {
    root.hidden = true;
  };
  const pick = (i: number): void => {
    const c = choices[i];
    if (!c) return;
    hide();
    onPick(c.id);
  };

  close.addEventListener("click", hide);
  root.addEventListener("click", (e) => {
    if (e.target === root) hide();
  });
  root.addEventListener("keydown", (e) => {
    // Keep game keys (E, Q, WASD) out of the scene while the list is open.
    e.stopPropagation();
    if (e.key === "Escape") hide();
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= choices.length) {
      e.preventDefault();
      pick(n - 1);
    }
  });

  return {
    open(next) {
      choices = next.slice(0, 9);
      title.textContent = `${next.length} notes here: which one?`;
      list.replaceChildren(
        ...choices.map((c, i) => {
          const li = document.createElement("li");
          const b = document.createElement("button");
          b.type = "button";
          const flat = c.text.replace(/\s+/g, " ").trim();
          const preview = flat.length > PREVIEW ? `${flat.slice(0, PREVIEW)}…` : flat;
          const num = document.createElement("span");
          num.className = "chooser-num";
          num.textContent = String(i + 1);
          const who = document.createElement("strong");
          who.textContent = `${c.author}'s note`;
          const what = document.createElement("span");
          what.className = "chooser-preview";
          what.textContent = preview;
          b.append(num, who, what);
          b.addEventListener("click", () => pick(i));
          li.append(b);
          return li;
        }),
      );
      root.hidden = false;
      (list.querySelector("button") as HTMLButtonElement | null)?.focus();
    },
    isOpen: () => !root.hidden,
  };
}
