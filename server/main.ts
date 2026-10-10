import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { Server } from "node:http";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context } from "hono";
import { marked } from "marked";
import { NAME_RULE, RESERVED, RESERVED_RULE, checkPassword, mayRemove, textError } from "./accounts.ts";
import {
  NOTES_PER_SPACE,
  addComment,
  addNote,
  commentsOn,
  createVisitor,
  deleteComment,
  deleteNote,
  findByName,
  findByToken,
  findComment,
  findNote,
  lastSpot,
  noteCount,
  notesIn,
  type Visitor,
} from "./db.ts";
import { attachRealtime, broadcastSpace } from "./realtime.ts";
import { FIRST_SPACE, SPACES, clampTo, isSpace } from "./spaces.ts";

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
    if (!account?.passwordHash) return c.json({ error: "Names starting with qa_ are reserved." }, 403);
    if (typeof password !== "string" || !checkPassword(password, account.passwordHash)) {
      return c.json({ error: "Wrong password." }, 401);
    }
    return c.json({ name: account.name, token: account.token, role: account.role, spawn: lastSpot(account.name) });
  }

  if (!NAME_RULE.test(name)) return c.json({ error: "Names are 1–8 letters, digits or underscores." }, 400);
  const existing = findByName(name);
  if (existing) {
    // A name belongs to whoever first took it; only their browser's token gets it back.
    if (existing.token === token) {
      return c.json({ name: existing.name, token: existing.token, role: existing.role, spawn: lastSpot(existing.name) });
    }
    return c.json({ error: `"${name}" is taken. Pick another name.` }, 409);
  }
  const fresh = randomUUID();
  createVisitor(name, fresh);
  return c.json({ name, token: fresh, role: "user", spawn: { space: FIRST_SPACE, ...SPACES[FIRST_SPACE].spawn } });
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
  if (bad) return c.json({ error: bad }, 400);
  const { x, z } = clampTo(b.space, b.x, b.z);
  const result = addNote(v.name, b.space, x, z, (b.text as string).trim());
  if (!result.ok) return c.json({ error: `One note every 30 seconds. Wait ${result.wait}s.`, wait: result.wait }, 429);
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
  if (!mayRemove(v, note.author)) return c.json({ error: "Only its author can remove this note." }, 403);
  deleteNote(note.id);
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
  if (bad) return c.json({ error: bad }, 400);
  const result = addComment(v.name, note.id, (b.text as string).trim());
  if (!result.ok) return c.json({ error: `One comment every 10 seconds. Wait ${result.wait}s.`, wait: result.wait }, 429);
  broadcastSpace(note.space, { t: "action", kind: "comment", comment: result.comment });
  return c.json(result.comment, 201);
});

app.delete("/api/comments/:id", async (c) => {
  const v = who(await body(c));
  if (!v) return c.json({ error: "Join first." }, 401);
  const comment = findComment(Number(c.req.param("id")));
  if (!comment) return c.json({ error: "That comment is gone." }, 404);
  if (!mayRemove(v, comment.author)) return c.json({ error: "Only its author can remove this comment." }, 403);
  const note = findNote(comment.noteId);
  deleteComment(comment.id);
  if (note) broadcastSpace(note.space, { t: "action", kind: "comment-removed", id: comment.id, noteId: note.id });
  return c.json({ ok: true });
});

// The 3D client, once Vite has built it.
const dist = "client/dist";
if (existsSync(dist)) {
  app.use("/*", serveStatic({ root: dist }));
} else {
  app.get("/", (c) => c.html('<!doctype html><title>ANU campus</title><p>Client not built yet. <a href="/readme/">README</a></p>'));
}

const port = Number(process.env.PORT ?? 8080);
const server = serve({ fetch: app.fetch, hostname: "0.0.0.0", port }, () => {
  console.log(`listening on http://0.0.0.0:${port}`);
});
attachRealtime(server as Server);
