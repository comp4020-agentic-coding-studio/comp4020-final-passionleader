// Settings: a gear button opens a small dialog. It holds the volumes (they
// apply at once) and the graphics quality, in three levels (11/4): Low keeps
// every device smooth (no shadows, one pixel per screen pixel, simpler
// glass, fewer trees); Medium adds the trees, flowers, wind, drifting sky and
// reflective glass but no shadows; High adds the shadows, antialiasing and
// (plan 105) rippling water that mirrors the sky (creek.ts), clearer sky in
// the glass and a richer, vignetted picture done in CSS (style.css).
// A phone starts on Medium, a computer on Low. Quality is remembered per
// browser and applies on reload, since some of it is fixed when the renderer
// is created.

import { getBgmVolume, getSfxVolume, setBgmVolume, setSfxVolume } from "./audio.ts";
import { readVoiceVolume, saveVoiceVolume } from "./voicechat.ts";
import { ICONS } from "./icons.ts";
import { weatherLine } from "./weather.ts";

export type Quality = "low" | "medium" | "high";
const KEY = "campus.quality";
/** Phones and tablets start on Medium (the user's call, 11/4), computers on Low as before. */
const DEFAULT: Quality = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches ? "medium" : "low";

function read(): Quality {
  try {
    const v = localStorage.getItem(KEY);
    return v === "high" || v === "medium" || v === "low" ? v : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export const QUALITY: Quality = read();
/** Shadows, antialiasing, rippling water, clearer glass, the CSS finish: High only. */
export const HIGH = QUALITY === "high";
/** Trees, flowers, wind, the drifting sky and reflective glass: Medium and High. */
export const RICH = QUALITY !== "low";

// Reduce motion (RICE v3, accessibility): the camera keeps up with you at once instead of
// gliding after you, and the sky and the grass stop drifting. Off until ticked here (remembered in
// this browser): following the device's "reduce motion" setting made the view snap, the quarter
// turn included, for people who never chose it (the user, 11/8).
const MOTION_KEY = "campus.reduceMotion";
let calm = ((): boolean => {
  try {
    const v = localStorage.getItem(MOTION_KEY);
    if (v === "1" || v === "0") return v === "1";
  } catch {
    // private mode: the device's setting
  }
  return false;
})();
export const reduceMotion = (): boolean => calm;

// Text size (RICE v3, accessibility; the user, 11/9): the page's base size, which the UI's rem sizes
// follow, and the name tags with it. Remembered in this browser; applied as soon as this loads.
const TEXT_KEY = "campus.textSize";
const TEXT_SIZES = [90, 100, 115, 130];
function applyTextSize(pct: number): void {
  document.documentElement.style.fontSize = pct === 100 ? "" : `${pct}%`;
  document.documentElement.style.setProperty("--label-scale", String(pct / 100));
}
let textSize = ((): number => {
  try {
    const v = Number(localStorage.getItem(TEXT_KEY));
    return TEXT_SIZES.includes(v) ? v : 100;
  } catch {
    return 100;
  }
})();
applyTextSize(textSize);

// Describe what's around me (screen-reader mode, a feature of its own: describe.ts): off until
// ticked here, remembered in this browser. Keyboard only: the keys it adds are L and G.
const DESCRIBE_KEY = "campus.describe";
let describing = ((): boolean => {
  try {
    return localStorage.getItem(DESCRIBE_KEY) === "1";
  } catch {
    return false;
  }
})();
export const describeOn = (): boolean => describing;
const describeListeners: (() => void)[] = [];
/** Called when the box is ticked or cleared. */
export const onDescribeChange = (f: () => void): void => void describeListeners.push(f);

/** The labels under a slider that stops at each step, spread to sit under its stops. */
function stepTicks(labels: string[]): HTMLElement {
  const row = document.createElement("div");
  row.className = "settings-ticks";
  row.setAttribute("aria-hidden", "true");
  for (const l of labels) {
    const t = document.createElement("span");
    t.textContent = l;
    row.append(t);
  }
  return row;
}

export function mountSettings(opts: { credits(): void; reportBug(): void; reportPerson(): void; mute(): void; isGuest(): boolean; signUp(): void; signOut(): void; copyPlace(): void }): void {
  const button = document.createElement("button");
  button.type = "button";
  button.id = "settings-btn";
  button.innerHTML = ICONS.gear;
  button.setAttribute("aria-label", "Settings");
  button.setAttribute("aria-haspopup", "dialog");
  document.body.append(button);

  const dialog = document.createElement("div");
  dialog.id = "settings";
  dialog.hidden = true;
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "settings-title");

  const card = document.createElement("form");
  card.className = "settings-card";
  const title = document.createElement("h2");
  title.id = "settings-title";
  title.textContent = "Settings";

  const sound = document.createElement("fieldset");
  const soundLegend = document.createElement("legend");
  soundLegend.textContent = "Sound";
  sound.append(soundLegend);
  const sliders: [string, string, () => number, (v: number) => void][] = [
    ["volume-music", "Music", getBgmVolume, setBgmVolume],
    ["volume-sfx", "Sound effects", getSfxVolume, setSfxVolume],
    // Other people's voices (plan 86): in a room's voice, and outside (hold V to talk, on a computer).
    ["volume-voice", "Voices", readVoiceVolume, saveVoiceVolume],
  ];
  for (const [id, text, get, set] of sliders) {
    const row = document.createElement("div");
    row.className = "settings-slider";
    const label = document.createElement("label");
    label.htmlFor = id;
    label.textContent = text;
    const range = document.createElement("input");
    range.type = "range";
    range.id = id;
    range.min = "0";
    range.max = "100";
    range.step = "1";
    range.value = String(get());
    const value = document.createElement("output");
    value.htmlFor = id;
    value.textContent = range.value;
    range.addEventListener("input", () => {
      set(Number(range.value));
      value.textContent = range.value;
    });
    row.append(label, range, value);
    sound.append(row);
  }

  const fieldset = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = "Graphics quality";
  // A slider that stops at three levels (the user, 11/9), the level's line under it.
  const LEVELS: [Quality, string][] = [
    ["low", `Low: smooth on any device${DEFAULT === "low" ? " (default)" : ""}`],
    ["medium", `Medium: trees, wind, reflections, no shadows${DEFAULT === "medium" ? " (default)" : ""}`],
    ["high", "High: shadows, rippling water, clearer reflections"],
  ];
  const qualityRange = document.createElement("input");
  qualityRange.type = "range";
  qualityRange.id = "quality-range";
  qualityRange.min = "0";
  qualityRange.max = "2";
  qualityRange.step = "1";
  qualityRange.value = String(Math.max(0, LEVELS.findIndex(([q]) => q === QUALITY)));
  qualityRange.setAttribute("aria-label", "Graphics quality");
  const qualityTicks = stepTicks(["Low", "Medium", "High"]);
  const qualityText = document.createElement("p");
  qualityText.className = "settings-step-text";
  const showQuality = (): void => {
    const [, text] = LEVELS[Number(qualityRange.value)]!;
    qualityText.textContent = text;
    qualityRange.setAttribute("aria-valuetext", text);
  };
  qualityRange.addEventListener("input", showQuality);
  showQuality();
  fieldset.append(legend, qualityRange, qualityTicks, qualityText);
  const note = document.createElement("p");
  note.className = "settings-note";
  note.textContent = "Changing quality reloads the page; your name is remembered.";

  const actions = document.createElement("div");
  actions.className = "settings-actions";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close";
  const apply = document.createElement("button");
  apply.type = "submit";
  apply.textContent = "Apply quality";
  apply.className = "settings-apply";
  // Only the graphics quality waits for Apply (it reloads the page); everything else applies at
  // once, so the button sits with the quality slider (the user, 11/9) and the bottom keeps Close.
  actions.append(close);

  // Something broken? A short report goes to the admin (bugreport.ts).
  const bug = document.createElement("button");
  bug.type = "button";
  bug.className = "settings-bug";
  bug.textContent = "🐞 Report a bug";
  const person = document.createElement("button");
  person.type = "button";
  person.className = "settings-bug";
  person.textContent = "🚩 Report someone";
  const mute = document.createElement("button");
  mute.type = "button";
  mute.className = "settings-bug";
  mute.textContent = "🔇 Mute someone";
  // A guest's way to a real account (guests can't post, comment or stick notes).
  const verify = document.createElement("button");
  verify.type = "button";
  verify.className = "settings-bug settings-verify";
  verify.textContent = "✉️ Verify my ANU email (sign up)";

  // A link that opens the campus at this spot (placelink.ts), for sending to a friend on a phone too.
  const place = document.createElement("button");
  place.type = "button";
  place.className = "settings-bug";
  place.textContent = "🔗 Copy link to this place";

  // Members only: a guest's way out is signing up, and their browser's token is how they come back.
  const out = document.createElement("button");
  out.type = "button";
  out.className = "settings-bug";
  out.textContent = "🚪 Sign out";

  // Full screen (plan 88): a button where the browser allows it (computers too,
  // since the user asked, 11/4; Android, iPad); an iPhone's Safari doesn't, so it
  // says how to add the campus to the home screen, which opens without its bars.
  const screen = document.createElement("fieldset");
  const screenLegend = document.createElement("legend");
  screenLegend.textContent = "Screen";
  const fsBtn = document.createElement("button");
  fsBtn.type = "button";
  fsBtn.className = "settings-bug";
  const fsNote = document.createElement("p");
  fsNote.className = "settings-note";
  const motionLabel = document.createElement("label");
  motionLabel.className = "settings-check";
  const motionBox = document.createElement("input");
  motionBox.type = "checkbox";
  motionBox.checked = calm;
  motionBox.addEventListener("change", () => {
    calm = motionBox.checked;
    try {
      localStorage.setItem(MOTION_KEY, calm ? "1" : "0");
    } catch {
      // private mode: just for this visit
    }
  });
  motionLabel.append(motionBox, " Reduce motion (the camera doesn't glide; the sky and grass hold still)");
  // Accessibility (RICE v3): for people who use a screen reader. Off by default.
  const describeLabel = document.createElement("label");
  describeLabel.className = "settings-check";
  const describeBox = document.createElement("input");
  describeBox.type = "checkbox";
  describeBox.checked = describing;
  describeBox.addEventListener("change", () => {
    describing = describeBox.checked;
    try {
      localStorage.setItem(DESCRIBE_KEY, describing ? "1" : "0");
    } catch {
      // private mode: just for this visit
    }
    for (const f of describeListeners) f();
  });
  describeLabel.append(describeBox, " Describe what's around me (for screen readers: doors, assistants, boards and seats near you, in words; L lists who is here, G walks you to the nearest)");
  const describeBox2 = document.createElement("fieldset");
  const describeLegend = document.createElement("legend");
  describeLegend.textContent = "Accessibility";
  describeBox2.append(describeLegend, describeLabel);
  const textBox = document.createElement("fieldset");
  const textLegend = document.createElement("legend");
  textLegend.textContent = "Text size";
  const sizeRange = document.createElement("input");
  sizeRange.type = "range";
  sizeRange.min = "0";
  sizeRange.max = String(TEXT_SIZES.length - 1);
  sizeRange.step = "1";
  sizeRange.value = String(Math.max(0, TEXT_SIZES.indexOf(textSize)));
  sizeRange.setAttribute("aria-label", "Text size");
  sizeRange.addEventListener("input", () => {
    textSize = TEXT_SIZES[Number(sizeRange.value)]!;
    applyTextSize(textSize);
    sizeRange.setAttribute("aria-valuetext", `${textSize}%`);
    try {
      localStorage.setItem(TEXT_KEY, String(textSize));
    } catch {
      // private mode: just for this visit
    }
  });
  sizeRange.setAttribute("aria-valuetext", `${textSize}%`);
  textBox.append(textLegend, sizeRange, stepTicks(TEXT_SIZES.map((n) => `${n}%`)));
  screen.append(screenLegend, fsBtn, fsNote);
  const canFull = (): boolean => typeof document.documentElement.requestFullscreen === "function" && document.fullscreenEnabled;
  const standalone = (): boolean => window.matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  const syncScreen = (): void => {
    // Always shown now: Reduce motion lives here too.
    screen.hidden = false;
    fsBtn.hidden = !canFull() || standalone();
    fsBtn.textContent = document.fullscreenElement ? "↙ Leave full screen" : "⛶ Full screen";
    fsNote.hidden = canFull() || standalone() || !window.matchMedia("(pointer: coarse)").matches;
    fsNote.textContent = "For full screen on an iPhone: Share (□↑) → Add to Home Screen, then open ANU Crossing from its icon.";
  };
  fsBtn.addEventListener("click", () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
    dialog.hidden = true;
  });
  document.addEventListener("fullscreenchange", syncScreen);

  // Where everything not made here comes from, and its licence (13).
  const credits = document.createElement("button");
  credits.type = "button";
  credits.className = "settings-bug";
  credits.textContent = "📜 Credits and licences";
  credits.addEventListener("click", () => {
    dialog.hidden = true;
    opts.credits();
  });

  // A Close at the top as well: on a phone the card scrolls, and the bottom one starts out of sight.
  const head = document.createElement("div");
  head.className = "settings-head";
  const topClose = document.createElement("button");
  topClose.type = "button";
  topClose.className = "settings-x ui-close";
  topClose.textContent = "Close";
  topClose.setAttribute("aria-label", "Close the settings");
  head.append(title, topClose);
  const motionBox2 = document.createElement("fieldset");
  const motionLegend = document.createElement("legend");
  motionLegend.textContent = "Motion";
  motionBox2.append(motionLegend, motionLabel);
  const applyRow = document.createElement("div");
  applyRow.className = "settings-apply-row";
  applyRow.append(note, apply);
  fieldset.append(applyRow);
  // What the weather is in Canberra now (weather.ts), read when the dialog opens.
  const weather = document.createElement("p");
  weather.className = "settings-note settings-weather";
  weather.id = "settings-weather";
  card.append(head, sound, textBox, fieldset, motionBox2, describeBox2, screen, weather, place, verify, bug, person, mute, credits, out, actions);
  dialog.append(card);
  document.body.append(dialog);

  const hide = (): void => {
    dialog.hidden = true;
    button.focus();
  };
  button.addEventListener("click", () => {
    syncScreen();
    weather.textContent = `Weather: ${weatherLine()}`;
    verify.hidden = !opts.isGuest();
    out.hidden = opts.isGuest();
    dialog.hidden = false;
    (card.querySelector("input:checked") as HTMLInputElement | null)?.focus();
  });
  close.addEventListener("click", hide);
  topClose.addEventListener("click", hide);
  bug.addEventListener("click", () => {
    dialog.hidden = true;
    opts.reportBug();
  });
  person.addEventListener("click", () => {
    dialog.hidden = true;
    opts.reportPerson();
  });
  mute.addEventListener("click", () => {
    dialog.hidden = true;
    opts.mute();
  });
  out.addEventListener("click", () => {
    dialog.hidden = true;
    opts.signOut();
  });
  place.addEventListener("click", () => {
    dialog.hidden = true;
    opts.copyPlace();
  });
  verify.addEventListener("click", () => {
    dialog.hidden = true;
    opts.signUp();
  });
  dialog.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") hide();
  });
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) hide();
  });
  card.addEventListener("submit", (e) => {
    e.preventDefault();
    const picked = LEVELS[Number(qualityRange.value)]?.[0];
    if (!picked || picked === QUALITY) return hide();
    try {
      localStorage.setItem(KEY, picked);
    } catch {
      // private mode: can't remember it, so nothing to reload into
      return hide();
    }
    location.reload();
  });
}

/** True while the settings dialog is open, so game keys stay out of it. */
export const settingsOpen = (): boolean => !(document.getElementById("settings")?.hidden ?? true);
