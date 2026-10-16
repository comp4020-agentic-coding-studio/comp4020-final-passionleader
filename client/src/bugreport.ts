import "./bugreport.css";
import { ACCEPT_IMAGES, MAX_FILE_BYTES } from "./uploads.ts";

// The bug report form, opened from the settings dialog: what went wrong, and
// a screenshot if you like (an image, up to 200 MB; it goes to the S3 bucket,
// see uploads.ts, after the report itself is sent). The server adds who sent it, from which browser and IP, the space they were in
// and their browser's user agent, and only the admin reads reports (on the
// Student Hub's reception PC).

const MAX = 2000;

export function mountBugReport(opts: {
  /**
   * Sends the text, then the screenshot if there is one. `sent` says whether
   * the report itself went (it may have, with the screenshot failing after).
   * `progress` gets 0..1 while the image uploads.
   */
  send(text: string, shot: File | null, progress: (done: number) => void): Promise<{ sent: boolean; error: string | null }>;
}): { open(): void; isOpen(): boolean } {
  const root = document.createElement("div");
  root.id = "bug-report";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "bug-report-title");

  const card = document.createElement("form");
  card.className = "settings-card bug-card";
  const title = document.createElement("h2");
  title.id = "bug-report-title";
  title.textContent = "🐞 Report a bug";
  const hint = document.createElement("p");
  hint.className = "bug-hint";
  hint.textContent = "What happened, and what did you expect? Only the admin reads this. Your name, the place you're in and your browser are sent with it.";
  const text = document.createElement("textarea");
  text.rows = 6;
  text.maxLength = MAX;
  text.setAttribute("aria-label", "What went wrong");
  const shotLabel = document.createElement("label");
  shotLabel.className = "bug-shot";
  shotLabel.textContent = "Screenshot (optional, an image up to 200 MB) ";
  const shot = document.createElement("input");
  shot.type = "file";
  shot.accept = ACCEPT_IMAGES;
  shotLabel.append(shot);
  const status = document.createElement("p");
  status.className = "bug-status";
  status.setAttribute("role", "status");
  const actions = document.createElement("div");
  actions.className = "settings-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  const send = document.createElement("button");
  send.type = "submit";
  send.className = "bug-send";
  send.textContent = "Send";
  actions.append(cancel, send);
  card.append(title, hint, text, shotLabel, status, actions);
  root.append(card);
  document.body.append(root);

  const hide = (): void => {
    root.hidden = true;
  };
  cancel.addEventListener("click", hide);
  root.addEventListener("click", (e) => {
    if (e.target === root) hide();
  });
  root.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") hide();
  });
  card.addEventListener("submit", async (e) => {
    e.preventDefault();
    const value = text.value.trim();
    if (!value) {
      status.textContent = "Say what went wrong first.";
      return;
    }
    const file = shot.files?.[0] ?? null;
    if (file && file.size > MAX_FILE_BYTES) {
      status.textContent = "Files can be up to 200 MB.";
      return;
    }
    send.disabled = true;
    status.textContent = "Sending…";
    const { sent, error } = await opts.send(value, file, (done) => {
      status.textContent = `Uploading the screenshot… ${Math.round(done * 100)}%`;
    });
    send.disabled = false;
    if (sent) {
      text.value = "";
      shot.value = "";
    }
    if (error) {
      status.textContent = sent ? `The report was sent, but not the screenshot. ${error}` : error;
      return;
    }
    status.textContent = "Sent. Thank you!";
    window.setTimeout(hide, 1200);
  });

  return {
    open() {
      status.textContent = "";
      root.hidden = false;
      text.focus();
    },
    isOpen: () => !root.hidden,
  };
}
