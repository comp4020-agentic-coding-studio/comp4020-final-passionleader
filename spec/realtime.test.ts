import { afterEach, describe, expect, it } from "vitest";
import { api, closeAll, connect, visitor, wsUrl } from "./helpers.ts";

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
});
