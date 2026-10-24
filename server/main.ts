import { createHash, randomInt, randomUUID } from "node:crypto";
import { MailFailure, lastMail, mailReady, sendMail, testOutbox } from "./mail.ts";
import { NPCS, answer, npcById } from "./npcs.ts";
import { existsSync, readFileSync } from "node:fs";
import type { Server } from "node:http";
import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context } from "hono";
import { marked } from "marked";
import { NAME_RULE, RESERVED, RESERVED_RULE, checkPassword, hashPassword, mayRemove, postError, textError } from "./accounts.ts";
import {
  editPost,
  editPostComment,
  cached,
  setCached,
  NOTES_PER_SPACE,
  addClassroom,
  addComment,
  addNote,
  addPost,
  addPostComment,
  classroomList,
  commentsOn,
  createVisitor,
  deleteComment,
  deleteNote,
  deletePost,
  deletePostComment,
  findByName,
  findByToken,
  findComment,
  findNote,
  findPost,
  findPostComment,
  lastSpot,
  noteCount,
  notesIn,
  postCommentsOn,
  postsIn,
  expiredPosts,
  postsInGoneTabs,
  staleClassrooms,
  postIdsIn,
  toggleHeart,
  toggleMember,
  sendMailTo,
  inboxOf,
  sentBy,
  findMail,
  markRead,
  deleteMail,
  unreadCount,
  purgeOldMail,
  purgeIdleGuests,
  createGuest,
  createMember,
  findByEmail,
  forgetCode,
  isMember,
  isStaff,
  resetPassword,
  storeCode,
  takeCode,
  purgeExpiredNotes,
  purgeOldAudit,
  addAudit,
  auditEntries,
  AUDIT_DAYS,
  addBugReport,
  bugReports,
  deleteBugReport,
  findBugReport,
  lift,
  purgeOldChat,
  recentChat,
  restrict,
  restrictionOn,
  restrictions,
  RESTRICTABLE,
  type Restrictable,
  addFile,
  findFile,
  filesOn,
  markFileReady,
  purgeFiles,
  uploadsToday,
  lookOf,
  saveLook,
  validLook,
  QA_HAT,
  removeClassroom,
  setClassroomLink,
  type Visitor,
} from "./db.ts";
import { browserTag, keepIn, log } from "./log.ts";
import { attachRealtime, broadcastAll, broadcastSpace, evictSpace, kick, livePlayer, noticeRestriction, tellPerson, roomSessionOf, roomShare, setLook } from "./realtime.ts";
import { S3Failure, arrivedSize, cleanName, downloadLink, fileError, isImage, keyFor, removeObjects, s3Message, s3Ready, typeOf, uploadLink, type FileKind } from "./files.ts";
import { sketchRoutes } from "./sketch/routes.ts";
import { boardOf, expiringBoards, maySeePost, mayPostIn, spaceOfBoard, tabOf } from "./boards.ts";
import { CLASSROOM_CODE, FIRST_SPACE, OLD_COMMON, SPACES, clampTo, classroomSpace, isSpace, noteSpotError, roomOf, teamRoomsOf } from "./spaces.ts";

// Lines the admin can read back for seven days go into SQLite as well.
keepIn(addAudit);

const app = new Hono();

// Rendered on the server, so the marker (and the spec) read it without scripts.
app.get("/readme/", (c) => {
  const body = marked.parse(readFileSync("README.md", "utf8"), { async: false });
  return c.html(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>README · ANU Crossing</title>
<style>body{max-width:42rem;margin:2rem auto;padding:0 1rem;font:1rem/1.6 system-ui,sans-serif}img{max-width:100%}</style>
</head><body><main>${body}</main><p><a href="/">Back to the campus</a></p></body></html>`);
});

type Body = Record<string, unknown>;
const wordCount = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;
const body = (c: Context): Promise<Body> => c.req.json<Body>().catch(() => ({}));

/** The visitor behind a request's token, or null. */
/**
 * The IP a request came from, for the admin's seven-day log only: Fly puts
 * the visitor's address in Fly-Client-IP; running locally, the socket's.
 */
function ipOf(c: Context): string | null {
  const fly = c.req.header("fly-client-ip");
  if (fly) return fly;
  try {
    return getConnInfo(c).remote.address ?? null;
  } catch {
    return null;
  }
}

function who(b: Body): Visitor | null {
  return typeof b.token === "string" ? (findByToken(b.token) ?? null) : null;
}

/**
 * Guests (came in without signing up) may walk, chat, emote and use team
 * rooms; sticky notes, posting, commenting, hearts, joining groups, files
 * and reporting someone need an ANU sign-up. Refused here (403, logged), not
 * only hidden in the browser; the client shows a sign-up prompt.
 */
/**
 * What a board's watchers are told when a post changes: the tab, and which
 * post, so an open one reloads. Never a private post's id: others mustn't
 * learn that it exists or when it's busy.
 */
const boardChanged = (post: { tab: string; id: number; private: boolean }): Record<string, unknown> =>
  post.private ? { t: "action", kind: "board", tab: post.tab } : { t: "action", kind: "board", tab: post.tab, post: post.id };

function guestRefused(c: Context, v: Visitor, action: string): Response | null {
  if (isMember(v)) return null;
  log("refused", v, { action, reason: "guest" }, { ip: ipOf(c) });
  return c.json({ error: "Sign up with your ANU email to do that (⚙️ → Verify my ANU email).", signup: true }, 403);
}

const RESTRICTED_WHAT: Record<Restrictable, string> = { notes: "sticking notes or commenting on them", posts: "posting or commenting on boards", chat: "chatting", join: "coming in" };
/** If the admin has stopped `v` doing `what`, logs the refusal and answers 403; else null. */
function stopped(c: Context, v: Visitor, what: Restrictable, details: Record<string, unknown>): Response | null {
  const r = restrictionOn(v.name, what);
  if (!r) return null;
  log("refused", v, { ...details, reason: "restricted" }, { ip: ipOf(c) });
  const when = new Date(r.until).toLocaleString("en-AU", { timeZone: "Australia/Canberra", dateStyle: "medium", timeStyle: "short" });
  return c.json({ error: `The admin has stopped you ${RESTRICTED_WHAT[what]} until ${when} (Canberra time).`, until: r.until }, 403);
}

app.post("/api/join", async (c) => {
  const b = await body(c);
  const { token, password } = b;
  if (typeof b.name !== "string") return c.json({ error: "Pick a name." }, 400);
  // Phone keyboards add spaces and lookalike characters (a full-width "＿").
  const name = b.name.normalize("NFKC").trim();

  // Test and admin accounts sign in with a password, from any browser.
  if (RESERVED.test(name)) {
    const account = RESERVED_RULE.test(name) ? findByName(name) : undefined;
    if (!account?.passwordHash) {
      log("join-refused", { name }, { reason: "reserved name" }, { ip: ipOf(c) });
      return c.json({ error: "Names starting with qa_ are reserved." }, 403);
    }
    // Trimmed: a phone keyboard's trailing space shouldn't lock a test account out (none has a space).
    if (typeof password !== "string" || !checkPassword(password.trim(), account.passwordHash)) {
      log("join-refused", { name: account.name }, { reason: "wrong password" }, { ip: ipOf(c) });
      return c.json({ error: "Wrong password." }, 401);
    }
    const barred = stopped(c, account, "join", { action: "join" });
    if (barred) return barred;
    log("join", account, { how: "password" }, { ip: ipOf(c) });
    return c.json({ name: account.name, token: account.token, role: account.role, spawn: lastSpot(account.name), look: lookOf(account.name) });
  }

  if (!NAME_RULE.test(name)) return c.json({ error: "Names are 1–8 letters, digits or underscores." }, 400);
  const existing = findByName(name);
  // Since sign-up, a name without a password is a guest's: guests come in
  // with { guest: true } (below), members with their name and password.
  if (existing?.role === "retired") return c.json({ error: `"${name}" belonged to someone from before sign-up. Pick another name.` }, 409);
  // A name with a password behind it signs in with that password from any device.
  if (existing?.passwordHash && typeof password === "string" && password.trim()) {
    if (!checkPassword(password.trim(), existing.passwordHash)) {
      log("join-refused", { name: existing.name }, { reason: "wrong password" }, { ip: ipOf(c) });
      return c.json({ error: "Wrong password." }, 401);
    }
    const barred = stopped(c, existing, "join", { action: "join" });
    if (barred) return barred;
    log("join", existing, { how: "password" }, { ip: ipOf(c) });
    return c.json({ name: existing.name, token: existing.token, role: existing.role, spawn: lastSpot(existing.name), look: lookOf(existing.name) });
  }
  if (existing) {
    // A guest's name belongs to their browser: only its token gets it back.
    if (existing.token === token) {
      const barred = stopped(c, existing, "join", { action: "join" });
      if (barred) return barred;
      log("join", existing, { how: "returning" }, { ip: ipOf(c) });
      return c.json({ name: existing.name, token: existing.token, role: existing.role, spawn: lastSpot(existing.name), look: lookOf(existing.name) });
    }
    log("join-refused", { name: existing.name, token: typeof token === "string" ? token : undefined }, { reason: "name taken" }, { ip: ipOf(c) });
    // `password` says whether this name could be signed into with one instead.
    return c.json({ error: `"${name}" is taken. Pick another name.`, password: !!existing.passwordHash }, 409);
  }
  return c.json({ error: "Sign up with your ANU email to pick a name, or come in as a guest." }, 404);
});

// Coming in as a guest: your browser's guest back if it has one, else the
// next free guestNNN. Guests walk, chat, emote, stick notes and use team
// rooms; posting, commenting, hearts, files and reports need signing up.
const newGuests: { ip: string | null; at: number }[] = [];
app.post("/api/guest", async (c) => {
  const b = await body(c);
  const known = typeof b.token === "string" ? findByToken(b.token) : undefined;
  if (known?.role === "guest") {
    const barred = stopped(c, known, "join", { action: "join" });
    if (barred) return barred;
    log("join", known, { how: "guest returning" }, { ip: ipOf(c) });
    return c.json({ name: known.name, token: known.token, role: "guest", spawn: lastSpot(known.name), look: lookOf(known.name) });
  }
  // A new guest name each time is cheap to ask for and there are only a
  // thousand: twenty new guests an hour from one IP.
  const ip = ipOf(c);
  const hourAgo = Date.now() - 3_600_000;
  while (newGuests.length && newGuests[0]!.at < hourAgo) newGuests.shift();
  if (!testOutbox() && newGuests.filter((g) => g.ip === ip).length >= 20) return c.json({ error: "Too many new guests from here. Try again in an hour, or sign up." }, 429);
  newGuests.push({ ip, at: Date.now() });
  const fresh = randomUUID();
  const name = createGuest(fresh);
  if (!name) return c.json({ error: "The campus is full of guests right now. Sign up, or try later." }, 503);
  log("join", { name, token: fresh }, { how: "guest" }, { ip: ipOf(c) });
  return c.json({ name, token: fresh, role: "guest", spawn: { space: FIRST_SPACE, ...SPACES[FIRST_SPACE]!.spawn }, look: null });
});

// --- signing up with an ANU email ---------------------------------------------
// Students give their student number (u1234567, the email is
// u1234567@anu.edu.au); staff tick "I'm staff" and give their @anu.edu.au
// address (not a student number). A six-digit code goes there by SES, ten
// minutes, five tries, one email a minute. With the code: a name (the usual
// rules) and a password (8+ characters) make the account. Forgot it? The same
// code by email sets a new one, and every browser signs in again.

const STUDENT_NO = /^u\d{7}$/i;
const STAFF_EMAIL = /^[a-z][a-z0-9._-]{0,63}@anu\.edu\.au$/i;
const code6 = (): string => String(randomInt(0, 1_000_000)).padStart(6, "0");
const hashCode = (email: string, code: string): string => createHash("sha256").update(`${email.toLowerCase()}:${code}`).digest("hex");

/** The ANU email a sign-up names, and whether it's staff's; or an error. */
function anuEmail(b: Body): { email: string; staff: boolean } | { error: string } {
  if (b.staff === true) {
    const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
    if (!STAFF_EMAIL.test(email) || STUDENT_NO.test(email.split("@")[0]!)) return { error: "Staff: your @anu.edu.au address (not a student number)." };
    return { email, staff: true };
  }
  const no = typeof b.studentNo === "string" ? b.studentNo.trim().toLowerCase() : "";
  if (!STUDENT_NO.test(no)) return { error: "Your student number, like u1234567." };
  return { email: `${no}@anu.edu.au`, staff: false };
}

// Codes by email cost money and reputation (bounces from made-up staff
// addresses), and each one is five guesses at a code: at most 5 an hour
// from one IP, and 200 an hour in all.
const codeMailed: { ip: string | null; at: number }[] = [];
const CODES_PER_IP_HOUR = 5;
const CODES_PER_HOUR = 200;
function codeQuotaLeft(ip: string | null): boolean {
  // The spec signs up a hundred visitors from one address; its outbox sends nothing.
  if (testOutbox()) return true;
  const hourAgo = Date.now() - 3_600_000;
  while (codeMailed.length && codeMailed[0]!.at < hourAgo) codeMailed.shift();
  return codeMailed.length < CODES_PER_HOUR && codeMailed.filter((m) => m.ip === ip).length < CODES_PER_IP_HOUR;
}

async function sendCode(c: Context, email: string, purpose: "signup" | "reset"): Promise<Response> {
  if (!mailReady()) return c.json({ error: "Email isn't available right now. Please tell the admin. Error code: MAIL-CONFIG" }, 503);
  if (!codeQuotaLeft(ipOf(c))) {
    log("refused", null, { action: "mail-code", reason: "too many codes" }, { ip: ipOf(c) });
    return c.json({ error: "Too many codes asked for. Try again in an hour." }, 429);
  }
  codeMailed.push({ ip: ipOf(c), at: Date.now() });
  const code = code6();
  if (!storeCode(email, purpose, hashCode(email, code))) return c.json({ error: "A code went to that address under a minute ago. Check your inbox (and junk)." }, 429);
  const subject = purpose === "signup" ? `${code} is your ANU Crossing sign-up code` : `${code} resets your ANU Crossing password`;
  const text = `Your code is ${code}. It works for ten minutes.\n\nIf you didn't ask for it, ignore this email.\n\nANU Crossing is an unofficial, fan-made campus; it isn't an ANU service.`;
  try {
    await sendMail(email, subject, text);
  } catch (err) {
    forgetCode(email);
    return c.json({ error: `The email didn't go. Please tell the admin. Error code: ${err instanceof MailFailure ? err.code : "MAIL-SEND"}` }, 502);
  }
  log("mail-code", null, { purpose }, { ip: ipOf(c) });
  return c.json({ sent: true, to: email });
}

app.post("/api/signup/start", async (c) => {
  const b = await body(c);
  const who2 = anuEmail(b);
  if ("error" in who2) return c.json({ error: who2.error }, 400);
  if (findByEmail(who2.email)) return c.json({ error: "That email has an account already. Sign in, or reset its password." }, 409);
  return sendCode(c, who2.email, "signup");
});

app.post("/api/signup/finish", async (c) => {
  const b = await body(c);
  const who2 = anuEmail(b);
  if ("error" in who2) return c.json({ error: who2.error }, 400);
  const stored = takeCode(who2.email, "signup");
  if (!stored || typeof b.code !== "string" || stored !== hashCode(who2.email, b.code.trim())) {
    log("join-refused", null, { reason: "wrong sign-up code" }, { ip: ipOf(c) });
    return c.json({ error: "That code is wrong or too old. Ask for a new one." }, 401);
  }
  const name = typeof b.name === "string" ? b.name.normalize("NFKC").trim() : "";
  if (!NAME_RULE.test(name) || RESERVED.test(name) || /^guest/i.test(name)) return c.json({ error: "Names are 1–8 letters, digits or underscores (not qa_ or guest…)." }, 400);
  if (findByName(name)) return c.json({ error: `"${name}" is taken. Pick another name.` }, 409);
  if (typeof b.password !== "string" || b.password.length < 8 || b.password.length > 200) return c.json({ error: "A password of at least 8 characters." }, 400);
  if (findByEmail(who2.email)) return c.json({ error: "That email has an account already." }, 409);
  const token = randomUUID();
  const role = who2.staff ? "staff" : "student";
  createMember(name, token, role, who2.email, hashPassword(b.password));
  forgetCode(who2.email);
  log("signed-up", { name, token }, { role }, { ip: ipOf(c) });
  return c.json({ name, token, role, spawn: { space: FIRST_SPACE, ...SPACES[FIRST_SPACE]!.spawn }, look: null }, 201);
});

app.post("/api/password/start", async (c) => {
  const b = await body(c);
  const who2 = anuEmail(b);
  if ("error" in who2) return c.json({ error: who2.error }, 400);
  // No account, no email; the answer looks the same, though sign-up's own
  // "has an account already" says as much anyway (a student number isn't secret).
  if (!findByEmail(who2.email)) return c.json({ sent: true, to: who2.email });
  return sendCode(c, who2.email, "reset");
});

app.post("/api/password/finish", async (c) => {
  const b = await body(c);
  const who2 = anuEmail(b);
  if ("error" in who2) return c.json({ error: who2.error }, 400);
  const account = findByEmail(who2.email);
  const stored = takeCode(who2.email, "reset");
  if (!account || !stored || typeof b.code !== "string" || stored !== hashCode(who2.email, b.code.trim())) return c.json({ error: "That code is wrong or too old. Ask for a new one." }, 401);
  if (typeof b.password !== "string" || b.password.length < 8 || b.password.length > 200) return c.json({ error: "A password of at least 8 characters." }, 400);
  const token = randomUUID();
  resetPassword(account.name, hashPassword(b.password), token);
  forgetCode(who2.email);
  // Open tabs were let in by the old token: put them out too.
  kick(account.name);
  log("password-reset", account, {}, { ip: ipOf(c) });
  return c.json({ name: account.name, token, role: account.role, spawn: lastSpot(account.name), look: lookOf(account.name) });
});

// --- mail (plan 16) ------------------------------------------------------------
// A message to someone signed up, by name, read whenever they come in. Only
// members send it (and only to members); one every 30 seconds; a subject
// (80) and up to 1000 characters. Its reader sees it, and may delete it; its
// sender sees what they sent. If the reader is online, their mailbox lights
// up at once. The log notes that mail went, not what it said.

app.post("/api/mail", async (c) => {
  const b = await body(c);
  const v = who(b);
  if (!v) return c.json({ error: "Join first." }, 401);
  const guest = guestRefused(c, v, "mail");
  if (guest) return guest;
  const barred = stopped(c, v, "posts", { action: "mail" });
  if (barred) return barred;
  const to = typeof b.to === "string" ? findByName(b.to.normalize("NFKC").trim()) : undefined;
  if (!to || !isMember(to)) return c.json({ error: "There's nobody signed up by that name." }, 404);
  if (to.name.toLowerCase() === v.name.toLowerCase()) return c.json({ error: "That's you." }, 400);
  const subject = typeof b.subject === "string" ? b.subject.trim() : "";
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (!subject || subject.length > 80) return c.json({ error: "A subject, up to 80 characters." }, 400);
  if (!text || text.length > 1000) return c.json({ error: "Write something, up to 1000 characters." }, 400);
  const sent = sendMailTo(v.name, to.name, subject, text);
  if (!sent) return c.json({ error: "One message every 30 seconds." }, 429);
  log("mail-sent", v, { to: to.name, chars: text.length });
  tellPerson(to.name, { t: "action", kind: "mail", unread: unreadCount(to.name) });
  return c.json(sent, 201);
});

app.post("/api/mail/box", async (c) => {
  const v = who(await body(c));
  if (!v) return c.json({ error: "Join first." }, 401);
  return c.json({ inbox: inboxOf(v.name), sent: sentBy(v.name), unread: unreadCount(v.name) });
});

app.post("/api/mail/:id/read", async (c) => {
  const v = who(await body(c));
  if (!v) return c.json({ error: "Join first." }, 401);
  const m = findMail(Number(c.req.param("id")));
  if (!m || m.reader.toLowerCase() !== v.name.toLowerCase()) return c.json({ error: "That message is gone." }, 404);
  markRead(m.id);
  return c.json({ unread: unreadCount(v.name) });
});

app.delete("/api/mail/:id", async (c) => {
  const v = who(await body(c));
  if (!v) return c.json({ error: "Join first." }, 401);
  const m = findMail(Number(c.req.param("id")));
  if (!m || m.reader.toLowerCase() !== v.name.toLowerCase()) return c.json({ error: "That message is gone." }, 404);
  deleteMail(m.id, v.name);
  return c.json({ unread: unreadCount(v.name) });
});

// --- the AI campus assistants (plan 56) ---------------------------------------
// Where they stand and what they cover (npcs.ts). Anyone joined may ask, guests
// too, one question every three seconds, 500 characters; nothing is stored or
// logged but that someone asked whom. Not connected to a model yet.
app.get("/api/npcs", (c) => c.json(NPCS.map(({ id, name, role, space, x, z, rot, look, links, greeting }) => ({ id, name, role, space, x, z, rot, look, links, greeting }))));

const lastAsked = new Map<string, number>();
const askedBy = new Map<string, { day: string; n: number }>();
app.post("/api/npc/:id/ask", async (c) => {
  const b = await body(c);
  const v = who(b);
  if (!v) return c.json({ error: "Join first." }, 401);
  const npc = npcById(c.req.param("id"));
  if (!npc) return c.json({ error: "Nobody by that name here." }, 404);
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (!text) return c.json({ error: "Ask something first." }, 400);
  if (text.length > 500) return c.json({ error: "Up to 500 characters." }, 400);
  const now = Date.now();
  const key = v.name.toLowerCase();
  if (now - (lastAsked.get(key) ?? 0) < 3000) return c.json({ error: "One question every few seconds." }, 429);
  // Thirty a person a day (a paid model answers): kept in memory, by day.
  const day = new Date().toISOString().slice(0, 10);
  const asked = askedBy.get(key);
  const count = asked?.day === day ? asked.n : 0;
  if (count >= 30) return c.json({ error: "That's thirty questions today. The assistants are back tomorrow." }, 429);
  askedBy.set(key, { day, n: count + 1 });
  lastAsked.set(key, now);
  log("npc-asked", v, { npc: npc.id, chars: text.length });
  return c.json({ reply: await answer(npc, text), links: npc.links });
});

// The spec's view of what was "sent" (MAIL_TEST_OUTBOX=1, the CI container only).
app.get("/api/test/mail", (c) => {
  if (!testOutbox()) return c.json({ error: "Not here." }, 404);
  const m = lastMail(c.req.query("to") ?? "");
  return m ? c.json(m) : c.json({ error: "Nothing sent there." }, 404);
});

// --- sticky notes ----------------------------------------------------------

app.get("/api/notes", (c) => {
  const space = c.req.query("space");
  if (!isSpace(space)) return c.json({ error: "No such place." }, 404);
  return c.json(notesIn(space));
});

app.post("/api/notes", async (c) => {
  const b = await body(c);
  const v = who(b);
  if (!v) return c.json({ error: "Join first." }, 401);
  if (!isSpace(b.space)) return c.json({ error: "No such place." }, 400);
  const guestNo = guestRefused(c, v, "note");
  if (guestNo) return guestNo;
  const barred = stopped(c, v, "notes", { action: "note", space: b.space });
  if (barred) return barred;
  if (typeof b.x !== "number" || typeof b.z !== "number" || !Number.isFinite(b.x) || !Number.isFinite(b.z)) {
    return c.json({ error: "A note needs a place." }, 400);
  }
  const bad = textError(b.text);
  if (bad) {
    log("refused", v, { action: "note", space: b.space, reason: bad }, { ip: ipOf(c), content: typeof b.text === "string" ? b.text.slice(0, 3000) : null });
    return c.json({ error: bad }, 400);
  }
  const { x, z } = clampTo(b.space, b.x, b.z);
  const where = noteSpotError(b.space, x, z);
  if (where) {
    log("refused", v, { action: "note", space: b.space, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, reason: where }, { ip: ipOf(c), content: (b.text as string).trim() });
    return c.json({ error: where }, 400);
  }
  // What a sixth note pushes out, for the admin's log (read before it goes).
  const oldest = noteCount(v.name, b.space) >= NOTES_PER_SPACE ? notesIn(b.space).find((n) => n.author === v.name) : undefined;
  const replacedText = oldest?.text ?? null;
  const result = addNote(v.name, b.space, x, z, (b.text as string).trim());
  if (!result.ok) {
    log("refused", v, { action: "note", space: b.space, reason: "too soon", wait: result.wait }, { ip: ipOf(c), content: (b.text as string).trim() });
    return c.json({ error: `One note every 30 seconds. Wait ${result.wait}s.`, wait: result.wait }, 429);
  }
  log("note", v, { space: b.space, note: result.note.id, words: wordCount(result.note.text) }, { ip: ipOf(c), content: result.note.text });
  if (result.replaced !== null) log("note-replaced", v, { space: b.space, note: result.replaced, by: result.note.id }, { ip: ipOf(c), content: replacedText });
  // Everyone in the space sees it land (and the replaced one go) right away.
  if (result.replaced !== null) broadcastSpace(b.space, { t: "action", kind: "note-removed", id: result.replaced });
  broadcastSpace(b.space, { t: "action", kind: "note", note: result.note });
  return c.json({ note: result.note, replaced: result.replaced }, 201);
});

/** How many notes the caller already has in a space, so the client can warn before a sixth. */
app.post("/api/notes/mine", async (c) => {
  const b = await body(c);
  const v = who(b);
  if (!v) return c.json({ error: "Join first." }, 401);
  if (!isSpace(b.space)) return c.json({ error: "No such place." }, 400);
  return c.json({ count: noteCount(v.name, b.space), limit: NOTES_PER_SPACE });
});

app.delete("/api/notes/:id", async (c) => {
  const v = who(await body(c));
  if (!v) return c.json({ error: "Join first." }, 401);
  const note = findNote(Number(c.req.param("id")));
  if (!note) return c.json({ error: "That note is gone." }, 404);
  if (!mayRemove(v, note.author)) {
    log("refused", v, { action: "remove note", space: note.space, note: note.id, owner: note.author, reason: "not the author" }, { ip: ipOf(c), content: note.text });
    return c.json({ error: "Only its author can remove this note." }, 403);
  }
  deleteNote(note.id);
  log("note-removed", v, { space: note.space, note: note.id, owner: note.author }, { ip: ipOf(c), content: note.text });
  broadcastSpace(note.space, { t: "action", kind: "note-removed", id: note.id });
  return c.json({ ok: true });
});

// --- comments --------------------------------------------------------------

app.get("/api/notes/:id/comments", (c) => {
  const note = findNote(Number(c.req.param("id")));
  if (!note) return c.json({ error: "That note is gone." }, 404);
  return c.json(commentsOn(note.id));
});

app.post("/api/notes/:id/comments", async (c) => {
  const b = await body(c);
  const v = who(b);
  if (!v) return c.json({ error: "Join first." }, 401);
  const guest = guestRefused(c, v, "comment");
  if (guest) return guest;
  const note = findNote(Number(c.req.param("id")));
  if (!note) return c.json({ error: "That note is gone." }, 404);
  const barred = stopped(c, v, "notes", { action: "comment", space: note.space, note: note.id });
  if (barred) return barred;
  const bad = textError(b.text);
  if (bad) {
    log("refused", v, { action: "comment", space: note.space, note: note.id, reason: bad }, { ip: ipOf(c), content: typeof b.text === "string" ? b.text.slice(0, 3000) : null });
    return c.json({ error: bad }, 400);
  }
  const result = addComment(v.name, note.id, (b.text as string).trim());
  if (!result.ok) {
    log("refused", v, { action: "comment", space: note.space, note: note.id, reason: "too soon", wait: result.wait }, { ip: ipOf(c), content: (b.text as string).trim() });
    return c.json({ error: `One comment every 10 seconds. Wait ${result.wait}s.`, wait: result.wait }, 429);
  }
  log("comment", v, { space: note.space, note: note.id, comment: result.comment.id, words: wordCount(result.comment.text) }, { ip: ipOf(c), content: result.comment.text });
  broadcastSpace(note.space, { t: "action", kind: "comment", comment: result.comment });
  return c.json(result.comment, 201);
});

// Hearts on comments: one each, a second press takes it back. Anyone joined
// (the same people who may comment), never your own, nothing logged (it's
// not something anyone wrote).
app.post("/api/comments/:id/heart", async (c) => {
  const v = who(await body(c));
  if (!v) return c.json({ error: "Join first." }, 401);
  const guest = guestRefused(c, v, "heart");
  if (guest) return guest;
  const comment = findComment(Number(c.req.param("id")));
  if (!comment) return c.json({ error: "That comment is gone." }, 404);
  if (comment.author.toLowerCase() === v.name.toLowerCase()) return c.json({ error: "You can't heart your own comment." }, 400);
  const hearted = toggleHeart("note", comment.id, v.name);
  const note = findNote(comment.noteId);
  if (note) broadcastSpace(note.space, { t: "action", kind: "hearts", noteId: note.id });
  return c.json({ hearted, hearts: findComment(comment.id)!.heartedBy.length });
});

app.post("/api/board-comments/:id/heart", async (c) => {
  const v = who(await body(c));
  if (!v) return c.json({ error: "Join first." }, 401);
  const guest = guestRefused(c, v, "heart");
  if (guest) return guest;
  const comment = findPostComment(Number(c.req.param("id")));
  if (!comment) return c.json({ error: "That comment is gone." }, 404);
  if (comment.author.toLowerCase() === v.name.toLowerCase()) return c.json({ error: "You can't heart your own comment." }, 400);
  const post = findPost(comment.postId);
  if (post && !maySeePost(v, post)) return c.json({ error: "That comment is gone." }, 404);
  const hearted = toggleHeart("post", comment.id, v.name);
  if (post) broadcastSpace(spaceOfBoard(post.space), boardChanged(post));
  return c.json({ hearted, hearts: findPostComment(comment.id)!.heartedBy.length });
});

app.delete("/api/comments/:id", async (c) => {
  const v = who(await body(c));
  if (!v) return c.json({ error: "Join first." }, 401);
  const comment = findComment(Number(c.req.param("id")));
  if (!comment) return c.json({ error: "That comment is gone." }, 404);
  const note = findNote(comment.noteId);
  if (!mayRemove(v, comment.author)) {
    log("refused", v, { action: "remove comment", space: note?.space, comment: comment.id, owner: comment.author, reason: "not the author" }, { ip: ipOf(c), content: comment.text });
    return c.json({ error: "Only its author can remove this comment." }, 403);
  }
  deleteComment(comment.id);
  log("comment-removed", v, { space: note?.space, comment: comment.id, owner: comment.author }, { ip: ipOf(c), content: comment.text });
  if (note) broadcastSpace(note.space, { t: "action", kind: "comment-removed", id: comment.id, noteId: note.id });
  return c.json({ ok: true });
});

// --- classrooms -------------------------------------------------------------
// Anyone may list them (the picker at 155's door); only staff and the admin
// open or close one. The check is here on the server, so a request crafted outside
// the app gets the same answer as a click in it.

app.get("/api/classrooms", (c) => c.json(classroomList()));

app.post("/api/classrooms", async (c) => {
  const b = await body(c);
  const v = who(b);
  if (!v) return c.json({ error: "Join first." }, 401);
  const code = typeof b.code === "string" ? b.code.trim().toUpperCase() : "";
  if (!isStaff(v)) {
    log("refused", v, { action: "create classroom", code, reason: "not staff" }, { ip: ipOf(c) });
    return c.json({ error: "Only staff can open a classroom." }, 403);
  }
  if (!CLASSROOM_CODE.test(code)) return c.json({ error: "Use a course code like COMP6300." }, 400);
  if (!addClassroom(code, v.name)) return c.json({ error: `${code} is already open.` }, 409);
  log("classroom-created", v, { code, space: classroomSpace(code) }, { ip: ipOf(c) });
  broadcastAll({ t: "action", kind: "classrooms", classrooms: classroomList() });
  return c.json({ code, space: classroomSpace(code) }, 201);
});

app.delete("/api/classrooms/:code", async (c) => {
  const v = who(await body(c));
  if (!v) return c.json({ error: "Join first." }, 401);
  const code = c.req.param("code").toUpperCase();
  if (!isStaff(v)) {
    log("refused", v, { action: "remove classroom", code, reason: "not staff" }, { ip: ipOf(c) });
    return c.json({ error: "Only staff can close a classroom." }, 403);
  }
  const space = classroomSpace(code);
  // Anyone inside is sent back out first, so nobody is left in a room that's gone.
  let moved = evictSpace(space, FIRST_SPACE, { x: -8.4, z: 7 });
  for (const room of teamRoomsOf(space)) moved += evictSpace(room, FIRST_SPACE, { x: -8.4, z: 7 });
  if (!removeClassroom(code)) return c.json({ error: `${code} isn't open.` }, 404);
  log("classroom-removed", v, { code, space, moved }, { ip: ipOf(c) });
  broadcastAll({ t: "action", kind: "classrooms", classrooms: classroomList() });
  return c.json({ ok: true });
});

// The whiteboard and the board to its right open a web page the admin
// chooses, in the in-app window (COMP8020's are fixed: its course page and
// the classmates' projects). Only the admin sets them, checked here; any
// https address, since it's only ever opened, never fetched by the server.

const MAX_URL = 500;

app.put("/api/classrooms/:code/link", async (c) => {
  const b = await body(c);
  const v = who(b);
  if (!v) return c.json({ error: "Join first." }, 401);
  const code = c.req.param("code").toUpperCase();
  const which = b.which;
  if (!isStaff(v)) {
    log("refused", v, { action: "set classroom link", code, reason: "not staff" }, { ip: ipOf(c) });
    return c.json({ error: "Only staff can set what the boards open." }, 403);
  }
  if (which !== "board" && which !== "side") return c.json({ error: "Which board?" }, 400);
  let url: string | null = null;
  if (typeof b.url === "string" && b.url.trim()) {
    try {
      const u = new URL(b.url.trim());
      if (u.protocol !== "https:" || b.url.trim().length > MAX_URL) throw new Error();
      url = u.href;
    } catch {
      return c.json({ error: "Use a full https:// address." }, 400);
    }
  }
  const newTab = b.newTab === true;
  if (!setClassroomLink(code, which, url, newTab)) return c.json({ error: `${code} isn't open.` }, 404);
  log("classroom-link", v, { code, which, url, newTab }, { ip: ipOf(c) });
  broadcastAll({ t: "action", kind: "classrooms", classrooms: classroomList() });
  return c.json({ ok: true });
});

// --- classmates' final projects -------------------------------------------------
// COMP8020's side board lists the course's final-project apps that are up:
// public comp4020-final-* repos in the course's GitHub organisation, each
// tried at https://<repo>.fly.dev/, kept only if it answers. Looked up at
// start and then every six hours, never per request, so visitors can't make
// this server hammer GitHub or anyone's app.

const ORG = "comp4020-agentic-coding-studio";
const PROJECTS_EVERY_MS = 6 * 60 * 60 * 1000;
// A deploy restarts the server, and the check takes a minute or two: until
// it's done, the list from before the restart shows, not an empty board.
type Projects = { projects: { name: string; url: string }[]; checkedAt: string | null };
const saved = cached<Projects>("projects");
let projects: Projects["projects"] = saved?.projects ?? [];
let projectsCheckedAt: string | null = saved?.checkedAt ?? null;

async function refreshProjects(): Promise<void> {
  try {
    const repos: string[] = [];
    // The search finds them in two requests where listing the organisation's
    // repos takes a dozen, which matters at 60 requests an hour without a key.
    for (let page = 1; page <= 5; page++) {
      const q = encodeURIComponent(`comp4020-final in:name org:${ORG} is:public`);
      const res = await fetch(`https://api.github.com/search/repositories?q=${q}&per_page=100&page=${page}`, {
        headers: { accept: "application/vnd.github+json", "user-agent": "comp4020-final-passionleader" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`GitHub ${res.status}`);
      const batch = ((await res.json()) as { items: { name: string }[] }).items;
      repos.push(...batch.map((r) => r.name).filter((n) => /^comp4020-final-[a-z0-9-]+$/i.test(n)));
      if (batch.length < 100) break;
    }
    const found: { name: string; url: string }[] = [];
    // A few at a time, each with a short timeout: a sleeping app that won't wake in time is left out.
    for (let i = 0; i < repos.length; i += 8) {
      await Promise.all(
        repos.slice(i, i + 8).map(async (repo) => {
          const url = `https://${repo.toLowerCase()}.fly.dev/`;
          const res = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(8000) }).catch(() => null);
          if (res?.ok) found.push({ name: repo.slice("comp4020-final-".length), url });
          await res?.body?.cancel().catch(() => {});
        }),
      );
    }
    projects = found.sort((a, b) => a.name.localeCompare(b.name));
    projectsCheckedAt = new Date().toISOString();
    setCached("projects", { projects, checkedAt: projectsCheckedAt });
    console.log(JSON.stringify({ at: projectsCheckedAt, event: "projects-checked", repos: repos.length, live: projects.length }));
  } catch (err) {
    console.error("projects check failed:", err instanceof Error ? err.message : err);
  }
}
if (process.env.PROJECTS_CHECK !== "0") {
  void refreshProjects();
  setInterval(() => void refreshProjects(), PROJECTS_EVERY_MS).unref();
}

app.get("/api/projects", (c) => c.json({ projects, checkedAt: projectsCheckedAt }));

// --- boards ------------------------------------------------------------------
// Classrooms (Q&A, Notices, Board), the Student Hub and the lawn each have a
// board; boards.ts lists their tabs. Anyone reads everything, posts in most
// tabs and comments anywhere. Only staff and the admin post in a staff-only
// tab like Notices: checked here,
// refused with a 403 and a log line. Authors and the admin remove posts and
// comments.

// Not a row: the first thing in every staff-only tab, saying who may post there.
const pinnedNotice = (label: string) => ({
  id: 0,
  tab: label,
  author: "ANU Crossing",
  title: "Who can post here",
  text: `Only lecturers and staff can post in ${label}, so other users can't post here. Everyone can read and comment.`,
  createdAt: "",
  comments: 0,
  pinned: true,
});

app.get("/api/board-config", (c) => {
  const board = boardOf(c.req.query("space"));
  if (!board) return c.json({ error: "There's no board here." }, 404);
  return c.json(board);
});

app.get("/api/board", (c) => {
  const space = c.req.query("space");
  const board = boardOf(space);
  if (!board) return c.json({ error: "There's no board here." }, 404);
  const tab = tabOf(board, c.req.query("tab"));
  if (!tab) return c.json({ error: "No such tab." }, 400);
  const viewer = who({ token: c.req.query("token") });
  const posts = postsIn(space!, tab.id, board.keepDays)
    .filter((p) => maySeePost(viewer, p))
    .map((p) => ({ ...p, files: filesOn("post", p.id).map(({ id, name, size }) => ({ id, name, size })) }));
  return c.json(tab.staffOnly ? [{ ...pinnedNotice(tab.label), tab: tab.id }, ...posts] : posts);
});

app.post("/api/board", async (c) => {
  const b = await body(c);
  const v = who(b);
  if (!v) return c.json({ error: "Join first." }, 401);
  const guest = guestRefused(c, v, "post");
  if (guest) return guest;
  const board = boardOf(b.space);
  if (!board) return c.json({ error: "There's no board here." }, 400);
  const tab = tabOf(board, b.tab);
  if (!tab) return c.json({ error: "No such tab." }, 400);
  const space = b.space as string;
  const barred = stopped(c, v, "posts", { action: "post", space, tab: tab.id });
  if (barred) return barred;
  const content = typeof b.title === "string" || typeof b.text === "string" ? `${String(b.title ?? "")}\n\n${String(b.text ?? "")}`.slice(0, 3200) : null;
  if (!mayPostIn(v, tab)) {
    log("refused", v, { action: "post", space, tab: tab.id, reason: "staff only" }, { ip: ipOf(c), content });
    return c.json({ error: `Only lecturers and staff can post in ${tab.label}.` }, 403);
  }
  const bad = postError(b.title, b.text);
  if (bad) {
    log("refused", v, { action: "post", space, tab: tab.id, reason: bad }, { ip: ipOf(c), content });
    return c.json({ error: bad }, 400);
  }
  // A study group says how many people (2-20); elsewhere there's no size.
  let capacity: number | null = null;
  if (board.groups) {
    capacity = typeof b.capacity === "number" && Number.isInteger(b.capacity) ? b.capacity : NaN;
    if (!(capacity >= 2 && capacity <= 20)) return c.json({ error: "How many people? Between 2 and 20." }, 400);
  }
  const result = addPost(v.name, space, tab.id, (b.title as string).trim(), (b.text as string).trim(), board.allowPrivate === true && b.private === true, capacity);
  if (!result.ok) {
    log("refused", v, { action: "post", space, tab: tab.id, reason: "too soon", wait: result.wait }, { ip: ipOf(c), content });
    return c.json({ error: `One post every 30 seconds. Wait ${result.wait}s.`, wait: result.wait }, 429);
  }
  log("post", v, { space, tab: tab.id, post: result.post.id, words: wordCount(result.post.text) }, { ip: ipOf(c), content: `${result.post.title}\n\n${result.post.text}` });
  broadcastSpace(spaceOfBoard(space), { t: "action", kind: "board", tab: tab.id });
  return c.json(result.post, 201);
});

// Joining a study group (or leaving it): anyone joined, never past its size;
// its writer stays in. Everyone at the board sees the count change.
app.post("/api/board/:id/join", async (c) => {
  const v = who(await body(c));
  if (!v) return c.json({ error: "Join first." }, 401);
  const guest = guestRefused(c, v, "join group");
  if (guest) return guest;
  const post = findPost(Number(c.req.param("id")));
  if (!post || !maySeePost(v, post)) return c.json({ error: "That post is gone." }, 404);
  if (post.capacity === null) return c.json({ error: "That isn't a study group." }, 400);
  const barred = stopped(c, v, "posts", { action: "join group", space: post.space, post: post.id });
  if (barred) return barred;
  const r = toggleMember(post, v.name);
  if (!r.ok) return c.json({ error: r.why === "full" ? "That group is full." : "It's your group: remove the post to close it." }, 409);
  log("group-joined", v, { space: post.space, post: post.id, joined: r.joined, members: r.members.length, capacity: post.capacity });
  broadcastSpace(spaceOfBoard(post.space), boardChanged(post));
  return c.json({ joined: r.joined, members: r.members });
});

app.delete("/api/board/:id", async (c) => {
  const v = who(await body(c));
  if (!v) return c.json({ error: "Join first." }, 401);
  const post = findPost(Number(c.req.param("id")));
  if (!post) return c.json({ error: "That post is gone." }, 404);
  if (!mayRemove(v, post.author)) {
    log("refused", v, { action: "remove post", space: post.space, post: post.id, owner: post.author, reason: "not the author" }, { ip: ipOf(c), content: `${post.title}\n\n${post.text}` });
    return c.json({ error: "Only its author can remove this post." }, 403);
  }
  removeObjects(filesOn("post", post.id, true).map((f) => f.key));
  deletePost(post.id);
  log("post-removed", v, { space: post.space, tab: post.tab, post: post.id, owner: post.author }, { ip: ipOf(c), content: `${post.title}\n\n${post.text}` });
  broadcastSpace(spaceOfBoard(post.space), { t: "action", kind: "board", tab: post.tab });
  return c.json({ ok: true });
});

// Editing: only the author, never the admin on someone else's behalf (an
// admin removes; putting words in someone's mouth is another matter). Same
// limits as posting, no cooldown; the post or comment then says "edited".
app.patch("/api/board/:id", async (c) => {
  const b = await body(c);
  const v = who(b);
  if (!v) return c.json({ error: "Join first." }, 401);
  const guest = guestRefused(c, v, "edit post");
  if (guest) return guest;
  const post = findPost(Number(c.req.param("id")));
  if (!post) return c.json({ error: "That post is gone." }, 404);
  const barred = stopped(c, v, "posts", { action: "edit post", space: post.space, post: post.id });
  if (barred) return barred;
  const content = typeof b.title === "string" || typeof b.text === "string" ? `${String(b.title ?? "")}\n\n${String(b.text ?? "")}`.slice(0, 3200) : null;
  if (v.name.toLowerCase() !== post.author.toLowerCase()) {
    log("refused", v, { action: "edit post", space: post.space, post: post.id, owner: post.author, reason: "not the author" }, { ip: ipOf(c), content });
    return c.json({ error: "Only its author can edit this post." }, 403);
  }
  const bad = postError(b.title, b.text);
  if (bad) {
    log("refused", v, { action: "edit post", space: post.space, post: post.id, reason: bad }, { ip: ipOf(c), content });
    return c.json({ error: bad }, 400);
  }
  // A study group's writer may change its size, never below who's in it now.
  let capacity: number | undefined;
  if (post.capacity !== null && b.capacity !== undefined) {
    const n = typeof b.capacity === "number" && Number.isInteger(b.capacity) ? b.capacity : NaN;
    if (!(n >= 2 && n <= 20)) return c.json({ error: "How many people? Between 2 and 20." }, 400);
    if (n < post.members.length) return c.json({ error: `${post.members.length} people are in it already: it can't be smaller than that.` }, 400);
    capacity = n;
  }
  const edited = editPost(post.id, (b.title as string).trim(), (b.text as string).trim(), capacity);
  log("post-edited", v, { space: post.space, tab: post.tab, post: post.id, words: wordCount(edited.text) }, { ip: ipOf(c), content: `${edited.title}\n\n${edited.text}` });
  broadcastSpace(spaceOfBoard(post.space), boardChanged(post));
  return c.json({ ...edited, files: filesOn("post", edited.id).map(({ id, name, size }) => ({ id, name, size })) });
});

app.get("/api/board/:id/comments", (c) => {
  const post = findPost(Number(c.req.param("id")));
  if (!post || !maySeePost(who({ token: c.req.query("token") }), post)) return c.json({ error: "That post is gone." }, 404);
  return c.json(postCommentsOn(post.id));
});

app.post("/api/board/:id/comments", async (c) => {
  const b = await body(c);
  const v = who(b);
  if (!v) return c.json({ error: "Join first." }, 401);
  const guest = guestRefused(c, v, "post comment");
  if (guest) return guest;
  const post = findPost(Number(c.req.param("id")));
  if (!post || !maySeePost(v, post)) return c.json({ error: "That post is gone." }, 404);
  const barred = stopped(c, v, "posts", { action: "post comment", space: post.space, post: post.id });
  if (barred) return barred;
  const bad = textError(b.text);
  if (bad) {
    log("refused", v, { action: "post comment", space: post.space, post: post.id, reason: bad }, { ip: ipOf(c), content: typeof b.text === "string" ? b.text.slice(0, 3000) : null });
    return c.json({ error: bad }, 400);
  }
  const result = addPostComment(v.name, post.id, (b.text as string).trim());
  if (!result.ok) {
    log("refused", v, { action: "post comment", space: post.space, post: post.id, reason: "too soon", wait: result.wait }, { ip: ipOf(c), content: (b.text as string).trim() });
    return c.json({ error: `One comment every 10 seconds. Wait ${result.wait}s.`, wait: result.wait }, 429);
  }
  log("post-comment", v, { space: post.space, tab: post.tab, post: post.id, comment: result.comment.id, words: wordCount(result.comment.text) }, { ip: ipOf(c), content: result.comment.text });
  broadcastSpace(spaceOfBoard(post.space), boardChanged(post));
  return c.json(result.comment, 201);
});

app.patch("/api/board-comments/:id", async (c) => {
  const b = await body(c);
  const v = who(b);
  if (!v) return c.json({ error: "Join first." }, 401);
  const guest = guestRefused(c, v, "edit comment");
  if (guest) return guest;
  const comment = findPostComment(Number(c.req.param("id")));
  if (!comment) return c.json({ error: "That comment is gone." }, 404);
  const post = findPost(comment.postId);
  const barred = stopped(c, v, "posts", { action: "edit post comment", space: post?.space, comment: comment.id });
  if (barred) return barred;
  if (v.name.toLowerCase() !== comment.author.toLowerCase()) {
    log("refused", v, { action: "edit post comment", space: post?.space, comment: comment.id, owner: comment.author, reason: "not the author" }, { ip: ipOf(c), content: typeof b.text === "string" ? b.text.slice(0, 3000) : null });
    return c.json({ error: "Only its author can edit this comment." }, 403);
  }
  const bad = textError(b.text);
  if (bad) {
    log("refused", v, { action: "edit post comment", space: post?.space, comment: comment.id, reason: bad }, { ip: ipOf(c), content: typeof b.text === "string" ? b.text.slice(0, 3000) : null });
    return c.json({ error: bad }, 400);
  }
  const edited = editPostComment(comment.id, (b.text as string).trim());
  log("post-comment-edited", v, { space: post?.space, comment: comment.id, words: wordCount(edited.text) }, { ip: ipOf(c), content: edited.text });
  if (post) broadcastSpace(spaceOfBoard(post.space), boardChanged(post));
  return c.json(edited);
});

app.delete("/api/board-comments/:id", async (c) => {
  const v = who(await body(c));
  if (!v) return c.json({ error: "Join first." }, 401);
  const comment = findPostComment(Number(c.req.param("id")));
  if (!comment) return c.json({ error: "That comment is gone." }, 404);
  const post = findPost(comment.postId);
  if (!mayRemove(v, comment.author)) {
    log("refused", v, { action: "remove post comment", space: post?.space, comment: comment.id, owner: comment.author, reason: "not the author" }, { ip: ipOf(c), content: comment.text });
    return c.json({ error: "Only its author can remove this comment." }, 403);
  }
  deletePostComment(comment.id);
  log("post-comment-removed", v, { space: post?.space, comment: comment.id, owner: comment.author }, { ip: ipOf(c), content: comment.text });
  if (post) broadcastSpace(spaceOfBoard(post.space), boardChanged(post));
  return c.json({ ok: true });
});

// --- the admin's log and bug reports -------------------------------------------
// The Student Hub's admin PC opens /admin/ (and so can a browser tab, for
// reading along during a crit). Only the admin reads either, checked here on
// every request; anyone joined may send a bug report.

const AUDIT_GROUPS: Record<string, string[]> = {
  admin: ["restricted", "restriction-lifted", "kicked", "classroom-created", "classroom-removed", "classroom-link"],
  content: ["note", "note-replaced", "note-removed", "note-expired", "comment", "comment-removed", "post", "post-removed", "post-comment", "post-comment-removed", "bug-report", "person-report", "file"],
  signin: ["join", "join-refused", "connect", "disconnect"],
  refused: ["refused", "join-refused"],
};

async function asAdmin(c: Context): Promise<{ v: Visitor; b: Body } | Response> {
  const b = await body(c);
  const v = who(b);
  if (!v) return c.json({ error: "Join first." }, 401);
  if (v.role !== "admin") {
    log("refused", v, { action: "read admin log", reason: "not admin" }, { ip: ipOf(c) });
    return c.json({ error: "This is for the admin." }, 403);
  }
  return { v, b };
}

app.post("/api/admin/log", async (c) => {
  const r = await asAdmin(c);
  if (r instanceof Response) return r;
  const { b } = r;
  const str = (x: unknown): string | undefined => (typeof x === "string" && x.trim() ? x.trim().slice(0, 80) : undefined);
  const event = str(b.event);
  const events = event ? (AUDIT_GROUPS[event] ?? [event]) : undefined;
  const limit = typeof b.limit === "number" ? Math.max(1, Math.min(500, Math.floor(b.limit))) : 200;
  const before = typeof b.before === "number" && Number.isFinite(b.before) ? b.before : undefined;
  return c.json({ entries: auditEntries({ who: str(b.who), space: str(b.space), events, before, limit }), keepDays: AUDIT_DAYS });
});

app.post("/api/admin/bugs", async (c) => {
  const r = await asAdmin(c);
  if (r instanceof Response) return r;
  return c.json({ bugs: bugReports().map((b) => ({ ...b, files: filesOn("bug", b.id).map(({ id, name, size }) => ({ id, name, size })) })) });
});

app.delete("/api/admin/bugs/:id", async (c) => {
  const r = await asAdmin(c);
  if (r instanceof Response) return r;
  const id = Number(c.req.param("id"));
  const shots = filesOn("bug", id, true).map((f) => f.key);
  if (!deleteBugReport(id)) return c.json({ error: "Already gone." }, 404);
  removeObjects(shots);
  return c.json({ ok: true });
});

// Stopping someone doing one thing (notes, board posts, chat, or coming in
// at all) for a while; the server checks before each of those. The admin
// can't be restricted, and every change is logged.
app.post("/api/admin/restrictions", async (c) => {
  const r = await asAdmin(c);
  if (r instanceof Response) return r;
  return c.json({ restrictions: restrictions(), kinds: RESTRICTABLE });
});

app.put("/api/admin/restrictions", async (c) => {
  const r = await asAdmin(c);
  if (r instanceof Response) return r;
  const { v, b } = r;
  const target = typeof b.name === "string" ? findByName(b.name.trim()) : undefined;
  if (!target) return c.json({ error: "No one by that name." }, 404);
  if (target.role === "admin") return c.json({ error: "The admin can't be restricted." }, 400);
  const what = RESTRICTABLE.find((k) => k === b.what);
  if (!what) return c.json({ error: "Restrict what?" }, 400);
  const hours = typeof b.hours === "number" && Number.isFinite(b.hours) ? Math.max(1, Math.min(24 * 365, Math.round(b.hours))) : 0;
  if (!hours) return c.json({ error: "For how many hours?" }, 400);
  const until = new Date(Date.now() + hours * 3600_000).toISOString();
  const reason = typeof b.reason === "string" && b.reason.trim() ? b.reason.trim().slice(0, 200) : null;
  restrict(target.name, what, until, v.name, reason);
  log("restricted", v, { name: target.name, what, until }, { ip: ipOf(c), content: reason });
  noticeRestriction(target.name, what, until);
  return c.json({ ok: true, until });
});

// A plain kick: put someone out once, nothing stored, so they can come back
// in. For a nuisance that doesn't need a restriction. Logged like the rest.
app.post("/api/admin/kick", async (c) => {
  const r = await asAdmin(c);
  if (r instanceof Response) return r;
  const { v, b } = r;
  const target = typeof b.name === "string" ? findByName(b.name.trim()) : undefined;
  if (!target) return c.json({ error: "No one by that name." }, 404);
  if (target.role === "admin") return c.json({ error: "The admin can't be kicked." }, 400);
  const tabs = kick(target.name);
  if (!tabs) return c.json({ error: `${target.name} isn't on the campus right now.` }, 404);
  log("kicked", v, { name: target.name, tabs }, { ip: ipOf(c) });
  return c.json({ ok: true, tabs });
});

app.delete("/api/admin/restrictions", async (c) => {
  const r = await asAdmin(c);
  if (r instanceof Response) return r;
  const { v, b } = r;
  const what = RESTRICTABLE.find((k) => k === b.what);
  if (typeof b.name !== "string" || !what) return c.json({ error: "Lift what, from whom?" }, 400);
  if (!lift(b.name.trim(), what)) return c.json({ error: "Already lifted." }, 404);
  log("restriction-lifted", v, { name: b.name.trim(), what }, { ip: ipOf(c) });
  return c.json({ ok: true });
});

const MAX_BUG = 2000;

app.post("/api/bugs", async (c) => {
  const b = await body(c);
  const v = who(b);
  if (!v) return c.json({ error: "Join first." }, 401);
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (!text) return c.json({ error: "Say what went wrong." }, 400);
  if (text.length > MAX_BUG) return c.json({ error: `Up to ${MAX_BUG} characters.` }, 400);
  if (typeof b.about === "string" && b.about.trim()) {
    const guest = guestRefused(c, v, "person report");
    if (guest) return guest;
  }
  const space = typeof b.space === "string" && isSpace(b.space) ? b.space : null;
  const userAgent = (c.req.header("user-agent") ?? "").slice(0, 300) || null;
  // A report about someone (abuse in the chat) can carry the space's chat
  // from the last five minutes: the server attaches it, not the browser, so
  // nobody can put words in someone else's mouth.
  // Anyone with an account can be reported (qa_ names too); a name nobody has
  // is refused, rather than quietly filed as a bug report.
  let about: string | null = null;
  if (typeof b.about === "string" && b.about.trim()) {
    const target = findByName(b.about.normalize("NFKC").trim());
    if (!target) return c.json({ error: `No one is called "${b.about.trim().slice(0, 20)}". Check the name above their head.` }, 404);
    about = target.name;
  }
  const chat = about && b.withChat === true && space ? recentChat(space) : null;
  const result = addBugReport({ author: v.name, browser: browserTag(v.token), ip: ipOf(c), space, userAgent, text, about, chat });
  if (!result.ok) return c.json({ error: `One report a minute. Wait ${result.wait}s.` }, 429);
  // A report about a person is its own event in the log, so it doesn't read as a bug.
  if (about) log("person-report", v, { space, report: result.id, chars: text.length, about, chatLines: chat?.length ?? 0 }, { ip: ipOf(c), content: text });
  else log("bug-report", v, { space, report: result.id, chars: text.length }, { ip: ipOf(c), content: text });
  return c.json({ id: result.id }, 201);
});

// --- attached files ----------------------------------------------------------------
// A screenshot on your own bug report, files on your own board post (within
// a day of posting), and files shared in the meeting room you're in. Each
// is checked here: who may attach to what, the type (by extension) and the
// size (200 MB); then the browser gets a five-minute link that S3 accepts for
// exactly that file, and tells us when it's done. Fetching one is checked
// the same way: the admin for bug screenshots, anyone for a board post's,
// and only the people in the room for a room's (until it empties).

const UPLOADS_PER_DAY = 50;
const s3Error = (c: Context, err: unknown): Response => {
  const code = err instanceof S3Failure ? err.code : "S3-NET";
  console.error(JSON.stringify({ at: new Date().toISOString(), event: "s3-error", code, error: String((err as Error)?.name ?? err) }));
  return c.json({ error: s3Message(code), code }, 503);
};

app.get("/api/files/status", (c) => c.json({ ready: s3Ready(), code: s3Ready() ? null : "S3-CONFIG" }));

app.post("/api/files", async (c) => {
  const b = await body(c);
  const v = who(b);
  if (!v) return c.json({ error: "Join first." }, 401);
  const guest = guestRefused(c, v, "upload");
  if (guest) return guest;
  const kind = b.kind as FileKind;
  if (kind !== "bug" && kind !== "board" && kind !== "room") return c.json({ error: "Attach it to what?" }, 400);
  const name = cleanName(b.name);
  if (!name) return c.json({ error: "That file needs a name of up to 120 characters." }, 400);
  const refuse = (reason: string, status: 400 | 403 | 429): Response => {
    log("refused", v, { action: "upload", kind, reason }, { ip: ipOf(c), content: name });
    return c.json({ error: reason }, status);
  };
  const bad = fileError(kind, name, b.size);
  if (bad) return refuse(bad, 400);
  if (uploadsToday(v.name) >= UPLOADS_PER_DAY) return refuse(`Up to ${UPLOADS_PER_DAY} files a day.`, 429);

  let postId: number | null = null;
  let bugId: number | null = null;
  let room: string | null = null;
  let space: string | null = null;
  if (kind === "bug") {
    const report = findBugReport(Number(b.bug));
    if (!report || report.author !== v.name) return refuse("Only on your own bug report.", 403);
    if (filesOn("bug", report.id, true).length >= 1) return refuse("One screenshot per report.", 400);
    bugId = report.id;
    space = report.space;
  } else if (kind === "board") {
    const post = findPost(Number(b.post));
    if (!post || post.author !== v.name) return refuse("Only on your own post.", 403);
    if (Date.now() - Date.parse(post.createdAt.replace(" ", "T") + "Z") > 24 * 3600 * 1000) return refuse("Files go on a post within a day of posting.", 403);
    if (filesOn("post", post.id, true).length >= 5) return refuse("Up to five files on a post.", 400);
    postId = post.id;
    space = post.space;
  } else {
    const at = livePlayer(v.name)?.space;
    room = at && roomOf(at) ? roomSessionOf(v.name, at) : null;
    if (!at || !room) return refuse("Only inside a meeting room.", 403);
    space = at;
  }
  const id = randomUUID();
  const key = keyFor(kind, id, name);
  const type = typeOf(name);
  try {
    const url = await uploadLink(key, type, b.size as number);
    addFile({ id, kind, owner: v.name, name, size: b.size as number, key, postId, bugId, room });
    return c.json({ id, url, type }, 201);
  } catch (err) {
    log("refused", v, { action: "upload", kind, reason: err instanceof S3Failure ? err.code : "S3-NET" }, { ip: ipOf(c), content: name });
    return s3Error(c, err);
  }
});

app.post("/api/files/:id/done", async (c) => {
  const v = who(await body(c));
  if (!v) return c.json({ error: "Join first." }, 401);
  const f = findFile(c.req.param("id"));
  if (!f || f.owner !== v.name) return c.json({ error: "No such upload." }, 404);
  if (!f.ready) {
    try {
      const size = await arrivedSize(f.key);
      if (size !== f.size) return c.json({ error: "The file didn't arrive whole. Try again." }, 409);
    } catch (err) {
      if (err instanceof S3Failure && err.code === "S3-MISSING") return c.json({ error: "The file didn't arrive. Try again." }, 409);
      return s3Error(c, err);
    }
    markFileReady(f.id);
    const space = f.kind === "room" ? livePlayer(v.name)?.space : f.kind === "board" ? findPost(f.postId!)?.space : null;
    log("file", v, { space, kind: f.kind, post: f.postId, report: f.bugId, size: f.size }, { ip: ipOf(c), content: f.name });
    const filed = f.kind === "board" ? findPost(f.postId!) : undefined;
    if (filed) broadcastSpace(spaceOfBoard(filed.space), boardChanged(filed));
    if (f.kind === "room" && space && roomSessionOf(v.name, space) === f.room) roomShare(space, v.name, { id: f.id, name: f.name, size: f.size });
  }
  return c.json({ ok: true });
});

app.post("/api/files/:id/link", async (c) => {
  const b = await body(c);
  const v = who(b);
  if (!v) return c.json({ error: "Join first." }, 401);
  const f = findFile(c.req.param("id"));
  if (!f || !f.ready) return c.json({ error: "That file is gone." }, 404);
  const allowed =
    (f.kind === "board" && maySeePost(v, findPost(f.postId!) ?? { author: "", private: true })) ||
    (f.kind === "bug" && v.role === "admin") ||
    (f.kind === "room" && (() => {
      const at = livePlayer(v.name)?.space;
      return !!at && roomSessionOf(v.name, at) === f.room;
    })());
  if (!allowed) {
    log("refused", v, { action: "download", kind: f.kind, reason: f.kind === "room" ? "not in the room" : "not admin" }, { ip: ipOf(c), content: f.name });
    return c.json({ error: f.kind === "room" ? "Only the people in the room can open its files." : f.kind === "board" ? "That post is private." : "This is for the admin." }, 403);
  }
  try {
    // Images may be shown in place (a post's picture, a bug's screenshot); everything else downloads.
    const inline = isImage(f.name) && (f.kind === "bug" || b.inline === true);
    return c.json({ url: await downloadLink(f.key, f.name, inline), name: f.name });
  } catch (err) {
    return s3Error(c, err);
  }
});

// --- how you look -----------------------------------------------------------------
// Anyone joined picks a look (colours and a hat) for their own figure only;
// everyone in the space sees the change at once.

app.put("/api/look", async (c) => {
  const b = await body(c);
  const v = who(b);
  if (!v) return c.json({ error: "Join first." }, 401);
  const look = validLook(b.look);
  if (!look) return c.json({ error: "That isn't a look." }, 400);
  // The hard hat marks the test accounts, so nobody else can wear it.
  if (look.hat === QA_HAT && !RESERVED.test(v.name)) return c.json({ error: "The hard hat is for the test accounts." }, 403);
  saveLook(v.name, look);
  setLook(v.name, look);
  return c.json({ ok: true });
});

// Sketch & Guess, the drawing game on the Hub's arcade machine.
sketchRoutes(app);

// Notes past their month: hidden from every query already, deleted hourly.
// The admin's log past its seven days goes the same way.
// The Hub's board lost its "Ask the Hub" tab (questions for the Hub go to
// the enquiry PC): its posts go too, files and all. Runs on every start, and
// does nothing once they're gone.
{
  const hub = boardOf("hub")!;
  const ids = postsInGoneTabs("hub", hub.tabs.map((t) => t.id));
  for (const id of ids) {
    removeObjects(filesOn("post", id, true).map((f) => f.key));
    deletePost(id);
  }
  if (ids.length) log("post-removed", null, { space: "hub", count: ids.length, reason: "tab removed" });
}

// COMMON, the "classroom for anyone", is gone: the ANUSA Student Lounge (its own
// space, on 154's ground floor) does that job now. Close it as the admin would, its
// notes, posts and their files with it, and anyone saved inside starts
// outside. Runs on every start and does nothing once it's gone.
if (classroomList().some((c) => c.code === OLD_COMMON)) {
  const space = classroomSpace(OLD_COMMON);
  let moved = evictSpace(space, FIRST_SPACE, { x: -8.4, z: 7 });
  for (const room of teamRoomsOf(space)) moved += evictSpace(room, FIRST_SPACE, { x: -8.4, z: 7 });
  for (const id of postIdsIn(space)) removeObjects(filesOn("post", id, true).map((f) => f.key));
  if (removeClassroom(OLD_COMMON)) log("classroom-removed", null, { code: OLD_COMMON, space, moved, reason: "replaced by the ANUSA Student Lounge" });
}

const purge = (): void => {
  const gone = purgeExpiredNotes();
  if (gone) log("note-expired", null, { count: gone });
  // A classroom lasts a semester: six months after it opened it closes on its
  // own (never COMP8020), as if the admin had closed it.
  for (const code of staleClassrooms()) {
    const space = classroomSpace(code);
    let moved = evictSpace(space, FIRST_SPACE, { x: -8.4, z: 7 });
    for (const room of teamRoomsOf(space)) moved += evictSpace(room, FIRST_SPACE, { x: -8.4, z: 7 });
    for (const id of postIdsIn(space)) removeObjects(filesOn("post", id, true).map((f) => f.key));
    if (removeClassroom(code)) {
      log("classroom-removed", null, { code, space, moved, reason: "six months old" });
      broadcastAll({ t: "action", kind: "classrooms", classrooms: classroomList() });
    }
  }
  // The lawn's posts past their 30 days go, files and all.
  for (const [space, days] of expiringBoards()) {
    const ids = expiredPosts(space, days);
    for (const id of ids) {
      removeObjects(filesOn("post", id, true).map((f) => f.key));
      deletePost(id);
    }
    if (ids.length) log("post-expired", null, { space, count: ids.length });
  }
  purgeOldAudit();
  purgeOldChat();
  purgeOldMail();
  const guestsGone = purgeIdleGuests();
  if (guestsGone) log("guests-purged", null, { count: guestsGone });
  removeObjects(purgeFiles());
};
purge();
setInterval(purge, 60 * 60 * 1000).unref();

// The 3D client, once Vite has built it.
const dist = "client/dist";
if (existsSync(dist)) {
  // Pages always ask again, so a reload after a deploy gets the new build;
  // Vite's /assets/ files carry a hash in their names and may be kept.
  app.use("/*", async (c, next) => {
    await next();
    if (!c.req.path.startsWith("/assets/")) c.header("Cache-Control", "no-cache");
  });
  app.use("/*", serveStatic({ root: dist }));
} else {
  app.get("/", (c) => c.html('<!doctype html><title>ANU Crossing (Unofficial)</title><p>Client not built yet. <a href="/readme/">README</a></p>'));
}

const port = Number(process.env.PORT ?? 8080);
const server = serve({ fetch: app.fetch, hostname: "0.0.0.0", port }, () => {
  console.log(JSON.stringify({ at: new Date().toISOString(), event: "start", port }));
});
attachRealtime(server as Server);
