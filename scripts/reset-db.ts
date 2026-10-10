// Wipes every visitor (names, tokens, last spots) and every note and comment from the database the
// server uses. An operator tool, not a route: it only runs from a shell on the
// machine, e.g.
//
//   flyctl ssh console -a comp4020-final-passionleader -C "node /app/scripts/reset-db.ts"
//
// Quoting a one-liner through `flyctl ssh console -C` mangles it, which is why
// this lives in a file. An ssh session starts outside /app and may not carry
// the image's ENV, so the path is absolute and the volume file is found
// without DATABASE_PATH.
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const path = process.env.DATABASE_PATH ?? (existsSync("/data/app.db") ? "/data/app.db" : "data/app.db");
if (!existsSync(path)) {
  console.error(`no database at ${path}`);
  process.exit(1);
}
const db = new DatabaseSync(path);
for (const table of ["comments", "notes"]) {
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
  if (exists) db.prepare(`DELETE FROM ${table}`).run();
}
const { changes } = db.prepare("DELETE FROM visitors").run();
console.log(`${path}: removed ${changes} visitor(s)`);
