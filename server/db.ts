import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { COMMON, FIRST_SPACE, SPACES, classroomSpace, isSpace, setClassrooms, type SpaceId } from "./spaces.ts";

// Four tables. Visitors: a name, the secret that reclaims it, a role, and
// where they last stood. Notes: sticky notes on a space's floor, kept until
// their author or an admin removes them. Comments: replies on a note.
// Classrooms: the course codes the admin has opened in building 155.
// Posts and post comments: each classroom's board (Q&A, Notices, Board).
// Audit: the admin's seven-day copy of the activity log (below). Bug
// reports: what visitors send from the settings dialog.
// Live positions never come here; they stay in server memory.

export type Role = "user" | "admin";
export interface Visitor {
  name: string;
  token: string;
  role: Role;
  passwordHash: string | null;
}
export interface Note {
  id: number;
  space: SpaceId;
  author: string;
  x: number;
  z: number;
  text: string;
  createdAt: string;
  /** When it disappears (UTC, "YYYY-MM-DD HH:MM:SS"). */
  expiresAt: string;
  comments: number;
}
export interface Comment {
  id: number;
  noteId: number;
  author: string;
  text: string;
  createdAt: string;
}

const path = process.env.DATABASE_PATH ?? "data/app.db";
mkdirSync(dirname(path), { recursive: true });
const db = new DatabaseSync(path);
db.exec("PRAGMA foreign_keys = ON");
// Write-ahead logging: each write (every note, join, and now the admin's log
// lines) costs one append instead of a full rewrite and sync, and readers
// don't wait on writers. NORMAL sync is safe with WAL (a crash can lose the
// last moment's writes, never corrupt the file). Wait up to 5 s for a lock.
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA synchronous = NORMAL");
db.exec("PRAGMA busy_timeout = 5000");

db.exec(`
  CREATE TABLE IF NOT EXISTS visitors (
    name       TEXT PRIMARY KEY COLLATE NOCASE,
    token      TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    space      TEXT NOT NULL,
    author     TEXT NOT NULL REFERENCES visitors(name) ON DELETE CASCADE,
    x          REAL NOT NULL,
    z          REAL NOT NULL,
    text       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS notes_by_space ON notes (space, created_at);
  CREATE TABLE IF NOT EXISTS comments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id    INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    author     TEXT NOT NULL REFERENCES visitors(name) ON DELETE CASCADE,
    text       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS posts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    space      TEXT NOT NULL,
    tab        TEXT NOT NULL,
    author     TEXT NOT NULL REFERENCES visitors(name) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    text       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS posts_by_board ON posts (space, tab, created_at);
  CREATE TABLE IF NOT EXISTS post_comments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    author     TEXT NOT NULL REFERENCES visitors(name) ON DELETE CASCADE,
    text       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS classrooms (
    code       TEXT PRIMARY KEY,
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Columns added after crit 8, and crit 8's poop columns removed: the poop is
// gone from the app (crit 9 turned the toilet into an ANU campus).
const columns = (): string[] =>
  (db.prepare("PRAGMA table_info(visitors)").all() as { name: string }[]).map((c) => c.name);
const wanted: Record<string, string> = {
  role: "TEXT NOT NULL DEFAULT 'user'",
  password_hash: "TEXT",
  last_space: "TEXT",
  last_x: "REAL",
  last_z: "REAL",
  last_note_at: "TEXT",
  last_comment_at: "TEXT",
  last_post_at: "TEXT",
  look: "TEXT",
};
for (const [col, type] of Object.entries(wanted)) {
  if (!columns().includes(col)) db.exec(`ALTER TABLE visitors ADD COLUMN ${col} ${type}`);
}
for (const col of ["poop_x", "poop_z", "pooped_at"]) {
  if (columns().includes(col)) db.exec(`ALTER TABLE visitors DROP COLUMN ${col}`);
}
// The classroom was first created under the wrong course code (COMP8280);
// it's COMP8020. Move anything saved under the old id.
db.exec("UPDATE notes SET space = 'comp8020' WHERE space = 'comp8280'");
db.exec("UPDATE visitors SET last_space = 'comp8020' WHERE last_space = 'comp8280'");
// Each classroom's two links the admin sets (the whiteboard, and the board to
// its right), added after crit 9.
const classroomCols = (db.prepare("PRAGMA table_info(classrooms)").all() as { name: string }[]).map((c) => c.name);
for (const col of ["board_url", "side_url"]) if (!classroomCols.includes(col)) db.exec(`ALTER TABLE classrooms ADD COLUMN ${col} TEXT`);
db.exec(`
  CREATE TABLE IF NOT EXISTS audit (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    at      TEXT NOT NULL,
    event   TEXT NOT NULL,
    who     TEXT,
    browser TEXT,
    role    TEXT,
    ip      TEXT,
    space   TEXT,
    details TEXT NOT NULL,
    content TEXT
  );
  CREATE INDEX IF NOT EXISTS audit_by_at ON audit (at);
  CREATE TABLE IF NOT EXISTS bug_reports (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    at         TEXT NOT NULL,
    author     TEXT NOT NULL,
    browser    TEXT,
    ip         TEXT,
    space      TEXT,
    user_agent TEXT,
    text       TEXT NOT NULL
  );
`);
// The first two classrooms: the one there's always been, and COMMON for anyone.
db.prepare("INSERT OR IGNORE INTO classrooms (code) VALUES (?), (?)").run("COMP8020", COMMON);

// --- visitors --------------------------------------------------------------

const visitorCols = "name, token, role, password_hash AS passwordHash";

export function findByName(name: string): Visitor | undefined {
  return db.prepare(`SELECT ${visitorCols} FROM visitors WHERE name = ?`).get(name) as Visitor | undefined;
}

export function findByToken(token: string): Visitor | undefined {
  return db.prepare(`SELECT ${visitorCols} FROM visitors WHERE token = ?`).get(token) as Visitor | undefined;
}

export function createVisitor(name: string, token: string): void {
  db.prepare("INSERT INTO visitors (name, token) VALUES (?, ?)").run(name, token);
}

/** Creates or updates an account that signs in with a password (test and admin accounts). */
export function upsertAccount(name: string, token: string, role: Role, passwordHash: string): void {
  db.prepare(
    `INSERT INTO visitors (name, token, role, password_hash) VALUES (?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET role = excluded.role, password_hash = excluded.password_hash`,
  ).run(name, token, role, passwordHash);
}

export function lastSpot(name: string): { space: SpaceId; x: number; z: number } {
  const row = db.prepare("SELECT last_space AS space, last_x AS x, last_z AS z FROM visitors WHERE name = ?").get(name) as
    | { space: string | null; x: number | null; z: number | null }
    | undefined;
  if (row && isSpace(row.space) && row.x !== null && row.z !== null) return { space: row.space, x: row.x, z: row.z };
  return { space: FIRST_SPACE, ...SPACES[FIRST_SPACE]!.spawn };
}

export function saveLastSpot(name: string, space: SpaceId, x: number, z: number): void {
  db.prepare("UPDATE visitors SET last_space = ?, last_x = ?, last_z = ? WHERE name = ?").run(space, x, z, name);
}

// --- notes -----------------------------------------------------------------

export const NOTE_COOLDOWN_SECONDS = 30;
export const COMMENT_COOLDOWN_SECONDS = 10;
// Five notes per person per space: a sixth replaces their oldest there, so no
// one can paper a floor.
export const NOTES_PER_SPACE = 5;
// A note lasts a month, then goes: queries stop showing it at once, and the
// rows (and their comments) are deleted within the hour.
export const NOTE_DAYS = 30;
const live = `n.created_at > datetime('now', '-${NOTE_DAYS} days')`;

const noteCols = `n.id, n.space, n.author, n.x, n.z, n.text, n.created_at AS createdAt,
  datetime(n.created_at, '+${NOTE_DAYS} days') AS expiresAt,
  (SELECT COUNT(*) FROM comments c WHERE c.note_id = n.id) AS comments`;

export function notesIn(space: SpaceId): Note[] {
  return db.prepare(`SELECT ${noteCols} FROM notes n WHERE n.space = ? AND ${live} ORDER BY n.created_at, n.id`).all(space) as unknown as Note[];
}

export function findNote(id: number): Note | undefined {
  return db.prepare(`SELECT ${noteCols} FROM notes n WHERE n.id = ? AND ${live}`).get(id) as Note | undefined;
}

/** How many notes this visitor already has in a space. */
export function noteCount(author: string, space: SpaceId): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM notes n WHERE author = ? AND space = ? AND ${live}`).get(author, space) as { n: number }).n;
}

/** Seconds left before this visitor may post again, or 0. */
function cooldownLeft(name: string, column: "last_note_at" | "last_comment_at" | "last_post_at", seconds: number): number {
  const row = db
    .prepare(`SELECT ${seconds} - (unixepoch('now') - unixepoch(${column})) AS left FROM visitors WHERE name = ?`)
    .get(name) as { left: number | null } | undefined;
  return Math.max(0, row?.left ?? 0);
}

export type AddNoteResult =
  | { ok: true; note: Note; replaced: number | null }
  | { ok: false; wait: number };

export function addNote(author: string, space: SpaceId, x: number, z: number, text: string): AddNoteResult {
  const wait = cooldownLeft(author, "last_note_at", NOTE_COOLDOWN_SECONDS);
  if (wait > 0) return { ok: false, wait };
  db.exec("BEGIN");
  try {
    let replaced: number | null = null;
    const mine = db
      .prepare(`SELECT id FROM notes n WHERE author = ? AND space = ? AND ${live} ORDER BY created_at, id`)
      .all(author, space) as { id: number }[];
    if (mine.length >= NOTES_PER_SPACE) {
      replaced = mine[0].id;
      db.prepare("DELETE FROM notes WHERE id = ?").run(replaced);
    }
    const { lastInsertRowid } = db
      .prepare("INSERT INTO notes (space, author, x, z, text) VALUES (?, ?, ?, ?, ?)")
      .run(space, author, x, z, text);
    db.prepare("UPDATE visitors SET last_note_at = datetime('now') WHERE name = ?").run(author);
    db.exec("COMMIT");
    return { ok: true, note: findNote(Number(lastInsertRowid))!, replaced };
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/** Deletes notes past their month (comments go with them). Returns how many. */
export function purgeExpiredNotes(): number {
  return Number(db.prepare(`DELETE FROM notes WHERE created_at <= datetime('now', '-${NOTE_DAYS} days')`).run().changes);
}

export function deleteNote(id: number): void {
  db.prepare("DELETE FROM notes WHERE id = ?").run(id);
}

// --- comments --------------------------------------------------------------

const commentCols = "id, note_id AS noteId, author, text, created_at AS createdAt";

export function commentsOn(noteId: number): Comment[] {
  return db.prepare(`SELECT ${commentCols} FROM comments WHERE note_id = ? ORDER BY created_at, id`).all(noteId) as unknown as Comment[];
}

export function findComment(id: number): Comment | undefined {
  return db.prepare(`SELECT ${commentCols} FROM comments WHERE id = ?`).get(id) as Comment | undefined;
}

export type AddCommentResult = { ok: true; comment: Comment } | { ok: false; wait: number };

export function addComment(author: string, noteId: number, text: string): AddCommentResult {
  const wait = cooldownLeft(author, "last_comment_at", COMMENT_COOLDOWN_SECONDS);
  if (wait > 0) return { ok: false, wait };
  const { lastInsertRowid } = db.prepare("INSERT INTO comments (note_id, author, text) VALUES (?, ?, ?)").run(noteId, author, text);
  db.prepare("UPDATE visitors SET last_comment_at = datetime('now') WHERE name = ?").run(author);
  return { ok: true, comment: findComment(Number(lastInsertRowid))! };
}

export function deleteComment(id: number): void {
  db.prepare("DELETE FROM comments WHERE id = ?").run(id);
}

// --- classrooms ------------------------------------------------------------

export interface Classroom {
  code: string;
  space: SpaceId;
  createdAt: string;
  /** What the whiteboard opens, if the admin has set it. */
  boardUrl: string | null;
  /** What the board right of the whiteboard opens, if set. */
  sideUrl: string | null;
}

export type ClassroomLink = "board" | "side";

export function classroomList(): Classroom[] {
  const rows = db
    .prepare("SELECT code, created_at AS createdAt, board_url AS boardUrl, side_url AS sideUrl FROM classrooms ORDER BY code = 'COMMON' DESC, code")
    .all() as unknown as Omit<Classroom, "space">[];
  return rows.map((r) => ({ ...r, space: classroomSpace(r.code) }));
}

/** Sets (or, with null, clears) one of a classroom's links. False if there's no such classroom. */
export function setClassroomLink(code: string, which: ClassroomLink, url: string | null): boolean {
  const col = which === "board" ? "board_url" : "side_url";
  return db.prepare(`UPDATE classrooms SET ${col} = ? WHERE code = ?`).run(url, code).changes > 0;
}

const syncClassrooms = (): void => setClassrooms(classroomList().map((c) => c.code));
syncClassrooms();

/** False if it already exists. */
export function addClassroom(code: string, by: string): boolean {
  const { changes } = db.prepare("INSERT OR IGNORE INTO classrooms (code, created_by) VALUES (?, ?)").run(code, by);
  syncClassrooms();
  return changes > 0;
}

/** Removes a classroom and the notes left in it; anyone saved there starts outside next time. */
export function removeClassroom(code: string): boolean {
  const space = classroomSpace(code);
  db.exec("BEGIN");
  try {
    const { changes } = db.prepare("DELETE FROM classrooms WHERE code = ?").run(code);
    db.prepare("DELETE FROM notes WHERE space = ?").run(space);
    db.prepare("DELETE FROM posts WHERE space = ?").run(space);
    db.prepare("UPDATE visitors SET last_space = NULL, last_x = NULL, last_z = NULL WHERE last_space = ?").run(space);
    db.exec("COMMIT");
    syncClassrooms();
    return changes > 0;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

// --- classroom boards --------------------------------------------------------
// Each classroom has a board with three tabs. Anyone may post in Q&A and
// Board and comment anywhere; only the admin (for now the only "staff") posts
// in Notices, which main.ts checks. Posts stay until their author or an admin
// removes them, or the classroom is closed.

export type BoardTab = "qa" | "notices" | "board";
export const BOARD_TABS: readonly BoardTab[] = ["qa", "notices", "board"];
export const POST_COOLDOWN_SECONDS = 30;

export interface Post {
  id: number;
  space: SpaceId;
  tab: BoardTab;
  author: string;
  title: string;
  text: string;
  createdAt: string;
  comments: number;
}
export interface PostComment {
  id: number;
  postId: number;
  author: string;
  text: string;
  createdAt: string;
}

const postCols = `p.id, p.space, p.tab, p.author, p.title, p.text, p.created_at AS createdAt,
  (SELECT COUNT(*) FROM post_comments c WHERE c.post_id = p.id) AS comments`;

export function postsIn(space: SpaceId, tab: BoardTab): Post[] {
  return db
    .prepare(`SELECT ${postCols} FROM posts p WHERE p.space = ? AND p.tab = ? ORDER BY p.created_at DESC, p.id DESC`)
    .all(space, tab) as unknown as Post[];
}

export function findPost(id: number): Post | undefined {
  return db.prepare(`SELECT ${postCols} FROM posts p WHERE p.id = ?`).get(id) as Post | undefined;
}

export type AddPostResult = { ok: true; post: Post } | { ok: false; wait: number };

export function addPost(author: string, space: SpaceId, tab: BoardTab, title: string, text: string): AddPostResult {
  const wait = cooldownLeft(author, "last_post_at", POST_COOLDOWN_SECONDS);
  if (wait > 0) return { ok: false, wait };
  const { lastInsertRowid } = db
    .prepare("INSERT INTO posts (space, tab, author, title, text) VALUES (?, ?, ?, ?, ?)")
    .run(space, tab, author, title, text);
  db.prepare("UPDATE visitors SET last_post_at = datetime('now') WHERE name = ?").run(author);
  return { ok: true, post: findPost(Number(lastInsertRowid))! };
}

export function deletePost(id: number): void {
  db.prepare("DELETE FROM posts WHERE id = ?").run(id);
}

const postCommentCols = "id, post_id AS postId, author, text, created_at AS createdAt";

export function postCommentsOn(postId: number): PostComment[] {
  return db
    .prepare(`SELECT ${postCommentCols} FROM post_comments WHERE post_id = ? ORDER BY created_at, id`)
    .all(postId) as unknown as PostComment[];
}

export function findPostComment(id: number): PostComment | undefined {
  return db.prepare(`SELECT ${postCommentCols} FROM post_comments WHERE id = ?`).get(id) as PostComment | undefined;
}

/** Comments on posts share the note comments' 10-second gap. */
export function addPostComment(author: string, postId: number, text: string): { ok: true; comment: PostComment } | { ok: false; wait: number } {
  const wait = cooldownLeft(author, "last_comment_at", COMMENT_COOLDOWN_SECONDS);
  if (wait > 0) return { ok: false, wait };
  const { lastInsertRowid } = db.prepare("INSERT INTO post_comments (post_id, author, text) VALUES (?, ?, ?)").run(postId, author, text);
  db.prepare("UPDATE visitors SET last_comment_at = datetime('now') WHERE name = ?").run(author);
  return { ok: true, comment: findPostComment(Number(lastInsertRowid))! };
}

export function deletePostComment(id: number): void {
  db.prepare("DELETE FROM post_comments WHERE id = ?").run(id);
}

// --- the admin's audit log -------------------------------------------------------
// A copy of the activity log the admin can read in the app for seven days:
// what people wrote (notes, comments, posts, and what was removed), sign-ins,
// admin actions and refusals, each with the IP it came from. Moves, emotes
// and chat aren't kept (chat is never stored). Deleted after seven days.

export const AUDIT_DAYS = 7;
export interface AuditEntry {
  id: number;
  at: string;
  event: string;
  who: string | null;
  browser: string | null;
  role: string | null;
  ip: string | null;
  space: string | null;
  details: Record<string, unknown>;
  content: string | null;
}

export function addAudit(e: Omit<AuditEntry, "id">): void {
  db.prepare("INSERT INTO audit (at, event, who, browser, role, ip, space, details, content) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    e.at,
    e.event,
    e.who,
    e.browser,
    e.role,
    e.ip,
    e.space,
    JSON.stringify(e.details),
    e.content,
  );
}

export interface AuditQuery {
  who?: string;
  space?: string;
  events?: string[];
  before?: number;
  limit: number;
}

/** Newest first, filtered; `before` pages back by id. */
export function auditEntries(q: AuditQuery): AuditEntry[] {
  const where: string[] = [`at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-${AUDIT_DAYS} days')`];
  const args: (string | number)[] = [];
  if (q.who) {
    where.push("who = ? COLLATE NOCASE");
    args.push(q.who);
  }
  if (q.space) {
    where.push("space = ?");
    args.push(q.space.toLowerCase());
  }
  if (q.events?.length) {
    where.push(`event IN (${q.events.map(() => "?").join(", ")})`);
    args.push(...q.events);
  }
  if (q.before) {
    where.push("id < ?");
    args.push(q.before);
  }
  const rows = db
    .prepare(`SELECT id, at, event, who, browser, role, ip, space, details, content FROM audit WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT ?`)
    .all(...args, q.limit) as unknown as (Omit<AuditEntry, "details"> & { details: string })[];
  return rows.map((r) => ({ ...r, details: JSON.parse(r.details) as Record<string, unknown> }));
}

export function purgeOldAudit(): number {
  const a = db.prepare(`DELETE FROM audit WHERE at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-${AUDIT_DAYS} days')`).run().changes;
  const b = db.prepare(`DELETE FROM bug_reports WHERE at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-${AUDIT_DAYS * 4} days')`).run().changes;
  return Number(a) + Number(b);
}

// --- bug reports -----------------------------------------------------------------
// Anyone joined can send one; only the admin reads them. Text only for now.

export interface BugReport {
  id: number;
  at: string;
  author: string;
  browser: string | null;
  ip: string | null;
  space: string | null;
  userAgent: string | null;
  text: string;
}
export const BUG_COOLDOWN_SECONDS = 60;

/** Adds a report, unless the author sent one in the last minute. */
export function addBugReport(r: Omit<BugReport, "id" | "at">): { ok: true; id: number } | { ok: false; wait: number } {
  const last = db.prepare("SELECT at FROM bug_reports WHERE author = ? ORDER BY id DESC LIMIT 1").get(r.author) as { at: string } | undefined;
  const since = last ? (Date.now() - Date.parse(last.at)) / 1000 : Infinity;
  if (since < BUG_COOLDOWN_SECONDS) return { ok: false, wait: Math.ceil(BUG_COOLDOWN_SECONDS - since) };
  const at = new Date().toISOString();
  const { lastInsertRowid } = db
    .prepare("INSERT INTO bug_reports (at, author, browser, ip, space, user_agent, text) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(at, r.author, r.browser, r.ip, r.space, r.userAgent, r.text);
  return { ok: true, id: Number(lastInsertRowid) };
}

export function bugReports(): BugReport[] {
  return db
    .prepare("SELECT id, at, author, browser, ip, space, user_agent AS userAgent, text FROM bug_reports ORDER BY id DESC LIMIT 500")
    .all() as unknown as BugReport[];
}

export function deleteBugReport(id: number): boolean {
  return db.prepare("DELETE FROM bug_reports WHERE id = ?").run(id).changes > 0;
}

// --- how people look ------------------------------------------------------------
// A figure (two bodies), skin, hair, top and bottom colours as indexes into
// fixed palettes (client/src/lookpicker.ts), and a hat. Indexes, not colours,
// so nobody can paint themselves an arbitrary colour or slip anything else in.

export interface Look {
  body: number;
  skin: number;
  hair: number;
  top: number;
  bottom: number;
  hat: number;
}
const LOOK_LIMITS: Record<keyof Look, number> = { body: 2, skin: 6, hair: 10, top: 10, bottom: 10, hat: 7 };

/** The look if every part is a whole number in its range, else null. */
export function validLook(v: unknown): Look | null {
  if (typeof v !== "object" || v === null) return null;
  const out: Partial<Look> = {};
  for (const [k, n] of Object.entries(LOOK_LIMITS) as [keyof Look, number][]) {
    const x = (v as Record<string, unknown>)[k];
    if (typeof x !== "number" || !Number.isInteger(x) || x < 0 || x >= n) return null;
    out[k] = x;
  }
  return out as Look;
}

export function lookOf(name: string): Look | null {
  const row = db.prepare("SELECT look FROM visitors WHERE name = ?").get(name) as { look: string | null } | undefined;
  return row?.look ? validLook(JSON.parse(row.look)) : null;
}

export function saveLook(name: string, look: Look): void {
  db.prepare("UPDATE visitors SET look = ? WHERE name = ?").run(JSON.stringify(look), name);
}
