// Reading a sticky note: author, text, its comments, and a box to add one.
// A modal dialog over the scene — self-mounts to <body>, hidden until open().

import "./notepanel.css";
import { canberraDay, canberraTime, parseUtc, sameCanberraDay } from "./when.ts";

export interface NoteView {
  id: number;
  author: string;
  text: string;
  createdAt: string;
  /** When the note disappears (UTC, "YYYY-MM-DD HH:MM:SS"). */
  expiresAt: string;
  canDelete: boolean;
}

/** "Disappears on 16 Nov" (or "today"), in Canberra time. */
function goneOn(utc: string): string {
  const when = parseUtc(utc);
  if (!when) return "";
  return sameCanberraDay(when, new Date()) ? "Disappears today" : `Disappears on ${canberraDay(when)}`;
}

export interface CommentView {
  id: number;
  author: string;
  text: string;
  createdAt: string;
  canDelete: boolean;
  hearts: number;
  hearted: boolean;
  /** False on your own comment. */
  canHeart: boolean;
}

/** What a report is about: who wrote it, and a short description of the item. */
export interface ReportAbout {
  name: string;
  item: string;
}

/** The first 80 characters, for a report's description. */
const snippet = (text: string): string => (text.length > 80 ? `${text.slice(0, 80)}…` : text);

const MAX_CHARS = 600;
const MAX_WORDS = 100;

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

export function mountNotePanel(h: {
  onComment(noteId: number, text: string): Promise<void>;
  onDeleteNote(noteId: number): Promise<void>;
  onDeleteComment(noteId: number, commentId: number): Promise<void>;
  onHeart(noteId: number, commentId: number): Promise<void>;
  onReport(about: ReportAbout): void;
}): {
  open(note: NoteView, comments: CommentView[]): void;
  close(): void;
  isOpen(): boolean;
  openNoteId(): number | null;
  setComments(noteId: number, comments: CommentView[]): void;
  error(msg: string): void;
} {
  const root = document.createElement("div");
  root.id = "note-panel";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "Sticky note");

  const card = document.createElement("div");
  card.className = "note-card";

  const head = document.createElement("div");
  head.className = "note-head";
  const headInfo = document.createElement("div");
  const author = document.createElement("span");
  author.className = "note-author";
  const date = document.createElement("span");
  date.className = "note-date";
  headInfo.append(author, document.createTextNode(" "), date);
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "note-close";
  closeBtn.textContent = "✕";
  closeBtn.setAttribute("aria-label", "Close");
  head.append(headInfo, closeBtn);

  const text = document.createElement("p");
  text.className = "note-text";

  const deleteNoteBtn = document.createElement("button");
  deleteNoteBtn.type = "button";
  deleteNoteBtn.className = "note-delete";
  deleteNoteBtn.textContent = "Delete note";

  const reportNoteBtn = document.createElement("button");
  reportNoteBtn.type = "button";
  reportNoteBtn.className = "note-report";
  reportNoteBtn.textContent = "Report";

  const comments = document.createElement("div");
  comments.className = "note-comments";

  const compose = document.createElement("div");
  compose.className = "note-compose";
  const textarea = document.createElement("textarea");
  textarea.maxLength = MAX_CHARS;
  textarea.placeholder = "Add a comment…";
  textarea.setAttribute("aria-label", "Comment");
  const composeRow = document.createElement("div");
  composeRow.className = "note-compose-row";
  const counter = document.createElement("span");
  counter.className = "note-counter";
  const postBtn = document.createElement("button");
  postBtn.type = "button";
  postBtn.className = "note-post";
  postBtn.textContent = "Post";
  composeRow.append(counter, postBtn);
  compose.append(textarea, composeRow);

  const error = document.createElement("p");
  error.className = "note-error";

  card.append(head, text, deleteNoteBtn, reportNoteBtn, comments, compose, error);
  root.append(card);
  document.body.append(root);

  let open = false;
  let current: NoteView | null = null;
  let currentComments: CommentView[] = [];
  /** Comments whose heart request is still going, so a double tap counts once. */
  const hearting = new Set<number>();

  function setError(msg: string): void {
    error.textContent = msg;
  }

  function updateCounter(): void {
    const words = wordCount(textarea.value);
    counter.textContent = `${words} / ${MAX_WORDS} words`;
    const over = words > MAX_WORDS;
    counter.classList.toggle("is-over", over);
    postBtn.disabled = over || textarea.value.trim() === "";
  }
  textarea.addEventListener("input", updateCounter);

  function renderComments(): void {
    comments.replaceChildren();
    if (currentComments.length === 0) {
      const empty = document.createElement("p");
      empty.className = "note-empty";
      empty.textContent = "No comments yet.";
      comments.append(empty);
      return;
    }
    for (const c of currentComments) {
      const row = document.createElement("div");
      row.className = "note-comment";
      const rowHead = document.createElement("div");
      rowHead.className = "note-comment-head";
      const a = document.createElement("span");
      a.className = "note-comment-author";
      a.textContent = c.author;
      const d = document.createElement("span");
      d.textContent = canberraTime(c.createdAt);
      rowHead.append(a, d);
      const heart = document.createElement("button");
      heart.type = "button";
      heart.className = "comment-heart" + (c.hearted ? " is-on" : "");
      heart.textContent = `${c.hearted ? "♥" : "♡"} ${c.hearts}`;
      heart.setAttribute("aria-pressed", String(c.hearted));
      heart.setAttribute("aria-label", `Heart this comment, ${c.hearts} ${c.hearts === 1 ? "heart" : "hearts"}`);
      heart.disabled = !c.canHeart || hearting.has(c.id);
      heart.addEventListener("click", () => {
        if (!current || hearting.has(c.id)) return;
        const noteId = current.id;
        hearting.add(c.id);
        heart.disabled = true;
        h.onHeart(noteId, c.id)
          .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
          .finally(() => {
            hearting.delete(c.id);
            // The refetch re-rendered the list while this was still in flight,
            // so its new button came out disabled: draw it again, free.
            if (current?.id === noteId) renderComments();
          });
      });
      rowHead.append(heart);
      if (!c.canDelete) {
        const report = document.createElement("button");
        report.type = "button";
        report.className = "comment-report";
        report.textContent = "Report";
        report.setAttribute("aria-label", `Report ${c.author}'s comment`);
        report.addEventListener("click", () => h.onReport({ name: c.author, item: `${c.author}'s comment on a sticky note: "${snippet(c.text)}"` }));
        rowHead.append(report);
      }
      if (c.canDelete) {
        const del = document.createElement("button");
        del.type = "button";
        del.className = "comment-delete";
        del.textContent = "Delete";
        confirmDelete(del, () => {
          if (!current) return;
          const noteId = current.id;
          h.onDeleteComment(noteId, c.id)
            .then(() => {
              if (current?.id !== noteId) return;
              currentComments = currentComments.filter((x) => x.id !== c.id);
              renderComments();
            })
            .catch((err: unknown) => {
              setError(err instanceof Error ? err.message : String(err));
              renderComments();
            });
        });
        rowHead.append(del);
      }
      const t = document.createElement("p");
      t.className = "note-comment-text";
      t.textContent = c.text;
      row.append(rowHead, t);
      comments.append(row);
    }
  }

  /**
   * Delete in two steps, as on the boards: the button turns into
   * "Delete? Yes No" in place, and only Yes deletes.
   */
  function confirmDelete(button: HTMLButtonElement, onYes: () => void): void {
    button.addEventListener("click", () => {
      const ask = document.createElement("span");
      ask.className = "note-confirm";
      const text = document.createElement("span");
      text.textContent = "Delete?";
      const yes = document.createElement("button");
      yes.type = "button";
      yes.className = "is-danger";
      yes.textContent = "Yes";
      const no = document.createElement("button");
      no.type = "button";
      no.textContent = "No";
      ask.append(text, yes, no);
      yes.addEventListener("click", () => {
        yes.disabled = true;
        onYes();
      });
      no.addEventListener("click", () => {
        ask.replaceWith(button);
        button.focus();
      });
      button.replaceWith(ask);
      no.focus();
    });
  }

  function hide(): void {
    if (!open) return;
    open = false;
    current = null;
    root.classList.remove("is-open");
    document.removeEventListener("keydown", onKeydown);
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      hide();
    }
  }

  closeBtn.addEventListener("click", hide);
  root.addEventListener("pointerdown", (e) => {
    if (e.target === root) hide();
  });

  reportNoteBtn.addEventListener("click", () => {
    if (current) h.onReport({ name: current.author, item: `${current.author}'s sticky note: "${snippet(current.text)}"` });
  });

  confirmDelete(deleteNoteBtn, () => {
    if (!current) return;
    const noteId = current.id;
    h.onDeleteNote(noteId)
      .then(() => {
        if (current?.id === noteId) hide();
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  });

  postBtn.addEventListener("click", () => {
    if (!current) return;
    const noteId = current.id;
    const body = textarea.value.trim();
    if (!body) return;
    postBtn.disabled = true;
    h.onComment(noteId, body)
      .then(() => {
        if (current?.id !== noteId) return;
        textarea.value = "";
        updateCounter();
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => updateCounter());
  });

  return {
    open(note: NoteView, initialComments: CommentView[]): void {
      open = true;
      current = note;
      currentComments = initialComments;
      author.textContent = note.author;
      date.textContent = `${canberraTime(note.createdAt)} · ${goneOn(note.expiresAt)}`;
      date.title = "Sticky notes disappear a month after they're stuck.";
      text.textContent = note.text;
      // A "Delete?" left over from the last note goes back to its button.
      card.querySelector(":scope > .note-confirm")?.replaceWith(deleteNoteBtn);
      deleteNoteBtn.hidden = !note.canDelete;
      reportNoteBtn.hidden = note.canDelete;
      hearting.clear();
      textarea.value = "";
      setError("");
      updateCounter();
      renderComments();
      root.classList.add("is-open");
      document.addEventListener("keydown", onKeydown);
      // Open at the top, on the note itself: focusing the comment box at the
      // bottom used to scroll the card down past the text.
      textarea.focus({ preventScroll: true });
      card.scrollTop = 0;
    },
    close(): void {
      hide();
    },
    isOpen(): boolean {
      return open;
    },
    openNoteId(): number | null {
      return current?.id ?? null;
    },
    setComments(noteId: number, newComments: CommentView[]): void {
      if (current?.id !== noteId) return;
      currentComments = newComments;
      renderComments();
    },
    error(msg: string): void {
      setError(msg);
    },
  };
}
