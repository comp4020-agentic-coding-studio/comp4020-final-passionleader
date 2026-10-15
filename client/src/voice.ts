import { getSfxVolume } from "./audio.ts";

// Spoken emotes: the browser's own speech synthesis says "Hello", "Yes",
// "No" or "How ya doing, mate?" out loud. Each listener's browser speaks it
// for an emote it receives, quieter the further away the person is, so
// people standing nearby hear it and people across the campus don't.
// No recordings, so nothing to license.

const HEAR_RANGE = 14; // world units: beyond this you don't hear it

// The Web Speech API doesn't say whether a voice is a man's or a woman's,
// so it's guessed from the names browsers and systems give their English
// voices. Where only one voice exists, pitch alone tells them apart.
const FEMALE = /female|woman|karen|catherine|natasha|zira|samantha|susan|hazel|libby|sonia|serena|fiona|moira|tessa|victoria|aria|jenny|kate|emily|nicky|allison|ava|joanna|olivia|amy|emma|salli|kimberly|ivy|clara|annette|elsa|freya|isla|maisie|tina/i;
const MALE = /\bmale\b|\bman\b|lee|william|daniel|david|mark|george|ryan|james|alex|fred|guy|oliver|thomas|arthur|rishi|aaron|tom|eric|christopher|brian|matthew|joey|justin|liam|ken\b|duncan|darren|neil/i;
type Voice = "female" | "male";
const voices: Record<Voice, SpeechSynthesisVoice | null> = { female: null, male: null };
function pickVoice(): void {
  const all = typeof speechSynthesis === "undefined" ? [] : speechSynthesis.getVoices();
  const english = [
    ...all.filter((v) => v.lang === "en-AU"),
    ...all.filter((v) => v.lang.startsWith("en-GB")),
    ...all.filter((v) => v.lang.startsWith("en") && v.lang !== "en-AU" && !v.lang.startsWith("en-GB")),
  ];
  // "Female" has to be checked before "male", which it contains.
  voices.female = english.find((v) => FEMALE.test(v.name)) ?? english[0] ?? null;
  voices.male = english.find((v) => !FEMALE.test(v.name) && MALE.test(v.name)) ?? english.find((v) => !FEMALE.test(v.name)) ?? english[0] ?? null;
}
if (typeof speechSynthesis !== "undefined") {
  pickVoice();
  speechSynthesis.addEventListener?.("voiceschanged", pickVoice);
}

/**
 * Says `text` as if from someone `distance` units away (0 = yourself), in a
 * woman's or a man's voice; `spread` (0-0.2) varies the pitch per person.
 */
export function say(text: string, distance: number, kind: Voice, spread = 0): void {
  if (typeof speechSynthesis === "undefined" || getSfxVolume() === 0 || distance > HEAR_RANGE) return;
  const u = new SpeechSynthesisUtterance(text);
  const voice = voices[kind];
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? "en-AU";
  u.volume = Math.max(0.15, 1 - distance / HEAR_RANGE) * (getSfxVolume() / 100);
  u.rate = 1.05;
  // Higher for women, lower for men, so it reads right even with one voice.
  u.pitch = (kind === "female" ? 1.3 : 0.8) + spread;
  speechSynthesis.speak(u);
}
