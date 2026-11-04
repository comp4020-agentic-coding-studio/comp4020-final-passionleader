import "./signupprompt.css";

// Coming in as a guest (the user's ask, 11/4): once per browser, before the
// campus, a short card says what a guest can and can't do, and what is kept
// about them (the same as README's "What the app keeps": the admin's log
// holds sign-ins and refusals with the IP for seven days). "Sign up instead"
// goes to the sign-up form; "Continue as a guest" carries on.

const SEEN = "campus.guestNotice";

export function mountGuestNotice(opts: { signUp(): void }): { maybeOpen(): void } {
  const root = document.createElement("div");
  root.id = "guest-notice";
  root.className = "signup-root";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "guest-notice-title");

  const card = document.createElement("div");
  card.className = "settings-card signup-card";
  const title = document.createElement("h2");
  title.id = "guest-notice-title";
  title.textContent = "You're in as a guest";
  const can = document.createElement("p");
  can.className = "signup-ask";
  can.textContent = "You can walk around, chat, emote, use team rooms, talk by voice and ask the AI assistants.";
  const cannot = document.createElement("p");
  cannot.className = "signup-ask";
  cannot.textContent = "Signing up with an ANU email is needed for sticky notes, posts and comments, hearts, study groups, mail, files, saving a room's chat and reporting someone.";
  const kept = document.createElement("p");
  kept.className = "signup-ask guest-kept";
  kept.textContent =
    "What's kept: your guest name, so this browser comes back as you, for a day after your last visit. The admin's log keeps your sign-ins and anything refused, with your IP address, for seven days. Chat text isn't kept in the log.";
  const actions = document.createElement("div");
  actions.className = "settings-actions";
  const signUp = document.createElement("button");
  signUp.type = "button";
  signUp.textContent = "Sign up instead";
  const ok = document.createElement("button");
  ok.type = "button";
  ok.className = "signup-yes";
  ok.textContent = "Continue as a guest";
  actions.append(signUp, ok);
  card.append(title, can, cannot, kept, actions);
  root.append(card);
  document.body.append(root);

  const close = (): void => {
    root.hidden = true;
    try {
      localStorage.setItem(SEEN, "1");
    } catch {
      // private mode: shown again next visit
    }
  };
  ok.addEventListener("click", close);
  signUp.addEventListener("click", () => {
    close();
    opts.signUp();
  });
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  return {
    maybeOpen(): void {
      try {
        if (localStorage.getItem(SEEN) === "1") return;
      } catch {
        // no storage: show it
      }
      root.hidden = false;
      ok.focus();
    },
  };
}
