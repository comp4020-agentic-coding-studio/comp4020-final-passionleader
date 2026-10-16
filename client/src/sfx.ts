import { getSfxVolume } from "./audio.ts";

// Short sound effects (Kenney's Interface and Impact Sounds, CC0, credited in
// assets/CREDITS.md): footsteps that match the floor, doors, UI clicks, and
// a ping for a new line in a meeting room's chat. Played through Web Audio,
// each decoded once, at the sound-effects volume from the settings. Nothing
// plays before the first click or key (browsers require one), and a sound
// that fails to load just stays silent.

export type Floor = "concrete" | "wood" | "carpet";
export type Effect = "door" | "click" | "open" | "close" | "message" | "note" | "error";

const FILES: Record<Effect, string> = {
  door: "impactPlank_medium_000",
  click: "click_002",
  open: "open_001",
  close: "close_001",
  message: "confirmation_001",
  note: "drop_002",
  error: "error_004",
};
const STEPS: Record<Floor, string[]> = {
  concrete: ["footstep_concrete_000", "footstep_concrete_001", "footstep_concrete_002"],
  wood: ["footstep_wood_000", "footstep_wood_001", "footstep_wood_002"],
  carpet: ["footstep_carpet_000", "footstep_carpet_001", "footstep_carpet_002"],
};
/** Each effect's own level, so a click isn't as loud as a door. */
const LEVEL: Partial<Record<Effect, number>> = { click: 0.5, open: 0.6, close: 0.6, message: 0.55, door: 0.7 };
const STEP_LEVEL = 0.35;

let ctx: AudioContext | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();

function context(): AudioContext | null {
  if (ctx) return ctx;
  try {
    ctx = new AudioContext();
  } catch {
    return null;
  }
  return ctx;
}

function load(name: string): Promise<AudioBuffer | null> {
  let b = buffers.get(name);
  if (b) return b;
  const c = context();
  b = c
    ? fetch(`${import.meta.env.BASE_URL}assets/sfx/${name}.ogg`)
        .then((r) => r.arrayBuffer())
        .then((data) => c.decodeAudioData(data))
        .catch(() => null)
    : Promise.resolve(null);
  buffers.set(name, b);
  return b;
}

function playFile(name: string, level: number): void {
  const volume = (getSfxVolume() / 100) * level;
  const c = context();
  if (!c || volume <= 0) return;
  if (c.state === "suspended") void c.resume();
  void load(name).then((buffer) => {
    if (!buffer) return;
    const src = c.createBufferSource();
    src.buffer = buffer;
    // A little variety, so steps don't sound like a machine gun.
    src.playbackRate.value = 0.94 + Math.random() * 0.12;
    const gain = c.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(c.destination);
    src.start();
  });
}

export function sfx(effect: Effect): void {
  playFile(FILES[effect], LEVEL[effect] ?? 0.8);
}

let lastStep = 0;
/** A footstep on this floor, no faster than `every` seconds (walking ~0.42, running ~0.28). */
export function step(floor: Floor, now: number, every: number): void {
  if (now - lastStep < every * 1000) return;
  lastStep = now;
  const list = STEPS[floor];
  playFile(list[Math.floor(Math.random() * list.length)]!, STEP_LEVEL);
}

/** Decodes everything in the background after the first gesture, so the first step isn't late. */
export function warmUp(): void {
  if (!context()) return;
  for (const name of [...Object.values(FILES), ...Object.values(STEPS).flat()]) void load(name);
}
