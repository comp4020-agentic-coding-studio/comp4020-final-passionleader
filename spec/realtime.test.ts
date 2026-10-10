import { afterEach, describe, expect, inject, it } from "vitest";

// Crit 9's contract, checked over a real WebSocket against the running app:
// what one visitor does shows up for everyone else within a second, without
// a reload.
const baseUrl = inject("baseUrl");
const wsUrl = (token: string) => {
  const u = new URL("/ws", baseUrl);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.searchParams.set("token", token);
  return u.href;
};

const freshName = () =>
  Array.from({ length: 8 }, () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]).join("");

async function visitor(): Promise<{ name: string; token: string }> {
  const name = freshName();
  const res = await fetch(new URL("/api/join", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return { name, ...(await res.json()) };
}

const open: WebSocket[] = [];
afterEach(() => open.splice(0).forEach((ws) => ws.close()));

type Msg = { t: string; [k: string]: unknown };

// Connects and collects every message, so a test can wait for the one it needs.
function connect(token: string): Promise<{ ws: WebSocket; next: (pred: (m: Msg) => boolean, ms?: number) => Promise<Msg> }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl(token));
    open.push(ws);
    const seen: Msg[] = [];
    const waiters: { pred: (m: Msg) => boolean; done: (m: Msg) => void }[] = [];
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data)) as Msg;
      seen.push(m);
      for (const w of [...waiters]) if (w.pred(m)) (waiters.splice(waiters.indexOf(w), 1), w.done(m));
    };
    ws.onerror = () => reject(new Error("socket failed to open"));
    ws.onopen = () =>
      resolve({
        ws,
        next: (pred, ms = 1000) =>
          new Promise((done, fail) => {
            const hit = seen.find(pred);
            if (hit) return done(hit);
            const timer = setTimeout(() => fail(new Error(`nothing matching within ${ms}ms`)), ms);
            waiters.push({ pred, done: (m) => (clearTimeout(timer), done(m)) });
          }),
      });
  });
}

describe("real time", () => {
  it("refuses a socket without a joined visitor's token", async () => {
    const ws = new WebSocket(wsUrl("not-a-visitor"));
    open.push(ws);
    await expect(new Promise((ok, fail) => ((ws.onopen = ok), (ws.onerror = fail)))).rejects.toBeTruthy();
  });

  it("shows one visitor's movement to another within a second", async () => {
    const a = await visitor();
    const b = await visitor();
    const sa = await connect(a.token);
    const sb = await connect(b.token);

    sa.ws.send(JSON.stringify({ t: "move", x: 3.5, y: 0, z: -2, rot: 1 }));
    const seen = await sb.next(
      (m) => m.t === "players" && (m.players as { name: string; x: number }[]).some((p) => p.name === a.name && p.x === 3.5),
    );
    expect(seen).toBeTruthy();
  });

  it("shows a poop to everyone else the moment it lands", async () => {
    const a = await visitor();
    const b = await visitor();
    await connect(a.token);
    const sb = await connect(b.token);

    await fetch(new URL("/api/poop", baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: a.token, x: -4, z: 2 }),
    });
    const seen = await sb.next((m) => m.t === "action" && (m.poop as { name: string }).name === a.name);
    expect(seen).toMatchObject({ kind: "poop", poop: { x: -4, z: 2 } });
  });

  it("tells the room when someone leaves", async () => {
    const a = await visitor();
    const b = await visitor();
    const sa = await connect(a.token);
    const sb = await connect(b.token);
    const welcome = await sa.next((m) => m.t === "welcome");

    sa.ws.close();
    const left = await sb.next((m) => m.t === "leave");
    expect(left.id).toBe(welcome.id);
  });
});
