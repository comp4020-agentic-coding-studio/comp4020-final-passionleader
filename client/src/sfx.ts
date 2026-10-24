import { getSfxVolume } from "./audio.ts";

// Short sound effects (Kenney's Interface and Impact Sounds, CC0, credited in
// assets/CREDITS.md): footsteps that match the floor, doors, UI clicks, and
// a ping for a new line in a meeting room's chat, and the dog's bark
// (BigSoundBank, CC0). Played through Web Audio,
// each decoded once, at the sound-effects volume from the settings. Nothing
// plays before the first click or key (browsers require one), and a sound
// that fails to load just stays silent.

export type Floor = "concrete" | "wood" | "carpet";
export type Effect = "door" | "click" | "open" | "close" | "message" | "note" | "error" | "bark";

const FILES: Record<Effect, string> = {
  door: "impactPlank_medium_000",
  click: "click_002",
  open: "open_001",
  close: "close_001",
  message: "confirmation_001",
  note: "drop_002",
  error: "error_004",
  bark: "dog_bark",
};
const STEPS: Record<Floor, string[]> = {
  concrete: ["footstep_concrete_000", "footstep_concrete_001", "footstep_concrete_002"],
  wood: ["footstep_wood_000", "footstep_wood_001", "footstep_wood_002"],
  carpet: ["footstep_carpet_000", "footstep_carpet_001", "footstep_carpet_002"],
};
/** Each effect's own level, so a click isn't as loud as a door. */
const LEVEL: Partial<Record<Effect, number>> = { click: 0.5, open: 0.6, close: 0.6, message: 0.55, door: 0.7, bark: 0.6 };
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

/**
 * The Poop Room's fart, crit 8's: synthesised rather than sampled, a low
 * buzzy tone whose pitch wobbles and sags, roughened by filtered noise. No
 * asset, no licence; a little different every time.
 */
export function fart(): void {
  const volume = (getSfxVolume() / 100) * 0.6;
  const c = context();
  if (!c || volume <= 0) return;
  if (c.state === "suspended") void c.resume();
  const now = c.currentTime;
  const length = 0.45 + Math.random() * 0.35;

  const out = c.createGain();
  out.gain.setValueAtTime(0.0001, now);
  out.gain.exponentialRampToValueAtTime(volume, now + 0.03);
  out.gain.setValueAtTime(volume, now + length * 0.7);
  out.gain.exponentialRampToValueAtTime(0.0001, now + length);
  const tone = c.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 600;
  tone.connect(out).connect(c.destination);

  const osc = c.createOscillator();
  osc.type = "sawtooth";
  const base = 70 + Math.random() * 40;
  osc.frequency.setValueAtTime(base * 1.3, now);
  osc.frequency.exponentialRampToValueAtTime(base * 0.7, now + length);
  const wobble = c.createOscillator();
  wobble.frequency.value = 18 + Math.random() * 10;
  const depth = c.createGain();
  depth.gain.value = base * 0.35;
  wobble.connect(depth).connect(osc.frequency);
  osc.connect(tone);

  const noise = c.createBufferSource();
  const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * length), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.35;
  noise.buffer = buffer;
  noise.connect(tone);

  for (const node of [osc, wobble, noise]) {
    node.start(now);
    node.stop(now + length);
  }
}

/** One note of a soft trumpet-ish tone (sawtooth through a low-pass), for the fanfare and the ding. */
function blow(c: AudioContext, freq: number, at: number, length: number, level: number): void {
  const osc = c.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.value = freq;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = freq * 4;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(level, at + 0.02);
  gain.gain.setValueAtTime(level, at + length * 0.7);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(filter).connect(gain).connect(c.destination);
  osc.start(at);
  osc.stop(at + length + 0.02);
}
function synth(): { c: AudioContext; level: number } | null {
  const level = (getSfxVolume() / 100) * 0.25;
  const c = context();
  if (!c || level <= 0) return null;
  if (c.state === "suspended") void c.resume();
  return { c, level };
}
/** A quest ticked off: two quick rising notes. */
export function ding(): void {
  const s = synth();
  if (!s) return;
  const now = s.c.currentTime;
  blow(s.c, 784, now, 0.12, s.level);
  blow(s.c, 1175, now + 0.09, 0.25, s.level);
}
/** All the quests done: a little fanfare (G C E G, the last held, with a chord under it). */
export function fanfare(): void {
  const s = synth();
  if (!s) return;
  const now = s.c.currentTime;
  [392, 523, 659].forEach((f, i) => blow(s.c, f, now + i * 0.13, 0.14, s.level));
  blow(s.c, 784, now + 0.39, 0.32, s.level);
  blow(s.c, 659, now + 0.72, 0.12, s.level);
  for (const f of [523, 659, 784]) blow(s.c, f, now + 0.86, 0.9, s.level * 0.7);
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
