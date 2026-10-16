import "./bugreport.css";

// The bug report form, opened from the settings dialog. Text only for now (a
// screenshot needs file storage, planned with a separate AWS server). The
// server adds who sent it, from which browser and IP, the space they were in
// and their browser's user agent, and only the admin reads reports (on the
// Student Hub's reception PC).

const MAX = 2000;

export function mountBugReport(opts: {
  /** Sends the text; resolves to an error message, or null when sent. */
  send(text: string): Promise<string | null>;
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
  card.append(title, hint, text, status, actions);
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
    send.disabled = true;
    status.textContent = "Sending…";
    const failed = await opts.send(value);
    send.disabled = false;
    if (failed) {
      status.textContent = failed;
      return;
    }
    text.value = "";
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
