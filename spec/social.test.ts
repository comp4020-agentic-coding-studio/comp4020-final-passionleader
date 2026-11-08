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
