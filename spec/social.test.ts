import { afterEach, describe, expect, it } from "vitest";
import { api, closeAll, connect, guest, visitor, type Msg } from "./helpers.ts";

// Interest tags, presence alerts and office hours: all of them are fixed choices, checked on the
// server, and what a person does here reaches only the people it is meant for.

afterEach(closeAll);

const tagsOn = (name: string, f: (tags: string[] | undefined) => boolean) => (m: Msg) =>
  m.t === "players" && (m.players as { name: string; tags?: string[] }[]).some((p) => p.name === name && f(p.tags));

describe("interest tags", () => {
  it("keeps up to three tags from the fixed list and shows them to the space; refuses anything off it", async () => {
    const [a, b] = await Promise.all([visitor(), visitor()]);
    const sb = await connect(b.token);
    await sb.next((m) => m.t === "welcome");
    const sa = await connect(a.token);
    await sa.next((m) => m.t === "welcome");
    expect((await api("/api/tags", "PUT", { token: a.token, tags: ["COMP4020", "coffee", "web dev"] })).status).toBe(200);
    await expect(sb.next(tagsOn(a.name, (t) => t?.join() === "COMP4020,coffee,web dev"))).resolves.toBeTruthy();
    // Off the list, free text, four, a repeat, not a list: all refused, and the saved pick stays.
    for (const tags of [["pizza"], ["<b>hi</b>"], ["COMP4020", "coffee", "gym", "AI"], ["gym", "gym"], "gym", [1], ["comp4020"]]) {
      expect((await api("/api/tags", "PUT", { token: a.token, tags })).status).toBe(400);
    }
    const mine = await (await api("/api/tags/mine", "POST", { token: a.token })).json();
    expect(mine.tags).toEqual(["COMP4020", "coffee", "web dev"]);
    expect(mine.courses).toContain("COMP4020");
    expect(mine.interests).toContain("badminton");
    // Stored with the account: they come back with it.
    const sa2 = await connect(a.token);
    await expect(sa2.next((m) => m.t === "welcome" && (m.players as { name: string; tags?: string[] }[]).some((p) => p.name === a.name && p.tags?.length === 3))).resolves.toBeTruthy();
    expect((await api("/api/tags", "PUT", { tags: [] })).status).toBe(401);
  });

  it("is for members: a guest's pick is refused", async () => {
    const g = await guest();
    expect((await api("/api/tags", "PUT", { token: g.token, tags: ["gym"] })).status).toBe(403);
  });
});

const follow = (token: string, name: string, on = true) => api("/api/follows", "PUT", { token, name, on });
const toldOf = (name: string) => (m: Msg) => m.t === "action" && m.kind === "followed-on" && m.name === name;
const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms));

describe("presence alerts", () => {
  it("doesn't tell a non-mutual follower by default, but tells a mutual one, with the space's name only", async () => {
    const [a, b] = await Promise.all([visitor(), visitor()]);
    const sa = await connect(a.token);
    await sa.next((m) => m.t === "welcome");
    // a follows b, b doesn't follow back: b coming on tells a nothing.
    expect((await follow(a.token, b.name)).status).toBe(200);
    const first = await connect(b.token);
    await first.next((m) => m.t === "welcome");
    expect(await sa.sees(toldOf(b.name), 600)).toBe(false);
    first.ws.close();
    await settle();
    // b follows a back: now b coming on does tell a.
    expect((await follow(b.token, a.name)).status).toBe(200);
    const again = await connect(b.token);
    const told = await sa.next(toldOf(b.name));
    // The space's name, never a position.
    expect(told.where).toBe("ANU campus");
    expect(Object.keys(told).sort()).toEqual(["kind", "name", "t", "where"]);
    again.ws.close();
  });

  it("tells anyone who follows when the followed person turns the default off, and not otherwise", async () => {
    const [a, b] = await Promise.all([visitor(), visitor()]);
    const sa = await connect(a.token);
    await sa.next((m) => m.t === "welcome");
    await follow(a.token, b.name);
    expect((await api("/api/follows/mutual-only", "PUT", { token: b.token, on: false })).status).toBe(200);
    const sb = await connect(b.token);
    await expect(sa.next(toldOf(b.name))).resolves.toBeTruthy();
    sb.ws.close();
  });

  it("is members only at both ends, capped at 20, and the follower's own list", async () => {
    const [a, b] = await Promise.all([visitor(), visitor()]);
    const g = await guest();
    expect((await follow(g.token, a.name)).status).toBe(403);
    expect((await follow(a.token, g.name)).status).toBe(404);
    expect((await follow(a.token, a.name)).status).toBe(400);
    expect((await follow(a.token, "nobodyhere")).status).toBe(404);
    expect((await follow(a.token, b.name)).status).toBe(200);
    expect((await (await api("/api/follows", "POST", { token: a.token })).json()).follows).toEqual([b.name]);
    // b is shown nothing about being followed.
    expect(JSON.stringify(await (await api("/api/follows", "POST", { token: b.token })).json())).not.toContain(a.name);
    const many = await Promise.all(Array.from({ length: 20 }, () => visitor()));
    for (const m of many.slice(0, 19)) expect((await follow(a.token, m.name)).status).toBe(200);
    expect((await follow(a.token, many[19]!.name)).status).toBe(400);
    expect((await follow(a.token, b.name, false)).status).toBe(200);
    expect((await follow(a.token, many[19]!.name)).status).toBe(200);
  });
});
