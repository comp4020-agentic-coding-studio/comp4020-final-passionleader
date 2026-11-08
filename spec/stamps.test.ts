import { afterEach, describe, expect, it } from "vitest";
import { api, closeAll, connect, guest, outside, visitor, type Msg, type Socket } from "./helpers.ts";

// Visit stamps: a member earns one the first time they are let into each kind of main space (the
// server records it when it accepts the "enter"; nothing the client sends grants one), guests get
// none, and some hat styles and colours are locked until enough stamps are collected.

afterEach(closeAll);

type Card = { member: boolean; count: number; total: number; stamps: { id: string; label: string; got: boolean }[]; unlocks: { part: string; index: number; stamps: number }[] };
const card = async (token: string): Promise<Card> => (await api("/api/stamps", "POST", { token })).json() as Promise<Card>;
const isStamp = (m: Msg) => m.t === "action" && m.kind === "stamp";
const stamp = (label: string) => (m: Msg) => isStamp(m) && m.label === label;
const enter = (s: Socket, space: string) => s.send({ t: "enter", space, x: 0, z: 0 });
const look = { body: 0, skin: 1, hair: 0, top: 0, bottom: 1, hat: 1, hatColour: 1 };
const put = (token: string, l: object) => api("/api/look", "PUT", { token, look: l });

describe("visit stamps", () => {
  it("gives a member a stamp the first time they enter a kind of space, and says so once", async () => {
    const a = await visitor();
    const s = await connect(a.token);
    await outside(s); // the lawn is the first stamp (and the arrival counts too)
    const first = await s.next(stamp("ANU campus"));
    expect(first).toMatchObject({ count: 1, total: 8 });
    enter(s, "library");
    await expect(s.next(stamp("Chifley Library"))).resolves.toMatchObject({ count: 2, total: 8 });
    // The same place again: no second stamp.
    enter(s, "outdoor");
    await s.next((m) => m.t === "players", 1000);
    enter(s, "library");
    expect(await s.seesNew(stamp("Chifley Library"), 500)).toBe(false);
    const c = await card(a.token);
    expect(c).toMatchObject({ member: true, count: 2, total: 8 });
    expect(c.stamps.filter((x) => x.got).map((x) => x.id).sort()).toEqual(["library", "outdoor"]);
  });

  it("counts every classroom as one, every team room as one, and keeps the Poop Room secret until found", async () => {
    const a = await visitor();
    const s = await connect(a.token);
    await outside(s);
    enter(s, "comp8020");
    await expect(s.next(stamp("A classroom"))).resolves.toBeTruthy();
    enter(s, "team-library-1");
    await expect(s.next(stamp("A team room"))).resolves.toBeTruthy();
    expect((await card(a.token)).stamps.find((x) => x.id === "poop")).toMatchObject({ label: "A secret place", got: false });
    enter(s, "poop");
    await expect(s.next(stamp("The Poop Room"))).resolves.toBeTruthy();
    expect((await card(a.token)).stamps.find((x) => x.id === "poop")).toMatchObject({ label: "The Poop Room", got: true });
  });

  it("gives a guest none, and the client can't ask for one", async () => {
    const g = await guest();
    const s = await connect(g.token);
    await outside(s);
    enter(s, "library");
    expect(await s.seesNew(isStamp, 600)).toBe(false);
    expect(await card(g.token)).toMatchObject({ member: false, count: 0 });
    // Nothing a member sends grants a stamp either: a made-up "stamp" message does nothing.
    const a = await visitor();
    const sa = await connect(a.token);
    await sa.next((m) => m.t === "welcome");
    sa.send({ t: "stamp", stamp: "library" });
    sa.send({ t: "enter", space: "not-a-place", x: 0, z: 0 });
    await new Promise((r) => setTimeout(r, 300));
    expect((await card(a.token)).stamps.filter((x) => x.got).map((x) => x.id)).not.toContain("library");
  });
});

describe("look rewards", () => {
  it("refuses a locked hat colour before three stamps and accepts it after", async () => {
    const a = await visitor();
    const locked = { ...look, hatColour: 8 };
    const refused = await put(a.token, locked);
    expect(refused.status).toBe(403);
    expect(((await refused.json()) as { error: string }).error).toMatch(/3 visit stamps\. 3 more stamps/);
    // Free choices still work.
    expect((await put(a.token, { ...look, hatColour: 7 })).status).toBe(200);
    const s = await connect(a.token);
    await outside(s); // 1 stamp
    enter(s, "library"); // 2
    await s.next(stamp("Chifley Library"));
    const two = await put(a.token, locked);
    expect(two.status).toBe(403);
    expect(((await two.json()) as { error: string }).error).toMatch(/1 more stamp to go/);
    enter(s, "hub"); // 3
    await s.next(stamp("Student Hub"));
    expect((await put(a.token, locked)).status).toBe(200);
    expect((await put(a.token, { ...look, hatColour: 9 })).status).toBe(200);
  });

  it("unlocks the helmet only with all eight stamps, and a guest never has any unlocked", async () => {
    const a = await visitor();
    const helmet = { ...look, hat: 6 };
    expect((await put(a.token, helmet)).status).toBe(403);
    const s = await connect(a.token);
    await outside(s);
    for (const space of ["hub", "library", "anusa", "careers", "comp8020", "team-library-2", "poop"]) enter(s, space);
    await s.next(stamp("The Poop Room"), 3000);
    expect((await card(a.token)).count).toBe(8);
    expect((await put(a.token, helmet)).status).toBe(200);
    // Saved, so it comes back with them.
    expect(((await (await api("/api/join", "POST", { name: a.name, token: a.token })).json()) as { look: { hat: number } }).look.hat).toBe(6);
    const g = await guest();
    expect((await put(g.token, { ...look, hatColour: 8 })).status).toBe(403);
    expect((await put(g.token, helmet)).status).toBe(403);
  });

  it("tells the look window what is locked, and never locks the test accounts' hard hat by stamps", async () => {
    const c = await card((await visitor()).token);
    expect(c.unlocks).toEqual(expect.arrayContaining([{ part: "hatColour", index: 8, stamps: 3 }, { part: "hatColour", index: 9, stamps: 3 }, { part: "hat", index: 6, stamps: 8 }]));
    // The hard hat stays the test accounts' own, whatever the stamps.
    expect(c.unlocks.some((u) => u.part === "hat" && u.index === 7)).toBe(false);
  });
});

// A rule added later must never stop someone saving a look that already had a now-locked choice:
// checked on the database's own code (a throwaway file), since over HTTP it needs a saved look
// from before the rule.
describe("a locked choice already saved stays allowed", () => {
  it("lets them keep it, and still refuses it for anyone who never had it", async () => {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "campus-stamps-")), "test.db");
    const db = await import("../server/db.ts");
    db.createVisitor("oldtimer", "t-old");
    db.createVisitor("newbie", "t-new");
    const had = { ...look, hatColour: 9 };
    db.saveLook("oldtimer", had);
    expect(db.lockedChoice("oldtimer", had)).toBeNull();
    expect(db.lockedChoice("oldtimer", { ...had, hatColour: 8 })).toMatchObject({ part: "hatColour", index: 8, stamps: 3, have: 0 });
    expect(db.lockedChoice("newbie", had)).toMatchObject({ part: "hatColour", index: 9 });
    db.addStamp("newbie", "outdoor");
    db.addStamp("newbie", "hub");
    db.addStamp("newbie", "library");
    expect(db.lockedChoice("newbie", had)).toBeNull();
  });
});
