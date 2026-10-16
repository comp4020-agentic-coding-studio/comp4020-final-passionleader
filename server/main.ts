import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { Server } from "node:http";
import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context } from "hono";
import { marked } from "marked";
import { NAME_RULE, RESERVED, RESERVED_RULE, checkPassword, mayPostIn, mayRemove, postError, textError } from "./accounts.ts";
import {
  BOARD_TABS,
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
  lookOf,
  saveLook,
  validLook,
  removeClassroom,
  setClassroomLink,
  type BoardTab,
  type Visitor,
} from "./db.ts";
import { browserTag, keepIn, log } from "./log.ts";
import { attachRealtime, broadcastAll, broadcastSpace, evictSpace, setLook } from "./realtime.ts";
import { sketchRoutes } from "./sketch/routes.ts";
import { CLASSROOM_CODE, COMMON, FIRST_SPACE, SPACES, clampTo, classroomSpace, isClassroom, isSpace, noteSpotError, teamRoomsOf } from "./spaces.ts";

// Lines the admin can read back for seven days go into SQLite as well.
keepIn(addAudit);

const app = new Hono();

// Rendered on the server, so the marker (and the spec) read it without scripts.
app.get("/readme/", (c) => {
  const body = marked.parse(readFileSync("README.md", "utf8"), { async: false });
  return c.html(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>README</title>
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

app.post("/api/join", async (c) => {
  const { name, token, password } = await body(c);
  if (typeof name !== "string") return c.json({ error: "Pick a name." }, 400);

  // Test and admin accounts sign in with a password, from any browser.
  if (RESERVED.test(name)) {
    const account = RESERVED_RULE.test(name) ? findByName(name) : undefined;
    if (!account?.passwordHash) {
      log("join-refused", { name }, { reason: "reserved name" }, { ip: ipOf(c) });
      return c.json({ error: "Names starting with qa_ are reserved." }, 403);
    }
    if (typeof password !== "string" || !checkPassword(password, account.passwordHash)) {
      log("join-refused", { name: account.name }, { reason: "wrong password" }, { ip: ipOf(c) });
      return c.json({ error: "Wrong password." }, 401);
    }
    log("join", account, { how: "password" }, { ip: ipOf(c) });
    return c.json({ name: account.name, token: account.token, role: account.role, spawn: lastSpot(account.name), look: lookOf(account.name) });
  }

  if (!NAME_RULE.test(name)) return c.json({ error: "Names are 1–8 letters, digits or underscores." }, 400);
  const existing = findByName(name);
  if (existing) {
    // A name belongs to whoever first took it; only their browser's token gets it back.
    if (existing.token === token) {
      log("join", existing, { how: "returning" }, { ip: ipOf(c) });
      return c.json({ name: existing.name, token: existing.token, role: existing.role, spawn: lastSpot(existing.name), look: lookOf(existing.name) });
    }
    log("join-refused", { name: existing.name, token: typeof token === "string" ? token : undefined }, { reason: "name taken" }, { ip: ipOf(c) });
    return c.json({ error: `"${name}" is taken. Pick another name.` }, 409);
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
let projects: { name: string; url: string }[] = [];
let projectsCheckedAt: string | null = null;

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

// --- classroom boards --------------------------------------------------------
// Every classroom has a board with three tabs. Anyone reads everything, posts
// in Q&A and Board, and comments anywhere. Only lecturers and staff post in
// Notices (until there's a staff role, the admin): checked here, refused with
// a 403 and a log line. Authors and the admin remove posts and comments.

const isTab = (t: unknown): t is BoardTab => typeof t === "string" && (BOARD_TABS as readonly string[]).includes(t);
// Not a row: the first thing in every Notices tab, saying who may post there.
const PINNED_NOTICE = {
  id: 0,
  tab: "notices",
  author: "ANU campus",
  title: "Who can post here",
  text: "Only lecturers and staff can post in Notices, so other users can't post here. Everyone can read and comment.",
  createdAt: "",
  comments: 0,
  pinned: true,
};

app.get("/api/board", (c) => {
  const space = c.req.query("space");
  const tab = c.req.query("tab");
  if (!isClassroom(space)) return c.json({ error: "No such classroom." }, 404);
  if (!isTab(tab)) return c.json({ error: "No such tab." }, 400);
  const posts = postsIn(space, tab);
  return c.json(tab === "notices" ? [PINNED_NOTICE, ...posts] : posts);
});

app.post("/api/board", async (c) => {
  const b = await body(c);
  const v = who(b);
  if (!v) return c.json({ error: "Join first." }, 401);
  if (!isClassroom(b.space)) return c.json({ error: "No such classroom." }, 400);
  if (!isTab(b.tab)) return c.json({ error: "No such tab." }, 400);
  if (!mayPostIn(v, b.tab)) {
    log("refused", v, { action: "post", space: b.space, tab: b.tab, reason: "notices are for staff" }, { ip: ipOf(c), content: typeof b.title === "string" || typeof b.text === "string" ? `${String(b.title ?? "")}\n\n${String(b.text ?? "")}`.slice(0, 3200) : null });
    return c.json({ error: "Only lecturers and staff can post in Notices." }, 403);
  }
  const bad = postError(b.title, b.text);
  if (bad) {
    log("refused", v, { action: "post", space: b.space, tab: b.tab, reason: bad }, { ip: ipOf(c), content: typeof b.title === "string" || typeof b.text === "string" ? `${String(b.title ?? "")}\n\n${String(b.text ?? "")}`.slice(0, 3200) : null });
    return c.json({ error: bad }, 400);
  }
  const result = addPost(v.name, b.space, b.tab, (b.title as string).trim(), (b.text as string).trim());
  if (!result.ok) {
    log("refused", v, { action: "post", space: b.space, tab: b.tab, reason: "too soon", wait: result.wait }, { ip: ipOf(c), content: typeof b.title === "string" || typeof b.text === "string" ? `${String(b.title ?? "")}\n\n${String(b.text ?? "")}`.slice(0, 3200) : null });
    return c.json({ error: `One post every 30 seconds. Wait ${result.wait}s.`, wait: result.wait }, 429);
  }
  log("post", v, { space: b.space, tab: b.tab, post: result.post.id, words: wordCount(result.post.text) }, { ip: ipOf(c), content: `${result.post.title}\n\n${result.post.text}` });
  broadcastSpace(b.space, { t: "action", kind: "board", tab: b.tab });
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
  deletePost(post.id);
  log("post-removed", v, { space: post.space, tab: post.tab, post: post.id, owner: post.author }, { ip: ipOf(c), content: `${post.title}\n\n${post.text}` });
  broadcastSpace(post.space, { t: "action", kind: "board", tab: post.tab });
  return c.json({ ok: true });
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
  content: ["note", "note-replaced", "note-removed", "note-expired", "comment", "comment-removed", "post", "post-removed", "post-comment", "post-comment-removed", "bug-report"],
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
  return c.json({ bugs: bugReports() });
});

app.delete("/api/admin/bugs/:id", async (c) => {
  const r = await asAdmin(c);
  if (r instanceof Response) return r;
  if (!deleteBugReport(Number(c.req.param("id")))) return c.json({ error: "Already gone." }, 404);
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
  const result = addBugReport({ author: v.name, browser: browserTag(v.token), ip: ipOf(c), space, userAgent, text });
  if (!result.ok) return c.json({ error: `One report a minute. Wait ${result.wait}s.` }, 429);
  log("bug-report", v, { space, report: result.id, chars: text.length }, { ip: ipOf(c), content: text });
  return c.json({ id: result.id }, 201);
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
};
purge();
setInterval(purge, 60 * 60 * 1000).unref();

// The 3D client, once Vite has built it.
const dist = "client/dist";
if (existsSync(dist)) {
  app.use("/*", serveStatic({ root: dist }));
} else {
  app.get("/", (c) => c.html('<!doctype html><title>ANU campus</title><p>Client not built yet. <a href="/readme/">README</a></p>'));
}

const port = Number(process.env.PORT ?? 8080);
const server = serve({ fetch: app.fetch, hostname: "0.0.0.0", port }, () => {
  console.log(JSON.stringify({ at: new Date().toISOString(), event: "start", port }));
});
attachRealtime(server as Server);
