// Settings: a gear button beside the mute button opens a small dialog. For
// now it holds the graphics quality. Low (the default) keeps every device
// smooth: no shadows, one pixel per screen pixel, simpler glass and fewer far
// trees. High turns all of that on. The choice is remembered per browser and
// applies on reload, since some of it is fixed when the renderer is created.

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

export function mountSettings(): void {
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

  card.append(title, fieldset, note, actions);
  dialog.append(card);
  document.body.append(dialog);

  const hide = (): void => {
    dialog.hidden = true;
    button.focus();
  };
  button.addEventListener("click", () => {
    dialog.hidden = false;
    (card.querySelector("input:checked") as HTMLInputElement | null)?.focus();
  });
  close.addEventListener("click", hide);
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
