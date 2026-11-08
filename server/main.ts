import { createHash, randomInt, randomUUID } from "node:crypto";
import { MailFailure, lastMail, mailReady, sendMail, testOutbox } from "./mail.ts";
import { NPCS, answer, npcById } from "./npcs.ts";
import { crawl } from "./crawl.ts";
import { loadProjectDocs } from "./projectdocs.ts";
import { voiceReady, voiceToken, voiceUrl } from "./voice.ts";
import { lastFinished as lastCrawl } from "./knowledge.ts";
import { existsSync, readFileSync } from "node:fs";
import type { Server } from "node:http";
import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
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
  hiddenIds,
  hiddenList,
  isHidden,
  purgeOldItemReports,
  reportItem,
  restoreItem,
  REPORTS_TO_HIDE,
  type ReviewKind,
  REVIEW_KINDS,
  toggleMember,
  sendMailTo,
  inboxOf,
  sentBy,
  findMail,
  markRead,
  deleteMail,
  unreadCount,
  purgeOldMail,
  purgeOldChats,
  keepsFile,
  releaseKeptFiles,
  purgeOldPoops,
  savedChatsOf,
  savedChat,
  deleteSavedChat,
  purgeIdleGuests,
  createGuest,
  createMember,
  findByEmail,
  forgetCode,
  isMember,
  isStaff,
  mayUseAdminPc,
  findPeople,
  staffAndAdmins,
  setRole,
  setAdminPc,
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
  dropFileRow,
  lookOf,
  saveLook,
  saveTags,
  tagsOf,
  followsOf,
  setFollow,
  presenceMutualOnly,
  setPresenceMutualOnly,
  validLook,
  QA_HAT,
  LOOK_UNLOCKS,
  lockedChoice,
  stampsOf,
  stampCount,
  addEvent,
  deleteEvent,
  eventsNow,
  findEvent,
  purgeEndedEvents,
  removeClassroom,
  setClassroomLink,
  type Post,
  type Visitor,
} from "./db.ts";
import { browserTag, KEPT, keepIn, log } from "./log.ts";
import { attachRealtime, broadcastAll, broadcastSpace, evictSpace, kick, livePlayer, noticeRestriction, tellPerson, roomSessionOf, roomShare, setLook, setTags } from "./realtime.ts";
import { S3Failure, arrivedSize, cleanName, downloadLink, fileError, isImage, keyFor, removeObjects, s3Message, s3Ready, typeOf, uploadLink, type FileKind } from "./files.ts";
import { COURSE_TAGS, INTEREST_TAGS, MAX_FOLLOWS, MAX_TAGS, validTags } from "./social.ts";
import { sketchRoutes } from "./sketch/routes.ts";
import { startWeather, weatherForClient } from "./weather.ts";
import { boardOf, expiringBoards, maySeePost as maySeeUnhiddenPost, mayPostIn, spaceOfBoard, tabOf } from "./boards.ts";
import { ARRIVAL, CLASSROOM_CODE, FIRST_SPACE, OLD_COMMON, SECRET_STAMP_LABEL, SPACES, STAMPS, clampTo, classroomSpace, isSpace, noteSpotError, roomOf, spaceInfo, teamRoomsOf } from "./spaces.ts";
import { EVENT_AHEAD_DAYS, EVENT_MAX_MINUTES, EVENT_MIN_MINUTES, canberraToEpoch, eventTitle } from "./events.ts";

// Lines the admin can read back for seven days go into SQLite as well.
keepIn(addAudit);

const app = new Hono();

// Every response: no framing by other sites (the in-app window frames only our own pages), no MIME
// sniffing, and no full addresses sent to the pages people open from here.
app.use("*", async (c, next) => {
  await next();
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("Content-Security-Policy", "frame-ancestors 'self'");
  c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
});
// Every API body is small JSON (files go straight to S3): a huge one is refused, not read into memory.
app.use("/api/*", bodyLimit({ maxSize: 256 * 1024, onError: (c) => c.json({ error: "That's too big to send." }, 413) }));

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

// Credits and licences (13, 120): who made it and for which course (ABOUT.md),
// then the assets' sources and licences, from the same
// file the build ships (client/public/assets/CREDITS.md), as a page the
// settings dialog opens in the in-app window.
app.get("/credits/", (c) => {
  const file = ["client/dist/assets/CREDITS.md", "client/public/assets/CREDITS.md"].find((f) => existsSync(f));
  if (!file) return c.text("No credits file.", 404);
  const about = ["client/dist/assets/ABOUT.md", "client/public/assets/ABOUT.md"].find((f) => existsSync(f));
  // The README's argument, from "What it is" up to "Using this code" (the markers' sign-up notes
  // and the licence stay on /readme/), read each time so the two never drift apart (the user, 11/9).
  const readme = readFileSync("README.md", "utf8");
  const from = readme.indexOf("## What it is");
  const to = readme.indexOf("## Using this code");
  const argument = from >= 0 ? readme.slice(from, to > from ? to : undefined).replace(/^## /gm, "### ") : "";
  const top = about ? marked.parse(readFileSync(about, "utf8").replace("{{README}}", argument), { async: false }) : "";
  // It opens in the in-app window, where outside sites would load blank (most
  // refuse to be framed): every outside link opens a new tab instead.
  const body = (top + marked.parse(readFileSync(file, "utf8"), { async: false })).replaceAll('<a href="http', '<a target="_blank" rel="noopener" href="http');
  return c.html(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Credits and licences · ANU Crossing</title>
<style>body{max-width:46rem;margin:1.5rem auto;padding:0 1rem;font:0.95rem/1.55 system-ui,sans-serif;color:#2b2418;background:#f7f1e3}table{border-collapse:collapse;font-size:0.85rem}td,th{border:1px solid #e4d7ba;padding:3px 6px;text-align:left;vertical-align:top}code{font-size:0.85em}a{color:#6b3f1d}</style>
</head><body><main><p><strong>ANU Crossing</strong> is an unofficial, fan-made student project, not an ANU service. The code is the author's (see the repository's LICENSE). Everything it uses from elsewhere, and its licence:</p>${body}</main></body></html>`);
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

/** The one answer for a student number or email that didn't sign in, whichever the reason. */
const SIGN_IN_FAILED = "That student number (or email) and password don't match. Check both, reset your password, or sign up.";
/** A real scrypt hash of nothing anyone types, so a missing account takes as long as a wrong password. */
const DUMMY_HASH = hashPassword("not-a-real-password-" + Math.random());

/**
 * Wrong passwords per address and typed name: ten in fifteen minutes, then "wait" until the window
 * passes, so a known name or student number can't be guessed at without end. Keyed by the address
 * too, so someone elsewhere can't lock the real owner out (service check, 11/8).
 */
const signInFails = new Map<string, { n: number; since: number }>();
const FAIL_WINDOW_MS = 15 * 60_000;
const FAIL_MAX = 10;
function signInBlocked(key: string): boolean {
  const now = Date.now();
  for (const [k, f] of signInFails) if (now - f.since > FAIL_WINDOW_MS) signInFails.delete(k);
  return (signInFails.get(key)?.n ?? 0) >= FAIL_MAX;
}
function signInFailed(key: string): void {
  const f = signInFails.get(key);
  if (f) f.n++;
  else signInFails.set(key, { n: 1, since: Date.now() });
}

app.post("/api/join", async (c) => {
  const b = await body(c);
  const { token, password } = b;
  if (typeof b.name !== "string") return c.json({ error: "Pick a name." }, 400);
  // Phone keyboards add spaces and lookalike characters (a full-width "＿").
  const name = b.name.normalize("NFKC").trim();
  const failKey = `${ipOf(c) ?? "?"}|${name.toLowerCase()}`;
  if (typeof password === "string" && password.trim() && signInBlocked(failKey)) {
    log("join-refused", null, { reason: "too many wrong passwords" }, { ip: ipOf(c) });
    return c.json({ error: "Too many wrong passwords. Wait fifteen minutes, or reset your password." }, 429);
  }

  // A student number or an ANU address signs in to the account signed up
  // with it, whatever its name (and wins over an old retired name like it).
  // A student number or email is private, unlike a name (on everyone's name tag): the answer
  // never says whether one has an account. No account and a wrong password read the same.
  const privateId = /^u\d{7}$/i.test(name) || /@/.test(name);
  const byEmail = /^u\d{7}$/i.test(name) ? findByEmail(`${name.toLowerCase()}@anu.edu.au`) : /@anu\.edu\.au$/i.test(name) ? findByEmail(name.toLowerCase()) : undefined;
  const typed = typeof password === "string" && password.trim() ? password.trim() : "";
  if (privateId && !typed) return c.json({ error: "Type your password.", password: true }, 401);
  if (privateId && (!byEmail?.passwordHash || !checkPassword(typed, byEmail.passwordHash))) {
    // (A wrong password still runs the hash, and a missing account checks against nothing, so both take about as long.)
    if (!byEmail?.passwordHash) checkPassword(typed, DUMMY_HASH);
    log("join-refused", byEmail ? { name: byEmail.name } : null, { reason: byEmail ? "wrong password" : "no such account" }, { ip: ipOf(c) });
    signInFailed(failKey);
    return c.json({ error: SIGN_IN_FAILED }, 401);
  }
  if (byEmail?.passwordHash) {
    const barred = stopped(c, byEmail, "join", { action: "join" });
    if (barred) return barred;
    log("join", byEmail, { how: "password, by email" }, { ip: ipOf(c) });
    return c.json({ name: byEmail.name, token: byEmail.token, role: byEmail.role, spawn: lastSpot(byEmail.name), look: lookOf(byEmail.name) });
  }

  // Test and admin accounts sign in with a password, from any browser.
  if (RESERVED.test(name)) {
    const account = RESERVED_RULE.test(name) ? findByName(name) : undefined;
    if (!account?.passwordHash) {
      log("join-refused", { name }, { reason: "no such account" }, { ip: ipOf(c) });
      return c.json({ error: "No account with that name or student number. Sign up with your ANU email, or come in as a guest." }, 404);
    }
    // Trimmed: a phone keyboard's trailing space shouldn't lock a test account out (none has a space).
    if (typeof password !== "string" || !checkPassword(password.trim(), account.passwordHash)) {
      log("join-refused", { name: account.name }, { reason: "wrong password" }, { ip: ipOf(c) });
      signInFailed(failKey);
      return c.json({ error: "Wrong password." }, 401);
    }
    const barred = stopped(c, account, "join", { action: "join" });
    if (barred) return barred;
    log("join", account, { how: "password" }, { ip: ipOf(c) });
    return c.json({ name: account.name, token: account.token, role: account.role, spawn: lastSpot(account.name), look: lookOf(account.name) });
  }

  // Signing in doesn't judge names (sign-up does): a name that isn't an
  // account you can sign into, retired ones included, just isn't found.
  const existing = NAME_RULE.test(name) ? findByName(name) : undefined;
  if (!existing || existing.role === "retired") return c.json({ error: "No account with that name or student number. Sign up with your ANU email, or come in as a guest." }, 404);
  // A name with a password behind it signs in with that password from any device.
  if (existing?.passwordHash && typeof password === "string" && password.trim()) {
    if (!checkPassword(password.trim(), existing.passwordHash)) {
      log("join-refused", { name: existing.name }, { reason: "wrong password" }, { ip: ipOf(c) });
      signInFailed(failKey);
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
    log("join-refused", { name: existing.name, token: typeof token === "string" ? token : undefined }, { reason: existing.passwordHash ? "no password" : "guest's name" }, { ip: ipOf(c) });
    // A member's name with no password typed: ask for it. A guest's, from another browser: not found.
    if (existing.passwordHash) return c.json({ error: "Type your password.", password: true }, 401);
    return c.json({ error: "No account with that name or student number. Sign up with your ANU email, or come in as a guest." }, 404);
  }
  return c.json({ error: "No account with that name or student number. Sign up with your ANU email, or come in as a guest." }, 404);
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
  return c.json({ name, token: fresh, role: "guest", spawn: ARRIVAL, look: null });
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

// The code alone, between the steps, so a wrong one is caught before the
// name and password: it counts as one of the five tries and the code stays
// for finish (which checks it again).
app.post("/api/signup/check", async (c) => {
  const b = await body(c);
  const who2 = anuEmail(b);
  if ("error" in who2) return c.json({ error: who2.error }, 400);
  const stored = takeCode(who2.email, "signup");
  if (!stored || typeof b.code !== "string" || stored !== hashCode(who2.email, b.code.trim())) {
    log("join-refused", null, { reason: "wrong sign-up code" }, { ip: ipOf(c) });
    return c.json({ error: stored ? "That code is wrong. Check the email and try again." : "That code is too old or tried too often. Ask for a new one." }, 401);
  }
  return c.json({ ok: true });
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
  return c.json({ name, token, role, spawn: ARRIVAL, look: null }, 201);
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

// --- saved meeting-room chats (plan 37) ---------------------------------------
// Only their owner lists, reads or deletes them; kept 30 days (db.ts).
app.post("/api/chats", async (c) => {
  const v = who(await body(c));
  if (!v) return c.json({ error: "Join first." }, 401);
  return c.json(savedChatsOf(v.name));
});
app.post("/api/chats/:id", async (c) => {
  const v = who(await body(c));
  if (!v) return c.json({ error: "Join first." }, 401);
  const chat = savedChat(v.name, Number(c.req.param("id")));
  return chat ? c.json(chat) : c.json({ error: "That chat is gone." }, 404);
});
app.delete("/api/chats/:id", async (c) => {
  const v = who(await body(c));
  if (!v) return c.json({ error: "Join first." }, 401);
  return deleteSavedChat(v.name, Number(c.req.param("id"))) ? c.json({ ok: true }) : c.json({ error: "That chat is gone." }, 404);
});

// --- voice (plan 86) -------------------------------------------------------------
// A ticket to talk: in a meeting room, its voice, only while you're inside
// (so its cap and its invites hold); outside, the open voice of the space
// you're in. Anyone joined, guests too, as for the rooms. The log notes who
// joined which voice, never what was said (it isn't recorded anywhere).
// Short-lived: LiveKit checks it only when joining, so a ticket kept after
// leaving (or passed on) is soon useless; the client asks again each time.
const VOICE_TICKET_S = 120;
app.post("/api/voice", async (c) => {
  const b = await body(c);
  const v = who(b);
  if (!v) return c.json({ error: "Join first." }, 401);
  if (!voiceReady()) return c.json({ error: "Voice isn't available right now. Error code: VOICE-CONFIG" }, 503);
  const barred = stopped(c, v, "chat", { action: "voice" });
  if (barred) return barred;
  const p = livePlayer(v.name);
  if (!p) return c.json({ error: "Come onto the campus first." }, 400);
  let room: string;
  const inRoom = !!roomOf(p.space);
  if (inRoom) {
    const sitting = roomSessionOf(v.name, p.space);
    if (!sitting) return c.json({ error: "You're not in that room." }, 403);
    room = `room-${p.space}-${sitting}`;
  } else if (p.space === "outdoor") room = "space-outdoor";
  else {
    log("refused", v, { action: "voice", space: p.space, reason: "no voice here" }, { ip: ipOf(c) });
    return c.json({ error: "Voice works in meeting rooms and outside." }, 400);
  }
  log("voice-joined", v, { space: p.space }, { ip: ipOf(c) });
  return c.json({ url: voiceUrl(), token: voiceToken(v.name, room, VOICE_TICKET_S, Date.now(), inRoom), room, space: p.space });
});

// --- the AI campus assistants (plan 56) ---------------------------------------
// Where they stand and what they cover (npcs.ts). Anyone joined may ask, guests
// too, one question every two seconds, thirty a day, 500 characters;
// nothing is stored or logged but that someone asked whom.
// The client bundle this server serves (its hashed name in index.html), so an open tab from before
// a deploy can tell it's out of date and offer a reload (RICE v3 item 17).
const BUILD = (() => {
  try {
    return /\/assets\/index-[\w-]+\.js/.exec(readFileSync("client/dist/index.html", "utf8"))?.[0] ?? "";
  } catch {
    return "";
  }
})();
app.get("/api/version", (c) => {
  c.header("Cache-Control", "no-store");
  return c.json({ build: BUILD });
});

app.get("/api/npcs", (c) =>
  c.json(
    NPCS.map(({ id, name, role, space, x, z, rot, reach, look, links, greeting, voice, seated, model3d, examples }) => ({ id, name, role, space, x, z, rot, reach, look, links, greeting, voice, seated, model3d, examples })),
  ),
);

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
  if (now - (lastAsked.get(key) ?? 0) < 2000) return c.json({ error: "Still thinking about your last one: ask again in a moment." }, 429);
  // Thirty a person a day (a paid model answers): kept in memory, by day.
  const day = new Date().toISOString().slice(0, 10);
  const asked = askedBy.get(key);
  const count = asked?.day === day ? asked.n : 0;
  if (count >= 30) return c.json({ error: "That's thirty questions today. The assistants are back tomorrow." }, 429);
  askedBy.set(key, { day, n: count + 1 });
  lastAsked.set(key, now);
  log("npc-asked", v, { npc: npc.id, chars: text.length });
  // The open window's last few turns, sent by the browser each time: used for this answer only,
  // never kept or logged (a window closed, or ten minutes quiet, starts afresh: npcchat.ts).
  const recent = Array.isArray(b.recent)
    ? b.recent
        .filter((t): t is { q: string; a: string } => !!t && typeof (t as { q?: unknown }).q === "string" && typeof (t as { a?: unknown }).a === "string")
        .slice(-4)
        .map((t) => ({ q: t.q.slice(0, 500), a: t.a.slice(0, 1500) }))
    : [];
  return c.json({ reply: await answer(npc, text, recent), links: npc.links });
});

// The spec's view of what was "sent" (MAIL_TEST_OUTBOX=1, the CI container only).
app.get("/api/test/mail", (c) => {
  if (!testOutbox()) return c.json({ error: "Not here." }, 404);
  const m = lastMail(c.req.query("to") ?? "");
  return m ? c.json(m) : c.json({ error: "Nothing sent there." }, 404);
});


// --- hidden after reports (RICE v3) -----------------------------------------------
// A note, post or comment that three different members reported within 24 hours is hidden at
// once (db.ts reportItem) and waits for the admin's Restore or Remove (the admin page's "Hidden,
// awaiting review"). Everyone but its author and the admin (anyone with the admin PC) gets it
// left out of every list, and a direct ask for it answers "gone", as if it weren't there.
const mayReview = (v: { role: string; adminPc?: number } | null | undefined): boolean => mayUseAdminPc(v);
/** Whether `v` sees a hidden item that `author` wrote: only the author and the admin. */
const mayViewHidden = (v: Visitor | null | undefined, author: string): boolean => !!v && (mayReview(v) || v.name.toLowerCase() === author.toLowerCase());
/** The filter db.ts's lists take for this viewer. */
const hiddenFor = (v: Visitor | null | undefined) => (author: string): boolean => mayViewHidden(v, author);
/** maySeePost, and not hidden for someone who may not see it. */
const maySeePost = (v: Visitor | null | undefined, post: { id?: number; author: string; private?: boolean }): boolean =>
  maySeeUnhiddenPost(v, post) && (post.id === undefined || !isHidden("post", post.id) || mayViewHidden(v, post.author));
/** A note a viewer may open (comment on, read the comments of): it's there and not hidden from them. */
const noteVisibleTo = (v: Visitor | null | undefined, note: { id: number; author: string }): boolean => !isHidden("note", note.id) || mayViewHidden(v, note.author);

// --- sticky notes ----------------------------------------------------------

app.get("/api/notes", (c) => {
  const space = c.req.query("space");
  if (!isSpace(space)) return c.json({ error: "No such place." }, 404);
  // The token (if any) only decides whether a note hidden after reports is yours to see.
  return c.json(notesIn(space, hiddenFor(who({ token: c.req.query("token") }))));
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
  const where = noteSpotError(b.space, x, z, isStaff(v));
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
  const viewer = who({ token: c.req.query("token") });
  const note = findNote(Number(c.req.param("id")));
  if (!note || !noteVisibleTo(viewer, note)) return c.json({ error: "That note is gone." }, 404);
  return c.json(commentsOn(note.id, hiddenFor(viewer)));
});

app.post("/api/notes/:id/comments", async (c) => {
  const b = await body(c);
  const v = who(b);
  if (!v) return c.json({ error: "Join first." }, 401);
  const guest = guestRefused(c, v, "comment");
  if (guest) return guest;
  const note = findNote(Number(c.req.param("id")));
  if (!note || !noteVisibleTo(v, note)) return c.json({ error: "That note is gone." }, 404);
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
  // On a note hidden after reports (its author replying, or the admin) the text doesn't go to the space.
  if (!isHidden("note", note.id)) broadcastSpace(note.space, { t: "action", kind: "comment", comment: result.comment });
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
  if (!comment || (isHidden("comment", comment.id) && !mayViewHidden(v, comment.author))) return c.json({ error: "That comment is gone." }, 404);
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
  if (!comment || (isHidden("post-comment", comment.id) && !mayViewHidden(v, comment.author))) return c.json({ error: "That comment is gone." }, 404);
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

// COMP8020 is the course's own room: always open, its boards fixed (db.ts
// recreates it at start; the purge and the client leave it alone too).
const COURSE_ROOM = "COMP8020";

app.delete("/api/classrooms/:code", async (c) => {
  const v = who(await body(c));
  if (!v) return c.json({ error: "Join first." }, 401);
  const code = c.req.param("code").toUpperCase();
  if (!isStaff(v)) {
    log("refused", v, { action: "remove classroom", code, reason: "not staff" }, { ip: ipOf(c) });
    return c.json({ error: "Only staff can close a classroom." }, 403);
  }
  if (code === COURSE_ROOM) {
    log("refused", v, { action: "remove classroom", code, reason: "course room" }, { ip: ipOf(c) });
    return c.json({ error: `${code} is always open.` }, 403);
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
  if (code === COURSE_ROOM) {
    log("refused", v, { action: "set classroom link", code, reason: "course room" }, { ip: ipOf(c) });
    return c.json({ error: `${code}'s boards are fixed.` }, 403);
  }
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
  const hidden = hiddenIds("post");
  const posts = postsIn(space!, tab.id, board.keepDays)
    .filter((p) => maySeePost(viewer, p))
    .map((p) => ({ ...p, ...(hidden.has(p.id) ? { hidden: true } : {}), files: filesOn("post", p.id).map(({ id, name, size }) => ({ id, name, size })) }));
  return c.json(tab.staffOnly ? [{ ...pinnedNotice(tab.label), tab: tab.id }, ...posts] : posts);
});

// "Join now" (RICE v3 #18): what is open to join or answer right now, at a
// glance, so nobody has to open three boards to find out. Read-only and built
// from the same queries and the same maySeePost as /api/board, so a private
// question reaches only its writer and staff, as everywhere else. Anyone may
// ask, guests too (they can read every board); about five of each kind.
const ACTIVITY_LIMIT = 5;
app.get("/api/activity", (c) => {
  const viewer = who({ token: c.req.query("token") });
  // The same newest-first lists the boards show (an ad's 30 days included), as the viewer may see them.
  const visible = (key: string): Post[] => {
    const board = boardOf(key)!;
    return postsIn(key, board.tabs[0]!.id, board.keepDays).filter((p) => maySeePost(viewer, p));
  };
  const item = (key: string, p: Post) => ({ board: key, tab: p.tab, id: p.id, title: p.title, author: p.author, createdAt: p.createdAt });
  const groups = visible("study-groups")
    .filter((p) => p.capacity !== null && p.members.length < p.capacity)
    .slice(0, ACTIVITY_LIMIT)
    .map((p) => ({ ...item("study-groups", p), capacity: p.capacity!, joined: p.members.length, left: p.capacity! - p.members.length }));
  const questions = visible("hub-desk")
    .filter((p) => p.comments === 0)
    .slice(0, ACTIVITY_LIMIT)
    .map((p) => ({ ...item("hub-desk", p), private: p.private }));
  const ads = visible("outdoor")
    .slice(0, ACTIVITY_LIMIT)
    .map((p) => item("outdoor", p));
  return c.json({ groups, questions, ads });
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
  const viewer = who({ token: c.req.query("token") });
  const post = findPost(Number(c.req.param("id")));
  if (!post || !maySeePost(viewer, post)) return c.json({ error: "That post is gone." }, 404);
  return c.json(postCommentsOn(post.id, hiddenFor(viewer)));
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


// --- reports on one item: hiding it, and the admin's review ----------------------------

type Found = { author: string; space: string | null; text: string; title?: string };

/** The item as someone reporting it may see it, or null if it's gone or hidden from them. */
function reportableItem(v: Visitor, kind: ReviewKind, id: number): Found | null {
  if (kind === "note") {
    const n = findNote(id);
    return n && noteVisibleTo(v, n) ? { author: n.author, space: n.space, text: n.text } : null;
  }
  if (kind === "comment") {
    const cm = findComment(id);
    const n = cm && findNote(cm.noteId);
    return cm && n && noteVisibleTo(v, n) && (!isHidden("comment", cm.id) || mayViewHidden(v, cm.author)) ? { author: cm.author, space: n.space, text: cm.text } : null;
  }
  if (kind === "post") {
    const p = findPost(id);
    return p && maySeePost(v, p) ? { author: p.author, space: p.space, text: p.text, title: p.title } : null;
  }
  const cm = findPostComment(id);
  const p = cm && findPost(cm.postId);
  return cm && p && maySeePost(v, p) && (!isHidden("post-comment", cm.id) || mayViewHidden(v, cm.author)) ? { author: cm.author, space: p.space, text: cm.text } : null;
}

/** Tells the people looking at an item's place that it's now hidden (or back), so their screens follow without a reload. */
function announceReview(kind: ReviewKind, id: number, hiddenNow: boolean): void {
  if (kind === "note") {
    const n = findNote(id);
    if (!n) return;
    // Clients drop a hidden note unless it's theirs to see (or the admin's), and put it back on restore.
    broadcastSpace(n.space, hiddenNow ? { t: "action", kind: "note-hidden", id, author: n.author } : { t: "action", kind: "note", note: n });
  } else if (kind === "comment") {
    const cm = findComment(id);
    const n = cm && findNote(cm.noteId);
    if (cm && n) broadcastSpace(n.space, hiddenNow ? { t: "action", kind: "comment-removed", id, noteId: n.id } : { t: "action", kind: "comment", comment: cm });
  } else {
    const cm = kind === "post-comment" ? findPostComment(id) : undefined;
    const p = kind === "post" ? findPost(id) : cm && findPost(cm.postId);
    if (p) broadcastSpace(spaceOfBoard(p.space), { t: "action", kind: "board", tab: p.tab });
  }
}

/** Three members have reported it: hidden now, in the admin's log, and gone from other screens. */
function hideItem(v: Visitor, c: Context, kind: ReviewKind, id: number, reporters: number): void {
  const f = reportableItem({ ...v, role: "admin" }, kind, id);
  log("item-hidden", v, { space: f?.space ?? undefined, kind, item: id, owner: f?.author, reporters, needed: REPORTS_TO_HIDE }, { ip: ipOf(c), content: f ? (f.title ? `${f.title}\n\n${f.text}` : f.text) : null });
  announceReview(kind, id, true);
}

/** Deletes one item as the admin's Remove does (the same deletions as the authors' own routes), returning what the log needs. */
function removeReviewed(kind: ReviewKind, id: number): { owner: string; space: string | null; content: string; event: "note-removed" | "comment-removed" | "post-removed" | "post-comment-removed"; tab?: string } | null {
  if (kind === "note") {
    const n = findNote(id);
    if (!n) return null;
    deleteNote(id);
    broadcastSpace(n.space, { t: "action", kind: "note-removed", id });
    return { owner: n.author, space: n.space, content: n.text, event: "note-removed" };
  }
  if (kind === "comment") {
    const cm = findComment(id);
    if (!cm) return null;
    const n = findNote(cm.noteId);
    deleteComment(id);
    if (n) broadcastSpace(n.space, { t: "action", kind: "comment-removed", id, noteId: n.id });
    return { owner: cm.author, space: n?.space ?? null, content: cm.text, event: "comment-removed" };
  }
  if (kind === "post") {
    const p = findPost(id);
    if (!p) return null;
    removeObjects(filesOn("post", p.id, true).map((f) => f.key));
    deletePost(id);
    broadcastSpace(spaceOfBoard(p.space), { t: "action", kind: "board", tab: p.tab });
    return { owner: p.author, space: p.space, content: `${p.title}\n\n${p.text}`, event: "post-removed", tab: p.tab };
  }
  const cm = findPostComment(id);
  if (!cm) return null;
  const p = findPost(cm.postId);
  deletePostComment(id);
  if (p) broadcastSpace(spaceOfBoard(p.space), { t: "action", kind: "board", tab: p.tab });
  return { owner: cm.author, space: p?.space ?? null, content: cm.text, event: "post-comment-removed" };
}

// --- the admin's log and bug reports -------------------------------------------
// The Student Hub's admin PC opens /admin/ (and so can a browser tab, for
// reading along during a crit). Only the admin reads either, checked here on
// every request; anyone joined may send a bug report.

const AUDIT_GROUPS: Record<string, string[]> = {
  admin: ["restricted", "restriction-lifted", "kicked", "role-changed", "item-hidden", "item-restored", "classroom-created", "classroom-removed", "classroom-link"],
  content: ["note", "note-replaced", "note-removed", "note-expired", "comment", "comment-removed", "post", "post-removed", "post-comment", "post-comment-removed", "bug-report", "person-report", "file"],
  signin: ["join", "join-refused", "connect", "disconnect"],
  refused: ["refused", "join-refused"],
};

async function asAdmin(c: Context): Promise<{ v: Visitor; b: Body } | Response> {
  const b = await body(c);
  const v = who(b);
  if (!v) return c.json({ error: "Join first." }, 401);
  if (!mayUseAdminPc(v)) {
    log("refused", v, { action: "read admin log", reason: "not admin" }, { ip: ipOf(c) });
    return c.json({ error: "This is for the admin." }, 403);
  }
  return { v, b };
}

/** Whether `v` (on the admin PC) may restrict or kick `target`: never the top admin, and another admin-PC holder only by the top admin. */
const mayAct = (v: Visitor, target: Visitor): boolean => target.role !== "admin" && (v.role === "admin" || !mayUseAdminPc(target));

// --- roles (plan 101): the top admin only ---------------------------------------
// Who is staff (Notices, classrooms, private enquiries, Hub notes) and who
// may use the admin PC. Only the top admin changes either, never their own,
// never a guest's; every change is logged.
async function asTopAdmin(c: Context): Promise<{ v: Visitor; b: Body } | Response> {
  const r = await asAdmin(c);
  if (r instanceof Response) return r;
  if (r.v.role !== "admin") {
    log("refused", r.v, { action: "roles", reason: "not the top admin" }, { ip: ipOf(c) });
    return c.json({ error: "Only the top admin changes roles." }, 403);
  }
  return r;
}
app.post("/api/admin/roles", async (c) => {
  const r = await asTopAdmin(c);
  if (r instanceof Response) return r;
  const q = typeof r.b.q === "string" ? r.b.q.trim().slice(0, 60) : "";
  return c.json({ people: q ? findPeople(q) : staffAndAdmins() });
});
app.put("/api/admin/roles", async (c) => {
  const r = await asTopAdmin(c);
  if (r instanceof Response) return r;
  const { v, b } = r;
  const target = typeof b.name === "string" ? findByName(b.name.trim()) : undefined;
  if (!target) return c.json({ error: "No one by that name." }, 404);
  if (target.role === "admin") return c.json({ error: "The top admin's role doesn't change." }, 400);
  if (target.role === "guest" || target.role === "retired") return c.json({ error: "Guests (and retired names) can't be given a role. They need to sign up first." }, 400);
  const changes: Record<string, unknown> = {};
  if (b.role === "staff" || b.role === "student") {
    if (!setRole(target.name, b.role)) return c.json({ error: "That role can't be set on them." }, 400);
    changes.role = b.role;
  }
  if (typeof b.adminPc === "boolean") {
    setAdminPc(target.name, b.adminPc);
    changes.adminPc = b.adminPc;
  }
  if (!Object.keys(changes).length) return c.json({ error: "Change what?" }, 400);
  log("role-changed", v, { name: target.name, ...changes }, { ip: ipOf(c) });
  return c.json({ ok: true, person: findPeople(target.name).find((p) => p.name === target.name) });
});

app.post("/api/admin/log", async (c) => {
  const r = await asAdmin(c);
  if (r instanceof Response) return r;
  const { b } = r;
  const str = (x: unknown): string | undefined => (typeof x === "string" && x.trim() ? x.trim().slice(0, 80) : undefined);
  const event = str(b.event);
  // The events ticked (the page's checkboxes: everything but connect and disconnect, say), or one group.
  const ticked = Array.isArray(b.events) ? b.events.filter((e): e is string => typeof e === "string" && KEPT.has(e as never)) : undefined;
  const events = ticked ?? (event ? (AUDIT_GROUPS[event] ?? [event]) : undefined);
  if (ticked && !ticked.length) return c.json({ entries: [], keepDays: AUDIT_DAYS, events: [...KEPT] });
  const by = b.by === "email" || b.by === "studentNo" ? b.by : "name";
  const role = b.role === "member" || b.role === "guest" || b.role === "staff" || b.role === "admin" ? b.role : undefined;
  const limit = typeof b.limit === "number" ? Math.max(1, Math.min(500, Math.floor(b.limit))) : 200;
  const before = typeof b.before === "number" && Number.isFinite(b.before) ? b.before : undefined;
  return c.json({ entries: auditEntries({ who: str(b.who), by, role, space: str(b.space), events, before, limit }), keepDays: AUDIT_DAYS, events: [...KEPT] });
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

// Hidden after reports, awaiting review: the admin sees what each says, who wrote it, who
// reported it and when it was hidden; Restore puts it back for everyone (and it stays), Remove deletes it.
app.post("/api/admin/hidden", async (c) => {
  const r = await asAdmin(c);
  if (r instanceof Response) return r;
  const admin = { ...r.v, role: "admin" } as Visitor;
  const items = hiddenList().flatMap((h) => {
    const f = reportableItem(admin, h.kind, h.target);
    return f ? [{ kind: h.kind, id: h.target, author: f.author, space: f.space, title: f.title ?? null, text: f.text, hiddenAt: h.hiddenAt, reporters: h.reporters }] : [];
  });
  return c.json({ items });
});

app.post("/api/admin/hidden/:kind/:id/restore", async (c) => {
  const r = await asAdmin(c);
  if (r instanceof Response) return r;
  const kind = REVIEW_KINDS.find((k) => k === c.req.param("kind"));
  const id = Number(c.req.param("id"));
  if (!kind || !restoreItem(kind, id)) return c.json({ error: "Already dealt with." }, 404);
  const f = reportableItem({ ...r.v, role: "admin" }, kind, id);
  log("item-restored", r.v, { space: f?.space ?? undefined, kind, item: id, owner: f?.author }, { ip: ipOf(c), content: f ? (f.title ? `${f.title}\n\n${f.text}` : f.text) : null });
  announceReview(kind, id, false);
  return c.json({ ok: true });
});

app.delete("/api/admin/hidden/:kind/:id", async (c) => {
  const r = await asAdmin(c);
  if (r instanceof Response) return r;
  const kind = REVIEW_KINDS.find((k) => k === c.req.param("kind"));
  const id = Number(c.req.param("id"));
  if (!kind || !isHidden(kind, id)) return c.json({ error: "Already dealt with." }, 404);
  const gone = removeReviewed(kind, id);
  if (!gone) return c.json({ error: "Already gone." }, 404);
  // The same event the author's own removal writes, so the log reads the same; `by` says it was a review.
  log(gone.event, r.v, { space: gone.space ?? undefined, tab: gone.tab, [kind === "post-comment" ? "comment" : kind]: id, owner: gone.owner, review: true }, { ip: ipOf(c), content: gone.content });
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
  if (!mayAct(v, target)) return c.json({ error: "The admin can't be restricted." }, 400);
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
  if (!mayAct(v, target)) return c.json({ error: "The admin can't be kicked." }, 400);
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
  // Same limit as restricting: a holder of the admin PC can't lift what was
  // put on the top admin or on another holder (themselves included).
  const target = findByName(b.name.trim());
  if (target && !mayAct(v, target)) {
    log("refused", v, { action: "lift restriction", name: target.name, what }, { ip: ipOf(c) });
    return c.json({ error: "You can't lift that one." }, 403);
  }
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
  // A report that points at one note, post or comment (the Report buttons on them) also counts
  // towards hiding it. The item must exist, be visible to the reporter, be written by the person
  // reported, and not be the reporter's own; it's checked before anything is filed.
  let item: { kind: ReviewKind; id: number } | null = null;
  if (b.item !== undefined && b.item !== null) {
    const asked = b.item as { kind?: unknown; id?: unknown };
    const kind = REVIEW_KINDS.find((k) => k === asked.kind);
    const id = typeof asked.id === "number" && Number.isInteger(asked.id) ? asked.id : NaN;
    const found = kind && about ? reportableItem(v, kind, id) : null;
    if (!kind || !about || !found) return c.json({ error: "That is gone, so there's nothing to report." }, 404);
    if (found.author.toLowerCase() !== about.toLowerCase()) return c.json({ error: "That isn't theirs." }, 400);
    if (found.author.toLowerCase() === v.name.toLowerCase()) return c.json({ error: "That's yours: you can remove it yourself." }, 400);
    item = { kind, id };
  }
  const chat = about && b.withChat === true && space ? recentChat(space) : null;
  const result = addBugReport({ author: v.name, browser: browserTag(v.token), ip: ipOf(c), space, userAgent, text, about, chat });
  if (!result.ok) return c.json({ error: `One report a minute. Wait ${result.wait}s.` }, 429);
  if (item) {
    const counted = reportItem(item.kind, item.id, v.name);
    if (counted.hidden) hideItem(v, c, item.kind, item.id, counted.reporters);
  }
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

// A test server's clock shift (CLOCK_SHIFT_HOURS, never set on Fly): QA by day sees the campus at
// night, and the other way round (the user's ask, 11/4). The client's time of day adds it.
// Canberra's weather for the sky (weather.ts): the same answer for everyone, public data only.
app.get("/api/weather", (c) => {
  c.header("Cache-Control", "no-store");
  return c.json(weatherForClient());
});

app.get("/api/clock", (c) => c.json({ shiftHours: Number(process.env.CLOCK_SHIFT_HOURS) || 0 }));

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
    const barred = stopped(c, v, "posts", { action: "upload", space: post.space, post: post.id });
    if (barred) return barred;
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
  // The row goes in before the await, so parallel requests count it against
  // the limits above (a day's 50, five a post, one a report); dropped again
  // if S3 won't sign.
  addFile({ id, kind, owner: v.name, name, size: b.size as number, key, postId, bugId, room });
  try {
    const url = await uploadLink(key, type, b.size as number);
    return c.json({ id, url, type }, 201);
  } catch (err) {
    dropFileRow(id);
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
    (f.kind === "bug" && mayUseAdminPc(v)) ||
    (f.kind === "room" && (() => {
      const at = livePlayer(v.name)?.space;
      return (!!at && f.room !== null && roomSessionOf(v.name, at) === f.room) || keepsFile(v.name, f.id);
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
  // Some hat styles and colours are earned with visit stamps (db.ts LOOK_UNLOCKS); a guest has none.
  const locked = lockedChoice(v.name, look);
  if (locked) {
    log("refused", v, { action: "look", reason: "locked", part: locked.part, index: locked.index }, { ip: ipOf(c) });
    const more = locked.stamps - locked.have;
    return c.json({ error: `That one unlocks with ${locked.stamps} visit stamps. ${more} more ${more === 1 ? "stamp" : "stamps"} to go.`, locked }, 403);
  }
  // A guest's look shows at once but isn't saved (11/4: guests store as little as possible).
  if (isMember(v)) saveLook(v.name, look);
  setLook(v.name, look);
  return c.json({ ok: true });
});

// --- interest tags -----------------------------------------------------------------
// A member shows up to three tags from a fixed list (server/social.ts) under their name tag and in
// Who's here. Never free text: anything off the list is refused here, not only hidden in the browser.

app.post("/api/tags/mine", async (c) => {
  const v = who(await body(c));
  if (!v) return c.json({ error: "Join first." }, 401);
  return c.json({ tags: isMember(v) ? tagsOf(v.name) : [], courses: COURSE_TAGS, interests: INTEREST_TAGS, max: MAX_TAGS });
});

app.put("/api/tags", async (c) => {
  const b = await body(c);
  const v = who(b);
  if (!v) return c.json({ error: "Join first." }, 401);
  const guest = guestRefused(c, v, "tags");
  if (guest) return guest;
  const tags = validTags(b.tags);
  if (!tags) {
    log("refused", v, { action: "tags", reason: "not on the list" }, { ip: ipOf(c) });
    return c.json({ error: `Pick up to ${MAX_TAGS} tags from the list.` }, 400);
  }
  saveTags(v.name, tags);
  setTags(v.name, tags);
  return c.json({ tags });
});

// --- "tell me when they're on" ------------------------------------------------------
// A member follows up to 20 other members by name; when one of them comes onto the campus the
// follower gets one notice (realtime.ts announceOn). Members at both ends, and the followed person
// decides whether people they don't follow back may be told (default: only mutual follows).

app.post("/api/follows", async (c) => {
  const v = who(await body(c));
  if (!v) return c.json({ error: "Join first." }, 401);
  return c.json({ follows: isMember(v) ? followsOf(v.name) : [], max: MAX_FOLLOWS, mutualOnly: isMember(v) ? presenceMutualOnly(v.name) : true });
});

app.put("/api/follows", async (c) => {
  const b = await body(c);
  const v = who(b);
  if (!v) return c.json({ error: "Join first." }, 401);
  const guest = guestRefused(c, v, "follow");
  if (guest) return guest;
  if (typeof b.on !== "boolean") return c.json({ error: "Follow or unfollow." }, 400);
  const target = typeof b.name === "string" ? findByName(b.name.normalize("NFKC").trim()) : undefined;
  if (!target || !isMember(target)) return c.json({ error: "There's nobody signed up by that name." }, 404);
  if (target.name.toLowerCase() === v.name.toLowerCase()) return c.json({ error: "That's you." }, 400);
  if (setFollow(v.name, target.name, b.on, MAX_FOLLOWS) === "limit") return c.json({ error: `You can follow up to ${MAX_FOLLOWS} people. Unfollow someone first.` }, 400);
  return c.json({ follows: followsOf(v.name), max: MAX_FOLLOWS });
});

/** The followed person's one choice: may people they don't follow back be told when they come on? */
app.put("/api/follows/mutual-only", async (c) => {
  const b = await body(c);
  const v = who(b);
  if (!v) return c.json({ error: "Join first." }, 401);
  const guest = guestRefused(c, v, "follow");
  if (guest) return guest;
  if (typeof b.on !== "boolean") return c.json({ error: "On or off." }, 400);
  setPresenceMutualOnly(v.name, b.on);
  return c.json({ mutualOnly: b.on });
});

// --- visit stamps -------------------------------------------------------------------
// What a member has collected and what the stamps unlock. Read-only: the server grants a stamp
// itself when it accepts a move into a space (realtime.ts), never on the client's word.
// Also answers before anyone has joined (the look window on the join screen needs the locks): then it is an empty card.
app.post("/api/stamps", async (c) => {
  const v = who(await body(c));
  const got = new Map(v ? stampsOf(v.name).map((s) => [s.stamp, s.at]) : []);
  // The Poop Room is an easter egg: its stamp stays unnamed until it has been found.
  const stamps = STAMPS.map((s) => ({ id: s.id, label: s.id === "poop" && !got.has("poop") ? SECRET_STAMP_LABEL : s.label, got: got.has(s.id) }));
  return c.json({ member: !!v && isMember(v), stamps, count: v ? stampCount(v.name) : 0, total: STAMPS.length, unlocks: LOOK_UNLOCKS });
});

// --- the events timetable -------------------------------------------------------------
// A member puts an event on: a title, a space, a start (Canberra time, within 30 days) and a
// length. Everyone reads the list, guests too. Each is shown as "Coming up", then as a banner in
// its space while it's on, and deleted once it has ended. Nothing is pushed to other people's
// screens (what a person does reaches only their own space); the browser asks again every minute.

/** The spaces an event may be in: every main space and classroom, no meeting rooms, never the Poop Room (its door is never signposted). */
const eventSpaces = (): { id: string; label: string }[] =>
  [...Object.keys(SPACES), ...classroomList().map((r) => classroomSpace(r.code))].filter((id) => id !== "poop").map((id) => ({ id, label: spaceInfo(id)!.label }));

const eventView = (e: { id: number; author: string; space: string; title: string; start: number; end: number }) => ({ ...e, spaceLabel: spaceInfo(e.space)?.label ?? e.space });

app.get("/api/events", (c) => c.json({ now: Math.floor(Date.now() / 1000), events: eventsNow().map(eventView), spaces: eventSpaces() }));

app.post("/api/events", async (c) => {
  const b = await body(c);
  const v = who(b);
  if (!v) return c.json({ error: "Join first." }, 401);
  const guest = guestRefused(c, v, "event");
  if (guest) return guest;
  const barred = stopped(c, v, "posts", { action: "event" });
  if (barred) return barred;
  const refuse = (error: string, status: 400 | 429 = 400, extra: Record<string, unknown> = {}) => {
    log("refused", v, { action: "event", reason: error }, { ip: ipOf(c), content: typeof b.title === "string" ? b.title.slice(0, 200) : null });
    return c.json({ error, ...extra }, status);
  };
  const title = eventTitle(b.title);
  if (!title.ok) return refuse(title.error);
  if (typeof b.space !== "string" || !eventSpaces().some((s) => s.id === b.space)) return refuse("Pick a place on the campus (not a meeting room).");
  const start = canberraToEpoch(b.start);
  if (start === null) return refuse("Give a start time as a Canberra date and time.");
  const now = Math.floor(Date.now() / 1000);
  // A minute's grace: a time picker only reaches whole minutes, so "now" is already a few seconds ago.
  if (start < now - 60) return refuse("That time has already passed.");
  if (start > now + EVENT_AHEAD_DAYS * 86400) return refuse(`Events can be at most ${EVENT_AHEAD_DAYS} days ahead.`);
  const minutes = b.minutes;
  if (typeof minutes !== "number" || !Number.isInteger(minutes) || minutes < EVENT_MIN_MINUTES || minutes > EVENT_MAX_MINUTES) return refuse(`An event lasts ${EVENT_MIN_MINUTES} to ${EVENT_MAX_MINUTES} minutes.`);
  const result = addEvent(v.name, b.space, title.title, start, start + minutes * 60);
  if (!result.ok) {
    if (result.why === "wait") return refuse(`One event every 30 seconds. Wait ${result.wait}s.`, 429, { wait: result.wait });
    return refuse("You already have 5 events coming up. Remove one first.");
  }
  log("event-added", v, { space: b.space, event: result.event.id, minutes }, { ip: ipOf(c), content: title.title });
  return c.json(eventView(result.event), 201);
});

app.delete("/api/events/:id", async (c) => {
  const v = who(await body(c));
  if (!v) return c.json({ error: "Join first." }, 401);
  const e = findEvent(Number(c.req.param("id")));
  if (!e) return c.json({ error: "That event is gone." }, 404);
  if (!mayRemove(v, e.author)) {
    log("refused", v, { action: "remove event", event: e.id, owner: e.author, reason: "not the author" }, { ip: ipOf(c), content: e.title });
    return c.json({ error: "Only its author can remove this event." }, 403);
  }
  deleteEvent(e.id);
  log("event-removed", v, { space: e.space, event: e.id, owner: e.author }, { ip: ipOf(c), content: e.title });
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
  purgeOldItemReports();
  purgeOldChat();
  purgeOldMail();
  purgeOldChats();
  purgeOldPoops();
  purgeEndedEvents();
  const guestsGone = purgeIdleGuests();
  if (guestsGone) log("guests-purged", null, { count: guestsGone });
  removeObjects(purgeFiles());
  removeObjects(releaseKeptFiles());
};
purge();
setInterval(purge, 60 * 60 * 1000).unref();
// The weather is fetched in the background: start-up never waits for Open-Meteo.
startWeather();

// Seongsu answers from the project's own documents (projectdocs.ts), loaded on every start, so a
// deploy that changes README, PROCESS, a decision record or CLAUDE.md changes what he knows.
try {
  const pages = loadProjectDocs();
  console.log(JSON.stringify({ at: new Date().toISOString(), event: "project-docs", pages }));
} catch (err) {
  console.error(JSON.stringify({ at: new Date().toISOString(), event: "project-docs-error", name: (err as Error)?.name }));
}

// The assistants' pages are read again once a month, by the server itself
// (crawl.ts; no Claude needed, so it keeps going after the course). Checked
// daily; only in production (CRAWL_AUTO=0 turns it off), one crawl at a time.
let crawling = false;
const crawlIfDue = (): void => {
  const last = lastCrawl();
  // The first full crawl is seeded by hand (docs/self-hosting.md), so a fresh
  // deploy doesn't spend hours on a crawl about to be replaced; CRAWL_FIRST=1
  // lets a new server start one itself.
  if (!last && process.env.CRAWL_FIRST !== "1") return;
  if (crawling || (last && Date.now() - Date.parse(`${last}Z`) < 30 * 86400_000)) return;
  crawling = true;
  void crawl()
    .catch((err: Error) => console.error(JSON.stringify({ at: new Date().toISOString(), event: "crawl-error", name: err.name })))
    .finally(() => (crawling = false));
};
if (process.env.NODE_ENV === "production" && process.env.CRAWL_AUTO !== "0") {
  setTimeout(crawlIfDue, 10 * 60_000).unref();
  setInterval(crawlIfDue, 24 * 3600_000).unref();
}

// The 3D client, once Vite has built it.
const dist = "client/dist";
if (existsSync(dist)) {
  // Pages always ask again, so a reload after a deploy gets the new build;
  // Vite's /assets/ files carry a hash in their names and may be kept.
  app.use("/*", async (c, next) => {
    await next();
    const p = c.req.path;
    if (!p.startsWith("/assets/")) c.header("Cache-Control", "no-cache");
    // Vite's hashed bundles never change under their name: a year. Models, music and pictures: a day.
    else if (c.res.status === 200 || c.res.status === 206) c.header("Cache-Control", /\.(js|css)$/.test(p) ? "public, max-age=31536000, immutable" : "public, max-age=86400");
  });
  app.use("/*", serveStatic({ root: dist, precompressed: true }));
} else {
  app.get("/", (c) => c.html('<!doctype html><title>ANU Crossing (Unofficial)</title><p>Client not built yet. <a href="/readme/">README</a></p>'));
}

const port = Number(process.env.PORT ?? 8080);
const server = serve({ fetch: app.fetch, hostname: "0.0.0.0", port }, () => {
  console.log(JSON.stringify({ at: new Date().toISOString(), event: "start", port }));
});
attachRealtime(server as Server);
// A last resort: an error nothing caught is logged (name and message only), and the one server
// everyone shares keeps running.
for (const ev of ["uncaughtException", "unhandledRejection"] as const) {
  process.on(ev, (e: unknown) => console.error(JSON.stringify({ at: new Date().toISOString(), event: ev, name: (e as Error)?.name, msg: (e as Error)?.message })));
}
