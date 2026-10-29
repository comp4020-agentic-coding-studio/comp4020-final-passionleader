import "./invitepopup.css";

// An invitation to a counselling or interview room (the user's call, 10/30):
// "<name> invites you to <room>", Accept takes you straight in, Decline (or
// Esc) lets it be. It's good for one visit: leave the room and it takes a
// new one (server/realtime.ts). Several at once: the newest shows.

export function mountInvitePopup(opts: { accept(space: string): void }): { show(space: string, from: string, title: string): void; isOpen(): boolean } {
  const root = document.createElement("div");
  root.id = "invite-popup";
  root.hidden = true;
  root.setAttribute("role", "alertdialog");
  root.setAttribute("aria-labelledby", "invite-title");
  const card = document.createElement("div");
  card.className = "settings-card";
  const title = document.createElement("h2");
  title.id = "invite-title";
  title.textContent = "You're invited";
  const text = document.createElement("p");
  const row = document.createElement("div");
  row.className = "settings-actions";
  const no = document.createElement("button");
  no.type = "button";
  no.textContent = "Decline";
  const yes = document.createElement("button");
  yes.type = "submit";
  yes.textContent = "Accept and go in";
  row.append(no, yes);
  card.append(title, text, row);
  root.append(card);
  document.body.append(root);

  let space = "";
  const hide = (): void => void (root.hidden = true);
  no.addEventListener("click", hide);
  yes.addEventListener("click", () => {
    hide();
    opts.accept(space);
  });
  root.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") hide();
  });
  return {
    show(to, from, roomTitle) {
      space = to;
      text.textContent = `${from} invites you to ${roomTitle}. Accept to go in now; the invitation is good for one visit.`;
      root.hidden = false;
      yes.focus();
    },
    isOpen: () => !root.hidden,
  };
}
