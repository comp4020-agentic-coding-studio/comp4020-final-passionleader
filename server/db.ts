import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { FIRST_SPACE, SPACES, isSpace, type SpaceId } from "./spaces.ts";

// Three tables. Visitors: a name, the secret that reclaims it, a role, and
// where they last stood. Notes: sticky notes on a space's floor, kept until
// their author or an admin removes them. Comments: replies on a note.
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
  return { space: FIRST_SPACE, ...SPACES[FIRST_SPACE].spawn };
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

const noteCols = `n.id, n.space, n.author, n.x, n.z, n.text, n.created_at AS createdAt,
  (SELECT COUNT(*) FROM comments c WHERE c.note_id = n.id) AS comments`;

export function notesIn(space: SpaceId): Note[] {
  return db.prepare(`SELECT ${noteCols} FROM notes n WHERE n.space = ? ORDER BY n.created_at, n.id`).all(space) as unknown as Note[];
}

export function findNote(id: number): Note | undefined {
  return db.prepare(`SELECT ${noteCols} FROM notes n WHERE n.id = ?`).get(id) as Note | undefined;
}

/** How many notes this visitor already has in a space. */
export function noteCount(author: string, space: SpaceId): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM notes WHERE author = ? AND space = ?").get(author, space) as { n: number }).n;
}

/** Seconds left before this visitor may post again, or 0. */
function cooldownLeft(name: string, column: "last_note_at" | "last_comment_at", seconds: number): number {
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
      .prepare("SELECT id FROM notes WHERE author = ? AND space = ? ORDER BY created_at, id")
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
