// The "Customise look" window: how your figure looks. Two bodies (Figure A and
// Figure B), and a colour for skin, hair, top and bottom, and a hat and its
// colour. A choice is an index into the palettes below, so a look is seven
// small numbers the server can check. The window only collects the choice and reports it; the
// 3D preview goes into `previewSlot` (filled by main) and the recolouring,
// the saving and the wiring happen outside.

import "./lookpicker.css";

export interface Look {
  body: 0 | 1;
  skin: number;
  hair: number;
  top: number;
  bottom: number;
  hat: number;
  /** Which of the HAIR colours the hat (if any) is painted; ignored when hat is 0. */
  hatColour: number;
}

// body 0 = "Figure A", 1 = "Figure B". skin 0-5, hair 0-9, top and bottom 0-9
// index these palettes; hat 0 is none and 1-6 are the hats, coloured from
// the same HAIR palette (one fewer palette to keep straight, and a hat never
// looks out of place next to the hair it's covering).
export const SKIN = [0xf6d7b8, 0xe8b893, 0xd29a6c, 0xa86e45, 0x7a4a2c, 0x4e2f1d];
export const HAIR = [0x2b2118, 0x5a3a22, 0x8c5a2b, 0xc79a4a, 0xe6d3a3, 0x8a8a8a, 0xb23b2e, 0x2f5d8a, 0x6b3fa0, 0x2e7d4f];
export const CLOTH = [0x2f5d8a, 0x3a3f4a, 0x8a2f2f, 0x2e7d4f, 0xc58a12, 0x6b3fa0, 0xe8e2d4, 0x1f1f24, 0xd2691e, 0x4aa3c7];
export const HATS = ["No hat", "Beanie", "Cap", "Bucket hat", "Graduation cap", "Beret", "Helmet", "Hard hat"];
/** The yellow hard hat is for the test accounts (`qa_`) only; the server checks too. */
export const QA_HAT = 7;
export const DEFAULT_LOOK: Look = { body: 0, skin: 1, hair: 0, top: 0, bottom: 1, hat: 0, hatColour: 1 };

type Colour = "skin" | "hair" | "top" | "bottom" | "hatColour";
const ROWS: { key: Colour; label: string; palette: number[] }[] = [
  { key: "skin", label: "Skin", palette: SKIN },
  { key: "hair", label: "Hair", palette: HAIR },
  { key: "top", label: "Top", palette: CLOTH },
  { key: "bottom", label: "Bottom", palette: CLOTH },
];

const hex = (c: number): string => `#${c.toString(16).padStart(6, "0")}`;
const pick = (n: number): number => Math.floor(Math.random() * n);
const copy = (l: Look): Look => ({ ...l });

/** A look that is valid whatever came in: out-of-range numbers fall back to the default. */
function clean(l: Look): Look {
  const ok = (v: number, n: number, d: number): number => (Number.isInteger(v) && v >= 0 && v < n ? v : d);
  return {
    body: l.body === 1 ? 1 : 0,
    skin: ok(l.skin, SKIN.length, DEFAULT_LOOK.skin),
    hair: ok(l.hair, HAIR.length, DEFAULT_LOOK.hair),
    top: ok(l.top, CLOTH.length, DEFAULT_LOOK.top),
    bottom: ok(l.bottom, CLOTH.length, DEFAULT_LOOK.bottom),
    hat: ok(l.hat, HATS.length, DEFAULT_LOOK.hat),
    hatColour: ok(l.hatColour, HAIR.length, DEFAULT_LOOK.hatColour),
  };
}

export function mountLookPicker(opts: {
  /** Whether this visitor may wear the qa-only hard hat. */
  qaHats(): boolean;
  /** Called on every change, so the main session can update a live preview (and on Save). */
  preview(look: Look): void;
  /** Save pressed: resolve to an error message or null. */
  save(look: Look): Promise<string | null>;
}): {
  open(current: Look): void;
  close(): void;
  isOpen(): boolean;
  /** An element main fills with a live 3D preview canvas (about 200x260). */
  previewSlot: HTMLElement;
} {
  const root = document.createElement("div");
  root.id = "look-picker";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.dataset.keep = "";
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "look-picker-title");

  const card = document.createElement("div");
  card.className = "settings-card look-card";
  const title = document.createElement("h2");
  title.id = "look-picker-title";
  title.textContent = "Customise look";

  const layout = document.createElement("div");
  layout.className = "look-layout";
  const previewSlot = document.createElement("div");
  previewSlot.className = "look-preview";
  previewSlot.setAttribute("aria-label", "Preview of your figure");
  const rows = document.createElement("div");
  rows.className = "look-rows";
  layout.append(previewSlot, rows);

  // The inputs of each row, in order, so a look can be shown by checking one per row.
  const inputs = new Map<string, HTMLInputElement[]>();

  /** One row: a legend and a group of real radio buttons, each with a visible face. */
  function row(group: string, label: string, count: number, face: (i: number, input: HTMLInputElement, span: HTMLSpanElement) => void, onPick: (i: number) => void): HTMLFieldSetElement {
    const fs = document.createElement("fieldset");
    fs.className = "look-row";
    const legend = document.createElement("legend");
    legend.textContent = label;
    const box = document.createElement("div");
    box.className = "look-options";
    const list: HTMLInputElement[] = [];
    for (let i = 0; i < count; i++) {
      const lab = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = `look-${group}`;
      input.value = String(i);
      const span = document.createElement("span");
      face(i, input, span);
      input.addEventListener("change", () => {
        if (input.checked) onPick(i);
      });
      lab.append(input, span);
      box.append(lab);
      list.push(input);
    }
    inputs.set(group, list);
    fs.append(legend, box);
    return fs;
  }

  let look: Look = copy(DEFAULT_LOOK);
  let original: Look = copy(DEFAULT_LOOK);
  let isOpen = false;
  let saving = false;

  function changed(): void {
    opts.preview(copy(look));
  }

  rows.append(
    row(
      "body",
      "Body",
      2,
      (i, input, span) => {
        span.className = "look-chip";
        span.textContent = i === 0 ? "Figure A" : "Figure B";
        input.setAttribute("aria-label", span.textContent);
      },
      (i) => {
        look.body = i === 1 ? 1 : 0;
        changed();
      },
    ),
  );
  for (const r of ROWS) {
    rows.append(
      row(
        r.key,
        r.label,
        r.palette.length,
        (i, input, span) => {
          span.className = "look-swatch";
          span.style.background = hex(r.palette[i]!);
          input.setAttribute("aria-label", `${r.label} colour ${i + 1} of ${r.palette.length}`);
        },
        (i) => {
          look[r.key] = i;
          changed();
        },
      ),
    );
  }
  rows.append(
    row(
      "hat",
      "Hat",
      HATS.length,
      (i, input, span) => {
        span.className = "look-chip";
        span.textContent = HATS[i]!;
        input.setAttribute("aria-label", HATS[i]!);
      },
      (i) => {
        look.hat = i;
        syncHatColourRow();
        changed();
      },
    ),
  );
  const hatColourRow = row(
    "hatColour",
    "Hat colour",
    HAIR.length,
    (i, input, span) => {
      span.className = "look-swatch";
      span.style.background = hex(HAIR[i]!);
      input.setAttribute("aria-label", `Hat colour ${i + 1} of ${HAIR.length}`);
    },
    (i) => {
      look.hatColour = i;
      changed();
    },
  );
  rows.append(hatColourRow);
  inputs.get("hat")?.[QA_HAT]?.closest("label")?.classList.add("look-qa-only");

  /** Greys out the hat colour row with no hat, or the hard hat (always yellow). */
  function syncHatColourRow(): void {
    hatColourRow.disabled = look.hat === 0 || look.hat === QA_HAT;
  }

  const error = document.createElement("p");
  error.className = "look-error";
  error.setAttribute("role", "alert");

  const actions = document.createElement("div");
  actions.className = "settings-actions";
  const random = document.createElement("button");
  random.type = "button";
  random.textContent = "Random";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  const save = document.createElement("button");
  save.type = "button";
  save.className = "look-save";
  save.textContent = "Save";
  actions.append(random, cancel, save);

  card.append(title, layout, error, actions);
  root.append(card);
  document.body.append(root);

  /** Checks the radio for each part of a look. */
  function show(l: Look): void {
    const at: Record<string, number> = { body: l.body, skin: l.skin, hair: l.hair, top: l.top, bottom: l.bottom, hat: l.hat, hatColour: l.hatColour };
    for (const [group, list] of inputs) for (const [i, input] of list.entries()) input.checked = i === at[group];
    syncHatColourRow();
  }

  function hide(): void {
    if (!isOpen) return;
    isOpen = false;
    root.hidden = true;
    error.textContent = "";
    (document.activeElement as HTMLElement | null)?.blur();
  }

  /** Close without saving, and put the preview back to what it was. */
  function cancelAll(): void {
    if (!isOpen || saving) return;
    opts.preview(copy(original));
    hide();
  }

  random.addEventListener("click", () => {
    look = {
      body: pick(2) === 1 ? 1 : 0,
      skin: pick(SKIN.length),
      hair: pick(HAIR.length),
      top: pick(CLOTH.length),
      bottom: pick(CLOTH.length),
      hat: pick(opts.qaHats() ? HATS.length : QA_HAT),
      hatColour: pick(HAIR.length),
    };
    show(look);
    error.textContent = "";
    changed();
  });
  cancel.addEventListener("click", cancelAll);
  save.addEventListener("click", async () => {
    if (saving) return;
    saving = true;
    save.disabled = true;
    random.disabled = true;
    error.textContent = "";
    const mine = copy(look);
    opts.preview(copy(mine));
    let message: string | null;
    try {
      message = await opts.save(mine);
    } catch {
      message = "Could not save your look. Try again.";
    }
    saving = false;
    save.disabled = false;
    random.disabled = false;
    // The window may have been closed from outside while this was saving.
    if (!isOpen) return;
    if (message) {
      error.textContent = message;
      return;
    }
    original = copy(mine);
    hide();
  });

  root.addEventListener("click", (e) => {
    if (e.target === root) cancelAll();
  });
  root.addEventListener("keydown", (e) => {
    // Keep game keys (WASD, E, Q) out of the scene while the window is open.
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      cancelAll();
    }
  });

  return {
    open(current) {
      // The hard hat only shows for the test accounts.
      for (const el of root.querySelectorAll<HTMLElement>(".look-qa-only")) el.hidden = !opts.qaHats();
      look = clean(current);
      original = copy(look);
      show(look);
      error.textContent = "";
      saving = false;
      save.disabled = false;
      random.disabled = false;
      isOpen = true;
      root.hidden = false;
      changed();
      // Land on the chosen body, so the arrow keys work straight away.
      inputs.get("body")?.[look.body]?.focus();
    },
    close() {
      hide();
    },
    isOpen: () => isOpen,
    previewSlot,
  };
}
