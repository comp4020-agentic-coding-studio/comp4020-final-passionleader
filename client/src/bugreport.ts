import "./bugreport.css";
import { ACCEPT_IMAGES, MAX_FILE_BYTES } from "./uploads.ts";

// The bug report form, opened from the settings dialog: what went wrong, and
// a screenshot if you like (an image, up to 200 MB; it goes to the S3 bucket,
// see uploads.ts, after the report itself is sent). The server adds who sent it, from which browser and IP, the space they were in
// and their browser's user agent, and only the admin reads reports (on the
// Student Hub's admin PC).
// The same form reports a person ("Report someone"): who, what they did, and
// if you like the last five minutes of this space's chat, which the server
// attaches itself (map chat is kept a day for this, meeting rooms' never).

const MAX = 2000;

export function mountBugReport(opts: {
  /**
   * Sends the text, then the screenshot if there is one. `sent` says whether
   * the report itself went (it may have, with the screenshot failing after).
   * `progress` gets 0..1 while the image uploads.
   */
  send(text: string, shot: File | null, progress: (done: number) => void, about: { name: string; withChat: boolean } | null): Promise<{ sent: boolean; error: string | null }>;
}): {
  /** Opens the bug form, or with `person` the person form; `about` fills in who and what (a post, note or comment). */
  open(person?: boolean, about?: { name: string; item: string }): void;
  isOpen(): boolean;
} {
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
  const whoLabel = document.createElement("label");
  whoLabel.className = "bug-who";
  whoLabel.textContent = "Who? (their name above their head) ";
  const who = document.createElement("input");
  who.maxLength = 12;
  who.autocomplete = "off";
  who.setAttribute("autocapitalize", "off");
  who.spellcheck = false;
  whoLabel.append(who);
  const chatLabel = document.createElement("label");
  chatLabel.className = "bug-chat";
  const withChat = document.createElement("input");
  withChat.type = "checkbox";
  withChat.checked = true;
  chatLabel.append(withChat, " Send the last 5 minutes of chat here with it");
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
  card.append(title, hint, whoLabel, chatLabel, text, shotLabel, status, actions);
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
    const name = who.value.normalize("NFKC").trim();
    if (person && !name) {
      status.textContent = "Type their name first.";
      return;
    }
    if (!value) {
      status.textContent = person ? "Say what happened first." : "Say what went wrong first.";
      return;
    }
    const file = shot.files?.[0] ?? null;
    if (file && file.size > MAX_FILE_BYTES) {
      status.textContent = "Files can be up to 200 MB.";
      return;
    }
    send.disabled = true;
    status.textContent = "Sending…";
    const { sent, error } = await opts.send(
      value,
      file,
      (done) => {
        status.textContent = `Uploading the screenshot… ${Math.round(done * 100)}%`;
      },
      person ? { name, withChat: withChat.checked } : null,
    );
    send.disabled = false;
    if (sent) {
      text.value = "";
      shot.value = "";
      who.value = "";
    }
    if (error) {
      status.textContent = sent ? `The report was sent, but not the screenshot. ${error}` : error;
      return;
    }
    status.textContent = "Sent. Thank you!";
    window.setTimeout(hide, 1200);
  });

  let person = false;
  return {
    open(aboutPerson = false, about) {
      person = aboutPerson || !!about;
      title.textContent = person ? "🚩 Report someone" : "🐞 Report a bug";
      hint.textContent = person
        ? "What did they do? Only the admin reads this, and can stop someone chatting, posting or coming in. Your name and the place you're in are sent with it."
        : "What happened, and what did you expect? Only the admin reads this. Your name, the place you're in and your browser are sent with it.";
      text.setAttribute("aria-label", person ? "What happened" : "What went wrong");
      whoLabel.hidden = !person;
      chatLabel.hidden = !person;
      status.textContent = "";
      if (about) {
        // Reporting something they wrote: who, and a quote of it, filled in.
        who.value = about.name;
        text.value = `About ${about.item}\n\n`;
      }
      root.hidden = false;
      if (about) {
        text.focus();
        text.setSelectionRange(text.value.length, text.value.length);
      } else (person ? who : text).focus();
    },
    isOpen: () => !root.hidden,
  };
}
