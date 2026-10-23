import { afterEach, describe, expect, it } from "vitest";
import { api, closeAll, connect, visitor, type Msg } from "./helpers.ts";

// Sitting and looks: one person per seat, in the space they're in, and the
// others see it; a look is your own, picked from fixed palettes, and the
// others see it too.

afterEach(closeAll);

type P = { name: string; seat?: string; look?: Record<string, number> | null };
const seen = (name: string, f: (p: P) => boolean) => (m: Msg) => m.t === "players" && (m.players as P[]).some((p) => p.name === name && f(p));

describe("sitting", () => {
  it("shows someone sitting to the others, and gets them up when they walk off", async () => {
    const [a, b] = await Promise.all([visitor(), visitor()]);
    const sa = await connect(a.token);
    const sb = await connect(b.token);
    await sa.next((m) => m.t === "welcome");
    sa.send({ t: "sit", seat: "outdoor:3", x: -15.45, z: -5.2 });
    await expect(sb.next(seen(a.name, (p) => p.seat === "outdoor:3"))).resolves.toBeTruthy();
    // Staying put on the seat (the client keeps sending its spot) keeps you seated.
    sa.send({ t: "move", x: -15.45, y: 0, z: -5.2, rot: 0 });
    expect(await sb.seesNew(seen(a.name, (p) => !p.seat), 600)).toBe(false);
    sa.send({ t: "move", x: 0, y: 0, z: -20, rot: 0 });
    await expect(sb.next(seen(a.name, (p) => !p.seat))).resolves.toBeTruthy();
  });

  it("seats one person per seat, and only in the space you're in", async () => {
    const [a, b] = await Promise.all([visitor(), visitor()]);
    const sa = await connect(a.token);
    const sb = await connect(b.token);
    await Promise.all([sa.next((m) => m.t === "welcome"), sb.next((m) => m.t === "welcome")]);
    sa.send({ t: "sit", seat: "outdoor:4" });
    await sa.next(seen(a.name, (p) => p.seat === "outdoor:4"));
    sb.send({ t: "sit", seat: "outdoor:4" });
    await expect(sb.next((m) => m.t === "action" && m.kind === "seat-refused")).resolves.toBeTruthy();
    sb.send({ t: "sit", seat: "hub:1" });
    await expect(sb.next((m) => m.t === "action" && m.kind === "seat-refused" && m.seat === "hub:1")).resolves.toBeTruthy();
  });
});

describe("looks", () => {
  it("saves your own look and shows it to the space; refuses anything off the palettes", async () => {
    const [a, b] = await Promise.all([visitor(), visitor()]);
    const sb = await connect(b.token);
    await sb.next((m) => m.t === "welcome");
    const sa = await connect(a.token);
    await sa.next((m) => m.t === "welcome");
    const look = { body: 1, skin: 3, hair: 7, top: 2, bottom: 5, hat: 4, hatColour: 6 };
    expect((await api("/api/look", "PUT", { token: a.token, look })).status).toBe(200);
    await expect(sb.next(seen(a.name, (p) => p.look?.hat === 4 && p.look?.hair === 7))).resolves.toBeTruthy();
    expect((await api("/api/look", "PUT", { token: a.token, look: { ...look, hair: 10 } })).status).toBe(400);
    expect((await api("/api/look", "PUT", { token: a.token, look: { ...look, top: "#ff0000" } })).status).toBe(400);
    expect((await api("/api/look", "PUT", { token: a.token, look: { ...look, hatColour: 10 } })).status).toBe(400);
    expect((await api("/api/look", "PUT", { look })).status).toBe(401);
    // It comes back with you next time.
    const again = await (await api("/api/join", "POST", { name: a.name, token: a.token })).json();
    expect(again.look).toEqual(look);
  });

  it("gives a look saved before hats had a colour the colour its hat had", async () => {
    const a = await visitor();
    const old = { body: 0, skin: 1, hair: 0, top: 0, bottom: 1, hat: 2 };
    expect((await api("/api/look", "PUT", { token: a.token, look: old })).status).toBe(200);
    const again = await (await api("/api/join", "POST", { name: a.name, token: a.token })).json();
    // The cap was blue: the nearest hair colour, index 7.
    expect(again.look).toEqual({ ...old, hatColour: 7 });
  });

  it("keeps the hard hat for the test accounts", async () => {
    const a = await visitor();
    const hard = { body: 0, skin: 1, hair: 0, top: 0, bottom: 1, hat: 7, hatColour: 1 };
    expect((await api("/api/look", "PUT", { token: a.token, look: hard })).status).toBe(403);
    expect((await api("/api/look", "PUT", { token: a.token, look: { ...hard, hat: 8 } })).status).toBe(400);
  });
});
