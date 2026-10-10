// Chat log and input. Self-mounts to <body>, hidden until the caller shows
// it. Lines fade out and remove themselves a minute after they arrive, and
// at most a handful stay on screen at once so the corner doesn't fill up.

import "./chatui.css";

const LINE_LIFETIME_MS = 60_000;
const FADE_MS = 400;
const MAX_LINES = 8;

interface Line {
  el: HTMLDivElement;
  timer: number;
}

export function mountChat(opts: { onSend(text: string): void; maxLength: number }): {
  show(): void;
  hide(): void;
  openInput(): void;
  closeInput(): void;
  isTyping(): boolean;
  add(msg: { name: string; text: string; self?: boolean }): void;
  system(text: string): void;
} {
  const root = document.createElement("div");
  root.id = "chat";
  root.hidden = true;

  const log = document.createElement("div");
  log.id = "chat-log";
  log.setAttribute("aria-live", "polite");

  const controls = document.createElement("div");
  controls.id = "chat-controls";
  const openBtn = document.createElement("button");
  openBtn.type = "button";
  openBtn.id = "chat-open";
  openBtn.textContent = "Chat";
  controls.append(openBtn);

  const inputRow = document.createElement("div");
  inputRow.id = "chat-input-row";
  const input = document.createElement("input");
  input.id = "chat-input";
  input.type = "text";
  input.maxLength = opts.maxLength;
  input.autocomplete = "off";
  input.setAttribute("aria-label", "Chat message");
  inputRow.append(input);

  root.append(log, controls, inputRow);
  document.body.append(root);

  const lines: Line[] = [];

  function removeLine(line: Line): void {
    const i = lines.indexOf(line);
    if (i !== -1) lines.splice(i, 1);
    window.clearTimeout(line.timer);
    line.el.remove();
  }

  function fadeThenRemove(line: Line): void {
    line.el.classList.add("fading");
    window.setTimeout(() => removeLine(line), FADE_MS);
  }

  function pushLine(el: HTMLDivElement): void {
    log.append(el);
    const line: Line = { el, timer: window.setTimeout(() => fadeThenRemove(line), LINE_LIFETIME_MS) };
    lines.push(line);
    while (lines.length > MAX_LINES) removeLine(lines[0]!);
    log.scrollTop = log.scrollHeight;
  }

  let typing = false;

  function closeInput(): void {
    typing = false;
    inputRow.classList.remove("is-open");
    input.value = "";
    input.blur();
  }

  function openInput(): void {
    typing = true;
    inputRow.classList.add("is-open");
    input.focus();
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      const text = input.value.trim();
      closeInput();
      if (text) opts.onSend(text);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeInput();
    }
  });
  openBtn.addEventListener("click", () => openInput());

  return {
    show(): void {
      root.hidden = false;
    },
    hide(): void {
      closeInput();
      root.hidden = true;
    },
    openInput,
    closeInput,
    isTyping(): boolean {
      return typing;
    },
    add(msg: { name: string; text: string; self?: boolean }): void {
      const el = document.createElement("div");
      el.className = "chat-line" + (msg.self ? " self" : "");
      const name = document.createElement("span");
      name.className = "chat-name";
      name.textContent = `${msg.name}: `;
      el.append(name, document.createTextNode(msg.text));
      pushLine(el);
    },
    system(text: string): void {
      const el = document.createElement("div");
      el.className = "chat-line system";
      el.textContent = text;
      pushLine(el);
    },
  };
}
