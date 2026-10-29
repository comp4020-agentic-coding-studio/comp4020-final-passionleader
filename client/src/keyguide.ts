// A small on-screen key guide: a mini keyboard showing WASD (move), E
// (interact), Q (menu), Enter (chat), Shift (run) and Space (jump), so a new player sees
// the controls without reading text.
// Purely decorative and click-through — mountKeyGuide() builds it once,
// appended to <body> and hidden until the caller shows it.

import "./keyguide.css";

const TRACKED_CODES = ["KeyW", "KeyA", "KeyS", "KeyD", "KeyE", "KeyQ", "KeyR", "KeyV", "Enter", "Space", "ShiftLeft"] as const;
type TrackedCode = (typeof TRACKED_CODES)[number];

function isTracked(code: string): code is TrackedCode {
  return (TRACKED_CODES as readonly string[]).includes(code);
}

function key(slot: string, label: string): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "keyguide-key";
  el.dataset.slot = slot;
  el.textContent = label;
  return el;
}

function group(caption: string, ...children: HTMLElement[]): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "keyguide-group";
  el.append(...children);
  const label = document.createElement("span");
  label.className = "keyguide-caption";
  label.textContent = caption;
  el.append(label);
  return el;
}

export function mountKeyGuide(): { show(): void; hide(): void; press(code: string, down: boolean): void } {
  const root = document.createElement("div");
  root.id = "keyguide";
  root.hidden = true;
  // Duplicates information already on screen elsewhere; a screen reader
  // doesn't need to announce a picture of the keyboard.
  root.setAttribute("aria-hidden", "true");

  const w = key("w", "W");
  const a = key("a", "A");
  const s = key("s", "S");
  const d = key("d", "D");
  const wasd = document.createElement("div");
  wasd.className = "keyguide-wasd";
  wasd.append(w, a, s, d);

  const e = key("e", "E");
  e.classList.add("keyguide-e");

  const q = key("q", "Q");
  q.classList.add("keyguide-e");
  const r = key("r", "R");
  r.classList.add("keyguide-e");
  const vk = key("v", "V");
  vk.classList.add("keyguide-e");
  const enter = key("enter", "ENTER");
  enter.classList.add("keyguide-e", "keyguide-enter");

  const space = key("space", "SPACE");
  space.classList.add("keyguide-space");
  const shift = key("shift", "SHIFT");
  shift.classList.add("keyguide-wide");
  enter.classList.add("keyguide-wide");

  // Move on the left, at the bottom; to its right two straight rows, each key over its caption:
  // E Q R V on top, Shift Space Enter below (the user's layout, 10/30).
  const rows = document.createElement("div");
  rows.className = "keyguide-rows";
  const row1 = document.createElement("div");
  row1.className = "keyguide-row";
  row1.append(group("Interact", e), group("Emotes", q), group("Turn view", r), group("Talk (hold)", vk));
  const row2 = document.createElement("div");
  row2.className = "keyguide-row";
  row2.append(group("Run", shift), group("Jump", space), group("Chat", enter));
  rows.append(row1, row2);
  const moveGroup = group("Move", wasd);
  moveGroup.classList.add("keyguide-move");
  root.append(moveGroup, rows);
  document.body.append(root);

  const keycaps: Record<TrackedCode, HTMLDivElement> = {
    KeyW: w,
    KeyA: a,
    KeyS: s,
    KeyD: d,
    KeyE: e,
    KeyQ: q,
    KeyR: r,
    KeyV: vk,
    Enter: enter,
    Space: space,
    ShiftLeft: shift,
  };

  return {
    show(): void {
      root.hidden = false;
    },
    hide(): void {
      root.hidden = true;
    },
    press(code: string, down: boolean): void {
      if (!isTracked(code)) return;
      keycaps[code].classList.toggle("is-down", down);
    },
  };
}
