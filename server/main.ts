import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { marked } from "marked";
import { POOP_COOLDOWN_SECONDS, allPoops, createVisitor, findByName, findByToken, placePoop } from "./db.ts";

// Letters and underscores, at most eight: short enough to float over a poop,
// and narrow enough that a stranger can't write a sentence into the room.
export const NAME_RULE = /^[A-Za-z_]{1,8}$/;
// The toilet floor runs from -10 to 10 on both axes; the client keeps the
// player inside it, and the server never trusts that it did.
const ROOM = 10;

const app = new Hono();

// Rendered on the server, so the marker (and the spec) read it without scripts.
app.get("/readme/", (c) => {
  const body = marked.parse(readFileSync("README.md", "utf8"), { async: false });
  return c.html(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>README · Poop Room</title>
<style>body{max-width:42rem;margin:2rem auto;padding:0 1rem;font:1rem/1.6 system-ui,sans-serif}</style>
</head><body><main>${body}</main><p><a href="/">Back to the room</a></p></body></html>`);
});

app.post("/api/join", async (c) => {
  const { name, token } = await c.req.json<{ name?: unknown; token?: unknown }>().catch(() => ({}) as never);
  if (typeof name !== "string" || !NAME_RULE.test(name)) {
    return c.json({ error: "Names are 1–8 letters or underscores." }, 400);
  }
  const existing = findByName(name);
  if (existing) {
    // A name belongs to whoever first took it; only their browser's token gets it back.
    if (existing.token === token) return c.json({ name: existing.name, token: existing.token });
    return c.json({ error: `"${name}" is taken. Pick another name.` }, 409);
  }
  const fresh = randomUUID();
  createVisitor(name, fresh);
  return c.json({ name, token: fresh });
});

app.get("/api/poops", (c) => c.json(allPoops()));

app.post("/api/poop", async (c) => {
  const { token, x, z } = await c.req.json<{ token?: unknown; x?: unknown; z?: unknown }>().catch(() => ({}) as never);
  if (typeof token !== "string" || !findByToken(token)) {
    return c.json({ error: "Join the room before pooping." }, 401);
  }
  if (typeof x !== "number" || typeof z !== "number" || !Number.isFinite(x) || !Number.isFinite(z)) {
    return c.json({ error: "A poop needs a place." }, 400);
  }
  const clamp = (n: number) => Math.max(-ROOM, Math.min(ROOM, n));
  const poop = placePoop(token, clamp(x), clamp(z));
  if (!poop) {
    return c.json({ error: `One poop every ${POOP_COOLDOWN_SECONDS} seconds. Hold it in.` }, 429);
  }
  return c.json(poop);
});

// The 3D client, once Vite has built it.
const dist = "client/dist";
if (existsSync(dist)) {
  app.use("/*", serveStatic({ root: dist }));
} else {
  app.get("/", (c) => c.html('<!doctype html><title>Poop Room</title><p>Client not built yet. <a href="/readme/">README</a></p>'));
}

const port = Number(process.env.PORT ?? 8080);
serve({ fetch: app.fetch, hostname: "0.0.0.0", port }, () => {
  console.log(`listening on http://0.0.0.0:${port}`);
});
