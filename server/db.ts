import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { COMMON, FIRST_SPACE, SPACES, classroomSpace, isSpace, setClassrooms, type SpaceId } from "./spaces.ts";

// Four tables. Visitors: a name, the secret that reclaims it, a role, and
// where they last stood. Notes: sticky notes on a space's floor, kept until
// their author or an admin removes them. Comments: replies on a note.
// Classrooms: the course codes the admin has opened in building 155.
// Posts and post comments: each classroom's board (Q&A, Notices, Board).
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
}

export function classroomList(): Classroom[] {
  const rows = db.prepare("SELECT code, created_at AS createdAt FROM classrooms ORDER BY code = 'COMMON' DESC, code").all() as unknown as {
    code: string;
    createdAt: string;
  }[];
  return rows.map((r) => ({ ...r, space: classroomSpace(r.code) }));
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
