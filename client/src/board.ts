// A board: the dialog a classroom's board (Q&A, Notices, Board), the Student
// Hub's or the lawn's opens. Its tabs come from the server (GET
// /api/board-config), each a list of posts. A post opens
// into its text and comments, and anyone can write a post or a comment. The
// server decides who may post in a staff-only tab (lecturers and staff) and who may
// delete what; this only hides the buttons a visitor couldn't use. A post can
// carry up to five files (200 MB each), which upload once the post is up.

import "./board.css";
import { ACCEPT, MAX_FILE_BYTES, isImage, sizeLabel } from "./uploads.ts";

export type BoardTab = string;

export interface BoardConfig {
  title: string;
  tabs: { id: BoardTab; label: string; staffOnly?: boolean }[];
  /** A line under the tabs, e.g. that the board is unofficial. */
  notice?: string;
  /** "grid": posts as thumbnails (first picture, else the title), two a row. */
  layout?: "grid";
}

export interface BoardPost {
  id: number;
  tab: BoardTab;
  author: string;
  title: string;
  text: string;
  createdAt: string;
  comments: number;
  pinned?: boolean;
  files?: { id: string; name: string; size: number }[];
  canDelete: boolean;
}

export interface BoardComment {
  id: number;
  author: string;
  text: string;
  createdAt: string;
  canDelete: boolean;
}

// The same limits as sticky notes.
const POST_WORDS = 500;
const POST_CHARS = 3000;
const COMMENT_WORDS = 100;
const COMMENT_CHARS = 600;
const TITLE_CHARS = 80;

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

type View = "list" | "post" | "write";

export function mountBoard(h: {
  /** Posts in one tab, newest first (a staff-only tab starts with a pinned note). */
  list(tab: BoardTab): Promise<BoardPost[]>;
  /** A post's comments, oldest first. */
  comments(postId: number): Promise<BoardComment[]>;
  /**
   * Posts, then uploads `files` onto it; resolves to an error message, or
   * null. `progress` names the file uploading and how far it has got (0..1).
   */
  post(tab: BoardTab, title: string, text: string, files: File[], progress: (name: string, done: number) => void): Promise<string | null>;
  /** Opens (downloads) one of a post's files; resolves to an error message, or null. */
  openFile(id: string): Promise<string | null>;
  /** A link that shows one of a post's pictures in place, or null. */
  imageLink(id: string): Promise<string | null>;
  comment(postId: number, text: string): Promise<string | null>;
  removePost(postId: number): Promise<string | null>;
  removeComment(commentId: number): Promise<string | null>;
}): {
  open(config: BoardConfig, canPostStaffOnly: boolean): void;
  /** A post or comment arrived or went, live: re-fetch whatever is on screen. */
  refresh(): void;
  close(): void;
  isOpen(): boolean;
} {
  const root = document.createElement("div");
  root.id = "board";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "board-title");

  const card = document.createElement("div");
  card.className = "board-card";

  const head = document.createElement("div");
  head.className = "board-head";
  const title = document.createElement("h2");
  title.id = "board-title";
  title.className = "board-title";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "board-close";
  closeBtn.textContent = "✕";
  closeBtn.setAttribute("aria-label", "Close");
  head.append(title, closeBtn);

  const tablist = document.createElement("div");
  tablist.className = "board-tabs";
  tablist.setAttribute("role", "tablist");
  tablist.setAttribute("aria-label", "Board sections");
  const tabButtons = new Map<BoardTab, HTMLButtonElement>();
  const boardNotice = document.createElement("p");
  boardNotice.className = "board-muted board-notice";

  const body = document.createElement("div");
  body.className = "board-body";
  body.id = "board-body";
  body.setAttribute("role", "tabpanel");

  const error = document.createElement("p");
  error.className = "board-error";
  error.setAttribute("role", "alert");

  card.append(head, tablist, boardNotice, body);
  root.append(card);
  document.body.append(root);

  // The three views are built once and swapped in, so a half-typed post or
  // comment survives a refresh: only the lists and comments are redrawn.
  const listView = document.createElement("div");
  const toolbar = document.createElement("div");
  toolbar.className = "board-toolbar";
  const writeBtn = document.createElement("button");
  writeBtn.type = "button";
  writeBtn.className = "board-primary";
  writeBtn.textContent = "Write a post";
  const noticeHint = document.createElement("p");
  noticeHint.className = "board-muted";
  toolbar.append(writeBtn, noticeHint);
  const posts = document.createElement("ul");
  posts.className = "board-list";
  listView.append(toolbar, posts);

  const postView = document.createElement("div");
  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className = "board-secondary";
  backBtn.textContent = "Back";
  const postTitle = document.createElement("h3");
  postTitle.className = "board-view-title";
  const postMeta = document.createElement("p");
  postMeta.className = "board-muted";
  const postText = document.createElement("p");
  postText.className = "board-text";
  const postFiles = document.createElement("ul");
  postFiles.className = "board-files";
  postFiles.setAttribute("aria-label", "Attached files");
  const postActions = document.createElement("div");
  postActions.className = "board-row";
  const commentList = document.createElement("div");
  commentList.className = "board-comments";
  const compose = document.createElement("div");
  compose.className = "board-compose";
  const commentBox = document.createElement("textarea");
  commentBox.maxLength = COMMENT_CHARS;
  commentBox.placeholder = "Add a comment…";
  commentBox.setAttribute("aria-label", "Comment");
  const commentRow = document.createElement("div");
  commentRow.className = "board-row";
  const commentCount = document.createElement("span");
  commentCount.className = "board-counter";
  const commentBtn = document.createElement("button");
  commentBtn.type = "button";
  commentBtn.className = "board-primary";
  commentBtn.textContent = "Comment";
  commentRow.append(commentCount, commentBtn);
  compose.append(commentBox, commentRow);
  postView.append(backBtn, postTitle, postMeta, postText, postFiles, postActions, commentList, compose);

  const writeView = document.createElement("form");
  writeView.className = "board-form";
  writeView.noValidate = true;
  const titleLabel = document.createElement("label");
  titleLabel.htmlFor = "board-post-title";
  titleLabel.textContent = "Title";
  const titleInput = document.createElement("input");
  titleInput.id = "board-post-title";
  titleInput.type = "text";
  titleInput.maxLength = TITLE_CHARS;
  titleInput.autocomplete = "off";
  const textLabel = document.createElement("label");
  textLabel.htmlFor = "board-post-text";
  textLabel.textContent = "Post";
  const textInput = document.createElement("textarea");
  textInput.id = "board-post-text";
  textInput.maxLength = POST_CHARS;
  const filesLabel = document.createElement("label");
  filesLabel.htmlFor = "board-post-files";
  filesLabel.textContent = "Files (optional: up to 5, 200 MB each; images, PDF, txt, md, docx, pptx, xlsx, zip)";
  const filesInput = document.createElement("input");
  filesInput.id = "board-post-files";
  filesInput.type = "file";
  filesInput.multiple = true;
  filesInput.accept = ACCEPT;
  const uploadStatus = document.createElement("p");
  uploadStatus.className = "board-muted";
  uploadStatus.setAttribute("role", "status");
  const writeRow = document.createElement("div");
  writeRow.className = "board-row";
  const writeCount = document.createElement("span");
  writeCount.className = "board-counter";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "board-secondary";
  cancelBtn.textContent = "Cancel";
  const submitBtn = document.createElement("button");
  submitBtn.type = "submit";
  submitBtn.className = "board-primary";
  submitBtn.textContent = "Post";
  writeRow.append(writeCount, cancelBtn, submitBtn);
  writeView.append(titleLabel, titleInput, textLabel, textInput, filesLabel, filesInput, uploadStatus, writeRow);

  let isOpen = false;
  let config: BoardConfig = { title: "", tabs: [] };
  let canStaff = false;
  let tab: BoardTab = "";
  let view: View = "list";
  let current: BoardPost | null = null;
  // Anything already asking for a Yes/No, and requests in flight, so a double
  // click can't send twice. A request that finishes after the visitor moved on
  // (another tab, another post) is dropped by checking its token.
  let confirming: string | null = null;
  let busy = false;
  let loadToken = 0;

  function setError(msg: string): void {
    error.textContent = msg;
  }

  function showView(next: View): void {
    view = next;
    setError("");
    body.replaceChildren(next === "list" ? listView : next === "post" ? postView : writeView, error);
  }

  function updateCounters(): void {
    const cw = wordCount(commentBox.value);
    const overC = cw > COMMENT_WORDS;
    commentCount.textContent = `${cw} / ${COMMENT_WORDS} words`;
    commentCount.classList.toggle("is-over", overC);
    commentBtn.disabled = busy || overC || commentBox.value.trim() === "";

    const pw = wordCount(textInput.value);
    const overP = pw > POST_WORDS;
    writeCount.textContent = `${pw} / ${POST_WORDS} words`;
    writeCount.classList.toggle("is-over", overP);
    submitBtn.disabled = busy || overP || titleInput.value.trim() === "" || textInput.value.trim() === "";
  }

  function syncTabs(): void {
    for (const [id, b] of tabButtons) {
      const on = id === tab;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
    }
    body.setAttribute("aria-labelledby", `board-tab-${tab}`);
    const def = config.tabs.find((t) => t.id === tab);
    const canWrite = !def?.staffOnly || canStaff;
    noticeHint.textContent = `Only lecturers and staff can post in ${def?.label ?? "this tab"}. You can read and comment.`;
    writeBtn.hidden = !canWrite;
    noticeHint.hidden = canWrite;
  }

  /** Two-step delete without window.confirm: "Delete" turns into "Delete? [Yes] [No]" in place. */
  function deleteControl(key: string, label: string, onYes: () => Promise<string | null>, after: () => void): HTMLElement {
    if (confirming !== key) {
      const del = document.createElement("button");
      del.type = "button";
      del.className = "board-link-danger";
      del.textContent = "Delete";
      del.setAttribute("aria-label", label);
      del.addEventListener("click", () => {
        confirming = key;
        setError("");
        rerenderCurrent();
      });
      return del;
    }
    const ask = document.createElement("span");
    ask.className = "board-confirm";
    const text = document.createElement("span");
    text.textContent = "Delete?";
    const yes = document.createElement("button");
    yes.type = "button";
    yes.className = "is-danger";
    yes.textContent = "Yes";
    yes.disabled = busy;
    const no = document.createElement("button");
    no.type = "button";
    no.textContent = "No";
    yes.addEventListener("click", () => {
      void run(onYes, () => {
        confirming = null;
        after();
      });
    });
    no.addEventListener("click", () => {
      confirming = null;
      rerenderCurrent();
    });
    ask.append(text, yes, no);
    return ask;
  }

  async function run(request: () => Promise<string | null>, onOk?: () => void): Promise<void> {
    if (busy) return;
    busy = true;
    setError("");
    updateCounters();
    try {
      const message = await request();
      if (message) {
        confirming = null;
        setError(message);
      } else onOk?.();
    } catch {
      confirming = null;
      setError("Something went wrong. Try again.");
    } finally {
      busy = false;
      if (isOpen) {
        rerenderCurrent();
        updateCounters();
      }
    }
  }

  // The last data fetched, so a Yes/No click can redraw without another round trip.
  let postsData: BoardPost[] = [];
  let commentsData: BoardComment[] = [];

  function renderPosts(): void {
    posts.replaceChildren(
      ...(postsData.length === 0
        ? [Object.assign(document.createElement("li"), { className: "board-empty", textContent: "Nothing here yet." })]
        : postsData.map((p) => {
            const li = document.createElement("li");
            const b = document.createElement("button");
            b.type = "button";
            b.className = "board-post" + (p.pinned ? " is-pinned" : "");
            const t = document.createElement("span");
            t.className = "board-post-title";
            t.textContent = (p.pinned ? "📌 " : "") + p.title;
            const meta = document.createElement("span");
            meta.className = "board-post-meta";
            // The pinned notice has no date and no comments, so it shows just its author.
            meta.textContent = p.pinned ? p.author : `${p.author} · ${p.createdAt} · ${p.comments} ${p.comments === 1 ? "comment" : "comments"}`;
            b.append(t, meta);
            // On a grid board (the lawn's posters) the first picture, if any,
            // stands for the post; without one the title shows, smaller.
            const pic = config.layout === "grid" ? p.files?.find((f) => isImage(f.name)) : undefined;
            if (pic) {
              const img = document.createElement("img");
              img.className = "board-thumb";
              img.alt = p.title;
              img.loading = "lazy";
              b.prepend(img);
              b.classList.add("has-thumb");
              void h.imageLink(pic.id).then((url) => {
                if (url) img.src = url;
                else img.remove();
              });
            } else if (config.layout === "grid") {
              // No picture: a tile the same size with the title in it, small.
              const tile = document.createElement("span");
              tile.className = "board-thumb is-text";
              tile.textContent = t.textContent;
              t.hidden = true;
              b.prepend(tile);
            }
            b.addEventListener("click", () => void openPost(p));
            li.append(b);
            return li;
          })),
    );
  }

  function renderComments(): void {
    commentList.replaceChildren(
      ...(commentsData.length === 0
        ? [Object.assign(document.createElement("p"), { className: "board-muted", textContent: "No comments yet." })]
        : commentsData.map((c) => {
            const row = document.createElement("div");
            row.className = "board-comment";
            const ch = document.createElement("div");
            ch.className = "board-comment-head";
            const who = document.createElement("strong");
            who.textContent = c.author;
            const when = document.createElement("span");
            when.textContent = c.createdAt;
            ch.append(who, when);
            if (c.canDelete) {
              ch.append(
                deleteControl(
                  `comment:${c.id}`,
                  `Delete comment by ${c.author}`,
                  () => h.removeComment(c.id),
                  () => void loadComments(),
                ),
              );
            }
            const t = document.createElement("p");
            t.className = "board-comment-text";
            t.textContent = c.text;
            row.append(ch, t);
            return row;
          })),
    );
  }

  function renderPostHead(): void {
    if (!current) return;
    postTitle.textContent = (current.pinned ? "📌 " : "") + current.title;
    postMeta.textContent = current.createdAt ? `${current.author} · ${current.createdAt}` : current.author;
    postText.textContent = current.text;
    postFiles.replaceChildren(
      ...(current.files ?? []).map((f) => {
        const li = document.createElement("li");
        // A picture shows in the post (click for full size); anything else is a download button.
        if (isImage(f.name)) {
          const a = document.createElement("a");
          a.className = "board-image";
          a.target = "_blank";
          a.rel = "noopener";
          a.title = `${f.name} · ${sizeLabel(f.size)} (opens full size)`;
          const img = document.createElement("img");
          img.alt = f.name;
          img.loading = "lazy";
          a.append(img);
          li.append(a);
          void h.imageLink(f.id).then((url) => {
            if (url) {
              img.src = url;
              a.href = url;
            } else a.replaceWith(document.createTextNode(`🖼 ${f.name} (couldn't load)`));
          });
          return li;
        }
        const b = document.createElement("button");
        b.type = "button";
        b.className = "board-secondary board-file";
        b.textContent = `📎 ${f.name} · ${sizeLabel(f.size)}`;
        b.addEventListener("click", () => void h.openFile(f.id).then((msg) => setError(msg ?? "")));
        li.append(b);
        return li;
      }),
    );
    postFiles.hidden = !current.files?.length;
    // A pinned notice has no comments to read or add, so its comment box is hidden.
    compose.hidden = !!current.pinned;
    commentList.hidden = !!current.pinned;
    postActions.replaceChildren();
    if (current.canDelete) {
      const post = current;
      postActions.append(
        deleteControl(
          `post:${post.id}`,
          "Delete this post",
          () => h.removePost(post.id),
          () => {
            void goBack();
          },
        ),
      );
    }
  }

  function rerenderCurrent(): void {
    if (view === "list") renderPosts();
    else if (view === "post") {
      renderPostHead();
      renderComments();
    }
  }

  async function loadPosts(): Promise<void> {
    const token = ++loadToken;
    const want = tab;
    try {
      const list = await h.list(want);
      if (token !== loadToken || !isOpen || tab !== want) return;
      postsData = list;
      if (view === "list") renderPosts();
    } catch {
      if (token === loadToken && isOpen) setError("Could not load the board. Try again.");
    }
  }

  async function loadComments(): Promise<void> {
    // The pinned notice is not a stored post (the server gives it id 0 and has
    // no comments for it), so there is nothing to fetch.
    if (!current || current.pinned) return;
    const token = ++loadToken;
    const id = current.id;
    try {
      const list = await h.comments(id);
      if (token !== loadToken || !isOpen || current?.id !== id) return;
      commentsData = list;
      if (view === "post") renderComments();
    } catch {
      if (token === loadToken && isOpen) setError("Could not load the comments. Try again.");
    }
  }

  async function openPost(p: BoardPost): Promise<void> {
    current = p;
    commentsData = [];
    confirming = null;
    commentBox.value = "";
    showView("post");
    renderPostHead();
    renderComments();
    updateCounters();
    backBtn.focus();
    await loadComments();
  }

  async function goBack(): Promise<void> {
    current = null;
    confirming = null;
    showView("list");
    renderPosts();
    const first = posts.querySelector<HTMLButtonElement>(".board-post");
    (first ?? (writeBtn.hidden ? tabButtons.get(tab) : writeBtn))?.focus();
    await loadPosts();
  }

  async function switchTab(next: BoardTab): Promise<void> {
    tab = next;
    current = null;
    confirming = null;
    postsData = [];
    syncTabs();
    showView("list");
    renderPosts();
    await loadPosts();
  }

  /** Rebuilds the tab buttons for the board being opened. */
  function buildTabs(): void {
    tabButtons.clear();
    tablist.replaceChildren();
    for (const t of config.tabs) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "board-tab";
      b.id = `board-tab-${t.id}`;
      b.setAttribute("role", "tab");
      b.setAttribute("aria-controls", "board-body");
      b.textContent = t.label;
      b.addEventListener("click", () => void switchTab(t.id));
      tabButtons.set(t.id, b);
      tablist.append(b);
    }
    tablist.hidden = config.tabs.length < 2;
  }

  tablist.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const tabs = config.tabs;
    const at = tabs.findIndex((t) => t.id === tab);
    const next = tabs[(at + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length]!;
    e.preventDefault();
    void switchTab(next.id).then(() => tabButtons.get(next.id)?.focus());
  });

  writeBtn.addEventListener("click", () => {
    showView("write");
    updateCounters();
    titleInput.focus();
  });
  cancelBtn.addEventListener("click", () => void goBack());
  backBtn.addEventListener("click", () => void goBack());
  titleInput.addEventListener("input", updateCounters);
  textInput.addEventListener("input", updateCounters);
  commentBox.addEventListener("input", updateCounters);

  writeView.addEventListener("submit", (e) => {
    e.preventDefault();
    const t = titleInput.value.trim();
    const x = textInput.value.trim();
    if (!t || !x || submitBtn.disabled) return;
    const files = [...(filesInput.files ?? [])];
    if (files.length > 5) return setError("Up to five files on a post.");
    if (files.some((f) => f.size > MAX_FILE_BYTES)) return setError("Files can be up to 200 MB.");
    void run(
      () =>
        h.post(tab, t, x, files, (name, done) => {
          uploadStatus.textContent = `Uploading ${name}… ${Math.round(done * 100)}%`;
        }),
      () => {
        titleInput.value = "";
        textInput.value = "";
        filesInput.value = "";
        uploadStatus.textContent = "";
        void goBack();
      },
    );
  });
  commentBtn.addEventListener("click", () => {
    if (!current || commentBtn.disabled) return;
    const id = current.id;
    const text = commentBox.value.trim();
    if (!text) return;
    void run(
      () => h.comment(id, text),
      () => {
        commentBox.value = "";
        updateCounters();
        void loadComments();
      },
    );
  });

  function hide(): void {
    if (!isOpen) return;
    isOpen = false;
    root.hidden = true;
    loadToken++;
    current = null;
    confirming = null;
    setError("");
    (document.activeElement as HTMLElement | null)?.blur();
  }

  closeBtn.addEventListener("click", hide);
  root.addEventListener("click", (e) => {
    if (e.target === root) hide();
  });
  root.addEventListener("keydown", (e) => {
    // Keep game keys (WASD, E, Q) out of the scene while the board is open.
    e.stopPropagation();
    if (e.key !== "Escape") return;
    e.preventDefault();
    // Esc in the post view or the form goes back to the list first.
    if (view === "list") hide();
    else void goBack();
  });

  return {
    open(next, canPostStaffOnly) {
      config = next;
      canStaff = canPostStaffOnly;
      title.textContent = config.title;
      boardNotice.textContent = config.notice ?? "";
      boardNotice.hidden = !config.notice;
      posts.classList.toggle("is-grid", config.layout === "grid");
      buildTabs();
      tab = config.tabs[0]?.id ?? "";
      current = null;
      confirming = null;
      postsData = [];
      commentsData = [];
      titleInput.value = "";
      textInput.value = "";
      filesInput.value = "";
      uploadStatus.textContent = "";
      commentBox.value = "";
      isOpen = true;
      root.hidden = false;
      syncTabs();
      showView("list");
      renderPosts();
      updateCounters();
      tabButtons.get(tab)?.focus();
      void loadPosts();
    },
    refresh() {
      if (!isOpen) return;
      // Re-fetch what is on screen. The write form and the comment box are
      // never touched, so nothing half-typed is lost.
      if (view === "post") void loadComments();
      else if (view === "list") void loadPosts();
    },
    close: hide,
    isOpen: () => isOpen,
  };
}
