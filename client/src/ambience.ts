import { getSfxVolume } from "./audio.ts";
import { sfxBuffer, sfxContext } from "./sfx.ts";
import { creekDistance } from "./spaces/creek.ts";

// Outdoor ambience (RICE v3, 12): a soft, looping stream by Sullivans Creek,
// louder the closer you walk to it, and now and then a bird call on the lawn.
// Both are recorded CC0 sounds (assets/sfx/creek_loop.ogg and bird_1..4.ogg,
// credited in assets/CREDITS.md), played through the shared Web Audio context
// at the sound-effects volume, and stopped the moment you go inside. A file
// that fails to load just leaves its sound silent.

/** Silent this far (m) from the water's edge. */
const HEAR_WATER = 25;
/**
 * The creek recording is quiet on purpose (peak about 0.2, RMS about 0.035, as
 * the pack ships it), so unlike the footsteps (0.35 on peaks near 0.9) it
 * needs a gain near 1 to sit under the background music at the water's edge.
 */
const WATER_LEVEL = 1.1;
/** The bird calls are levelled to a 0.9 peak; 0.3 puts them near a footstep, well under the dog's bark (0.6). */
const BIRD_LEVEL = 0.3;
const BIRDS = ["bird_1", "bird_2", "bird_3", "bird_4"];

let water: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
/** undefined: not asked for yet; null: failed to load (stay silent). */
let creek: AudioBuffer | null | undefined;
let birdTimer = 0;
let lastBird = -1;

function startWater(c: AudioContext): void {
  if (creek === undefined) {
    creek = null; // stay silent until it has arrived (and for good if it never does)
    void sfxBuffer("creek_loop").then((b) => {
      creek = b;
    });
    return;
  }
  if (!creek) return;
  const src = c.createBufferSource();
  src.buffer = creek;
  src.loop = true;
  const gain = c.createGain();
  gain.gain.value = 0;
  src.connect(gain).connect(c.destination);
  src.start();
  water = { src, gain };
}

function stopWater(): void {
  if (!water) return;
  const w = water;
  water = null;
  try {
    w.src.stop();
  } catch {
    // already stopped
  }
  w.gain.disconnect();
}

/** One call: a random one of the recordings (never the same twice running), a touch different in pitch each time. */
function chirp(): void {
  const c = sfxContext();
  const volume = (getSfxVolume() / 100) * BIRD_LEVEL;
  if (!c || volume <= 0 || c.state !== "running") return;
  let i = Math.floor(Math.random() * BIRDS.length);
  if (i === lastBird) i = (i + 1 + Math.floor(Math.random() * (BIRDS.length - 1))) % BIRDS.length;
  lastBird = i;
  void sfxBuffer(BIRDS[i]).then((buffer) => {
    if (!buffer) return;
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = 0.96 + Math.random() * 0.08;
    const gain = c.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(c.destination);
    src.onended = () => gain.disconnect();
    src.start();
  });
}

function scheduleBird(first: boolean): void {
  // A call every 20 to 60 seconds; the first a little sooner, so it's noticed.
  const wait = first ? 6000 + Math.random() * 9000 : 20000 + Math.random() * 40000;
  birdTimer = window.setTimeout(() => {
    chirp();
    scheduleBird(false);
  }, wait);
}

/**
 * Called every frame with where you are. Outside, the creek's level follows
 * your distance from it and the bird timer runs; inside (or before you've
 * joined) everything is stopped, so it costs nothing.
 */
export function updateAmbience(outdoor: boolean, x: number, z: number): void {
  const volume = (getSfxVolume() / 100) * WATER_LEVEL;
  const near = outdoor ? Math.max(0, 1 - creekDistance(x, z) / HEAR_WATER) : 0;
  const level = volume * near * near;
  if (!outdoor) {
    if (birdTimer) {
      window.clearTimeout(birdTimer);
      birdTimer = 0;
    }
    stopWater();
    return;
  }
  if (!birdTimer) scheduleBird(true);
  if (level <= 0.0005) {
    // Out of earshot: don't keep a loop running for nothing.
    stopWater();
    return;
  }
  const c = sfxContext();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
  if (!water) startWater(c);
  // Eased, so the sound swells as you approach and never clicks.
  water?.gain.gain.setTargetAtTime(level, c.currentTime, 0.15);
}
