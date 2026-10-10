import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

// The smallest schema that carries the core interaction: one row per visitor,
// holding their name, the secret that lets them reclaim it, and where their one
// poop sits. A new poop moves the old one rather than adding a row, so the
// room never fills up with one person's mess.
export type Poop = { name: string; x: number; z: number; updatedAt: string };

const path = process.env.DATABASE_PATH ?? "data/app.db";
mkdirSync(dirname(path), { recursive: true });
const db = new DatabaseSync(path);

db.exec(`
  CREATE TABLE IF NOT EXISTS visitors (
    name       TEXT PRIMARY KEY COLLATE NOCASE,
    token      TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    poop_x     REAL,
    poop_z     REAL,
    pooped_at  TEXT
  )
`);

// Where each visitor last stood, written when their connection closes (never
// per move: live positions stay in server memory), so a returning visitor
// walks back in where they left. Added after crit 8, hence the migration.
const columns = (db.prepare("PRAGMA table_info(visitors)").all() as { name: string }[]).map((c) => c.name);
if (!columns.includes("last_x")) {
  db.exec("ALTER TABLE visitors ADD COLUMN last_x REAL; ALTER TABLE visitors ADD COLUMN last_z REAL;");
}

export function lastSpot(name: string): { x: number; z: number } | null {
  const row = db.prepare("SELECT last_x AS x, last_z AS z FROM visitors WHERE name = ?").get(name) as
    | { x: number | null; z: number | null }
    | undefined;
  return row && row.x !== null && row.z !== null ? { x: row.x, z: row.z } : null;
}

export function saveLastSpot(name: string, x: number, z: number): void {
  db.prepare("UPDATE visitors SET last_x = ?, last_z = ? WHERE name = ?").run(x, z, name);
}

export function findByName(name: string): { name: string; token: string } | undefined {
  return db.prepare("SELECT name, token FROM visitors WHERE name = ?").get(name) as
    | { name: string; token: string }
    | undefined;
}

export function findByToken(token: string): { name: string } | undefined {
  return db.prepare("SELECT name FROM visitors WHERE token = ?").get(token) as
    | { name: string }
    | undefined;
}

export function createVisitor(name: string, token: string): void {
  db.prepare("INSERT INTO visitors (name, token) VALUES (?, ?)").run(name, token);
}

// One poop per visitor every few seconds, so a held-down key can't hammer the
// database. Returns undefined when the visitor is still cooling down.
export const POOP_COOLDOWN_SECONDS = 5;

export function placePoop(token: string, x: number, z: number): Poop | undefined {
  return db
    .prepare(
      `UPDATE visitors SET poop_x = ?, poop_z = ?, pooped_at = datetime('now')
       WHERE token = ?
         AND (pooped_at IS NULL OR unixepoch('now') - unixepoch(pooped_at) >= ${POOP_COOLDOWN_SECONDS})
       RETURNING name, poop_x AS x, poop_z AS z, pooped_at AS updatedAt`,
    )
    .get(x, z, token) as Poop | undefined;
}

export function allPoops(): Poop[] {
  return db
    .prepare(
      `SELECT name, poop_x AS x, poop_z AS z, pooped_at AS updatedAt
       FROM visitors WHERE pooped_at IS NOT NULL ORDER BY pooped_at`,
    )
    .all() as Poop[];
}
