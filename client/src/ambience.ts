import { getSfxVolume } from "./audio.ts";
import { sfxContext } from "./sfx.ts";
import { creekDistance } from "./spaces/creek.ts";

// Outdoor ambience (RICE v3, 12): a soft, looping stream by Sullivans Creek,
// louder the closer you walk to it, and now and then a magpie-ish call on the
// lawn. Both are synthesised with the Web Audio API (filtered noise; a short
// gliding whistle), so there's no recorded asset and no licence to carry. They
// follow the sound-effects volume and stop the moment you go inside.

/** Silent this far (m) from the water's edge. */
const HEAR_WATER = 25;
const WATER_LEVEL = 0.35;
const BIRD_LEVEL = 0.22;

let water: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
let birdTimer = 0;
let noise: AudioBuffer | null = null;

function startWater(c: AudioContext): void {
  if (!noise) {
    // Four seconds of white noise on a loop; the filters below turn it into a stream.
    noise = c.createBuffer(1, c.sampleRate * 4, c.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const gain = c.createGain();
  gain.gain.value = 0;
  // The body of the sound: a low-passed rush whose cutoff drifts slowly.
  const body = c.createBiquadFilter();
  body.type = "lowpass";
  body.frequency.value = 700;
  const drift = c.createOscillator();
  drift.frequency.value = 0.23;
  const driftDepth = c.createGain();
  driftDepth.gain.value = 250;
  drift.connect(driftDepth).connect(body.frequency);
  drift.start();
  // A brighter babble over it, at a different pace so it never repeats evenly.
  const babble = c.createBiquadFilter();
  babble.type = "bandpass";
  babble.frequency.value = 1600;
  babble.Q.value = 1.2;
  const babbleGain = c.createGain();
  babbleGain.gain.value = 0.25;
  const swell = c.createOscillator();
  swell.frequency.value = 0.61;
  const swellDepth = c.createGain();
  swellDepth.gain.value = 0.12;
  swell.connect(swellDepth).connect(babbleGain.gain);
  swell.start();
  src.connect(body).connect(gain);
  src.connect(babble).connect(babbleGain).connect(gain);
  gain.connect(c.destination);
  src.start();
  water = { src, gain };
  // Stopping the loop stops its modulators' work too: they have no other path to the output.
  src.onended = () => {
    drift.stop();
    swell.stop();
  };
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

/** One call: three to five short whistles that slide up or down, a little different every time. */
function chirp(): void {
  const c = sfxContext();
  const volume = (getSfxVolume() / 100) * BIRD_LEVEL;
  if (!c || volume <= 0 || c.state !== "running") return;
  const notes = 3 + Math.floor(Math.random() * 3);
  const base = 900 + Math.random() * 500;
  let at = c.currentTime + 0.02;
  for (let i = 0; i < notes; i++) {
    const len = 0.09 + Math.random() * 0.08;
    const from = base * (1 + Math.random() * 0.6);
    const to = from * (Math.random() < 0.5 ? 0.6 : 1.5);
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(to, at + len);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + len);
    osc.connect(gain).connect(c.destination);
    osc.start(at);
    osc.stop(at + len + 0.02);
    at += len + 0.04 + Math.random() * 0.06;
  }
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
    // Out of earshot: don't keep a noise loop running for nothing.
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
