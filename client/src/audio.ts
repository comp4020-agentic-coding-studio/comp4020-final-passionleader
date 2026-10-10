// Sound: each space has its own background track (made with Google's AI
// music generator, credited in assets/CREDITS.md), switched when you walk
// through a door, and a speaker button (top right) that mutes it. The mute
// choice is remembered per browser.

const KEY = "campus.muted";
const read = (): boolean => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

let muted = read();
let started = false;
const bgm = new Audio();
bgm.loop = true;
bgm.volume = 0.3;

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
  else if (started) void bgm.play().catch(() => {});
  // keep keys working in the game rather than re-pressing this button
  button.blur();
});

/**
 * Plays a space's track. The first call must come from a user gesture (the
 * Enter click), which browsers require before any sound.
 */
export function playTrack(file: string): void {
  started = true;
  const src = `/assets/${file}`;
  if (!bgm.src.endsWith(src)) {
    bgm.src = src;
    bgm.currentTime = 0;
  }
  if (!muted) void bgm.play().catch(() => {});
}
