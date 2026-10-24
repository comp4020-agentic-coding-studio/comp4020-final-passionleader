import "./roompad.css";
import { renderMarkdown } from "./markdown.ts";

// A meeting room's shared notes (plan 39): one Markdown text for everyone
// inside. Typing sends it (a moment after you stop); the server keeps the
// last write and passes it to the others; it goes when the room empties,
// unless someone saves the chat (the notes go with it). While you're typing,
// someone else's change waits behind a "load" button so it doesn't eat your
// words.

export function mountRoomPad(opts: { onChange(text: string): void }): {
  /** Shows the pad, with the room's current text. */
  open(): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;
  isTyping(): boolean;
  /** The room's text, from the server (on coming in, or someone else's edit). */
  set(text: string, by: string | null): void;
} {
  const root = document.createElement("section");
  root.id = "room-pad";
  root.hidden = true;
  root.setAttribute("aria-label", "Shared notes");
  const head = document.createElement("div");
  head.className = "pad-head";
  const title = document.createElement("h2");
  title.textContent = "📝 Shared notes";
  const mode = document.createElement("button");
  mode.type = "button";
  mode.textContent = "Preview";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "✕";
  close.setAttribute("aria-label", "Close notes");
  head.append(title, mode, close);
  const text = document.createElement("textarea");
  text.maxLength = 5000;
  text.placeholder = "Agenda, who does what, links… Markdown works. Everyone in the room sees this; it goes when the room empties (unless someone saves the chat).";
  text.setAttribute("aria-label", "Shared notes, Markdown");
  const preview = document.createElement("div");
  preview.className = "pad-preview";
  preview.hidden = true;
  const foot = document.createElement("p");
  foot.className = "pad-foot";
  const load = document.createElement("button");
  load.type = "button";
  load.hidden = true;
  root.append(head, text, preview, foot, load);
  document.body.append(root);

  let typing = false;
  let timer = 0;
  let pending: { text: string; by: string | null } | null = null;

  const showPreview = (on: boolean): void => {
    preview.hidden = !on;
    text.hidden = on;
    mode.textContent = on ? "Edit" : "Preview";
    if (on) preview.replaceChildren(renderMarkdown(text.value || "_Nothing yet._"));
  };
  mode.addEventListener("click", () => showPreview(text.hidden === false));
  close.addEventListener("click", () => (root.hidden = true));
  text.addEventListener("focus", () => (typing = true));
  text.addEventListener("blur", () => (typing = false));
  // Keys stay in the pad (WASD, E, Q mean nothing here), except Escape.
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      text.blur();
      root.hidden = true;
    }
    e.stopPropagation();
  });
  text.addEventListener("input", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      opts.onChange(text.value);
      foot.textContent = "Saved for the room.";
    }, 400);
    foot.textContent = "…";
  });
  load.addEventListener("click", () => {
    if (pending) apply(pending.text, pending.by);
    pending = null;
    load.hidden = true;
  });

  function apply(value: string, by: string | null): void {
    text.value = value;
    foot.textContent = by ? `Last edited by ${by}.` : "";
    if (!preview.hidden) showPreview(true);
  }

  return {
    open() {
      root.hidden = false;
      text.focus();
    },
    close() {
      root.hidden = true;
      text.value = "";
      pending = null;
      load.hidden = true;
      showPreview(false);
    },
    toggle() {
      if (root.hidden) this.open();
      else root.hidden = true;
    },
    isOpen: () => !root.hidden,
    isTyping: () => typing,
    set(value, by) {
      if (typing && value !== text.value) {
        pending = { text: value, by };
        load.textContent = `${by ?? "Someone"} changed the notes: load their version`;
        load.hidden = false;
        return;
      }
      apply(value, by);
    },
  };
}
