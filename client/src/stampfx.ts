import "./stampfx.css";
import { reduceMotion } from "./settings.ts";

// A new visit stamp, shown big for a moment (the user, 11/9): a red ink stamp, "New place found!"
// and the place, pressed onto the screen, held about a second, then gone. Decoration only: it
// never takes a click or the focus, and a screen reader hears the same words once.
let shown: HTMLElement | null = null;

export function stampFx(label: string, count: number, total: number): void {
  shown?.remove();
  const el = document.createElement("div");
  el.className = "stampfx";
  el.setAttribute("role", "status");
  const ring = document.createElement("div");
  ring.className = "stampfx-ring";
  const top = document.createElement("span");
  top.className = "stampfx-top";
  top.textContent = "New place found!";
  const name = document.createElement("strong");
  name.className = "stampfx-name";
  name.textContent = label;
  const n = document.createElement("span");
  n.className = "stampfx-count";
  n.textContent = `${count} / ${total}`;
  ring.append(top, name, n);
  el.append(ring);
  if (reduceMotion()) el.classList.add("is-calm");
  document.body.append(el);
  shown = el;
  window.setTimeout(() => {
    el.remove();
    if (shown === el) shown = null;
  }, 1600);
}
