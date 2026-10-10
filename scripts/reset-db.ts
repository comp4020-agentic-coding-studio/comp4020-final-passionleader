// Wipes every visitor (names, tokens, poops, last spots) from the database the
// server uses. An operator tool, not a route: it only runs from a shell on the
// machine, e.g.
//
//   flyctl ssh console -a comp4020-final-passionleader -C "node scripts/reset-db.ts"
//
// Quoting a one-liner through `flyctl ssh console -C` mangles it, which is why
// this lives in a file.
import { DatabaseSync } from "node:sqlite";

const path = process.env.DATABASE_PATH ?? "data/app.db";
const db = new DatabaseSync(path);
const { changes } = db.prepare("DELETE FROM visitors").run();
console.log(`${path}: removed ${changes} visitor(s)`);
