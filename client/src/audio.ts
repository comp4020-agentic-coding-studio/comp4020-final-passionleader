// Sound: each space has its own playlist of background tracks (made with
// Google's AI music generator, credited in assets/CREDITS.md), switched when
// you walk through a door; a space with several tracks starts on a random
// one and plays the rest in turn.
// Two volumes, background music and sound effects (the spoken emotes), are
// set in the settings dialog and remembered per browser. The small player
// box (bgmplayer.ts) shows the track and can pause it or skip to the next.

const BGM_KEY = "campus.bgmVolume";
const SFX_KEY = "campus.sfxVolume";
const DEFAULT_VOLUME = 80;
/** Full volume (100) is a little louder than the old fixed level (0.3), which 80 keeps. */
const BGM_MAX = 0.375;

function readVolume(key: string): number {
  try {
    const n = Number(localStorage.getItem(key));
    return localStorage.getItem(key) !== null && Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}
function saveVolume(key: string, v: number): void {
  try {
    localStorage.setItem(key, String(v));
  } catch {
    // private mode: the choice just isn't remembered
  }
}

let bgmVolume = readVolume(BGM_KEY);
let sfxVolume = readVolume(SFX_KEY);
let playlist: string[] = [];
let index = 0;
let started = false;
let paused = false;
const bgm = new Audio();
bgm.volume = (bgmVolume / 100) * BGM_MAX;

const listeners = new Set<() => void>();
const changed = (): void => listeners.forEach((f) => f());

function load(i: number): void {
  index = i;
  bgm.src = `/assets/${playlist[index]}`;
  bgm.currentTime = 0;
  // One track loops on its own; several play one after another.
  bgm.loop = playlist.length === 1;
  resume();
  changed();
}
function resume(): void {
  if (started && !paused && bgmVolume > 0) void bgm.play().catch(() => {});
}
bgm.addEventListener("ended", () => nextTrack());

/**
 * Plays a space's playlist from a random track (so the campus doesn't always
 * open on the same song), unless that playlist is already playing. The
 * first call must come from a user gesture (the Enter click), which browsers
 * require before any sound.
 */
export function playTrack(files: string[]): void {
  started = true;
  if (files.length === 0) return;
  if (files.join() === playlist.join()) return resume();
  playlist = files;
  load(Math.floor(Math.random() * files.length));
}

/** The next track in this space's playlist (the same one again if it has only one). */
export function nextTrack(): void {
  if (playlist.length === 0) return;
  paused = false;
  load((index + 1) % playlist.length);
}

export function togglePause(): void {
  paused = !paused;
  if (paused) bgm.pause();
  else resume();
  changed();
}

export const isPaused = (): boolean => paused;

/** The playing track's name, from its file name ("Margin_Notes.mp3" → "Margin Notes"). */
export const nowPlaying = (): string | null =>
  playlist.length ? playlist[index]!.replace(/\.mp3$/i, "").replace(/_/g, " ") : null;

/** Calls `f` whenever the track, or paused/playing, changes. */
export function onTrackChange(f: () => void): void {
  listeners.add(f);
}

export const getBgmVolume = (): number => bgmVolume;
export const getSfxVolume = (): number => sfxVolume;

/** 0-100. At 0 the music stops rather than playing silently. */
export function setBgmVolume(v: number): void {
  bgmVolume = Math.max(0, Math.min(100, Math.round(v)));
  saveVolume(BGM_KEY, bgmVolume);
  bgm.volume = (bgmVolume / 100) * BGM_MAX;
  if (bgmVolume === 0) bgm.pause();
  else resume();
}

/** 0-100, for the spoken emotes (voice.ts). */
export function setSfxVolume(v: number): void {
  sfxVolume = Math.max(0, Math.min(100, Math.round(v)));
  saveVolume(SFX_KEY, sfxVolume);
}
