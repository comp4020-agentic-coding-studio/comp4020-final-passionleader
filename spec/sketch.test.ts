import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { api as campus, baseUrl, freshName } from "./helpers.ts";

// Sketch & Guess, the drawing game on the Hub's arcade machine, played over
// HTTP the way the page does. Brought over from the standalone game with its
// tests; joining now takes a campus token, and the name comes from it.
// The round tests need the room reset and the secret word read, which only
// work with GAME_TEST_HOOKS=1 (never in production); without it they skip,
// and the checks that need no hooks still run.

const url = (): URL => new URL("/api/sketch", baseUrl());
let hooks = false;

class Player {
  cookie = "";
  name = "";
  token = "";
  async enrol(): Promise<this> {
    const g = (await (await campus("/api/guest", "POST", {})).json()) as { name: string; token: string };
    this.name = g.name;
    this.token = g.token;
    return this;
  }
  async post(action: string, extra: Record<string, unknown> = {}): Promise<Response> {
    const res = await fetch(url(), {
      method: "POST",
      headers: { "content-type": "application/json", ...(this.cookie ? { cookie: this.cookie } : {}) },
      body: JSON.stringify({ action, ...extra }),
    });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0]!;
    return res;
  }
  async view(): Promise<Record<string, any>> {
    return (await fetch(url(), { headers: this.cookie ? { cookie: this.cookie } : {} })).json();
  }
  async join(): Promise<this> {
    await this.enrol();
    expect((await this.post("join", { campusToken: this.token })).status).toBe(200);
    return this;
  }
}

const anon = new Player();
const word = async (): Promise<string> => (await (await anon.post("test:word")).json()).word;
const drawerOf = async (ps: Player[]): Promise<Player> => {
  for (const p of ps) if ((await p.view()).isDrawer) return p;
  throw new Error("no drawer");
};
const stroke = { points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }], width: 6, color: "#1f1d1a" };

beforeAll(async () => {
  hooks = (await anon.post("test:reset")).status === 200;
});

describe("Sketch & Guess: joining", () => {
  it("takes your campus name, never one from the request", async () => {
    expect((await new Player().post("join", { name: "Anyone" })).status).toBe(401);
    expect((await new Player().post("join", { campusToken: "not-a-token" })).status).toBe(401);
    const a = await new Player().join();
    const v = await a.view();
    expect(v.me.name).toBe(a.name);
  });

  it("rejects junk bodies and unknown actions", async () => {
    const json = { "content-type": "application/json" };
    expect((await fetch(url(), { method: "POST", headers: json, body: "not json" })).status).toBe(400);
    expect((await anon.post("explode")).status).toBe(400);
    const huge = JSON.stringify({ action: "join", name: "x".repeat(20_000) });
    expect((await fetch(url(), { method: "POST", headers: json, body: huge })).status).toBe(413);
  });

  it("serves the game page", async () => {
    const res = await fetch(new URL("/minigame/sketch/", baseUrl()));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Sketch");
  });
});

describe("Sketch & Guess: rounds (needs GAME_TEST_HOOKS=1)", () => {
  beforeEach(async (ctx) => {
    if (!hooks) return ctx.skip();
    expect((await anon.post("test:reset")).status).toBe(200);
  });

  it("start needs at least two players", async () => {
    const a = await new Player().join();
    expect((await a.post("start")).status).toBe(409);
    expect((await anon.post("start")).status).toBe(403);
    await new Player().join();
    expect((await a.post("start")).status).toBe(200);
    expect((await a.view()).phase).toBe("drawing");
  });

  it("only the drawer is ever sent the word", async () => {
    const ps = [await new Player().join(), await new Player().join(), await new Player().join()];
    await ps[0]!.post("start");
    const secret = await word();
    const drawer = await drawerOf(ps);
    for (const p of ps) {
      const raw = await (await fetch(url(), { headers: { cookie: p.cookie } })).text();
      if (p === drawer) expect(raw).toContain(secret);
      else expect(raw).not.toContain(`"${secret}"`);
    }
    expect(JSON.stringify(await anon.view())).not.toContain(`"${secret}"`);
  });

  it("only the drawer can draw, and strokes are validated", async () => {
    const ps = [await new Player().join(), await new Player().join()];
    await ps[0]!.post("start");
    const drawer = await drawerOf(ps);
    const guesser = ps.find((p) => p !== drawer)!;
    expect((await guesser.post("draw", { stroke })).status).toBe(403);
    expect((await drawer.post("draw", { stroke })).status).toBe(200);
    for (const bad of [{ ...stroke, points: [] }, { ...stroke, points: [{ x: 2, y: 0 }] }, { ...stroke, width: 999 }, { ...stroke, color: "red; background:url(x)" }, "nope"]) {
      expect((await drawer.post("draw", { stroke: bad })).status, JSON.stringify(bad)).toBe(400);
    }
    expect((await guesser.view()).strokes).toHaveLength(1);
  });

  it("guesses are checked on the server, ignoring case and spaces", async () => {
    const ps = [await new Player().join(), await new Player().join()];
    await ps[0]!.post("start");
    const drawer = await drawerOf(ps);
    const guesser = ps.find((p) => p !== drawer)!;
    expect((await drawer.post("guess", { text: "x" })).status).toBe(403);
    await guesser.post("guess", { text: "definitely-wrong" });
    expect((await guesser.view()).iGuessed).toBe(false);
    await guesser.post("guess", { text: `  ${(await word()).toUpperCase()} ` });
    const v = await guesser.view();
    expect(v.iGuessed).toBe(true);
    expect(Object.fromEntries(v.players.map((p: any) => [p.name, p.score]))).toEqual({ [drawer.name]: 1, [guesser.name]: 1 });
  });

  it("correct guesses within the tie window both score", async () => {
    const ps = [await new Player().join(), await new Player().join(), await new Player().join()];
    await ps[0]!.post("start");
    const secret = await word();
    const drawer = await drawerOf(ps);
    const guessers = ps.filter((p) => p !== drawer);
    expect(await Promise.all(guessers.map((g) => g.post("guess", { text: secret }).then((r) => r.status)))).toEqual([200, 200]);
    const v = await drawer.view();
    for (const g of guessers) expect(v.players.find((p: any) => p.name === g.name).score).toBe(1);
    expect(v.players.find((p: any) => p.name === drawer.name).score).toBe(1);
  });

  it("refuses a flood of strokes", async () => {
    const ps = [await new Player().join(), await new Player().join()];
    await ps[0]!.post("start");
    const drawer = await drawerOf(ps);
    const statuses = await Promise.all(Array.from({ length: 60 }, () => drawer.post("draw", { stroke }).then((r) => r.status)));
    expect(statuses).toContain(200);
    expect(statuses).toContain(429);
  });
});
