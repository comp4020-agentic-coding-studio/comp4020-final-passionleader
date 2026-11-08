import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { reduceMotion } from "./settings.ts";
import type { Emote } from "./net.ts";
import "./emotefx.css";

// A small burst of symbols rising over a figure's head when it emotes (RICE v3,
// 8): hearts for a wave, notes for a dance, a tick for yes, a cross for no, a
// sparkle for mate. Plain CSS2D labels on the figure, each with an inner span
// the stylesheet animates (the label renderer owns the outer element's
// transform), taken down when the animation ends. A cap on how many are alive
// at once keeps a crowded lawn of dancers light on phones.

const SYMBOLS: Record<Emote, { glyphs: string[]; color: string }> = {
  wave: { glyphs: ["❤", "❤", "♥"], color: "#e0455f" },
  dance: { glyphs: ["♪", "♫", "♪"], color: "#6b3f9d" },
  yes: { glyphs: ["✔"], color: "#2e9e57" },
  no: { glyphs: ["✖"], color: "#d03a3a" },
  mate: { glyphs: ["✦", "✧", "✦"], color: "#e0a800" },
};
const LIFE_MS = 1200;
const PER_BURST = 4;
const MAX_ALIVE = 24;
/** Just above the head, below the speech bubble (2.75). */
const START_Y = 2.2;

let alive = 0;
const osQuiet = window.matchMedia("(prefers-reduced-motion: reduce)");

/** Whether bursts are skipped: the Settings option, or the device's own reduce-motion setting. */
const quiet = (): boolean => reduceMotion() || osQuiet.matches;

export function emoteBurst(figure: THREE.Object3D, kind: Emote): void {
  if (quiet()) return;
  const { glyphs, color } = SYMBOLS[kind];
  for (let i = 0; i < PER_BURST && alive < MAX_ALIVE; i++) {
    const el = document.createElement("div");
    el.className = "emote-fx";
    const inner = document.createElement("span");
    inner.textContent = glyphs[i % glyphs.length]!;
    inner.style.color = color;
    // Spread sideways and staggered, so it reads as a burst and not a column.
    inner.style.setProperty("--dx", `${(i - (PER_BURST - 1) / 2) * 14 + (Math.random() * 8 - 4)}px`);
    inner.style.animationDelay = `${i * 90}ms`;
    el.append(inner);
    const obj = new CSS2DObject(el);
    obj.position.set(0, START_Y, 0);
    figure.add(obj);
    alive++;
    window.setTimeout(() => {
      el.remove();
      figure.remove(obj);
      alive--;
    }, LIFE_MS + i * 90);
  }
}
