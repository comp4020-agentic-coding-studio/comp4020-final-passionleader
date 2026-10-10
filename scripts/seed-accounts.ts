// Creates or updates the password accounts: qa_master (admin) and
// qa_bot01–qa_bot10 (ordinary users). It takes only scrypt hashes, never
// passwords, as one base64 JSON argument, so it can run on the live machine:
//
//   flyctl ssh console -a comp4020-final-passionleader -C "node /app/scripts/seed-accounts.ts <base64>"
//
// The base64 comes from scripts/make-accounts.ts, run on my own machine, which
// also writes the passwords to ~/.config/comp4020/accounts.txt (never the repo).
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

process.env.DATABASE_PATH ??= existsSync("/data/app.db") ? "/data/app.db" : "data/app.db";
const { upsertAccount } = await import("../server/db.ts");

const arg = process.argv[2];
if (!arg) {
  console.error("usage: node scripts/seed-accounts.ts <base64 JSON of [{name, role, hash}]>");
  process.exit(1);
}
const accounts = JSON.parse(Buffer.from(arg, "base64").toString("utf8")) as { name: string; role: "user" | "admin"; hash: string }[];
for (const a of accounts) upsertAccount(a.name, randomUUID(), a.role, a.hash);
console.log(`${process.env.DATABASE_PATH}: ${accounts.length} account(s) ready: ${accounts.map((a) => a.name).join(", ")}`);
