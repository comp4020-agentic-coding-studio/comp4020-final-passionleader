// Settings: a gear button opens a small dialog. It holds the two volumes
// (music and sound effects, which live here now that the mute button is gone;
// they apply at once) and the graphics quality. Low (the default) keeps every
// device smooth: no shadows, one pixel per screen pixel, simpler glass and
// fewer far trees. High turns all of that on. Quality is remembered per
// browser and applies on reload, since some of it is fixed when the renderer
// is created.

import { getBgmVolume, getSfxVolume, setBgmVolume, setSfxVolume } from "./audio.ts";

export type Quality = "low" | "high";
const KEY = "campus.quality";

function read(): Quality {
  try {
    return localStorage.getItem(KEY) === "high" ? "high" : "low";
  } catch {
    return "low";
  }
}

export const QUALITY: Quality = read();
export const HIGH = QUALITY === "high";

export function mountSettings(opts: { reportBug(): void; reportPerson(): void; mute(): void; isGuest(): boolean; signUp(): void; signOut(): void }): void {
  const button = document.createElement("button");
  button.type = "button";
  button.id = "settings-btn";
  button.textContent = "⚙️";
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
  fieldset.append(legend);
  const options: [Quality, string][] = [
    ["low", "Low: smooth on any device (default)"],
    ["high", "High: shadows, reflections, more trees"],
  ];
  for (const [value, text] of options) {
    const label = document.createElement("label");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "quality";
    radio.value = value;
    radio.checked = value === QUALITY;
    label.append(radio, ` ${text}`);
    fieldset.append(label);
  }
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
  apply.textContent = "Apply";
  actions.append(close, apply);

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

  // Members only: a guest's way out is signing up, and their browser's token is how they come back.
  const out = document.createElement("button");
  out.type = "button";
  out.className = "settings-bug";
  out.textContent = "🚪 Sign out";

  card.append(title, sound, fieldset, note, verify, bug, person, mute, out, actions);
  dialog.append(card);
  document.body.append(dialog);

  const hide = (): void => {
    dialog.hidden = true;
    button.focus();
  };
  button.addEventListener("click", () => {
    verify.hidden = !opts.isGuest();
    out.hidden = opts.isGuest();
    dialog.hidden = false;
    (card.querySelector("input:checked") as HTMLInputElement | null)?.focus();
  });
  close.addEventListener("click", hide);
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
    const picked = (card.querySelector("input:checked") as HTMLInputElement | null)?.value as Quality | undefined;
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
