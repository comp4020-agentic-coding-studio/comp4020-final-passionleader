// A small on-screen key guide: a mini keyboard showing WASD (move), E
// (interact), Q (menu), Enter (chat), Shift (run) and Space (jump), so a new player sees
// the controls without reading text.
// Purely decorative and click-through — mountKeyGuide() builds it once,
// appended to <body> and hidden until the caller shows it.

import "./keyguide.css";

const TRACKED_CODES = ["KeyW", "KeyA", "KeyS", "KeyD", "KeyE", "KeyQ", "Enter", "Space", "ShiftLeft"] as const;
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
  const enter = key("enter", "ENTER");
  enter.classList.add("keyguide-e", "keyguide-enter");

  const main = document.createElement("div");
  main.className = "keyguide-main";
  main.append(group("Move", wasd), group("Interact", e), group("Menu", q), group("Chat", enter));

  const space = key("space", "SPACE");
  space.classList.add("keyguide-space");
  const spaceRow = document.createElement("div");
  spaceRow.className = "keyguide-space-row";
  const shift = key("shift", "SHIFT");
  shift.classList.add("keyguide-e", "keyguide-enter");
  spaceRow.append(shift, space);
  const spaceGroup = document.createElement("div");
  spaceGroup.className = "keyguide-group";
  spaceGroup.append(spaceRow);
  const spaceCaption = document.createElement("span");
  spaceCaption.className = "keyguide-caption";
  spaceCaption.textContent = "Shift run · Space jump";
  spaceGroup.append(spaceCaption);

  root.append(main, spaceGroup);
  document.body.append(root);

  const keycaps: Record<TrackedCode, HTMLDivElement> = {
    KeyW: w,
    KeyA: a,
    KeyS: s,
    KeyD: d,
    KeyE: e,
    KeyQ: q,
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
