// Reading a sticky note: author, text, its comments, and a box to add one.
// A modal dialog over the scene — self-mounts to <body>, hidden until open().

import "./notepanel.css";

export interface NoteView {
  id: number;
  author: string;
  text: string;
  createdAt: string;
  canDelete: boolean;
}

export interface CommentView {
  id: number;
  author: string;
  text: string;
  createdAt: string;
  canDelete: boolean;
}

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

  card.append(head, text, deleteNoteBtn, comments, compose, error);
  root.append(card);
  document.body.append(root);

  let open = false;
  let current: NoteView | null = null;
  let currentComments: CommentView[] = [];

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
      d.textContent = c.createdAt;
      rowHead.append(a, d);
      if (c.canDelete) {
        const del = document.createElement("button");
        del.type = "button";
        del.className = "comment-delete";
        del.textContent = "Delete";
        del.addEventListener("click", () => {
          if (!current) return;
          const noteId = current.id;
          h.onDeleteComment(noteId, c.id)
            .then(() => {
              if (current?.id !== noteId) return;
              currentComments = currentComments.filter((x) => x.id !== c.id);
              renderComments();
            })
            .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
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

  deleteNoteBtn.addEventListener("click", () => {
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
      date.textContent = note.createdAt;
      text.textContent = note.text;
      deleteNoteBtn.hidden = !note.canDelete;
      textarea.value = "";
      setError("");
      updateCounter();
      renderComments();
      root.classList.add("is-open");
      document.addEventListener("keydown", onKeydown);
      textarea.focus();
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
