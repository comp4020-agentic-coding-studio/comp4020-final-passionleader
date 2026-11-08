import { afterEach, describe, expect, it } from "vitest";
import { baseUrl, closeAll, connect, type Msg, type Socket } from "./helpers.ts";
import { api } from "./helpers.ts";
import { QUESTIONS } from "../server/quiz.ts";
import { ask, deal, winnersOf } from "../server/tables.ts";

// The Student Hub's games table (server/tables.ts): a quick quiz or Sketch & Guess for the
// people within 3 m of it, the score kept on the server. Tests use the one table, so each
// builds its own game and ends it (a game left running holds the table).

afterEach(closeAll);

const TABLE = { x: 14, z: 3 };
const tableMsg = (pred: (v: Record<string, any>) => boolean) => (m: Msg) => m.t === "action" && m.kind === "table" && pred(m.view as Record<string, any>);
const refusal = (reason: string) => (m: Msg) => m.t === "action" && m.kind === "table-refused" && m.reason === reason;

const tokens = new Map<string, string>();
const campusToken = async (name: string): Promise<string> => tokens.get(name)!;
async function at(x: number, z: number): Promise<{ name: string; s: Socket }> {
  const v = (await (await api("/api/guest", "POST", {})).json()) as { name: string; token: string };
  tokens.set(v.name, v.token);
  const s = await connect(v.token);
  await s.next((m) => m.t === "welcome");
  s.send({ t: "enter", space: "hub", x, z });
  await s.next((m) => m.t === "players");
  // The server's own move settles after the enter.
  await new Promise((r) => setTimeout(r, 100));
  return { name: v.name, s };
}
const close = (): Promise<{ name: string; s: Socket }> => at(TABLE.x + 1, TABLE.z + 1.5);

describe("the quiz's questions", () => {
  it("are at least 20, each with four different answers and one right", () => {
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(20);
    const seen = new Set<string>();
    for (const q of QUESTIONS) {
      expect(new Set([q.a, ...q.wrong]).size).toBe(4);
      expect(seen.has(q.q)).toBe(false);
      seen.add(q.q);
    }
  });
  it("are dealt five at a time, never twice, with the right answer where `correct` says", () => {
    const hand = deal();
    expect(hand).toHaveLength(5);
    expect(new Set(hand.map((h) => h.q)).size).toBe(5);
    for (const h of hand) {
      const orig = QUESTIONS.find((q) => q.q === h.q)!;
      expect(h.options[h.correct]).toBe(orig.a);
    }
    // Shuffled: the right answer isn't always first.
    const firsts = Array.from({ length: 40 }, () => ask(QUESTIONS[0]!).correct);
    expect(new Set(firsts).size).toBeGreaterThan(1);
  });
  it("name the winners: the highest score, all of them on a tie, nobody on zero", () => {
    expect(winnersOf([{ name: "a", score: 5 }, { name: "b", score: 9 }])).toEqual(["b"]);
    expect(winnersOf([{ name: "a", score: 9 }, { name: "b", score: 9 }])).toEqual(["a", "b"]);
    expect(winnersOf([{ name: "a", score: 0 }])).toEqual([]);
  });
});

describe("the games table", () => {
  it("runs a quiz: the right answer scores, the winner is announced to the table, and the answers stay secret until the reveal", async () => {
    const a = await close();
    const b = await close();
    const far = await at(-15, 10);
    a.s.send({ t: "action", kind: "table", table: "hub-1", op: "pick", game: "quiz" });
    await a.s.next(tableMsg((v) => v.game === "quiz" && v.phase === "lobby"));
    // Within 3 m, B hears of it too; someone across the Hub doesn't, and can't join.
    await b.s.next(tableMsg((v) => v.game === "quiz" && v.phase === "lobby"));
    expect(await far.s.sees(tableMsg((v) => v.game === "quiz"), 300)).toBe(false);
    far.s.send({ t: "action", kind: "table", table: "hub-1", op: "join" });
    await far.s.next(refusal("too far"));
    // One person alone can't start.
    a.s.send({ t: "action", kind: "table", table: "hub-1", op: "start" });
    await a.s.next(refusal("need two people"));
    await new Promise((r) => setTimeout(r, 300));
    b.s.send({ t: "action", kind: "table", table: "hub-1", op: "join" });
    await a.s.next(tableMsg((v) => v.players?.length === 2));
    await new Promise((r) => setTimeout(r, 300));
    a.s.send({ t: "action", kind: "table", table: "hub-1", op: "start" });
    for (let n = 1; n <= 5; n++) {
      const q = await a.s.next(tableMsg((v) => v.phase === "asking" && v.n === n), 5000);
      // The right answer is never sent while the question is open.
      expect((q.view as Record<string, unknown>).correct).toBeUndefined();
      const text = (q.view as any).question.text as string;
      const orig = QUESTIONS.find((x) => x.q === text)!;
      const options = (q.view as any).question.options as string[];
      expect(options).toHaveLength(4);
      // A answers rightly; B always picks a wrong one.
      await new Promise((r) => setTimeout(r, 300));
      a.s.send({ t: "action", kind: "table", table: "hub-1", op: "answer", pick: options.indexOf(orig.a) });
      await new Promise((r) => setTimeout(r, 300));
      b.s.send({ t: "action", kind: "table", table: "hub-1", op: "answer", pick: options.findIndex((o) => o !== orig.a) });
      const r = await a.s.next(tableMsg((v) => v.phase === "reveal" && v.n === n), 3000);
      expect(options[(r.view as any).correct]).toBe(orig.a);
    }
    const over = await b.s.next(tableMsg((v) => v.phase === "over"), 8000);
    expect((over.view as any).winners).toEqual([a.name]);
    const scores = Object.fromEntries((over.view as any).players.map((p: any) => [p.name, p.score]));
    expect(scores[a.name]).toBeGreaterThanOrEqual(50);
    expect(scores[b.name]).toBe(0);
  }, 40_000);

  it("holds the table while a quiz is on, and a table of Sketch & Guess hears who won", async () => {
    const a = await close();
    const b = await close();
    a.s.send({ t: "action", kind: "table", table: "hub-1", op: "pick", game: "quiz" });
    await b.s.next(tableMsg((v) => v.game === "quiz" && v.phase === "lobby"));
    await new Promise((r) => setTimeout(r, 300));
    b.s.send({ t: "action", kind: "table", table: "hub-1", op: "pick", game: "sketch" });
    await b.s.next(refusal("people are waiting for the quiz"));
    // The one who opened the quiz may change their mind while nobody else has joined (the user, 11/9).
    await new Promise((r) => setTimeout(r, 300));
    a.s.send({ t: "action", kind: "table", table: "hub-1", op: "pick", game: "sketch" });
    await b.s.next(tableMsg((v) => v.game === "sketch" && v.by === a.name));
    await new Promise((r) => setTimeout(r, 300));
    a.s.send({ t: "action", kind: "table", table: "hub-1", op: "pick", game: "quiz" });
    await b.s.next(tableMsg((v) => v.game === "quiz" && v.phase === "lobby"));
    await new Promise((r) => setTimeout(r, 300));
    a.s.send({ t: "action", kind: "table", table: "hub-1", op: "leave" });
    // The only player left: the table is free again, and Sketch & Guess can be opened on it.
    await b.s.next(tableMsg((v) => v.game === null));
    await new Promise((r) => setTimeout(r, 300));
    b.s.send({ t: "action", kind: "table", table: "hub-1", op: "pick", game: "sketch" });
    await a.s.next(tableMsg((v) => v.game === "sketch" && v.phase === "open" && v.by === b.name));
    // Played through the game's own routes (needs its test hooks, GAME_TEST_HOOKS=1; skipped without).
    const game = new URL("/api/sketch", baseUrl());
    const post = async (cookie: string, action: string, extra: Record<string, unknown> = {}) =>
      fetch(game, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ action, ...extra }) });
    if ((await post("", "test:reset")).status !== 200) return;
    const cookies: string[] = [];
    for (const who of [a, b]) {
      const v = await campusToken(who.name);
      const r = await post("", "join", { campusToken: v });
      cookies.push(r.headers.get("set-cookie")!.split(";")[0]!);
    }
    expect((await post(cookies[0]!, "start")).status).toBe(200);
    // Each round: whoever isn't drawing guesses the word (the game reads it for us under the hook).
    for (let round = 0; round < 2; round++) {
      const word = ((await (await post("", "test:word")).json()) as { word: string }).word;
      const views = await Promise.all(cookies.map(async (c) => (await fetch(game, { headers: { cookie: c } })).json() as Promise<any>));
      const guesser = views.findIndex((v) => !v.isDrawer);
      expect((await post(cookies[guesser]!, "guess", { text: word })).status).toBe(200);
      await new Promise((r) => setTimeout(r, 4800));
    }
    const over = await a.s.next(tableMsg((v) => v.game === "sketch" && v.phase === "over"), 5000);
    expect((over.view as any).winners.length).toBeGreaterThan(0);
    expect((over.view as any).players).toHaveLength(2);
  }, 40_000);

  it("ignores a table that doesn't exist, and answers 'look' only to people near it", async () => {
    const near = await close();
    near.s.send({ t: "action", kind: "table", table: "nowhere", op: "pick", game: "quiz" });
    expect(await near.s.sees(tableMsg(() => true), 300)).toBe(false);
    const far = await at(-15, 10);
    far.s.send({ t: "action", kind: "table", table: "hub-1", op: "look" });
    await far.s.next(refusal("too far"));
  });
});
