// A small room's window (a counselling room or a team room, plan 83).
// Coming in opens the room menu: the room's name and who is here, an invite
// box in a counselling room, and what you can do: Chat, Shared notes, Save
// chat, Save notes. Chat and Shared notes each fill the window; × (or Esc)
// goes back to the menu, and closing the menu leaves only the 3D room and a
// small "Room" button to open it again. Going between them never clears
// anything: the chat, the notes and anything half typed stay until you leave
// by the door. While the window is open, the rest of the screen's buttons
// (HUD, mail, look, settings, and on a phone the pad) step aside
// (body.room-open, style.css).
// Nothing is stored: the server keeps the chat only while someone is in the
// room. The server decides who may be invited or enter; this only collects
// the name and tidies it. The 📎 button shares a file (200 MB at most) with
// the people inside; it goes, like the chat, once the room empties. The last
// one out is warned in a popup of its own (askLeave, from the door).

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

/** What the room window shows: the menu, one of its views, or nothing (just the "Room" button). */
type View = "menu" | "chat" | "notes" | "closed";

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
  /** Keeps the chat so far (or only the shared notes) for this person, 30 days; everyone inside is told. */
  onSave(what: "chat" | "notes"): void;
  /** The shared notes' own element (roompad.ts), shown as the Notes view. */
  notes: HTMLElement;
  /** Called when the window opens or closes, so the rest of the screen can make way. */
  onShown(open: boolean): void;
  /** Opens the Campus Guide at the rooms (plan 112). */
  onHelp(): void;
  /** Opens the room's shared whiteboard (plan 85). */
  onWhiteboard(): void;
  /** Turns the room's voice on or off for you (plan 86). */
  onVoice(): void;
  /** Opens your saved chats and notes (the mailbox's Saved tab). */
  onSaved(): void;
  maxLength: number;
}): {
  open(info: RoomInfo, history: RoomLine[]): void;
  update(info: RoomInfo): void;
  add(line: RoomLine): void;
  close(): void;
  isOpen(): boolean;
  /** True while the window covers the room (menu or a view), so the game's keys stay out. */
  isShowing(): boolean;
  isTyping(): boolean;
  focusInput(): void;
  /** Shows a view (the menu, chat, notes) or hides the window. */
  show(view: View): void;
  /** Says on the menu whether your voice is on. */
  setVoice(on: boolean): void;
  /**
   * Leaving: straight out if anyone else is inside; if you're the last, a
   * warning first that the room's chat and files go when it empties.
   */
  askLeave(): void;
} {
  const ui = document.createElement("div");
  ui.id = "room-ui";
  ui.hidden = true;
  ui.setAttribute("role", "region");
  ui.setAttribute("aria-labelledby", "room-title");
  // Closing it loses nothing (the chat and notes stay), so Esc never asks (dialogkeys.ts).
  ui.dataset.keep = "";

  // --- the menu --------------------------------------------------------------
  const menu = document.createElement("div");
  menu.className = "room-menu";
  const menuHead = document.createElement("div");
  menuHead.className = "room-head";
  const title = document.createElement("h2");
  title.id = "room-title";
  title.className = "room-title";
  const count = document.createElement("span");
  count.className = "room-count";
  const hideBtn = document.createElement("button");
  hideBtn.type = "button";
  hideBtn.className = "room-x";
  hideBtn.textContent = "✕";
  hideBtn.title = "Close (Esc): see the room; walk to the door to leave";
  hideBtn.setAttribute("aria-label", "Close the room menu");
  menuHead.append(title, count, hideBtn);

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

  const items = document.createElement("div");
  items.className = "room-items";
  /** A big button on the menu. Later items (whiteboard, voice, help) come through here. */
  function addItem(
    icon: string,
    label: string,
    hint: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "room-item";
    const i = document.createElement("span");
    i.className = "room-item-icon";
    i.textContent = icon;
    i.setAttribute("aria-hidden", "true");
    const l = document.createElement("span");
    l.className = "room-item-label";
    l.textContent = label;
    const h = document.createElement("small");
    h.textContent = hint;
    l.append(h);
    b.append(i, l);
    b.addEventListener("click", onClick);
    items.append(b);
    return b;
  }
  const chatItem = addItem(
    "💬",
    "Chat",
    "Talk with everyone here; share files",
    () => show("chat"),
  );
  const badge = document.createElement("span");
  badge.className = "room-badge";
  badge.hidden = true;
  chatItem.append(badge);
  addItem("📝", "Shared notes", "One Markdown page for the room", () =>
    show("notes"),
  );
  const voiceItem = addItem("🎙️", "Voice: off", "Talk with everyone here who has voice on (microphone)", () => opts.onVoice());
  addItem("🖍️", "Whiteboard", "Draw together in a new tab (Excalidraw; everyone here gets the same board)", () => opts.onWhiteboard());
  addItem(
    "💾",
    "Save chat",
    "Keep this chat 30 days (only you; the room is told)",
    () => opts.onSave("chat"),
  );
  addItem("🗒️", "Save notes", "Keep the shared notes 30 days (only you)", () =>
    opts.onSave("notes"),
  );
  addItem("📂", "My saved chats and notes", "Read what you've saved (yours only, 30 days)", () => opts.onSaved());
  addItem("❓", "Help", "How rooms work, in the Campus Guide", () => opts.onHelp());
  // Last on the menu: leaving (the user's call, 10/30), the same as walking
  // out by the door, so the last one out is warned first.
  const leaveBtn = document.createElement("button");
  leaveBtn.type = "button";
  leaveBtn.className = "room-leave-btn";
  leaveBtn.textContent = "🚪 Leave the room";
  leaveBtn.addEventListener("click", () => askLeave());
  menu.append(menuHead, members, invite, items, leaveBtn);

  // --- the chat view ------------------------------------------------------------
  const chatView = document.createElement("div");
  chatView.className = "room-view room-chat";
  chatView.setAttribute("aria-label", "Room chat");
  const chatHead = viewHead("💬 Chat");
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
  chatView.append(chatHead, log, fileStatus, sendRow);

  // --- the notes view (roompad.ts draws inside) ----------------------------------
  const notesView = document.createElement("div");
  notesView.className = "room-view room-notes";
  notesView.append(viewHead("📝 Shared notes"), opts.notes);

  function viewHead(text: string): HTMLDivElement {
    const head = document.createElement("div");
    head.className = "room-head";
    const h = document.createElement("h3");
    h.textContent = text;
    const back = document.createElement("button");
    back.type = "button";
    back.className = "room-x";
    back.textContent = "✕";
    back.title = "Back to the room menu (Esc)";
    back.setAttribute("aria-label", "Back to the room menu");
    back.addEventListener("click", () => show("menu"));
    head.append(h, back);
    return head;
  }

  // The small button left when the window is closed, to open the menu again.
  const reopen = document.createElement("button");
  reopen.type = "button";
  reopen.id = "room-reopen";
  reopen.hidden = true;
  const reopenLabel = document.createElement("span");
  reopenLabel.textContent = "Open Room UI";
  const reopenBadge = document.createElement("span");
  reopenBadge.className = "room-badge";
  reopenBadge.hidden = true;
  reopen.append(reopenLabel, reopenBadge);
  reopen.addEventListener("click", () => show("menu"));

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
  lastOutText.textContent =
    "You're the last one here. When you leave, this room's chat, shared notes and files are cleared for good (unless you saved them).";
  const lastOutRow = document.createElement("div");
  lastOutRow.className = "room-last-out-row";
  const leaveYes = document.createElement("button");
  leaveYes.type = "button";
  leaveYes.className = "room-primary";
  leaveYes.textContent = "Leave and clear";
  const leaveNo = document.createElement("button");
  leaveNo.type = "button";
  leaveNo.className = "room-secondary";
  leaveNo.textContent = "Stay";
  lastOutRow.append(leaveYes, leaveNo);
  lastOutCard.append(lastOutTitle, lastOutText, lastOutRow);
  lastOut.append(lastOutCard);

  ui.append(menu, chatView, notesView);
  document.body.append(ui, reopen, lastOut);

  let isOpen = false;
  let view: View = "closed";
  let unread = 0;
  let memberCount = 0;

  function syncBadges(): void {
    for (const b of [badge, reopenBadge]) {
      b.hidden = unread === 0;
      b.textContent = unread === 0 ? "" : unread > 99 ? "99+" : String(unread);
    }
    chatItem.setAttribute(
      "aria-label",
      unread ? `Chat, ${unread} unread` : "Chat",
    );
    reopen.setAttribute(
      "aria-label",
      unread ? `Open the room menu, ${unread} unread` : "Open the room menu",
    );
  }

  function show(next: View): void {
    if (!isOpen) return;
    const wasShowing = view !== "closed";
    view = next;
    ui.hidden = next === "closed";
    reopen.hidden = next !== "closed";
    menu.hidden = next !== "menu";
    chatView.hidden = next !== "chat";
    notesView.hidden = next !== "notes";
    if (next === "chat") {
      unread = 0;
      log.scrollTop = log.scrollHeight;
      syncBadges();
    }
    // Focus follows the view (not on a phone's first open, where the keyboard would cover the menu).
    if (next === "closed") {
      if (ui.contains(document.activeElement))
        (document.activeElement as HTMLElement).blur();
    } else if (next === "menu")
      (menu.querySelector(".room-item") as HTMLElement | null)?.focus({
        preventScroll: true,
      });
    else if (next === "notes")
      (opts.notes.querySelector("textarea") as HTMLElement | null)?.focus({
        preventScroll: true,
      });
    if (wasShowing !== (next !== "closed")) opts.onShown(next !== "closed");
  }

  function renderInfo(info: RoomInfo): void {
    title.textContent = info.title;
    memberCount = info.members.length;
    // Someone came in while we were asking: no need to warn any more.
    if (memberCount > 1) closeLastOut();
    count.textContent = `${info.members.length}/${info.cap}`;
    count.setAttribute(
      "aria-label",
      `${info.members.length} of ${info.cap} people`,
    );
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
    invitedNote.textContent = waiting.length
      ? `Invited: ${waiting.join(", ")}`
      : "";
  }

  /** True when the log is at (or within a few pixels of) the bottom, so a new line should keep it there. */
  const atBottom = (): boolean =>
    log.scrollHeight - log.scrollTop - log.clientHeight < 24;

  function append(line: RoomLine): void {
    const el = document.createElement("div");
    el.className =
      "room-line" + (line.system ? " system" : line.self ? " self" : "");
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
          if (!url)
            return a.replaceWith(
              document.createTextNode(`🖼 ${f.name} (couldn't load)`),
            );
          const stick = atBottom();
          img.addEventListener(
            "load",
            () => stick && (log.scrollTop = log.scrollHeight),
            { once: true },
          );
          img.src = url;
          a.href = url;
        });
      } else if (line.file) {
        const f = line.file;
        const b = document.createElement("button");
        b.type = "button";
        b.className = "room-file";
        b.textContent = `📎 ${f.name} · ${sizeLabel(f.size)}`;
        b.addEventListener(
          "click",
          () => void opts.onOpenFile(f.id).then((msg) => say(msg)),
        );
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
    const error = await opts.onShare(file, (done) =>
      say(`Uploading ${file.name}… ${Math.round(done * 100)}%`),
    );
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
      inviteError.textContent =
        "A user name is 1–8 letters, digits or underscores.";
      return;
    }
    inviteError.textContent = "";
    inviteInput.value = "";
    opts.onInvite(name);
    inviteInput.focus();
  }

  inviteBtn.addEventListener("click", sendInvite);
  sendBtn.addEventListener("click", sendMessage);
  hideBtn.addEventListener("click", () => show("closed"));
  leaveYes.addEventListener("click", () => {
    closeLastOut();
    opts.onLeave();
  });
  leaveNo.addEventListener("click", () => closeLastOut());
  lastOut.addEventListener("click", (e) => {
    if (e.target === lastOut) closeLastOut();
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
      closeLastOut();
    } else if (e.key === "Tab") {
      e.preventDefault();
      (document.activeElement === leaveNo ? leaveYes : leaveNo).focus();
    }
  });

  // While the window is open no key reaches the game (it listens on window
  // for WASD, E, Q and Enter). Enter sends or invites. Esc steps back: out of
  // a view to the menu, out of the menu to the room. Nothing typed is lost.
  ui.addEventListener("keydown", (e) => {
    e.stopPropagation();
    const target = e.target as HTMLElement;
    if (e.key === "Enter" && (target === input || target === inviteInput)) {
      e.preventDefault();
      if (target === input) sendMessage();
      else sendInvite();
    } else if (e.key === "Escape") {
      e.preventDefault();
      show(view === "menu" ? "closed" : "menu");
    }
  });

  /** Closes the last-out popup. */
  function closeLastOut(): void {
    if (lastOut.hidden) return;
    lastOut.hidden = true;
  }

  function askLeave(): void {
    if (memberCount > 1) return opts.onLeave();
    lastOut.hidden = false;
    leaveNo.focus();
  }

  function hide(): void {
    const wasShowing = view !== "closed";
    isOpen = false;
    view = "closed";
    lastOut.hidden = true;
    ui.hidden = true;
    reopen.hidden = true;
    log.replaceChildren();
    members.replaceChildren();
    input.value = "";
    inviteInput.value = "";
    inviteError.textContent = "";
    invitedNote.textContent = "";
    say(null);
    unread = 0;
    syncBadges();
    (document.activeElement as HTMLElement | null)?.blur();
    if (wasShowing) opts.onShown(false);
  }

  return {
    open(info, history) {
      renderInfo(info);
      log.replaceChildren();
      for (const line of history) append(line);
      input.value = "";
      inviteInput.value = "";
      inviteError.textContent = "";
      unread = 0;
      syncBadges();
      isOpen = true;
      view = "closed";
      // Coming in opens the menu.
      show("menu");
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
      // Someone else's line while the chat isn't on screen: count it.
      if (view !== "chat" && !line.self && !line.system) {
        unread++;
        syncBadges();
      }
    },
    close: hide,
    isOpen: () => isOpen,
    isShowing: () => isOpen && view !== "closed",
    // Also true while the last-out popup is up, so the game doesn't walk behind it.
    isTyping: () => isOpen && (view !== "closed" || !lastOut.hidden),
    askLeave,
    show,
    setVoice(on) {
      const label = voiceItem.querySelector(".room-item-label");
      if (label?.firstChild) label.firstChild.textContent = on ? "Voice: on" : "Voice: off";
      voiceItem.classList.toggle("is-on", on);
    },
    focusInput() {
      if (!isOpen) return;
      show("chat");
      input.focus();
    },
  };
}
