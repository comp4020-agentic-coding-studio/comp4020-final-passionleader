import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { FIRST_SPACE, SPACES, classroomSpace, isSpace, setClassrooms, type SpaceId } from "./spaces.ts";

// Four tables. Visitors: a name, the secret that reclaims it, a role, and
// where they last stood. Notes: sticky notes on a space's floor, kept until
// their author or an admin removes them. Comments: replies on a note.
// Classrooms: the course codes the admin has opened in building 155.
// Posts and post comments: the boards in classrooms, the Student Hub and on the lawn.
// Audit: the admin's seven-day copy of the activity log (below). Bug
// reports: what visitors send from the settings dialog. Files: what's been
// attached to a bug report, a board post or a meeting room (the files
// themselves are in S3, see files.ts; this is who sent what, and where).
// Live positions never come here; they stay in server memory.

// guest: came in without signing up (guestNNN); student and staff: signed up
// with an ANU email; admin: qa_master. "retired": a free-name account from
// before sign-up (its posts stay, nobody can sign in as it). "user" is the
// old ordinary role, kept for the qa_ test accounts.
export type Role = "guest" | "student" | "staff" | "admin" | "retired" | "user";
/** Signed up (or a test account): may post, comment, heart, attach files and report. */
export const isMember = (v: { role: string }): boolean => v.role === "student" || v.role === "staff" || v.role === "admin" || v.role === "user";
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
  /** Who has hearted it (names are on everyone's name tags anyway). */
  heartedBy: string[];
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
  email: "TEXT",
  last_seen: "TEXT",
};
for (const [col, type] of Object.entries(wanted)) {
  if (!columns().includes(col)) db.exec(`ALTER TABLE visitors ADD COLUMN ${col} ${type}`);
}
for (const col of ["poop_x", "poop_z", "pooped_at"]) {
  if (columns().includes(col)) db.exec(`ALTER TABLE visitors DROP COLUMN ${col}`);
}
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS visitors_by_email ON visitors (email COLLATE NOCASE) WHERE email IS NOT NULL");
// Sign-up and password-reset codes: six digits, ten minutes, five tries; one
// email per address a minute. Only a hash of the code is kept.
db.exec(`
  CREATE TABLE IF NOT EXISTS mail_codes (
    email     TEXT PRIMARY KEY COLLATE NOCASE,
    purpose   TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    sent_at   TEXT NOT NULL,
    tries     INTEGER NOT NULL DEFAULT 0
  );
`);
// Sign-up arrived (final project): every free-name account from before it,
// except the test accounts, is retired once. Their notes and posts stay under
// their names; nobody can sign in as them any more.
if (!(db.prepare("SELECT 1 FROM visitors WHERE role = 'retired' LIMIT 1").get())) {
  db.prepare(
    "UPDATE visitors SET role = 'retired', token = 'retired:' || lower(hex(randomblob(16))), password_hash = NULL, last_space = NULL, last_x = NULL, last_z = NULL WHERE role = 'user' AND name NOT LIKE 'qa\\_%' ESCAPE '\\'",
  ).run();
}
// The classroom was first created under the wrong course code (COMP8280);
// it's COMP8020. Move anything saved under the old id.
db.exec("UPDATE notes SET space = 'comp8020' WHERE space = 'comp8280'");
db.exec("UPDATE visitors SET last_space = 'comp8020' WHERE last_space = 'comp8280'");
// Each classroom's two links the admin sets (the whiteboard, and the board to
// its right), added after crit 9; whether each opens in a new tab instead of
// the in-app window (1) was added for the final project.
const classroomCols = (db.prepare("PRAGMA table_info(classrooms)").all() as { name: string }[]).map((c) => c.name);
for (const col of ["board_url", "side_url"]) if (!classroomCols.includes(col)) db.exec(`ALTER TABLE classrooms ADD COLUMN ${col} TEXT`);
for (const col of ["board_tab", "side_tab"]) if (!classroomCols.includes(col)) db.exec(`ALTER TABLE classrooms ADD COLUMN ${col} INTEGER NOT NULL DEFAULT 0`);
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
db.exec(`
  CREATE TABLE IF NOT EXISTS files (
    id         TEXT PRIMARY KEY,
    kind       TEXT NOT NULL,
    owner      TEXT NOT NULL,
    name       TEXT NOT NULL,
    size       INTEGER NOT NULL,
    key        TEXT NOT NULL,
    post_id    INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    bug_id     INTEGER REFERENCES bug_reports(id) ON DELETE CASCADE,
    room       TEXT,
    ready      INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS files_by_post ON files (post_id);
  CREATE INDEX IF NOT EXISTS files_by_owner ON files (owner, created_at);
  CREATE TABLE IF NOT EXISTS cache (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
// Map chat, kept one day so a report can carry what was said (crit 10, was
// never stored), and what the admin has stopped someone doing, and until when.
db.exec(`
  CREATE TABLE IF NOT EXISTS chat_lines (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    at     TEXT NOT NULL,
    space  TEXT NOT NULL,
    author TEXT NOT NULL,
    text   TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS chat_by_space ON chat_lines (space, at);
  CREATE TABLE IF NOT EXISTS restrictions (
    name   TEXT NOT NULL COLLATE NOCASE,
    what   TEXT NOT NULL,
    until  TEXT NOT NULL,
    by     TEXT NOT NULL,
    reason TEXT,
    PRIMARY KEY (name, what)
  );
`);
const bugCols = (db.prepare("PRAGMA table_info(bug_reports)").all() as { name: string }[]).map((c) => c.name);
for (const col of ["about", "chat"]) if (!bugCols.includes(col)) db.exec(`ALTER TABLE bug_reports ADD COLUMN ${col} TEXT`);
// Whether a post is private (the Hub's enquiry board), added for the final project.
{
  const cols = (db.prepare("PRAGMA table_info(posts)").all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("private")) db.exec("ALTER TABLE posts ADD COLUMN private INTEGER NOT NULL DEFAULT 0");
}
// When a post or a board comment was last edited (null if never), added for crit 10.
for (const table of ["posts", "post_comments"]) {
  const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("edited_at")) db.exec(`ALTER TABLE ${table} ADD COLUMN edited_at TEXT`);
}
// Study groups (the ANUSA board): a post's size, and who has joined. The
// writer is the first member; nobody joins a full group; members go with
// their post.
{
  const cols = (db.prepare("PRAGMA table_info(posts)").all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("capacity")) db.exec("ALTER TABLE posts ADD COLUMN capacity INTEGER");
}
db.exec(`
  CREATE TABLE IF NOT EXISTS group_members (
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    name    TEXT NOT NULL COLLATE NOCASE,
    PRIMARY KEY (post_id, name)
  );
`);

// Mail (plan 16): a message to a signed-up person by name, read whenever they
// come in. Only its sender and its reader see it; kept 30 days, or until the
// reader deletes it.
db.exec(`
  CREATE TABLE IF NOT EXISTS mail (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    sender  TEXT NOT NULL COLLATE NOCASE,
    reader  TEXT NOT NULL COLLATE NOCASE,
    subject TEXT NOT NULL,
    body    TEXT NOT NULL,
    sent_at TEXT NOT NULL DEFAULT (datetime('now')),
    read_at TEXT
  );
  CREATE INDEX IF NOT EXISTS mail_by_reader ON mail (reader, sent_at);
`);
if (!(db.prepare("PRAGMA table_info(mail)").all() as { name: string }[]).some((c) => c.name === "reader_deleted")) {
  db.exec("ALTER TABLE mail ADD COLUMN reader_deleted INTEGER NOT NULL DEFAULT 0");
}

// Hearts on comments (sticky notes' and boards'): one per person per
// comment, so a second press takes it back. The most-hearted comment is shown
// first. A comment's hearts go with it.
db.exec(`
  CREATE TABLE IF NOT EXISTS hearts (
    kind    TEXT NOT NULL,
    target  INTEGER NOT NULL,
    name    TEXT NOT NULL COLLATE NOCASE,
    PRIMARY KEY (kind, target, name)
  );
  CREATE TRIGGER IF NOT EXISTS hearts_note_comment_gone AFTER DELETE ON comments
    BEGIN DELETE FROM hearts WHERE kind = 'note' AND target = OLD.id; END;
  CREATE TRIGGER IF NOT EXISTS hearts_post_comment_gone AFTER DELETE ON post_comments
    BEGIN DELETE FROM hearts WHERE kind = 'post' AND target = OLD.id; END;
`);

// The classroom there's always been. (COMMON, the room for anyone, was the
// second until the ANUSA Student Lounge replaced it; main.ts clears it out.)
db.prepare("INSERT OR IGNORE INTO classrooms (code) VALUES (?)").run("COMP8020");

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

/** The account signed up with this email, if any. */
export function findByEmail(email: string): Visitor | undefined {
  return db.prepare(`SELECT ${visitorCols} FROM visitors WHERE email = ?`).get(email) as Visitor | undefined;
}

/**
 * Guests not seen for 30 days go, freeing their guestNNN (there are only a
 * thousand). Guests can't write anything that stays (notes, posts, comments,
 * mail), so nothing of theirs goes with them but their saved spot and look;
 * the few notes from before guests were refused them go too.
 */
export const purgeIdleGuests = (): number =>
  Number(db.prepare("DELETE FROM visitors WHERE role = 'guest' AND coalesce(last_seen, created_at) < datetime('now', '-30 days')").run().changes);
/** Marks someone as seen now (when their socket connects). */
export const seen = (name: string): void => void db.prepare("UPDATE visitors SET last_seen = datetime('now') WHERE name = ?").run(name);

/** A new guest: the lowest free guestNNN (guest000-guest999); null if they're all taken. */
export function createGuest(token: string): string | null {
  const taken = new Set((db.prepare("SELECT lower(name) AS n FROM visitors WHERE name LIKE 'guest___'").all() as { n: string }[]).map((r) => r.n));
  for (let i = 0; i < 1000; i++) {
    const name = `guest${String(i).padStart(3, "0")}`;
    if (taken.has(name)) continue;
    db.prepare("INSERT INTO visitors (name, token, role) VALUES (?, ?, 'guest')").run(name, token);
    return name;
  }
  return null;
}

/** A new member, signed up with a verified ANU email. */
export function createMember(name: string, token: string, role: "student" | "staff", email: string, passwordHash: string): void {
  db.prepare("INSERT INTO visitors (name, token, role, email, password_hash) VALUES (?, ?, ?, ?, ?)").run(name, token, role, email, passwordHash);
}

/** A new password (after a reset); every browser signed in before has to sign in again. */
export function resetPassword(name: string, passwordHash: string, token: string): void {
  db.prepare("UPDATE visitors SET password_hash = ?, token = ? WHERE name = ?").run(passwordHash, token, name);
}

/** Keeps a fresh code for `email`; false if one was sent less than a minute ago. */
export function storeCode(email: string, purpose: "signup" | "reset", codeHash: string): boolean {
  const recent = db.prepare("SELECT 1 FROM mail_codes WHERE email = ? AND sent_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-60 seconds')").get(email);
  if (recent) return false;
  db.prepare("INSERT OR REPLACE INTO mail_codes (email, purpose, code_hash, sent_at, tries) VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 0)").run(email, purpose, codeHash);
  return true;
}

/** The code for `email` and `purpose` if it's under ten minutes old and under five tries; each look counts a try. */
export function takeCode(email: string, purpose: "signup" | "reset"): string | null {
  const row = db
    .prepare("SELECT code_hash AS hash, tries FROM mail_codes WHERE email = ? AND purpose = ? AND sent_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 minutes')")
    .get(email, purpose) as { hash: string; tries: number } | undefined;
  if (!row || row.tries >= 5) return null;
  db.prepare("UPDATE mail_codes SET tries = tries + 1 WHERE email = ?").run(email);
  return row.hash;
}

export const forgetCode = (email: string): void => void db.prepare("DELETE FROM mail_codes WHERE email = ?").run(email);

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

export type HeartKind = "note" | "post";

/** Who hearted each of these comments. */
function heartsFor(kind: HeartKind, ids: number[]): Map<number, string[]> {
  const by = new Map<number, string[]>(ids.map((id) => [id, []]));
  if (!ids.length) return by;
  const rows = db
    .prepare(`SELECT target, name FROM hearts WHERE kind = ? AND target IN (${ids.map(() => "?").join(", ")}) ORDER BY name`)
    .all(kind, ...ids) as { target: number; name: string }[];
  for (const r of rows) by.get(r.target)?.push(r.name);
  return by;
}

/** Most-hearted first; the same number of hearts, oldest first. */
function byHearts<T extends { id: number; heartedBy: string[] }>(list: T[]): T[] {
  const order = new Map(list.map((c, i) => [c.id, i]));
  return list.sort((a, b) => b.heartedBy.length - a.heartedBy.length || order.get(a.id)! - order.get(b.id)!);
}

export interface Mail {
  id: number;
  sender: string;
  reader: string;
  subject: string;
  body: string;
  sentAt: string;
  readAt: string | null;
}
const mailCols = "id, sender, reader, subject, body, sent_at AS sentAt, read_at AS readAt";
export const MAIL_DAYS = 30;
const freshMail = `sent_at > datetime('now', '-${MAIL_DAYS} days')`;

/** Sends mail; false if the sender sent one under 30 seconds ago. */
export function sendMailTo(sender: string, reader: string, subject: string, body: string): Mail | null {
  const recent = db.prepare("SELECT 1 FROM mail WHERE sender = ? AND sent_at > datetime('now', '-30 seconds')").get(sender);
  if (recent) return null;
  const { lastInsertRowid } = db.prepare("INSERT INTO mail (sender, reader, subject, body) VALUES (?, ?, ?, ?)").run(sender, reader, subject, body);
  return db.prepare(`SELECT ${mailCols} FROM mail WHERE id = ?`).get(Number(lastInsertRowid)) as unknown as Mail;
}
/** Someone's inbox (newest first), and what they've sent. */
export const inboxOf = (name: string): Mail[] => db.prepare(`SELECT ${mailCols} FROM mail WHERE reader = ? AND reader_deleted = 0 AND ${freshMail} ORDER BY id DESC LIMIT 200`).all(name) as unknown as Mail[];
export const sentBy = (name: string): Mail[] => db.prepare(`SELECT ${mailCols} FROM mail WHERE sender = ? AND ${freshMail} ORDER BY id DESC LIMIT 200`).all(name) as unknown as Mail[];
export const findMail = (id: number): Mail | undefined => db.prepare(`SELECT ${mailCols} FROM mail WHERE id = ?`).get(id) as Mail | undefined;
export const markRead = (id: number): void => void db.prepare("UPDATE mail SET read_at = datetime('now') WHERE id = ? AND read_at IS NULL").run(id);
/** The reader throws it away; the sender keeps their copy in Sent until the 30 days are up. */
export const deleteMail = (id: number, reader: string): void => void db.prepare("UPDATE mail SET reader_deleted = 1 WHERE id = ? AND reader = ?").run(id, reader);
export const unreadCount = (name: string): number => (db.prepare(`SELECT COUNT(*) AS n FROM mail WHERE reader = ? AND reader_deleted = 0 AND read_at IS NULL AND ${freshMail}`).get(name) as { n: number }).n;
export const purgeOldMail = (): number => Number(db.prepare(`DELETE FROM mail WHERE NOT (${freshMail})`).run().changes);

export type JoinResult = { ok: true; joined: boolean; members: string[] } | { ok: false; why: "full" | "writer" };

/**
 * Joins a study group, or leaves it if `name` is in it already. Nobody joins
 * a full group; the writer can't leave their own (they remove the post).
 */
export function toggleMember(post: Post, name: string): JoinResult {
  const isIn = post.members.some((m) => m.toLowerCase() === name.toLowerCase());
  if (isIn) {
    if (post.author.toLowerCase() === name.toLowerCase()) return { ok: false, why: "writer" };
    db.prepare("DELETE FROM group_members WHERE post_id = ? AND name = ?").run(post.id, name);
    return { ok: true, joined: false, members: membersOf(post.id) };
  }
  if (post.capacity !== null && post.members.length >= post.capacity) return { ok: false, why: "full" };
  db.prepare("INSERT OR IGNORE INTO group_members (post_id, name) VALUES (?, ?)").run(post.id, name);
  return { ok: true, joined: true, members: membersOf(post.id) };
}

/** Hearts a comment, or takes the heart back if `name` already gave one. Returns whether it's hearted now. */
export function toggleHeart(kind: HeartKind, target: number, name: string): boolean {
  const { changes } = db.prepare("DELETE FROM hearts WHERE kind = ? AND target = ? AND name = ?").run(kind, target, name);
  if (changes) return false;
  db.prepare("INSERT INTO hearts (kind, target, name) VALUES (?, ?, ?)").run(kind, target, name);
  return true;
}

export function commentsOn(noteId: number): Comment[] {
  const rows = db.prepare(`SELECT ${commentCols} FROM comments WHERE note_id = ? ORDER BY created_at, id`).all(noteId) as unknown as Omit<Comment, "heartedBy">[];
  const hearts = heartsFor("note", rows.map((r) => r.id));
  return byHearts(rows.map((r) => ({ ...r, heartedBy: hearts.get(r.id) ?? [] })));
}

export function findComment(id: number): Comment | undefined {
  const row = db.prepare(`SELECT ${commentCols} FROM comments WHERE id = ?`).get(id) as Omit<Comment, "heartedBy"> | undefined;
  return row && { ...row, heartedBy: heartsFor("note", [row.id]).get(row.id) ?? [] };
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
  /** The whiteboard's page opens in a new tab rather than the in-app window. */
  boardNewTab: boolean;
  /** The right-hand board's page opens in a new tab. */
  sideNewTab: boolean;
}

export type ClassroomLink = "board" | "side";

export function classroomList(): Classroom[] {
  const rows = db
    .prepare(
      "SELECT code, created_at AS createdAt, board_url AS boardUrl, side_url AS sideUrl, board_tab AS boardTab, side_tab AS sideTab FROM classrooms ORDER BY code = 'COMP8020' DESC, code",
    )
    .all() as unknown as (Omit<Classroom, "space" | "boardNewTab" | "sideNewTab"> & { boardTab: number; sideTab: number })[];
  return rows.map(({ boardTab, sideTab, ...r }) => ({ ...r, space: classroomSpace(r.code), boardNewTab: boardTab === 1, sideNewTab: sideTab === 1 }));
}

/** Sets (or, with null, clears) one of a classroom's links, and how it opens. False if there's no such classroom. */
export function setClassroomLink(code: string, which: ClassroomLink, url: string | null, newTab = false): boolean {
  const [col, tab] = which === "board" ? ["board_url", "board_tab"] : ["side_url", "side_tab"];
  return db.prepare(`UPDATE classrooms SET ${col} = ?, ${tab} = ? WHERE code = ?`).run(url, url && newTab ? 1 : 0, code).changes > 0;
}

const syncClassrooms = (): void => setClassrooms(classroomList().map((c) => c.code));
syncClassrooms();

/** False if it already exists. */
export function addClassroom(code: string, by: string): boolean {
  const { changes } = db.prepare("INSERT OR IGNORE INTO classrooms (code, created_by) VALUES (?, ?)").run(code, by);
  syncClassrooms();
  return changes > 0;
}

/** Classrooms opened more than `months` ago (never COMP8020): a course's room for one semester. */
export function staleClassrooms(months = 6): string[] {
  return (
    db.prepare(`SELECT code FROM classrooms WHERE code != 'COMP8020' AND created_at <= datetime('now', '-${Math.floor(months)} months')`).all() as {
      code: string;
    }[]
  ).map((r) => r.code);
}

/** The ids of a space's posts (to remove their files before the space goes). */
export function postIdsIn(space: string): number[] {
  return (db.prepare("SELECT id FROM posts WHERE space = ?").all(space) as { id: number }[]).map((r) => r.id);
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

// --- boards ------------------------------------------------------------------
// Classrooms, the Student Hub and the lawn have boards (boards.ts says which
// tabs and who posts where; main.ts checks it). Posts stay until their author
// or an admin removes them, or their classroom is closed; the lawn's go after
// 30 days (`keepDays`): hidden from then, deleted with the hourly purge.

export type BoardTab = string;
export const POST_COOLDOWN_SECONDS = 30;

export interface Post {
  id: number;
  space: SpaceId;
  tab: BoardTab;
  author: string;
  title: string;
  text: string;
  createdAt: string;
  editedAt: string | null;
  comments: number;
  /** Only its author and staff see it (boards that allow it). */
  private: boolean;
  /** A study group's size (the ANUSA board), else null. */
  capacity: number | null;
  /** Who has joined a study group (its writer first), else empty. */
  members: string[];
}
export interface PostComment {
  id: number;
  postId: number;
  author: string;
  text: string;
  createdAt: string;
  editedAt: string | null;
  heartedBy: string[];
}

const postCols = `p.id, p.space, p.tab, p.author, p.title, p.text, p.created_at AS createdAt, p.edited_at AS editedAt,
  (SELECT COUNT(*) FROM post_comments c WHERE c.post_id = p.id) AS comments, p.private, p.capacity`;
const membersOf = (postId: number): string[] =>
  (db.prepare("SELECT name FROM group_members WHERE post_id = ? ORDER BY rowid").all(postId) as { name: string }[]).map((r) => r.name);
const asPost = (r: unknown): Post => {
  const p = r as Omit<Post, "private" | "members"> & { private: number };
  return { ...p, private: p.private === 1, capacity: p.capacity ?? null, members: p.capacity ? membersOf(p.id) : [] };
};

export function postsIn(space: SpaceId, tab: BoardTab, keepDays?: number): Post[] {
  const fresh = keepDays ? ` AND p.created_at > datetime('now', '-${Math.floor(keepDays)} days')` : "";
  return db
    .prepare(`SELECT ${postCols} FROM posts p WHERE p.space = ? AND p.tab = ?${fresh} ORDER BY p.created_at DESC, p.id DESC`)
    .all(space, tab)
    .map(asPost);
}

/** The ids of a board's posts in tabs it no longer has (to remove, files and all). */
export function postsInGoneTabs(space: string, tabs: readonly string[]): number[] {
  const marks = tabs.map(() => "?").join(", ");
  return (db.prepare(`SELECT id FROM posts WHERE space = ? AND tab NOT IN (${marks})`).all(space, ...tabs) as { id: number }[]).map((r) => r.id);
}

/** The ids of a space's posts older than `days` (to remove, files and all). */
export function expiredPosts(space: string, days: number): number[] {
  return (db.prepare(`SELECT id FROM posts WHERE space = ? AND created_at <= datetime('now', '-${Math.floor(days)} days')`).all(space) as { id: number }[]).map((r) => r.id);
}

export function findPost(id: number): Post | undefined {
  const row = db.prepare(`SELECT ${postCols} FROM posts p WHERE p.id = ?`).get(id);
  return row ? asPost(row) : undefined;
}

export type AddPostResult = { ok: true; post: Post } | { ok: false; wait: number };

export function addPost(author: string, space: SpaceId, tab: BoardTab, title: string, text: string, isPrivate = false, capacity: number | null = null): AddPostResult {
  const wait = cooldownLeft(author, "last_post_at", POST_COOLDOWN_SECONDS);
  if (wait > 0) return { ok: false, wait };
  const { lastInsertRowid } = db
    .prepare("INSERT INTO posts (space, tab, author, title, text, private, capacity) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(space, tab, author, title, text, isPrivate ? 1 : 0, capacity);
  // A study group's writer is its first member.
  if (capacity) db.prepare("INSERT OR IGNORE INTO group_members (post_id, name) VALUES (?, ?)").run(Number(lastInsertRowid), author);
  db.prepare("UPDATE visitors SET last_post_at = datetime('now') WHERE name = ?").run(author);
  return { ok: true, post: findPost(Number(lastInsertRowid))! };
}

/** Rewrites a post's title and text (its author only, which main.ts checks). */
export function editPost(id: number, title: string, text: string, capacity?: number): Post {
  db.prepare("UPDATE posts SET title = ?, text = ?, edited_at = datetime('now') WHERE id = ?").run(title, text, id);
  if (capacity !== undefined) db.prepare("UPDATE posts SET capacity = ? WHERE id = ? AND capacity IS NOT NULL").run(capacity, id);
  return findPost(id)!;
}

/** Rewrites a board comment's text (its author only, which main.ts checks). */
export function editPostComment(id: number, text: string): PostComment {
  db.prepare("UPDATE post_comments SET text = ?, edited_at = datetime('now') WHERE id = ?").run(text, id);
  return findPostComment(id)!;
}

export function deletePost(id: number): void {
  db.prepare("DELETE FROM posts WHERE id = ?").run(id);
}

const postCommentCols = "id, post_id AS postId, author, text, created_at AS createdAt, edited_at AS editedAt";

export function postCommentsOn(postId: number): PostComment[] {
  const rows = db
    .prepare(`SELECT ${postCommentCols} FROM post_comments WHERE post_id = ? ORDER BY created_at, id`)
    .all(postId) as unknown as Omit<PostComment, "heartedBy">[];
  const hearts = heartsFor("post", rows.map((r) => r.id));
  return byHearts(rows.map((r) => ({ ...r, heartedBy: hearts.get(r.id) ?? [] })));
}

export function findPostComment(id: number): PostComment | undefined {
  const row = db.prepare(`SELECT ${postCommentCols} FROM post_comments WHERE id = ?`).get(id) as Omit<PostComment, "heartedBy"> | undefined;
  return row && { ...row, heartedBy: heartsFor("post", [row.id]).get(row.id) ?? [] };
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
// and chat aren't kept here (chat_lines below keeps it a day, for reports). Deleted after seven days.

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

// --- map chat, kept a day -----------------------------------------------------------
// Only so a report about abuse can carry the last few minutes of a space's
// chat; nobody reads it otherwise, and it's deleted after a day.

export const CHAT_KEEP_HOURS = 24;
export const REPORT_CHAT_MINUTES = 5;
export interface ChatLine {
  at: string;
  author: string;
  text: string;
}

export function keepChatLine(space: string, author: string, text: string): void {
  db.prepare("INSERT INTO chat_lines (at, space, author, text) VALUES (?, ?, ?, ?)").run(new Date().toISOString(), space, author, text);
}

/** The space's chat from the last `minutes`, oldest first. */
export function recentChat(space: string, minutes = REPORT_CHAT_MINUTES): ChatLine[] {
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  return db.prepare("SELECT at, author, text FROM chat_lines WHERE space = ? AND at > ? ORDER BY id LIMIT 300").all(space, since) as unknown as ChatLine[];
}

export function purgeOldChat(): number {
  const since = new Date(Date.now() - CHAT_KEEP_HOURS * 3600_000).toISOString();
  return Number(db.prepare("DELETE FROM chat_lines WHERE at <= ?").run(since).changes);
}

// --- restrictions ----------------------------------------------------------------------
// The admin can stop one person posting notes, posting on boards, chatting,
// or joining at all, for a while; the server checks before each of those.

export const RESTRICTABLE = ["notes", "posts", "chat", "join"] as const;
export type Restrictable = (typeof RESTRICTABLE)[number];
export interface Restriction {
  name: string;
  what: Restrictable;
  until: string;
  by: string;
  reason: string | null;
}

export function restrict(name: string, what: Restrictable, until: string, by: string, reason: string | null): void {
  db.prepare("INSERT OR REPLACE INTO restrictions (name, what, until, by, reason) VALUES (?, ?, ?, ?, ?)").run(name, what, until, by, reason);
}

export function lift(name: string, what: Restrictable): boolean {
  return db.prepare("DELETE FROM restrictions WHERE name = ? AND what = ?").run(name, what).changes > 0;
}

/** The restriction on `name` doing `what` now, if there is one. */
export function restrictionOn(name: string, what: Restrictable): Restriction | undefined {
  return db
    .prepare("SELECT name, what, until, by, reason FROM restrictions WHERE name = ? AND what = ? AND until > ?")
    .get(name, what, new Date().toISOString()) as Restriction | undefined;
}

export function restrictions(): Restriction[] {
  db.prepare("DELETE FROM restrictions WHERE until <= ?").run(new Date().toISOString());
  return db.prepare("SELECT name, what, until, by, reason FROM restrictions ORDER BY until").all() as unknown as Restriction[];
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
  /** For a report about someone: who. */
  about: string | null;
  /** For a report about someone: the space's chat from the five minutes before. */
  chat: ChatLine[] | null;
}
export const BUG_COOLDOWN_SECONDS = 60;

/** Adds a report, unless the author sent one in the last minute. */
export function addBugReport(r: Omit<BugReport, "id" | "at" | "about" | "chat"> & { about?: string | null; chat?: ChatLine[] | null }): { ok: true; id: number } | { ok: false; wait: number } {
  const last = db.prepare("SELECT at FROM bug_reports WHERE author = ? ORDER BY id DESC LIMIT 1").get(r.author) as { at: string } | undefined;
  const since = last ? (Date.now() - Date.parse(last.at)) / 1000 : Infinity;
  if (since < BUG_COOLDOWN_SECONDS) return { ok: false, wait: Math.ceil(BUG_COOLDOWN_SECONDS - since) };
  const at = new Date().toISOString();
  const { lastInsertRowid } = db
    .prepare("INSERT INTO bug_reports (at, author, browser, ip, space, user_agent, text, about, chat) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(at, r.author, r.browser, r.ip, r.space, r.userAgent, r.text, r.about ?? null, r.chat ? JSON.stringify(r.chat) : null);
  return { ok: true, id: Number(lastInsertRowid) };
}

export function bugReports(): BugReport[] {
  const rows = db
    .prepare("SELECT id, at, author, browser, ip, space, user_agent AS userAgent, text, about, chat FROM bug_reports ORDER BY id DESC LIMIT 500")
    .all() as unknown as (Omit<BugReport, "chat"> & { chat: string | null })[];
  return rows.map((r) => ({ ...r, chat: r.chat ? (JSON.parse(r.chat) as ChatLine[]) : null }));
}

export function findBugReport(id: number): BugReport | undefined {
  return db.prepare("SELECT id, at, author, browser, ip, space, user_agent AS userAgent, text, about, NULL AS chat FROM bug_reports WHERE id = ?").get(id) as BugReport | undefined;
}

export function deleteBugReport(id: number): boolean {
  return db.prepare("DELETE FROM bug_reports WHERE id = ?").run(id).changes > 0;
}

// --- how people look ------------------------------------------------------------
// A figure (two bodies), skin, hair, top and bottom colours as indexes into
// fixed palettes (client/src/lookpicker.ts), and a hat and its colour (from
// the hair palette). Indexes, not colours, so nobody can paint themselves an
// arbitrary colour or slip anything else in. Hat 7, the hard hat, is for the
// test accounts (qa_) only.

export interface Look {
  body: number;
  skin: number;
  hair: number;
  top: number;
  bottom: number;
  hat: number;
  hatColour: number;
}
const LOOK_LIMITS: Record<keyof Look, number> = { body: 2, skin: 6, hair: 10, top: 10, bottom: 10, hat: 8, hatColour: 10 };
export const QA_HAT = 7;
// Looks saved before hats had a colour: each hat keeps (about) the colour it had.
const OLD_HAT_COLOUR = [1, 6, 7, 3, 0, 8, 4];

/** The look if every part is a whole number in its range, else null. */
export function validLook(v: unknown): Look | null {
  if (typeof v !== "object" || v === null) return null;
  const given = v as Record<string, unknown>;
  const out: Partial<Look> = {};
  for (const [k, n] of Object.entries(LOOK_LIMITS) as [keyof Look, number][]) {
    let x = given[k];
    if (k === "hatColour" && x === undefined && typeof given.hat === "number") x = OLD_HAT_COLOUR[given.hat] ?? 1;
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

// --- attached files ---------------------------------------------------------------
// A row is written when someone asks to upload (not ready yet) and marked
// ready once the server has seen the whole file arrive in S3. Only ready
// files younger than 30 days are ever listed or handed out; the bucket
// deletes the files themselves at 30 days.

export interface FileRow {
  id: string;
  kind: "bug" | "board" | "room";
  owner: string;
  name: string;
  size: number;
  key: string;
  postId: number | null;
  bugId: number | null;
  room: string | null;
  ready: boolean;
  createdAt: string;
}
/** What a list of attachments shows. */
export type FileInfo = Pick<FileRow, "id" | "name" | "size">;

const fileCols = "id, kind, owner, name, size, key, post_id AS postId, bug_id AS bugId, room, ready, created_at AS createdAt";
const FRESH = "created_at > datetime('now', '-30 days')";

export function addFile(f: Omit<FileRow, "ready" | "createdAt">): void {
  db.prepare("INSERT INTO files (id, kind, owner, name, size, key, post_id, bug_id, room) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    f.id, f.kind, f.owner, f.name, f.size, f.key, f.postId, f.bugId, f.room,
  );
}

/** A file not yet 30 days old, ready or still arriving. */
export function findFile(id: string): FileRow | undefined {
  const row = db.prepare(`SELECT ${fileCols} FROM files WHERE id = ? AND ${FRESH}`).get(id) as (Omit<FileRow, "ready"> & { ready: number }) | undefined;
  return row ? { ...row, ready: !!row.ready } : undefined;
}

export function markFileReady(id: string): void {
  db.prepare("UPDATE files SET ready = 1 WHERE id = ?").run(id);
}

/** A post's or a bug report's files: the ready ones to list, or with `all`, every row (to count or delete). */
export function filesOn(on: "post" | "bug", id: number, all = false): (FileInfo & { key: string })[] {
  const col = on === "post" ? "post_id" : "bug_id";
  return db
    .prepare(`SELECT id, name, size, key FROM files WHERE ${col} = ? ${all ? "" : `AND ready = 1 AND ${FRESH}`} ORDER BY created_at, id`)
    .all(id) as unknown as (FileInfo & { key: string })[];
}

/** How many uploads `owner` has asked for in the last day. */
export function uploadsToday(owner: string): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM files WHERE owner = ? AND created_at > datetime('now', '-1 day')").get(owner) as { n: number }).n;
}

/** Forgets a meeting room's files once it empties; returns their S3 keys to delete. */
export function dropRoomFiles(room: string): string[] {
  const rows = db.prepare("SELECT key FROM files WHERE room = ?").all(room) as { key: string }[];
  db.prepare("DELETE FROM files WHERE room = ?").run(room);
  return rows.map((r) => r.key);
}

/**
 * Forgets uploads that never arrived (asked for over an hour ago) and files
 * past their 30 days; returns the S3 keys of the ones that never arrived,
 * in case half of one did (the bucket clears the rest itself).
 */
export function purgeFiles(): string[] {
  const stale = db.prepare("SELECT key FROM files WHERE ready = 0 AND created_at <= datetime('now', '-1 hour')").all() as { key: string }[];
  db.prepare("DELETE FROM files WHERE (ready = 0 AND created_at <= datetime('now', '-1 hour')) OR NOT " + FRESH).run();
  return stale.map((r) => r.key);
}

// --- cache -----------------------------------------------------------------
// Things the server works out slowly and would otherwise lose on a restart
// (a deploy): for now, the classmates' final projects that were last up.

export function cached<T>(key: string): T | undefined {
  const row = db.prepare("SELECT value FROM cache WHERE key = ?").get(key) as { value: string } | undefined;
  return row ? (JSON.parse(row.value) as T) : undefined;
}

export function setCached(key: string, value: unknown): void {
  db.prepare("INSERT INTO cache (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')").run(
    key,
    JSON.stringify(value),
  );
}
