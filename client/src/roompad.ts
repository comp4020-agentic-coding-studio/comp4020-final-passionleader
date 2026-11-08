import "./roompad.css";
import { renderMarkdown } from "./markdown.ts";

// A meeting room's shared notes (plan 39): one Markdown text for everyone
// inside. Typing sends it (a moment after you stop); the server keeps the
// last write and passes it to the others; it goes when the room empties,
// unless someone saves it. While you're typing, someone else's change waits
// behind a "load" button so it doesn't eat your words. The room window
// (roompanel.ts) shows this as its Notes view (plan 83). A picture dropped or
// pasted on it (plan 37) is shared with the room like 📎 and goes in as a line
// of its own, ![name](room-file:ID), which the rendered notes show as the
// picture; it goes with the room's other files when the room empties.
//
// It reads like Typora: the rendered Markdown is the main view and follows
// your typing (about 120 ms behind). The <textarea> stays the one source of
// truth (the sync, the 5000 limit, the "load" hold-back and the picture flow
// all work on it). On a wide screen (900 px and up) the rendered notes sit
// beside it, scrolling together by proportion. On a narrow one only the
// rendered notes show: tap a block and the editor opens with the caret on that
// block's line; leaving the field (blur, or Esc) goes back to the rendered notes.

const WIDE = "(min-width: 900px)";
/** The longest the notes can be (the server's limit too). */
const MAX = 5000;
/** How long a shared picture's link is trusted before asking for a fresh one. */
const LINK_MS = 3 * 60 * 1000;

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
  const text = document.createElement("textarea");
  text.className = "pad-editor";
  text.maxLength = MAX;
  text.placeholder =
    "Agenda, who does what, links… Markdown works. Everyone in the room sees this; it goes when the room empties (Save notes in the room menu keeps a copy for you).";
  text.setAttribute("aria-label", "Shared notes, Markdown source");
  text.spellcheck = false;
  const view = document.createElement("div");
  view.className = "pad-view";
  view.tabIndex = 0;
  view.setAttribute("aria-label", "Shared notes, rendered. Press Enter or tap to edit.");
  const body = document.createElement("div");
  body.className = "pad-body";
  body.append(text, view);
  const foot = document.createElement("p");
  foot.className = "pad-foot";
  const load = document.createElement("button");
  load.type = "button";
  load.hidden = true;
  root.append(head, body, foot, load);

  const wide = window.matchMedia(WIDE);
  let typing = false;
  let timer = 0;
  let renderTimer = 0;
  let pending: { text: string; by: string | null } | null = null;
  /** Pictures on their way to the room: the line the caret was on, and the file's name. */
  const uploading = new Set<{ line: number; name: string }>();

  // --- shared pictures: one link per id, so a re-render on every key never refetches ---
  const links = new Map<string, { url: string | null; at: number }>();
  const asking = new Map<string, Promise<string | null>>();
  function resolve(id: string): Promise<string | null> {
    let p = asking.get(id);
    if (!p) {
      p = opts.imageLink(id).then(
        (url) => {
          links.set(id, { url, at: Date.now() });
          asking.delete(id);
          return url;
        },
        () => {
          links.set(id, { url: null, at: Date.now() });
          asking.delete(id);
          return null;
        },
      );
      asking.set(id, p);
    }
    return p;
  }
  function picture(alt: string, id: string): Node {
    const img = document.createElement("img");
    img.className = "pad-picture";
    img.alt = alt || "picture";
    const gone = (): void => {
      links.delete(id);
      img.replaceWith(document.createTextNode(`🖼 ${img.alt} (gone)`));
    };
    img.addEventListener("error", gone);
    const hit = links.get(id);
    if (hit && Date.now() - hit.at < (hit.url ? LINK_MS : 20_000)) {
      if (hit.url) img.src = hit.url;
      else queueMicrotask(gone);
    } else
      void resolve(id).then((url) => {
        if (url) img.src = url;
        else gone();
      });
    return img;
  }

  // --- the rendered notes ---------------------------------------------------------
  const lineAt = (offset: number): number => text.value.slice(0, offset).split("\n").length - 1;

  function render(): void {
    window.clearTimeout(renderTimer);
    const keep = view.scrollTop;
    const frag = renderMarkdown(text.value, { headings: 5, topLevel: 1, rich: true, lines: true, picture });
    if (!text.value.trim() && uploading.size === 0) {
      const empty = document.createElement("p");
      empty.className = "pad-empty";
      empty.textContent = "Nothing yet. Type here, in Markdown; it shows up formatted as you go.";
      view.replaceChildren(empty);
      return;
    }
    view.replaceChildren(frag);
    for (const u of uploading) {
      const p = document.createElement("p");
      p.className = "pad-uploading";
      p.textContent = `Uploading ${u.name}…`;
      let anchor: Element | null = null;
      for (const el of view.children) {
        if (Number((el as HTMLElement).dataset.line ?? "0") <= u.line) anchor = el;
        else break;
      }
      if (anchor) anchor.after(p);
      else view.prepend(p);
    }
    view.scrollTop = keep;
    if (wide.matches && document.activeElement === text) syncScroll(text, view);
  }
  const renderSoon = (): void => {
    window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(render, 120);
  };

  // --- wide: the two columns scroll together by proportion ---------------------------
  let ignore: { el: HTMLElement; at: number } | null = null;
  function syncScroll(from: HTMLElement, to: HTMLElement): void {
    if (!wide.matches) return;
    const room = from.scrollHeight - from.clientHeight;
    const target = room > 0 ? (from.scrollTop / room) * (to.scrollHeight - to.clientHeight) : 0;
    if (Math.abs(to.scrollTop - target) < 1) return;
    ignore = { el: to, at: Date.now() };
    to.scrollTop = target;
  }
  const follow = (from: HTMLElement, to: HTMLElement) => (): void => {
    if (ignore && ignore.el === from && Date.now() - ignore.at < 150) return;
    syncScroll(from, to);
  };
  text.addEventListener("scroll", follow(text, view));
  view.addEventListener("scroll", follow(view, text));

  // --- narrow: the rendered notes, and the editor only while you are in a block ---------
  function openEditor(line: number | null): void {
    root.classList.add("pad-editing");
    text.focus({ preventScroll: true });
    const lines = text.value.split("\n");
    const n = line === null ? lines.length - 1 : Math.min(line, lines.length - 1);
    // The caret goes to the end of that block's first line.
    let at = 0;
    for (let k = 0; k < n; k++) at += lines[k]!.length + 1;
    at += lines[n]?.length ?? 0;
    text.setSelectionRange(at, at);
    const total = Math.max(1, lines.length);
    text.scrollTop = Math.max(0, (n / total) * text.scrollHeight - text.clientHeight / 3);
  }
  function closeEditor(): void {
    if (!root.classList.contains("pad-editing")) return;
    root.classList.remove("pad-editing");
    render();
    // Show the block the caret was in.
    const line = lineAt(text.selectionStart ?? 0);
    let anchor: HTMLElement | null = null;
    for (const el of view.children) {
      if (Number((el as HTMLElement).dataset.line ?? "-1") <= line) anchor = el as HTMLElement;
      else break;
    }
    anchor?.scrollIntoView({ block: "nearest" });
  }
  view.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("a")) return; // a link is a link
    if (!(window.getSelection()?.isCollapsed ?? true)) return; // selecting text to copy it
    const block = t.closest<HTMLElement>("[data-line]");
    openEditor(block ? Number(block.dataset.line) : null);
  });
  view.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target === view) {
      e.preventDefault();
      openEditor(null);
    }
  });
  // The room window asks for focus on opening the notes: the editor on a wide screen; on a narrow one the rendered
  // notes (the phone's keyboard would otherwise cover them), so Esc still steps back to the menu.
  root.addEventListener("pad-focus", () => (wide.matches ? text : view).focus({ preventScroll: true }));

  /** Puts `line` in at the cursor, on a line of its own, and sends the notes. */
  function insertLine(line: string): void {
    const at = text.selectionStart ?? text.value.length;
    const before = text.value.slice(0, at);
    const after = text.value.slice(at);
    const value = `${before}${before && !before.endsWith("\n") ? "\n" : ""}${line}\n${after}`.slice(0, MAX);
    text.value = value;
    opts.onChange(value);
    render();
    foot.textContent = "Saved for the room.";
  }
  async function addImages(files: File[]): Promise<void> {
    for (const f of files.filter((f) => /^image\//.test(f.type))) {
      foot.textContent = `Sharing ${f.name}…`;
      const mine = { line: lineAt(text.selectionStart ?? text.value.length), name: f.name };
      uploading.add(mine);
      render();
      const r = await opts.onImage(f);
      uploading.delete(mine);
      if (typeof r === "string") {
        render();
        foot.textContent = r;
        return;
      }
      insertLine(`![${f.name.replace(/[[\]()]/g, "")}](room-file:${r.id})`);
    }
  }
  for (const zone of [text, view] as HTMLElement[]) {
    zone.addEventListener("dragover", (e: DragEvent) => {
      if ([...(e.dataTransfer?.items ?? [])].some((i) => i.kind === "file")) e.preventDefault();
    });
    zone.addEventListener("drop", (e: DragEvent) => {
      const files = [...(e.dataTransfer?.files ?? [])];
      if (!files.length) return;
      e.preventDefault();
      void addImages(files);
    });
  }
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
  /** Sends what's typed now rather than after the pause, so nothing unsent is left to be overwritten. */
  function flush(): void {
    if (!timer) return;
    window.clearTimeout(timer);
    timer = 0;
    opts.onChange(text.value);
    foot.textContent = "Saved for the room.";
  }
  text.addEventListener("blur", () => {
    typing = false;
    // Leaving the field sends at once: a room edit arriving in the pause after it would have
    // replaced the last words before they were sent (audit, 11/8).
    flush();
    // On a narrow screen leaving the field returns to the rendered notes.
    if (!wide.matches) closeEditor();
  });
  // A screen that narrows while the field isn't in use goes back to the rendered notes (the
  // editor is hidden on a narrow screen unless you're in it).
  wide.addEventListener("change", () => {
    if (wide.matches) root.classList.remove("pad-editing");
    else if (document.activeElement !== text) closeEditor();
  });
  function onInput(): void {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = 0;
      opts.onChange(text.value);
      foot.textContent = "Saved for the room.";
    }, 400);
    foot.textContent = "…";
    renderSoon();
  }
  text.addEventListener("input", onInput);
  text.addEventListener("keydown", (e) => {
    // Tab writes two spaces instead of leaving the field (Shift+Tab still leaves, for the keyboard's sake).
    if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const a = text.selectionStart;
      const b = text.selectionEnd;
      if (text.value.length - (b - a) + 2 > MAX) return;
      // execCommand keeps the field's undo history and fires "input" itself.
      if (!document.execCommand("insertText", false, "  ")) {
        text.setRangeText("  ", a, b, "end");
        onInput();
      }
    } else if (e.key === "Escape" && !wide.matches && root.classList.contains("pad-editing")) {
      // On a narrow screen Esc leaves the editor, back to the rendered notes; the next Esc steps back to the menu.
      e.preventDefault();
      e.stopPropagation();
      closeEditor(); // shows the rendered notes again (the view is hidden while editing, so it can't take focus before)
      view.focus({ preventScroll: true });
    }
  });
  load.addEventListener("click", () => {
    if (pending) apply(pending.text, pending.by);
    pending = null;
    load.hidden = true;
  });

  function apply(value: string, by: string | null): void {
    // Newer text in: a version held back earlier is out of date, so its "load" button goes (audit, 11/8).
    pending = null;
    load.hidden = true;
    text.value = value;
    foot.textContent = by ? `Last edited by ${by}.` : "";
    render();
  }
  render();

  return {
    el: root,
    close() {
      text.value = "";
      pending = null;
      load.hidden = true;
      uploading.clear();
      root.classList.remove("pad-editing");
      render();
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
