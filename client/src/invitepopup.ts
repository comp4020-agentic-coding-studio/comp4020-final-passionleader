import "./invitepopup.css";

// An invitation to a counselling or interview room (the user's call, 10/30):
// "<name> invites you to <room>", Accept takes you straight in, Decline (or
// Esc) lets it be. It's good for one visit: leave the room and it takes a
// new one (server/realtime.ts). Several at once: the newest shows.

// A knock (office hours) reuses this window: "<name> knocks. Invite them in?" and its button
// sends the ordinary invitation (server/realtime.ts "invite"), so the same room rules hold.

export function mountInvitePopup(opts: { accept(space: string): void; invite(name: string): void }): { show(space: string, from: string, title: string): void; knock(from: string, room: number | null): void; isOpen(): boolean } {
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
  // Set while showing a knock: the name to invite instead of a room to go into.
  let knocker: string | null = null;
  const hide = (): void => void (root.hidden = true);
  no.addEventListener("click", hide);
  yes.addEventListener("click", () => {
    hide();
    if (knocker) opts.invite(knocker);
    else opts.accept(space);
  });
  root.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") hide();
  });
  return {
    knock(from, room) {
      knocker = from;
      title.textContent = "Someone knocked";
      yes.textContent = "Invite them in";
      no.textContent = "Not now";
      text.textContent = `${from} knocked on your office hours${room ? ` (counselling room ${room})` : ""}. Invite them in? You need to be in a counselling room to do that; the invitation is good for one visit.`;
      root.hidden = false;
      yes.focus();
    },
    show(to, from, roomTitle) {
      knocker = null;
      title.textContent = "You're invited";
      yes.textContent = "Accept and go in";
      no.textContent = "Decline";
      space = to;
      text.textContent = `${from} invites you to ${roomTitle}. Accept to go in now; the invitation is good for one visit.`;
      root.hidden = false;
      yes.focus();
    },
    isOpen: () => !root.hidden,
  };
}
