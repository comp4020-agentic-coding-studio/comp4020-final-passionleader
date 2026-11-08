import { afterEach, describe, expect, it } from "vitest";
import { api, closeAll, connect, guest, outside, visitor, type Msg, type Socket } from "./helpers.ts";

// Visit stamps: a member earns one the first time they are let into each kind of main space (the
// server records it when it accepts the "enter"; nothing the client sends grants one), guests get
// none.

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
