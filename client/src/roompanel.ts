// The group-chat window for a small room (a counselling room or a team room).
// While you're inside, it sits over the game like a group chat: who is here,
// the messages, a box to type in. Nothing is stored: the server keeps the chat
// only while someone is in the room, so the panel just shows what it is told.
// A counselling room is invite-only, so anyone inside can invite a user by
// name; a team room is open to all and has no invite row. The server decides
// who may be invited or enter; this only collects the name and tidies it.
// The 📎 button shares a file (200 MB at most) with the people inside; it is
// gone, like the chat, once the room empties.

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
} {
  const root = document.createElement("div");
  root.id = "room-panel";
  root.hidden = true;
  root.setAttribute("role", "region");
  root.setAttribute("aria-labelledby", "room-title");

  const head = document.createElement("div");
  head.className = "room-head";
  // On a phone the title row is a button that folds the sheet up, so the game
  // and the D-pad underneath stay usable; on a desktop it is just a label.
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "room-toggle";
  toggle.setAttribute("aria-expanded", "true");
  toggle.setAttribute("aria-label", "Show or hide the room chat");
  const title = document.createElement("h2");
  title.id = "room-title";
  title.className = "room-title";
  const count = document.createElement("span");
  count.className = "room-count";
  const chevron = document.createElement("span");
  chevron.className = "room-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = "▲";
  toggle.append(title, count, chevron);
  const leave = document.createElement("button");
  leave.type = "button";
  leave.className = "room-leave";
  leave.textContent = "Leave room";
  head.append(toggle, leave);

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

  root.append(head, members, invite, log, fileStatus, sendRow);
  document.body.append(root);

  let isOpen = false;

  function renderInfo(info: RoomInfo): void {
    title.textContent = info.title;
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
  leave.addEventListener("click", () => opts.onLeave());
  inviteInput.addEventListener("input", () => {
    inviteError.textContent = "";
  });
  toggle.addEventListener("click", () => {
    const collapsed = root.classList.toggle("is-collapsed");
    toggle.setAttribute("aria-expanded", String(!collapsed));
    chevron.textContent = collapsed ? "▼" : "▲";
  });

  // The game listens on window for WASD, E, Q and Enter, so keys typed in the
  // panel must not reach it (the same as the chat box in chatui.ts). Enter
  // sends or invites; Escape only lets go of the box, it does not close the room.
  root.addEventListener("keydown", (e) => {
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

  function hide(): void {
    isOpen = false;
    root.hidden = true;
    log.replaceChildren();
    members.replaceChildren();
    input.value = "";
    inviteInput.value = "";
    inviteError.textContent = "";
    invitedNote.textContent = "";
    say(null);
    root.classList.remove("is-collapsed");
    toggle.setAttribute("aria-expanded", "true");
    chevron.textContent = "▲";
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
      root.classList.remove("is-collapsed");
      toggle.setAttribute("aria-expanded", "true");
      chevron.textContent = "▲";
      isOpen = true;
      root.hidden = false;
      log.scrollTop = log.scrollHeight;
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
    },
    close: hide,
    isOpen: () => isOpen,
    isTyping: () => isOpen && (document.activeElement === input || document.activeElement === inviteInput),
    focusInput() {
      if (!isOpen) return;
      root.classList.remove("is-collapsed");
      toggle.setAttribute("aria-expanded", "true");
      chevron.textContent = "▲";
      input.focus();
    },
  };
}
