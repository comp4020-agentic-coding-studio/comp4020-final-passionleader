import "./signupprompt.css";

// A guest tried something that needs an ANU sign-up (writing a post, a note,
// a comment, a heart, mail, files): say so, with the way there. Opened before
// the action where the client knows (Write a post, the note menu), and
// whenever the server refuses a guest with `signup: true`.

export function mountSignupPrompt(opts: { signUp(): void }): { open(what?: string): void; isOpen(): boolean } {
  const root = document.createElement("div");
  root.id = "signup-prompt";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "signup-prompt-title");

  const card = document.createElement("div");
  card.className = "settings-card signup-card";
  const title = document.createElement("h2");
  title.id = "signup-prompt-title";
  title.textContent = "✉️ Verify your ANU email";
  const ask = document.createElement("p");
  ask.className = "signup-ask";
  const actions = document.createElement("div");
  actions.className = "settings-actions";
  const later = document.createElement("button");
  later.type = "button";
  later.textContent = "Not now";
  const yes = document.createElement("button");
  yes.type = "button";
  yes.className = "signup-yes";
  yes.textContent = "Sign up with your ANU email";
  actions.append(later, yes);
  card.append(title, ask, actions);
  root.append(card);
  document.body.append(root);

  const hide = (): void => {
    root.hidden = true;
  };
  later.addEventListener("click", hide);
  yes.addEventListener("click", () => {
    hide();
    opts.signUp();
  });
  root.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") hide();
  });
  root.addEventListener("click", (e) => {
    if (e.target === root) hide();
  });

  return {
    open(what = "do that") {
      ask.textContent = `Guests can walk, chat and look around. To ${what}, sign up with your ANU email: a code comes to your inbox, then pick a name and a password.`;
      root.hidden = false;
      yes.focus();
    },
    isOpen: () => !root.hidden,
  };
}
