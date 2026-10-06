import { describe, expect, inject, it } from "vitest";

// Crit 8's contract for the poop room, checked over HTTP against the running
// app: a stranger can claim a name, leave a poop, and find it again later.
const baseUrl = inject("baseUrl");

const post = (path: string, body: unknown) =>
  fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

// A fresh name per run, so the check works against a database that persists.
const freshName = () =>
  Array.from({ length: 8 }, () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]).join("");

describe("names", () => {
  it("accepts letters and underscores, up to eight", async () => {
    const res = await post("/api/join", { name: freshName() });
    expect(res.status).toBe(200);
  });

  it.each(["", "ninechars", "has space", "dig1t", "한글"])("rejects %j", async (name) => {
    const res = await post("/api/join", { name });
    expect(res.status).toBe(400);
  });

  it("can't be taken twice, whatever the case", async () => {
    const name = freshName();
    await post("/api/join", { name });
    const res = await post("/api/join", { name: name.toUpperCase() });
    expect(res.status).toBe(409);
  });

  it("can be reclaimed by the browser that took it", async () => {
    const name = freshName();
    const { token } = await (await post("/api/join", { name })).json();
    const res = await post("/api/join", { name, token });
    expect(res.status).toBe(200);
  });
});

describe("the trace", () => {
  it("is still there on the next visit", async () => {
    const name = freshName();
    const { token } = await (await post("/api/join", { name })).json();
    expect((await post("/api/poop", { token, x: 1.5, z: -2 })).status).toBe(200);

    const poops: { name: string; x: number; z: number }[] = await (await fetch(new URL("/api/poops", baseUrl))).json();
    expect(poops).toContainEqual(expect.objectContaining({ name, x: 1.5, z: -2 }));
  });

  it("can't be repeated within five seconds", async () => {
    const { token } = await (await post("/api/join", { name: freshName() })).json();
    expect((await post("/api/poop", { token, x: 1, z: 1 })).status).toBe(200);
    expect((await post("/api/poop", { token, x: 2, z: 2 })).status).toBe(429);
  });

  it("is one poop per person: a new one moves the old", { timeout: 15000 }, async () => {
    const name = freshName();
    const { token } = await (await post("/api/join", { name })).json();
    await post("/api/poop", { token, x: 1, z: 1 });
    await new Promise((r) => setTimeout(r, 6000));
    await post("/api/poop", { token, x: -3, z: 4 });

    const poops: { name: string; x: number; z: number }[] = await (await fetch(new URL("/api/poops", baseUrl))).json();
    const mine = poops.filter((p) => p.name === name);
    expect(mine).toEqual([expect.objectContaining({ x: -3, z: 4 })]);
  });

  it("stays inside the room", async () => {
    const { token } = await (await post("/api/join", { name: freshName() })).json();
    const poop = await (await post("/api/poop", { token, x: 999, z: -999 })).json();
    expect(poop).toMatchObject({ x: 10, z: -10 });
  });

  it("needs a name first", async () => {
    expect((await post("/api/poop", { token: "not-a-visitor", x: 0, z: 0 })).status).toBe(401);
  });
});
