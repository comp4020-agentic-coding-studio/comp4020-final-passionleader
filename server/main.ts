import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { Server } from "node:http";
import { serve } from "@hono/node-server";
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
  removeClassroom,
  type BoardTab,
  type Visitor,
} from "./db.ts";
import { log } from "./log.ts";
import { attachRealtime, broadcastAll, broadcastSpace, evictSpace } from "./realtime.ts";
import { sketchRoutes } from "./sketch/routes.ts";
import { CLASSROOM_CODE, COMMON, FIRST_SPACE, SPACES, clampTo, classroomSpace, isClassroom, isSpace, noteSpotError } from "./spaces.ts";

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
      log("join-refused", { name }, { reason: "reserved name" });
      return c.json({ error: "Names starting with qa_ are reserved." }, 403);
    }
    if (typeof password !== "string" || !checkPassword(password, account.passwordHash)) {
      log("join-refused", { name: account.name }, { reason: "wrong password" });
      return c.json({ error: "Wrong password." }, 401);
    }
    log("join", account, { how: "password" });
    return c.json({ name: account.name, token: account.token, role: account.role, spawn: lastSpot(account.name) });
  }

  if (!NAME_RULE.test(name)) return c.json({ error: "Names are 1–8 letters, digits or underscores." }, 400);
  const existing = findByName(name);
  if (existing) {
    // A name belongs to whoever first took it; only their browser's token gets it back.
    if (existing.token === token) {
      log("join", existing, { how: "returning" });
      return c.json({ name: existing.name, token: existing.token, role: existing.role, spawn: lastSpot(existing.name) });
    }
    log("join-refused", { name: existing.name, token: typeof token === "string" ? token : undefined }, { reason: "name taken" });
    return c.json({ error: `"${name}" is taken. Pick another name.` }, 409);
  }
  const fresh = randomUUID();
  createVisitor(name, fresh);
  log("join", { name, token: fresh }, { how: "new" });
  return c.json({ name, token: fresh, role: "user", spawn: { space: FIRST_SPACE, ...SPACES[FIRST_SPACE]!.spawn } });
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
    log("refused", v, { action: "note", space: b.space, reason: bad });
    return c.json({ error: bad }, 400);
  }
  const { x, z } = clampTo(b.space, b.x, b.z);
  const where = noteSpotError(b.space, x, z);
  if (where) {
    log("refused", v, { action: "note", space: b.space, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, reason: where });
    return c.json({ error: where }, 400);
  }
  const result = addNote(v.name, b.space, x, z, (b.text as string).trim());
  if (!result.ok) {
    log("refused", v, { action: "note", space: b.space, reason: "too soon", wait: result.wait });
    return c.json({ error: `One note every 30 seconds. Wait ${result.wait}s.`, wait: result.wait }, 429);
  }
  log("note", v, { space: b.space, note: result.note.id, words: wordCount(result.note.text) });
  if (result.replaced !== null) log("note-replaced", v, { space: b.space, note: result.replaced, by: result.note.id });
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
    log("refused", v, { action: "remove note", space: note.space, note: note.id, owner: note.author, reason: "not the author" });
    return c.json({ error: "Only its author can remove this note." }, 403);
  }
  deleteNote(note.id);
  log("note-removed", v, { space: note.space, note: note.id, owner: note.author });
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
    log("refused", v, { action: "comment", space: note.space, note: note.id, reason: bad });
    return c.json({ error: bad }, 400);
  }
  const result = addComment(v.name, note.id, (b.text as string).trim());
  if (!result.ok) {
    log("refused", v, { action: "comment", space: note.space, note: note.id, reason: "too soon", wait: result.wait });
    return c.json({ error: `One comment every 10 seconds. Wait ${result.wait}s.`, wait: result.wait }, 429);
  }
  log("comment", v, { space: note.space, note: note.id, comment: result.comment.id, words: wordCount(result.comment.text) });
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
    log("refused", v, { action: "remove comment", space: note?.space, comment: comment.id, owner: comment.author, reason: "not the author" });
    return c.json({ error: "Only its author can remove this comment." }, 403);
  }
  deleteComment(comment.id);
  log("comment-removed", v, { space: note?.space, comment: comment.id, owner: comment.author });
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
    log("refused", v, { action: "create classroom", code, reason: "not admin" });
    return c.json({ error: "Only the admin can open a classroom." }, 403);
  }
  if (!CLASSROOM_CODE.test(code)) return c.json({ error: "Use a course code like COMP6300." }, 400);
  if (!addClassroom(code, v.name)) return c.json({ error: `${code} is already open.` }, 409);
  log("classroom-created", v, { code, space: classroomSpace(code) });
  broadcastAll({ t: "action", kind: "classrooms", classrooms: classroomList() });
  return c.json({ code, space: classroomSpace(code) }, 201);
});

app.delete("/api/classrooms/:code", async (c) => {
  const v = who(await body(c));
  if (!v) return c.json({ error: "Join first." }, 401);
  const code = c.req.param("code").toUpperCase();
  if (v.role !== "admin") {
    log("refused", v, { action: "remove classroom", code, reason: "not admin" });
    return c.json({ error: "Only the admin can close a classroom." }, 403);
  }
  if (code === COMMON) return c.json({ error: "COMMON stays open." }, 400);
  const space = classroomSpace(code);
  // Anyone inside is sent back out first, so nobody is left in a room that's gone.
  const moved = evictSpace(space, FIRST_SPACE, { x: -8.4, z: 7 });
  if (!removeClassroom(code)) return c.json({ error: `${code} isn't open.` }, 404);
  log("classroom-removed", v, { code, space, moved });
  broadcastAll({ t: "action", kind: "classrooms", classrooms: classroomList() });
  return c.json({ ok: true });
});

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
    log("refused", v, { action: "post", space: b.space, tab: b.tab, reason: "notices are for staff" });
    return c.json({ error: "Only lecturers and staff can post in Notices." }, 403);
  }
  const bad = postError(b.title, b.text);
  if (bad) {
    log("refused", v, { action: "post", space: b.space, tab: b.tab, reason: bad });
    return c.json({ error: bad }, 400);
  }
  const result = addPost(v.name, b.space, b.tab, (b.title as string).trim(), (b.text as string).trim());
  if (!result.ok) {
    log("refused", v, { action: "post", space: b.space, tab: b.tab, reason: "too soon", wait: result.wait });
    return c.json({ error: `One post every 30 seconds. Wait ${result.wait}s.`, wait: result.wait }, 429);
  }
  log("post", v, { space: b.space, tab: b.tab, post: result.post.id, words: wordCount(result.post.text) });
  broadcastSpace(b.space, { t: "action", kind: "board", tab: b.tab });
  return c.json(result.post, 201);
});

app.delete("/api/board/:id", async (c) => {
  const v = who(await body(c));
  if (!v) return c.json({ error: "Join first." }, 401);
  const post = findPost(Number(c.req.param("id")));
  if (!post) return c.json({ error: "That post is gone." }, 404);
  if (!mayRemove(v, post.author)) {
    log("refused", v, { action: "remove post", space: post.space, post: post.id, owner: post.author, reason: "not the author" });
    return c.json({ error: "Only its author can remove this post." }, 403);
  }
  deletePost(post.id);
  log("post-removed", v, { space: post.space, tab: post.tab, post: post.id, owner: post.author });
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
    log("refused", v, { action: "post comment", space: post.space, post: post.id, reason: bad });
    return c.json({ error: bad }, 400);
  }
  const result = addPostComment(v.name, post.id, (b.text as string).trim());
  if (!result.ok) {
    log("refused", v, { action: "post comment", space: post.space, post: post.id, reason: "too soon", wait: result.wait });
    return c.json({ error: `One comment every 10 seconds. Wait ${result.wait}s.`, wait: result.wait }, 429);
  }
  log("post-comment", v, { space: post.space, tab: post.tab, post: post.id, comment: result.comment.id, words: wordCount(result.comment.text) });
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
    log("refused", v, { action: "remove post comment", space: post?.space, comment: comment.id, owner: comment.author, reason: "not the author" });
    return c.json({ error: "Only its author can remove this comment." }, 403);
  }
  deletePostComment(comment.id);
  log("post-comment-removed", v, { space: post?.space, comment: comment.id, owner: comment.author });
  if (post) broadcastSpace(post.space, { t: "action", kind: "board", tab: post.tab, post: post.id });
  return c.json({ ok: true });
});

// Sketch & Guess, the drawing game on the Hub's arcade machine.
sketchRoutes(app);

// Notes past their month: hidden from every query already, deleted hourly.
const purge = (): void => {
  const gone = purgeExpiredNotes();
  if (gone) log("note-expired", null, { count: gone });
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
