// A GTA-style radial picker: a ring of choices centred on the screen. The
// caller drives it (e.g. hold Q = open(), release Q = close()); this module
// only draws the ring, tracks which wedge the mouse points at or a number
// key chose, and reports the pick back through onPick.

import "./radial.css";

export interface RadialItem {
  id: string;
  label: string;
}

const RADIUS = 120; // px from the ring's centre to each item
const DEAD_ZONE = 36; // px: pointer within this of centre picks nothing

function angleOf(index: number, count: number): number {
  // Index 0 is straight up, then clockwise — matches screen coordinates,
  // where atan2(dy, dx) with a downward-positive y is also clockwise.
  return ((-90 + (360 / count) * index) * Math.PI) / 180;
}

function nearestIndex(dx: number, dy: number, count: number): number {
  if (Math.hypot(dx, dy) < DEAD_ZONE) return -1;
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI; // -180..180, 0 = right, clockwise
  const shifted = (((deg + 90) % 360) + 360) % 360; // 0 = item 0's direction
  return Math.round(shifted / (360 / count)) % count;
}

export function mountRadial(
  items: RadialItem[],
  onPick: (id: string) => void,
): { open(): void; close(): void; isOpen(): boolean; highlight(index: number): void } {
  const root = document.createElement("div");
  root.id = "radial";
  root.setAttribute("role", "menu");
  root.setAttribute("aria-label", "Emote menu");

  const ring = document.createElement("div");
  ring.className = "radial-ring";
  const centre = document.createElement("div");
  centre.className = "radial-centre";
  ring.append(centre);

  const elements: HTMLDivElement[] = items.map((item, i) => {
    const el = document.createElement("div");
    el.className = "radial-item";
    el.textContent = item.label;
    el.setAttribute("role", "menuitem");
    el.tabIndex = -1;
    const angle = angleOf(i, items.length);
    el.style.transform = `translate(${Math.cos(angle) * RADIUS}px, ${Math.sin(angle) * RADIUS}px)`;
    el.addEventListener("pointerup", (e) => {
      e.stopPropagation();
      pickAndHide(item.id);
    });
    ring.append(el);
    return el;
  });

  root.append(ring);
  document.body.append(root);

  let open = false;
  let highlighted = -1;

  function setHighlight(index: number): void {
    highlighted = index;
    elements.forEach((el, i) => el.classList.toggle("is-highlighted", i === index));
  }

  function pickAndHide(id: string): void {
    hide();
    onPick(id);
  }

  function onMouseMove(e: MouseEvent): void {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    setHighlight(nearestIndex(e.clientX - cx, e.clientY - cy, items.length));
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      setHighlight(-1);
      hide();
    }
  }

  function onBackdropPointerDown(e: PointerEvent): void {
    // A tap that didn't land on an item (those stop propagation) cancels.
    if (e.target === root || e.target === ring || e.target === centre) {
      setHighlight(-1);
      hide();
    }
  }

  function hide(): void {
    if (!open) return;
    open = false;
    root.classList.remove("is-open");
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("keydown", onKeydown);
    root.removeEventListener("pointerdown", onBackdropPointerDown);
  }

  return {
    open(): void {
      if (open) return;
      open = true;
      setHighlight(-1);
      root.classList.add("is-open");
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("keydown", onKeydown);
      root.addEventListener("pointerdown", onBackdropPointerDown);
    },
    close(): void {
      if (!open) return;
      const pick = highlighted >= 0 ? items[highlighted]?.id : undefined;
      hide();
      if (pick) onPick(pick);
    },
    isOpen(): boolean {
      return open;
    },
    highlight(index: number): void {
      if (!open || index < 0 || index >= items.length) return;
      setHighlight(index);
    },
  };
}
