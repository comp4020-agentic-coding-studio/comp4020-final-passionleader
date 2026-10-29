import { afterEach, describe, expect, it } from "vitest";
import { api, closeAll, connect, guest, visitor, wsUrl } from "./helpers.ts";

// Crit 9's contract, checked over real WebSockets against the running app:
// what one visitor does reaches everyone else in the same space within a
// second, without a reload, and nobody in another space.

afterEach(closeAll);

type P = { name: string; x: number; space: string };
const has = (name: string, x?: number) => (m: { t: string; players?: unknown }) =>
  m.t === "players" && (m.players as P[]).some((p) => p.name === name && (x === undefined || p.x === x));

describe("real time", () => {
  it("refuses a socket without a joined visitor's token", async () => {
    const ws = new WebSocket(wsUrl("not-a-visitor"));
    await expect(new Promise((ok, fail) => ((ws.onopen = ok), (ws.onerror = fail)))).rejects.toBeTruthy();
  });

  it("shows one visitor's movement to another in the same space within a second", async () => {
    const [a, b] = await Promise.all([visitor(), visitor()]);
    const sa = await connect(a.token);
    const sb = await connect(b.token);
    sa.send({ t: "move", x: 3.5, y: 0, z: 9, rot: 1 });
    await expect(sb.next(has(a.name, 3.5))).resolves.toBeTruthy();
  });

  it("keeps spaces apart: someone in the Student Hub doesn't see the campus", async () => {
    const [a, b] = await Promise.all([visitor(), visitor()]);
    const sa = await connect(a.token);
    const sb = await connect(b.token);
    sb.send({ t: "enter", space: "hub", x: 0, z: 6 });
    await sb.next((m) => m.t === "players" && !(m.players as P[]).some((p) => p.name === a.name));
    sa.send({ t: "move", x: 4.25, y: 0, z: 9, rot: 0 });
    expect(await sb.sees(has(a.name, 4.25), 600)).toBe(false);
  });

  it("delivers chat to the space, and only the space", async () => {
    const [a, b, c] = await Promise.all([visitor(), visitor(), visitor()]);
    const sa = await connect(a.token);
    const sb = await connect(b.token);
    const sc = await connect(c.token);
    sc.send({ t: "enter", space: "comp8020", x: 0, z: 5 });
    await sc.next((m) => m.t === "players");
    sa.send({ t: "chat", text: "  How ya going?  " });
    await expect(sb.next((m) => m.t === "chat" && m.name === a.name)).resolves.toMatchObject({ text: "How ya going?" });
    expect(await sc.sees((m) => m.t === "chat" && m.name === a.name, 600)).toBe(false);
  });

  it("sends /all to every space's chat log, once every 30 seconds, and keeps ordinary chat in its space", async () => {
    const [a, b, c] = await Promise.all([visitor(), visitor(), visitor()]);
    const sa = await connect(a.token);
    const sb = await connect(b.token);
    const sc = await connect(c.token);
    await Promise.all([sa.next((m) => m.t === "welcome"), sb.next((m) => m.t === "welcome"), sc.next((m) => m.t === "welcome")]);
    // c goes into the Hub; a and b stay outside.
    sc.send({ t: "enter", space: "hub", x: 0, z: 6 });
    await sc.next((m) => m.t === "players" && !(m.players as P[]).some((p) => p.name === a.name));
    sa.send({ t: "chat", text: "just the lawn" });
    await sb.next((m) => m.t === "chat" && m.text === "just the lawn");
    expect(await sc.seesNew((m) => m.t === "chat" && m.text === "just the lawn", 800)).toBe(false); // also past the 0.7 s chat gap
    sa.send({ t: "chat", text: "/all fire drill at noon" });
    await expect(sc.next((m) => m.t === "chat" && m.text === "fire drill at noon")).resolves.toMatchObject({ all: true, space: "outdoor", name: a.name });
    await new Promise((r) => setTimeout(r, 800)); // past the ordinary chat gap
    sa.send({ t: "chat", text: "/all again" });
    await expect(sa.next((m) => m.t === "action" && m.kind === "all-wait")).resolves.toBeTruthy();
    expect(await sc.seesNew((m) => m.t === "chat" && m.text === "again", 400)).toBe(false);
  });

  it("lets an emote through once every two seconds, but dance as often as you like", async () => {
    const [a, b] = await Promise.all([visitor(), visitor()]);
    const sa = await connect(a.token);
    const sb = await connect(b.token);
    await Promise.all([sa.next((m) => m.t === "welcome"), sb.next((m) => m.t === "welcome")]);
    sa.send({ t: "emote", kind: "wave" });
    await sb.next((m) => m.t === "emote" && m.kind === "wave");
    sa.send({ t: "emote", kind: "yes" });
    expect(await sb.seesNew((m) => m.t === "emote" && m.kind === "yes", 600)).toBe(false);
    sa.send({ t: "emote", kind: "dance" });
    await expect(sb.next((m) => m.t === "emote" && m.kind === "dance")).resolves.toBeTruthy();
  });

  it("shows a status (one of three, never free text) beside a name to the space, at most once every two seconds", async () => {
    const [a, b] = await Promise.all([visitor(), visitor()]);
    const sa = await connect(a.token);
    const sb = await connect(b.token);
    await Promise.all([sa.next((m) => m.t === "welcome"), sb.next((m) => m.t === "welcome")]);
    const status = (s: string | undefined) => (m: { t: string; players?: unknown }) =>
      m.t === "players" && (m.players as (P & { status?: string })[]).some((p) => p.name === a.name && p.status === s);
    sa.send({ t: "status", status: "chat" });
    await expect(sb.next(status("chat"))).resolves.toBeTruthy();
    // Too soon, and free text: neither changes it.
    sa.send({ t: "status", status: "study" });
    sa.send({ t: "status", status: "come find me lol" });
    expect(await sb.seesNew(status("study"), 700)).toBe(false);
    await new Promise((r) => setTimeout(r, 2100));
    sa.send({ t: "status", status: "come find me lol" });
    expect(await sb.seesNew(status("come find me lol"), 600)).toBe(false);
    sa.send({ t: "status", status: null });
    await expect(sb.next(status(undefined))).resolves.toBeTruthy();
  });

  it("keeps one poop per person in the Poop Room, five seconds apart, and nowhere else", async () => {
    const [a, b] = await Promise.all([visitor(), guest()]);
    const sa = await connect(a.token);
    const sb = await connect(b.token);
    await Promise.all([sa.next((m) => m.t === "welcome"), sb.next((m) => m.t === "welcome")]);
    const poops = (m: { t: string; kind?: unknown }) => m.t === "action" && m.kind === "poops";
    // Outside the room the server ignores it.
    sa.send({ t: "poop" });
    expect(await sa.seesNew(poops, 400)).toBe(false);
    sa.send({ t: "enter", space: "poop", x: 1, z: 1 });
    sb.send({ t: "enter", space: "poop", x: -1, z: 1 });
    await Promise.all([sa.next(poops), sb.next(poops)]);
    sa.send({ t: "poop" });
    const first = await sb.next((m) => poops(m) && (m.poops as { name: string }[]).some((p) => p.name === a.name));
    expect((first.poops as { name: string; x: number }[]).filter((p) => p.name === a.name)).toEqual([{ name: a.name, x: 1, z: 1 }]);
    // A second inside five seconds is dropped.
    sa.send({ t: "poop" });
    expect(await sb.seesNew(poops, 500)).toBe(false);
    // Guests may poop too; still one each.
    sb.send({ t: "poop" });
    const both = await sa.next((m) => poops(m) && (m.poops as unknown[]).length >= 2 && (m.poops as { name: string }[]).some((p) => p.name === b.name));
    expect((both.poops as { name: string }[]).filter((p) => p.name === a.name || p.name === b.name)).toHaveLength(2);
  });

  it("whispers (/w name) reach only that member, in any space, and never from or to a guest", async () => {
    const [a, b, c, g] = await Promise.all([visitor(), visitor(), visitor(), guest()]);
    const [sa, sb, sc, sg] = await Promise.all([a, b, c, g].map((v) => connect(v.token)));
    await Promise.all([sa, sb, sc, sg].map((s) => s.next((m) => m.t === "welcome")));
    sb.send({ t: "enter", space: "library", x: 0, z: 0 });
    await sb.next((m) => m.t === "players");
    sa.send({ t: "chat", text: `/w ${b.name} meet at the lawn?` });
    await expect(sb.next((m) => m.t === "whisper")).resolves.toMatchObject({ from: a.name, to: b.name, text: "meet at the lawn?" });
    await expect(sa.next((m) => m.t === "whisper")).resolves.toMatchObject({ to: b.name });
    expect(await sc.sees((m) => m.t === "whisper" || (m.t === "chat" && String(m.text).includes("lawn")), 400)).toBe(false);
    sg.send({ t: "chat", text: `/w ${b.name} hi` });
    await expect(sg.next((m) => m.t === "action" && m.kind === "whisper-refused")).resolves.toMatchObject({ reason: "guest" });
    await new Promise((r) => setTimeout(r, 1100));
    sa.send({ t: "chat", text: `/w ${g.name} hi` });
    await expect(sa.next((m) => m.t === "action" && m.kind === "whisper-refused")).resolves.toMatchObject({ reason: "nobody" });
  });

  it("shows an emote to the others in the space", async () => {
    const [a, b] = await Promise.all([visitor(), visitor()]);
    const sa = await connect(a.token);
    const sb = await connect(b.token);
    const welcome = await sa.next((m) => m.t === "welcome");
    sa.send({ t: "emote", kind: "wave" });
    await expect(sb.next((m) => m.t === "emote")).resolves.toMatchObject({ id: welcome.id, kind: "wave" });
  });

  it("shows a new sticky note to everyone in the space the moment it's stuck", async () => {
    const [a, b] = await Promise.all([visitor(), visitor()]);
    await connect(a.token);
    const sb = await connect(b.token);
    await api("/api/notes", "POST", { token: a.token, space: "outdoor", x: -4, z: 2, text: "Lunch on the lawn?" });
    const seen = await sb.next((m) => m.t === "action" && m.kind === "note");
    expect(seen.note).toMatchObject({ author: a.name, text: "Lunch on the lawn?", x: -4, z: 2 });
  });

  it("tells the space when someone leaves", async () => {
    const [a, b] = await Promise.all([visitor(), visitor()]);
    const sa = await connect(a.token);
    const sb = await connect(b.token);
    const welcome = await sa.next((m) => m.t === "welcome");
    sa.ws.close();
    await expect(sb.next((m) => m.t === "leave" && m.id === welcome.id)).resolves.toBeTruthy();
  });

  it("tells everyone how many are in each space, but never who", async () => {
    const [a, b] = await Promise.all([visitor(), visitor()]);
    const sa = await connect(a.token);
    const online = (await sa.next((m) => m.t === "action" && m.kind === "online")) as unknown as { counts: Record<string, number> };
    expect(Object.values(online.counts).every((n) => typeof n === "number")).toBe(true);
    expect(JSON.stringify(online)).not.toContain(a.name);
    // Someone arriving in the Hub shows up in its count within a few seconds.
    const before = online.counts.hub ?? 0;
    const sb = await connect(b.token);
    sb.send({ t: "enter", space: "hub", x: 0, z: 9 });
    await expect(sa.next((m) => m.t === "action" && m.kind === "online" && ((m.counts as Record<string, number>).hub ?? 0) > before, 8000)).resolves.toBeTruthy();
  }, 12000);
});
