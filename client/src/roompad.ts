import "./roompad.css";
import { renderMarkdown } from "./markdown.ts";

// A meeting room's shared notes (plan 39): one Markdown text for everyone
// inside. Typing sends it (a moment after you stop); the server keeps the
// last write and passes it to the others; it goes when the room empties,
// unless someone saves it. While you're typing, someone else's change waits
// behind a "load" button so it doesn't eat your words. The room window
// (roompanel.ts) shows this as its Notes view (plan 83). A picture dropped or
// pasted on it (plan 37) is shared with the room like 📎 and goes in as a line
// of its own, ![name](room-file:ID), which the preview shows as the picture;
// it goes with the room's other files when the room empties.

export function mountRoomPad(opts: {
  onChange(text: string): void;
  /** Shares a picture with the room (as 📎 does); resolves to its file id, or an error message. */
  onImage(file: File): Promise<{ id: string } | string>;
  /** A link that shows a shared picture, or null. */
  imageLink(id: string): Promise<string | null>;
}): {
  /** The pad's element, for the room window to hold. */
  el: HTMLElement;
  /** Clears it (leaving the room). */
  close(): void;
  isTyping(): boolean;
  /** The room's text, from the server (on coming in, or someone else's edit). */
  set(text: string, by: string | null): void;
} {
  const root = document.createElement("section");
  root.id = "room-pad";
  root.dataset.keep = "";
  root.setAttribute("aria-label", "Shared notes");
  const head = document.createElement("div");
  head.className = "pad-head";
  const mode = document.createElement("button");
  mode.type = "button";
  mode.textContent = "Preview";
  head.append(mode);
  const text = document.createElement("textarea");
  text.maxLength = 5000;
  text.placeholder =
    "Agenda, who does what, links… Markdown works. Everyone in the room sees this; it goes when the room empties (Save notes in the room menu keeps a copy for you).";
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

  let typing = false;
  let timer = 0;
  let pending: { text: string; by: string | null } | null = null;

  const showPreview = (on: boolean): void => {
    preview.hidden = !on;
    text.hidden = on;
    mode.textContent = on ? "Edit" : "Preview";
    if (on)
      preview.replaceChildren(renderMarkdown(text.value || "_Nothing yet._"));
  };
  mode.addEventListener("click", () => showPreview(text.hidden === false));

  /** Puts `line` in at the cursor, on a line of its own, and sends the notes. */
  function insertLine(line: string): void {
    const at = text.selectionStart ?? text.value.length;
    const before = text.value.slice(0, at);
    const after = text.value.slice(at);
    const value = `${before}${before && !before.endsWith("\n") ? "\n" : ""}${line}\n${after}`.slice(0, 5000);
    text.value = value;
    opts.onChange(value);
    foot.textContent = "Saved for the room.";
  }
  async function addImages(files: File[]): Promise<void> {
    for (const f of files.filter((f) => /^image\//.test(f.type))) {
      foot.textContent = `Sharing ${f.name}…`;
      const r = await opts.onImage(f);
      if (typeof r === "string") {
        foot.textContent = r;
        return;
      }
      insertLine(`![${f.name.replace(/[[\]()]/g, "")}](room-file:${r.id})`);
    }
  }
  text.addEventListener("dragover", (e) => {
    if ([...(e.dataTransfer?.items ?? [])].some((i) => i.kind === "file")) e.preventDefault();
  });
  text.addEventListener("drop", (e) => {
    const files = [...(e.dataTransfer?.files ?? [])];
    if (!files.length) return;
    e.preventDefault();
    void addImages(files);
  });
  text.addEventListener("paste", (e) => {
    const files = [...(e.clipboardData?.files ?? [])];
    if (!files.some((f) => /^image\//.test(f.type))) return;
    e.preventDefault();
    void addImages(files);
  });
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.textContent = "🖼 Add picture";
  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = "image/png,image/jpeg,image/gif,image/webp";
  picker.hidden = true;
  addBtn.addEventListener("click", () => picker.click());
  picker.addEventListener("change", () => {
    const files = [...(picker.files ?? [])];
    picker.value = "";
    void addImages(files);
  });
  head.prepend(addBtn, picker);
  text.addEventListener("focus", () => (typing = true));
  text.addEventListener("blur", () => (typing = false));
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
    el: root,
    close() {
      text.value = "";
      pending = null;
      load.hidden = true;
      showPreview(false);
    },
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

const PICTURE = /^!\[([^\]]*)\]\(room-file:([A-Za-z0-9-]+)\)\s*$/;
/** The notes as Markdown, but a line that is just a shared picture shows the picture (a link the server signs, only for people in the room). */
function withPictures(value: string, imageLink?: (id: string) => Promise<string | null>): DocumentFragment {
  const out = document.createDocumentFragment();
  let chunk: string[] = [];
  const flush = (): void => {
    if (chunk.length) out.append(renderMarkdown(chunk.join("\n")));
    chunk = [];
  };
  for (const line of value.split("\n")) {
    const m = PICTURE.exec(line);
    if (!m || !imageLink) {
      chunk.push(line);
      continue;
    }
    flush();
    const img = document.createElement("img");
    img.className = "pad-picture";
    img.alt = m[1] || "picture";
    void imageLink(m[2]!).then((url) => {
      if (url) img.src = url;
      else img.replaceWith(document.createTextNode(`🖼 ${img.alt} (gone)`));
    });
    out.append(img);
  }
  flush();
  return out;
}
