// Run on my own machine, never on the server: makes fresh passwords for
// qa_master and qa_bot01–qa_bot10 (one of each role), writes them to a file outside the repo, and
// prints the hashes-only argument for scripts/seed-accounts.ts.
//
//   node scripts/make-accounts.ts ~/.config/comp4020/accounts.txt
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { hashPassword } from "../server/accounts.ts";

const out = process.argv[2];
if (!out) {
  console.error("usage: node scripts/make-accounts.ts <passwords file outside the repo>");
  process.exit(1);
}
const names = ["qa_master", ...Array.from({ length: 10 }, (_, i) => `qa_bot${String(i + 1).padStart(2, "0")}`)];
// One account per role (plan 93): qa_master the top admin, qa_bot01–04 staff, 05–08 students, 09–10 guests.
const roleOf = (name: string): string => (name === "qa_master" ? "admin" : Number(name.slice(-2)) <= 4 ? "staff" : Number(name.slice(-2)) <= 8 ? "student" : "guest");
const accounts = names.map((name) => ({ name, role: roleOf(name), password: randomBytes(9).toString("base64url") }));
writeFileSync(out, accounts.map((a) => `${a.name}\t${a.role}\t${a.password}`).join("\n") + "\n", { mode: 0o600 });
const seed = accounts.map(({ name, role, password }) => ({ name, role, hash: hashPassword(password) }));
console.log(Buffer.from(JSON.stringify(seed)).toString("base64"));
