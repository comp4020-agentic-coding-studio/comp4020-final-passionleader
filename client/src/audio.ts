// Sound for the room: a calm looping track from the moment you enter, a fart
// on every poop, and a speaker button (top right) that mutes both. The mute
// choice is remembered per browser.

const KEY = "poop.muted";
const read = (): boolean => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

let muted = read();
const bgm = new Audio("/assets/bgm_calm.mp3");
bgm.loop = true;
// Background, not foreground: the fart should land clearly over it.
bgm.volume = 0.25;

let ctx: AudioContext | null = null;

const button = document.createElement("button");
button.type = "button";
button.id = "mute";
document.body.append(button);

function render(): void {
  button.textContent = muted ? "🔇" : "🔊";
  button.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
  button.setAttribute("aria-pressed", String(muted));
}
render();

button.addEventListener("click", () => {
  muted = !muted;
  try {
    localStorage.setItem(KEY, muted ? "1" : "0");
  } catch {
    // private mode: the choice just isn't remembered
  }
  render();
  if (muted) bgm.pause();
  else void bgm.play().catch(() => {});
  // keep Space working in the game rather than re-pressing this button
  button.blur();
});

// Called from the Enter click, which is the user gesture browsers require.
export function startBgm(): void {
  ctx ??= new AudioContext();
  if (!muted) void bgm.play().catch(() => {});
}

// A fart, synthesised rather than sampled: a low buzzy tone whose pitch
// wobbles and sags, roughened by filtered noise. No asset, no licence.
export function playFart(): void {
  if (muted) return;
  ctx ??= new AudioContext();
  const now = ctx.currentTime;
  const length = 0.45 + Math.random() * 0.35;

  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, now);
  out.gain.exponentialRampToValueAtTime(0.6, now + 0.03);
  out.gain.setValueAtTime(0.6, now + length * 0.7);
  out.gain.exponentialRampToValueAtTime(0.0001, now + length);
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 600;
  tone.connect(out).connect(ctx.destination);

  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  const base = 70 + Math.random() * 40;
  osc.frequency.setValueAtTime(base * 1.3, now);
  osc.frequency.exponentialRampToValueAtTime(base * 0.7, now + length);
  const wobble = ctx.createOscillator();
  wobble.frequency.value = 18 + Math.random() * 10;
  const depth = ctx.createGain();
  depth.gain.value = base * 0.35;
  wobble.connect(depth).connect(osc.frequency);
  osc.connect(tone);

  const noise = ctx.createBufferSource();
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * length), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.35;
  noise.buffer = buffer;
  noise.connect(tone);

  for (const node of [osc, wobble, noise]) {
    node.start(now);
    node.stop(now + length);
  }
}
