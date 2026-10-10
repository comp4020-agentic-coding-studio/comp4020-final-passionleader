import { isMuted } from "./audio.ts";

// Spoken emotes: the browser's own speech synthesis says "Hello", "Yes",
// "No" or "How ya doing, mate?" out loud. Each listener's browser speaks it
// for an emote it receives, quieter the further away the person is, so
// people standing nearby hear it and people across the campus don't.
// No recordings, so nothing to license.

const HEAR_RANGE = 14; // world units: beyond this you don't hear it

let voice: SpeechSynthesisVoice | null = null;
function pickVoice(): void {
  const voices = typeof speechSynthesis === "undefined" ? [] : speechSynthesis.getVoices();
  voice =
    voices.find((v) => v.lang === "en-AU") ??
    voices.find((v) => v.lang.startsWith("en-GB")) ??
    voices.find((v) => v.lang.startsWith("en")) ??
    null;
}
if (typeof speechSynthesis !== "undefined") {
  pickVoice();
  speechSynthesis.addEventListener?.("voiceschanged", pickVoice);
}

/** Says `text` as if from someone `distance` units away (0 = yourself). */
export function say(text: string, distance: number, pitch = 1): void {
  if (typeof speechSynthesis === "undefined" || isMuted() || distance > HEAR_RANGE) return;
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? "en-AU";
  u.volume = Math.max(0.15, 1 - distance / HEAR_RANGE);
  u.rate = 1.05;
  u.pitch = pitch;
  speechSynthesis.speak(u);
}
