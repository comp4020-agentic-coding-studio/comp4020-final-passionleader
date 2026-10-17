import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { Server } from "node:http";
import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context } from "hono";
import { marked } from "marked";
import { NAME_RULE, RESERVED, RESERVED_RULE, checkPassword, mayRemove, postError, textError } from "./accounts.ts";
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
  removeClassroom,
  setClassroomLink,
  type Visitor,
} from "./db.ts";
import { browserTag, keepIn, log } from "./log.ts";
import { attachRealtime, broadcastAll, broadcastSpace, evictSpace, livePlayer, noticeRestriction, roomSessionOf, roomShare, setLook } from "./realtime.ts";
import { S3Failure, arrivedSize, cleanName, downloadLink, fileError, isImage, keyFor, removeObjects, s3Message, s3Ready, typeOf, uploadLink, type FileKind } from "./files.ts";
import { sketchRoutes } from "./sketch/routes.ts";
import { boardOf, mayPostIn, tabOf } from "./boards.ts";
import { CLASSROOM_CODE, COMMON, FIRST_SPACE, SPACES, clampTo, classroomSpace, isSpace, noteSpotError, roomOf, teamRoomsOf } from "./spaces.ts";

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

const RESTRICTED_WHAT: Record<Restrictable, string> = { notes: "sticking notes or commenting on them", posts: "posting or commenting on boards", chat: "chatting", join: "coming in" };
/** If the admin has stopped `v` doing `what`, logs the refusal and answers 403; else null. */
function stopped(c: Context, v: Visitor, what: Restrictable, details: Record<string, unknown>): Response | null {
  const r = restrictionOn(v.name, what);
  if (!r) return null;
  log("refused", v, { ...details, reason: "restricted" }, { ip: ipOf(c) });
  return c.json({ error: `The admin has stopped you ${RESTRICTED_WHAT[what]} until ${r.until.slice(0, 16).replace("T", " ")} UTC.`, until: r.until }, 403);
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
    // A name belongs to whoever first took it; only their browser's token gets it back.
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
  const fresh = randomUUID();
  createVisitor(name, fresh);
  log("join", { name, token: fresh }, { how: "new" }, { ip: ipOf(c) });
  return c.json({ name, token: fresh, role: "user", spawn: { space: FIRST_SPACE, ...SPACES[FIRST_SPACE]!.spawn }, look: null });
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
// Anyone may list them (the picker at 155's door); only the admin opens or
// closes one. The check is here on the server, so a request crafted outside
// the app gets the same answer as a click in it.

app.get("/api/classrooms", (c) => c.json(classroomList()));

app.post("/api/classrooms", async (c) => {
  const b = await body(c);
  const v = who(b);
  if (!v) return c.json({ error: "Join first." }, 401);
  const code = typeof b.code === "string" ? b.code.trim().toUpperCase() : "";
  if (v.role !== "admin") {
    log("refused", v, { action: "create classroom", code, reason: "not admin" }, { ip: ipOf(c) });
    return c.json({ error: "Only the admin can open a classroom." }, 403);
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
  if (v.role !== "admin") {
    log("refused", v, { action: "remove classroom", code, reason: "not admin" }, { ip: ipOf(c) });
    return c.json({ error: "Only the admin can close a classroom." }, 403);
  }
  if (code === COMMON) return c.json({ error: "COMMON stays open." }, 400);
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
  if (v.role !== "admin") {
    log("refused", v, { action: "set classroom link", code, reason: "not admin" }, { ip: ipOf(c) });
    return c.json({ error: "Only the admin can set what the boards open." }, 403);
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
  if (!setClassroomLink(code, which, url)) return c.json({ error: `${code} isn't open.` }, 404);
  log("classroom-link", v, { code, which, url }, { ip: ipOf(c) });
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
// tabs and comments anywhere. Only lecturers and staff post in a staff-only
// tab like Notices (until there's a staff role, the admin): checked here,
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
  const posts = postsIn(space!, tab.id).map((p) => ({ ...p, files: filesOn("post", p.id).map(({ id, name, size }) => ({ id, name, size })) }));
  return c.json(tab.staffOnly ? [{ ...pinnedNotice(tab.label), tab: tab.id }, ...posts] : posts);
});

app.post("/api/board", async (c) => {
  const b = await body(c);
  const v = who(b);
  if (!v) return c.json({ error: "Join first." }, 401);
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
  const result = addPost(v.name, space, tab.id, (b.title as string).trim(), (b.text as string).trim());
  if (!result.ok) {
    log("refused", v, { action: "post", space, tab: tab.id, reason: "too soon", wait: result.wait }, { ip: ipOf(c), content });
    return c.json({ error: `One post every 30 seconds. Wait ${result.wait}s.`, wait: result.wait }, 429);
  }
  log("post", v, { space, tab: tab.id, post: result.post.id, words: wordCount(result.post.text) }, { ip: ipOf(c), content: `${result.post.title}\n\n${result.post.text}` });
  broadcastSpace(space, { t: "action", kind: "board", tab: tab.id });
  return c.json(result.post, 201);
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
  broadcastSpace(post.space, { t: "action", kind: "board", tab: post.tab });
  return c.json({ ok: true });
});

// Editing: only the author, never the admin on someone else's behalf (an
// admin removes; putting words in someone's mouth is another matter). Same
// limits as posting, no cooldown; the post or comment then says "edited".
app.patch("/api/board/:id", async (c) => {
  const b = await body(c);
  const v = who(b);
  if (!v) return c.json({ error: "Join first." }, 401);
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
  const edited = editPost(post.id, (b.title as string).trim(), (b.text as string).trim());
  log("post-edited", v, { space: post.space, tab: post.tab, post: post.id, words: wordCount(edited.text) }, { ip: ipOf(c), content: `${edited.title}\n\n${edited.text}` });
  broadcastSpace(post.space, { t: "action", kind: "board", tab: post.tab, post: post.id });
  return c.json({ ...edited, files: filesOn("post", edited.id).map(({ id, name, size }) => ({ id, name, size })) });
});

app.get("/api/board/:id/comments", (c) => {
  const post = findPost(Number(c.req.param("id")));
  if (!post) return c.json({ error: "That post is gone." }, 404);
  return c.json(postCommentsOn(post.id));
});

app.post("/api/board/:id/comments", async (c) => {
  const b = await body(c);
  const v = who(b);
  if (!v) return c.json({ error: "Join first." }, 401);
  const post = findPost(Number(c.req.param("id")));
  if (!post) return c.json({ error: "That post is gone." }, 404);
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
  broadcastSpace(post.space, { t: "action", kind: "board", tab: post.tab, post: post.id });
  return c.json(result.comment, 201);
});

app.patch("/api/board-comments/:id", async (c) => {
  const b = await body(c);
  const v = who(b);
  if (!v) return c.json({ error: "Join first." }, 401);
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
  if (post) broadcastSpace(post.space, { t: "action", kind: "board", tab: post.tab, post: post.id });
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
  if (post) broadcastSpace(post.space, { t: "action", kind: "board", tab: post.tab, post: post.id });
  return c.json({ ok: true });
});

// --- the admin's log and bug reports -------------------------------------------
// The Student Hub's reception PC opens /admin/ (and so can a browser tab, for
// reading along during a crit). Only the admin reads either, checked here on
// every request; anyone joined may send a bug report.

const AUDIT_GROUPS: Record<string, string[]> = {
  admin: ["restricted", "restriction-lifted", "classroom-created", "classroom-removed", "classroom-link"],
  content: ["note", "note-replaced", "note-removed", "note-expired", "comment", "comment-removed", "post", "post-removed", "post-comment", "post-comment-removed", "bug-report", "file"],
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
  log("bug-report", v, { space, report: result.id, chars: text.length, about, chatLines: chat?.length }, { ip: ipOf(c), content: text });
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
    if (f.kind === "board" && space) broadcastSpace(space, { t: "action", kind: "board", tab: findPost(f.postId!)?.tab, post: f.postId });
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
    f.kind === "board" ||
    (f.kind === "bug" && v.role === "admin") ||
    (f.kind === "room" && (() => {
      const at = livePlayer(v.name)?.space;
      return !!at && roomSessionOf(v.name, at) === f.room;
    })());
  if (!allowed) {
    log("refused", v, { action: "download", kind: f.kind, reason: f.kind === "room" ? "not in the room" : "not admin" }, { ip: ipOf(c), content: f.name });
    return c.json({ error: f.kind === "room" ? "Only the people in the room can open its files." : "This is for the admin." }, 403);
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
  saveLook(v.name, look);
  setLook(v.name, look);
  return c.json({ ok: true });
});

// Sketch & Guess, the drawing game on the Hub's arcade machine.
sketchRoutes(app);

// Notes past their month: hidden from every query already, deleted hourly.
// The admin's log past its seven days goes the same way.
const purge = (): void => {
  const gone = purgeExpiredNotes();
  if (gone) log("note-expired", null, { count: gone });
  purgeOldAudit();
  purgeOldChat();
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
