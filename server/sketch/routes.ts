import type { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { findByToken } from "../db.ts";
import { log } from "../log.ts";
import { clear, currentWordForTests, draw, guess, heartbeat, join, leave, resetForTests, start, subscribe, viewFor, type Result } from "./game.ts";

// Sketch & Guess on the campus server: the arcade machine in the Student Hub
// opens /minigame/sketch/ in the in-app window, and that page talks to these
// two endpoints. The game's own rules hold: who you are comes from an
// httpOnly cookie, never the request body, and the secret word only ever
// reaches the drawer (game.ts viewFor). The one change is joining: you join
// with your campus token, and the server takes your name from it, so in the
// game you're who you are on the campus, and nobody can play as someone else.

const COOKIE = "sketch";
const MAX_BODY = 16_000;
// Never set in production: lets the spec reset the room and read the word.
const TEST_HOOKS = process.env.GAME_TEST_HOOKS === "1";

export function sketchRoutes(app: Hono): void {
  app.get("/api/sketch", (c) => c.json(viewFor(getCookie(c, COOKIE) ?? null)));

  app.post("/api/sketch", async (c) => {
    const raw = await c.req.text();
    if (raw.length > MAX_BODY) return c.text("too large", 413);
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) throw new Error();
      body = parsed as Record<string, unknown>;
    } catch {
      return c.text("expected a JSON object", 400);
    }
    const token = getCookie(c, COOKIE) ?? null;
    let result: Result;
    switch (body.action) {
      case "join": {
        // The campus visitor behind the campus token: that's the name in the game.
        const visitor = typeof body.campusToken === "string" ? findByToken(body.campusToken) : undefined;
        if (!visitor) return c.text("join the campus first", 401);
        result = join(token, visitor.name);
        if (result.ok && result.token) {
          setCookie(c, COOKIE, result.token, {
            path: "/",
            httpOnly: true,
            sameSite: "Lax",
            secure: c.req.header("x-forwarded-proto") === "https",
            maxAge: 60 * 60 * 12,
          });
          log("game-join", { name: visitor.name, token: body.campusToken as string, role: visitor.role }, { game: "sketch" });
        }
        break;
      }
      case "leave":
        result = token ? leave(token) : { ok: false, status: 403, error: "not in the game" };
        if (result.ok) deleteCookie(c, COOKIE, { path: "/" });
        break;
      case "start":
        result = token ? start(token) : { ok: false, status: 403, error: "join first" };
        break;
      case "draw":
        result = token ? draw(token, body.stroke) : { ok: false, status: 403, error: "join first" };
        break;
      case "clear":
        result = token ? clear(token) : { ok: false, status: 403, error: "join first" };
        break;
      case "guess":
        result = token ? guess(token, body.text) : { ok: false, status: 403, error: "join first" };
        break;
      case "ping":
        if (token) heartbeat(token);
        result = { ok: true };
        break;
      case "test:reset":
        if (!TEST_HOOKS) return c.text("not found", 404);
        resetForTests();
        result = { ok: true };
        break;
      case "test:word":
        if (!TEST_HOOKS) return c.text("not found", 404);
        return c.json({ word: currentWordForTests() });
      default:
        return c.text("unknown action", 400);
    }
    if (!result.ok) return c.text(result.error, result.status as 400);
    return c.json({ ok: true, id: result.id });
  });

  // The live stream: a full snapshot on connect and on every change, plus each
  // stroke as it's drawn. Each connection gets its own view.
  app.get("/api/sketch/events", (c) => {
    const token = getCookie(c, COOKIE) ?? null;
    c.header("x-accel-buffering", "no");
    c.header("cache-control", "no-cache, no-transform");
    return streamSSE(c, async (stream) => {
      let done!: () => void;
      const closed = new Promise<void>((r) => (done = r));
      // game.ts writes ready-made SSE text ("event: …\ndata: …\n\n").
      const unsubscribe = subscribe(token, (chunk) => void stream.write(chunk));
      stream.onAbort(() => {
        unsubscribe();
        done();
      });
      await closed;
    });
  });
}
