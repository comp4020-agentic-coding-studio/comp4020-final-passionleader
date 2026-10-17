// The group-chat window for a small room (a counselling room or a team room).
// While you're inside, a small dock (room name, head count, buttons) sits at
// the top right, and its Chat button opens and closes the chat under it: who
// is here, the messages, a box to type in. Later buttons go in the dock too. Nothing is stored: the server keeps the chat
// only while someone is in the room, so the panel just shows what it is told.
// A counselling room is invite-only, so anyone inside can invite a user by
// name; a team room is open to all and has no invite row. The server decides
// who may be invited or enter; this only collects the name and tidies it.
// The 📎 button shares a file (200 MB at most) with the people inside; it is
// gone, like the chat, once the room empties. The last one out is warned in a
// popup of its own, so it works with the chat closed.

import "./roompanel.css";
import { ACCEPT, MAX_FILE_BYTES, isImage, sizeLabel } from "./uploads.ts";

export interface RoomInfo {
  title: string;
  kind: "counselling" | "team";
  members: string[];
  cap: number;
  /** Counselling only: marked "host" in the member list. */
  host?: string;
  /** Counselling only: invited names who are not in the room yet. */
  invited?: string[];
}

export interface RoomLine {
  name: string;
  text: string;
  self?: boolean;
  system?: boolean;
  file?: { id: string; name: string; size: number };
}

// The same rule as everywhere else for a user name.
const NAME_RULE = /^[A-Za-z0-9_]{1,8}$/;
const MAX_LINES = 200;

export function mountRoomPanel(opts: {
  onSend(text: string): void;
  onInvite(name: string): void;
  onLeave(): void;
  /** Shares a file; resolves to an error message, or null. `progress` gets 0..1. */
  onShare(file: File, progress: (done: number) => void): Promise<string | null>;
  /** Fetches a shared file; resolves to an error message, or null. */
  onOpenFile(id: string): Promise<string | null>;
  /** A link that shows a shared picture in place, or null. */
  onImageLink(id: string): Promise<string | null>;
  maxLength: number;
}): {
  open(info: RoomInfo, history: RoomLine[]): void;
  update(info: RoomInfo): void;
  add(line: RoomLine): void;
  close(): void;
  isOpen(): boolean;
  isTyping(): boolean;
  focusInput(): void;
  /**
   * Leaving: straight out if anyone else is inside; if you're the last, a
   * warning first that the room's chat and files go when it empties.
   */
  askLeave(): void;
} {
  // One fixed column at the top right: the dock, then the chat panel under it.
  // The column itself takes no clicks, so a closed chat leaves the game free.
  const ui = document.createElement("div");
  ui.id = "room-ui";
  ui.hidden = true;

  const root = document.createElement("div");
  root.id = "room-panel";
  root.setAttribute("role", "region");
  root.setAttribute("aria-labelledby", "room-title");

  const dock = document.createElement("div");
  dock.className = "room-dock";
  const dockTop = document.createElement("div");
  dockTop.className = "room-dock-top";
  const title = document.createElement("h2");
  title.id = "room-title";
  title.className = "room-title";
  const count = document.createElement("span");
  count.className = "room-count";
  dockTop.append(title, count);
  const actions = document.createElement("div");
  actions.className = "room-dock-actions";
  const leave = document.createElement("button");
  leave.type = "button";
  leave.className = "room-leave";
  leave.textContent = "Leave room";
  actions.append(leave);
  dock.append(dockTop, actions);

  /** Adds a button to the dock, before "Leave room" (which stays last). Later buttons go through here. */
  function addButton(label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "room-dock-btn";
    b.textContent = label;
    b.addEventListener("click", onClick);
    actions.insertBefore(b, leave);
    return b;
  }

  const chatBtn = addButton("", () => setChat(!chatOpen));
  const chatLabel = document.createElement("span");
  chatLabel.textContent = "💬 Chat";
  const badge = document.createElement("span");
  badge.className = "room-badge";
  badge.hidden = true;
  chatBtn.append(chatLabel, badge);
  chatBtn.setAttribute("aria-controls", "room-panel");

  // Shown when the last person in the room goes to leave: a popup of its own.
  const lastOut = document.createElement("div");
  lastOut.className = "room-modal";
  lastOut.hidden = true;
  const lastOutCard = document.createElement("div");
  lastOutCard.className = "room-modal-card";
  lastOutCard.setAttribute("role", "alertdialog");
  lastOutCard.setAttribute("aria-modal", "true");
  lastOutCard.setAttribute("aria-labelledby", "room-last-out-title");
  lastOutCard.setAttribute("aria-describedby", "room-last-out-text");
  const lastOutTitle = document.createElement("h2");
  lastOutTitle.id = "room-last-out-title";
  lastOutTitle.textContent = "Leave the room?";
  const lastOutText = document.createElement("p");
  lastOutText.id = "room-last-out-text";
  lastOutText.textContent = "You're the last one here. When you leave, this room's chat and shared files are cleared for good.";
  const lastOutRow = document.createElement("div");
  lastOutRow.className = "room-last-out-row";
  const leaveYes = document.createElement("button");
  leaveYes.type = "button";
  leaveYes.className = "room-primary";
  leaveYes.textContent = "Leave and clear";
  const leaveNo = document.createElement("button");
  leaveNo.type = "button";
  leaveNo.className = "room-leave";
  leaveNo.textContent = "Stay";
  lastOutRow.append(leaveYes, leaveNo);
  lastOutCard.append(lastOutTitle, lastOutText, lastOutRow);
  lastOut.append(lastOutCard);

  const members = document.createElement("ul");
  members.className = "room-members";
  members.setAttribute("aria-label", "People in the room");

  const invite = document.createElement("div");
  invite.className = "room-invite";
  invite.hidden = true;
  const inviteRow = document.createElement("div");
  inviteRow.className = "room-invite-row";
  const inviteInput = document.createElement("input");
  inviteInput.type = "text";
  inviteInput.maxLength = 8;
  inviteInput.placeholder = "User name to invite";
  inviteInput.autocomplete = "off";
  inviteInput.autocapitalize = "off";
  inviteInput.spellcheck = false;
  inviteInput.setAttribute("aria-label", "User name to invite");
  const inviteBtn = document.createElement("button");
  inviteBtn.type = "button";
  inviteBtn.className = "room-primary";
  inviteBtn.textContent = "Invite";
  inviteRow.append(inviteInput, inviteBtn);
  const invitedNote = document.createElement("p");
  invitedNote.className = "room-note";
  const inviteError = document.createElement("p");
  inviteError.className = "room-error";
  inviteError.setAttribute("role", "alert");
  invite.append(inviteRow, invitedNote, inviteError);

  const log = document.createElement("div");
  log.className = "room-log";
  log.setAttribute("role", "log");
  log.setAttribute("aria-live", "polite");
  log.setAttribute("aria-label", "Room chat");

  const sendRow = document.createElement("div");
  sendRow.className = "room-send-row";
  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = opts.maxLength;
  input.placeholder = "Message the room…";
  input.autocomplete = "off";
  input.setAttribute("aria-label", "Message");
  const sendBtn = document.createElement("button");
  sendBtn.type = "button";
  sendBtn.className = "room-primary";
  sendBtn.textContent = "Send";
  const attach = document.createElement("button");
  attach.type = "button";
  attach.className = "room-attach";
  attach.textContent = "📎";
  attach.title = "Share a file with the room (up to 200 MB)";
  attach.setAttribute("aria-label", "Share a file with the room");
  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = ACCEPT;
  picker.hidden = true;
  const fileStatus = document.createElement("p");
  fileStatus.className = "room-note room-file-status";
  fileStatus.setAttribute("role", "status");
  fileStatus.hidden = true;
  sendRow.append(attach, picker, input, sendBtn);

  root.append(members, invite, log, fileStatus, sendRow);
  ui.append(dock, root);
  document.body.append(ui, lastOut);

  let isOpen = false;
  // The chat panel is open or closed from the dock; it starts closed on entering
  // a room, so the room is seen first. A line from someone else while it is
  // closed counts as unread.
  let chatOpen = false;
  let unread = 0;

  function syncChatButton(): void {
    chatBtn.setAttribute("aria-pressed", String(chatOpen));
    chatBtn.setAttribute("aria-expanded", String(chatOpen));
    badge.hidden = unread === 0;
    badge.textContent = unread === 0 ? "" : unread > 99 ? "99+" : String(unread);
    chatBtn.setAttribute("aria-label", unread ? `Chat, ${unread} unread` : "Chat");
  }

  function setChat(on: boolean): void {
    chatOpen = on;
    root.hidden = !on;
    if (on) {
      unread = 0;
      log.scrollTop = log.scrollHeight;
    } else if (root.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    syncChatButton();
  }

  function renderInfo(info: RoomInfo): void {
    title.textContent = info.title;
    memberCount = info.members.length;
    // Someone came in while we were asking: no need to warn any more.
    if (memberCount > 1) closeLastOut(false);
    count.textContent = `${info.members.length}/${info.cap}`;
    count.setAttribute("aria-label", `${info.members.length} of ${info.cap} people`);
    members.replaceChildren(
      ...info.members.map((name) => {
        const li = document.createElement("li");
        li.className = "room-chip" + (info.host === name ? " is-host" : "");
        li.append(document.createTextNode(name));
        if (info.host === name) {
          const tag = document.createElement("small");
          tag.textContent = "host";
          li.append(tag);
        }
        return li;
      }),
    );
    const counselling = info.kind === "counselling";
    invite.hidden = !counselling;
    const waiting = counselling ? (info.invited ?? []) : [];
    invitedNote.hidden = waiting.length === 0;
    invitedNote.textContent = waiting.length ? `Invited: ${waiting.join(", ")}` : "";
  }

  /** True when the log is at (or within a few pixels of) the bottom, so a new line should keep it there. */
  const atBottom = (): boolean => log.scrollHeight - log.scrollTop - log.clientHeight < 24;

  function append(line: RoomLine): void {
    const el = document.createElement("div");
    el.className = "room-line" + (line.system ? " system" : line.self ? " self" : "");
    if (line.system) {
      el.textContent = line.text;
    } else {
      if (!line.self) {
        const who = document.createElement("b");
        who.textContent = line.name;
        el.append(who);
      }
      if (line.file && isImage(line.file.name)) {
        // A picture shows in the chat (click for full size in a new tab).
        const f = line.file;
        const a = document.createElement("a");
        a.className = "room-image";
        a.target = "_blank";
        a.rel = "noopener";
        a.title = `${f.name} · ${sizeLabel(f.size)} (opens full size)`;
        const img = document.createElement("img");
        img.alt = f.name;
        a.append(img);
        el.append(a);
        void opts.onImageLink(f.id).then((url) => {
          if (!url) return a.replaceWith(document.createTextNode(`🖼 ${f.name} (couldn't load)`));
          const stick = atBottom();
          img.addEventListener("load", () => stick && (log.scrollTop = log.scrollHeight), { once: true });
          img.src = url;
          a.href = url;
        });
      } else if (line.file) {
        const f = line.file;
        const b = document.createElement("button");
        b.type = "button";
        b.className = "room-file";
        b.textContent = `📎 ${f.name} · ${sizeLabel(f.size)}`;
        b.addEventListener("click", () => void opts.onOpenFile(f.id).then((msg) => say(msg)));
        el.append(b);
      } else el.append(document.createTextNode(line.text));
    }
    log.append(el);
    while (log.childElementCount > MAX_LINES) log.firstElementChild?.remove();
  }

  /** A line under the chat about a file: progress, or what went wrong. Empty hides it. */
  function say(msg: string | null): void {
    fileStatus.textContent = msg ?? "";
    fileStatus.hidden = !msg;
  }

  attach.addEventListener("click", () => picker.click());
  picker.addEventListener("change", async () => {
    const file = picker.files?.[0];
    picker.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) return say("Files can be up to 200 MB.");
    attach.disabled = true;
    say(`Uploading ${file.name}…`);
    const error = await opts.onShare(file, (done) => say(`Uploading ${file.name}… ${Math.round(done * 100)}%`));
    attach.disabled = false;
    say(error);
  });

  function sendMessage(): void {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    opts.onSend(text.slice(0, opts.maxLength));
    input.focus();
  }

  function sendInvite(): void {
    const name = inviteInput.value.trim();
    if (!NAME_RULE.test(name)) {
      inviteError.textContent = "A user name is 1–8 letters, digits or underscores.";
      return;
    }
    inviteError.textContent = "";
    inviteInput.value = "";
    opts.onInvite(name);
    inviteInput.focus();
  }

  inviteBtn.addEventListener("click", sendInvite);
  sendBtn.addEventListener("click", sendMessage);
  leave.addEventListener("click", askLeave);
  leaveYes.addEventListener("click", () => {
    closeLastOut(false);
    opts.onLeave();
  });
  leaveNo.addEventListener("click", () => closeLastOut(true));
  lastOut.addEventListener("click", (e) => {
    if (e.target === lastOut) closeLastOut(true);
  });
  inviteInput.addEventListener("input", () => {
    inviteError.textContent = "";
  });

  // Inside the popup no key reaches the game. Esc is Stay; Tab stays between
  // its two buttons.
  lastOut.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      closeLastOut(true);
    } else if (e.key === "Tab") {
      e.preventDefault();
      (document.activeElement === leaveNo ? leaveYes : leaveNo).focus();
    }
  });

  // The game listens on window for WASD, E, Q and Enter, so keys typed in the
  // panel must not reach it (the same as the chat box in chatui.ts). Enter
  // sends or invites; Escape only lets go of the box, it does not close the room.
  ui.addEventListener("keydown", (e) => {
    const target = e.target as HTMLElement;
    if (target !== input && target !== inviteInput) return;
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      if (target === input) sendMessage();
      else sendInvite();
    } else if (e.key === "Escape") {
      e.preventDefault();
      target.blur();
    }
  });

  let memberCount = 0;
  /** Closes the last-out popup; `back` puts focus back on the Leave button. */
  function closeLastOut(back: boolean): void {
    if (lastOut.hidden) return;
    lastOut.hidden = true;
    if (back) leave.focus();
  }

  function askLeave(): void {
    if (memberCount > 1) return opts.onLeave();
    lastOut.hidden = false;
    leaveNo.focus();
  }

  function hide(): void {
    isOpen = false;
    lastOut.hidden = true;
    ui.hidden = true;
    log.replaceChildren();
    members.replaceChildren();
    input.value = "";
    inviteInput.value = "";
    inviteError.textContent = "";
    invitedNote.textContent = "";
    say(null);
    chatOpen = true;
    root.hidden = false;
    unread = 0;
    syncChatButton();
    (document.activeElement as HTMLElement | null)?.blur();
  }

  return {
    open(info, history) {
      renderInfo(info);
      log.replaceChildren();
      for (const line of history) append(line);
      input.value = "";
      inviteInput.value = "";
      inviteError.textContent = "";
      isOpen = true;
      ui.hidden = false;
      setChat(false);
    },
    update(info) {
      // Only the header, the member chips and the invited line change, so
      // whatever is half typed in either box stays.
      if (isOpen) renderInfo(info);
    },
    add(line) {
      if (!isOpen) return;
      const stick = atBottom() || !!line.self;
      append(line);
      if (stick) log.scrollTop = log.scrollHeight;
      // Someone else's line while the chat is closed: count it on the button.
      if (!chatOpen && !line.self && !line.system) {
        unread++;
        syncChatButton();
      }
    },
    close: hide,
    isOpen: () => isOpen,
    // Also true while the last-out popup is up, so the game doesn't walk behind it.
    isTyping: () => isOpen && (!lastOut.hidden || document.activeElement === input || document.activeElement === inviteInput),
    askLeave,
    focusInput() {
      if (!isOpen) return;
      setChat(true);
      input.focus();
    },
  };
}
