import { afterEach, describe, expect, it } from "vitest";
import { api, closeAll, connect, guest, visitor, type Msg, type Socket } from "./helpers.ts";

// The meeting rooms (plan 21, 6a, 26a, 30): six people at most, and the
// counselling rooms let in only whoever someone inside has invited. The
// server decides, so these talk to it over real sockets. Each test uses its
// own room, since rooms are shared state on the running app.

afterEach(closeAll);

const opened = (space: string) => (m: Msg) => m.t === "action" && m.kind === "room-open" && m.space === space;
const refused = (space: string, reason: string) => (m: Msg) =>
  m.t === "action" && m.kind === "room-refused" && m.space === space && m.reason === reason;

async function inRoom(space: string, who: () => Promise<{ name: string; token: string }> = visitor): Promise<{ name: string; token: string; s: Socket }> {
  const v = await who();
  const s = await connect(v.token);
  await s.next((m) => m.t === "welcome");
  s.send({ t: "enter", space, x: 0, z: 0 });
  await s.next(opened(space));
  return { name: v.name, token: v.token, s };
}

describe("meeting rooms", () => {
  it("lets anyone into a team room (guests too), and turns the seventh away", async () => {
    const room = "team-library-4";
    const six = [];
    for (let i = 0; i < 6; i++) six.push(await inRoom(room, guest));
    const v = await guest();
    const s = await connect(v.token);
    await s.next((m) => m.t === "welcome");
    s.send({ t: "enter", space: room, x: 0, z: 0 });
    await expect(s.next(refused(room, "full"))).resolves.toBeTruthy();
    expect(await s.sees(opened(room), 400)).toBe(false);
  }, 15_000); // seven people in a row, while the other spec files sign people up

  it("gives everyone in a room the same whiteboard, and another room another", async () => {
    // The ANUSA lounge's rooms, which no other test fills.
    const a = await inRoom("team-anusa-1");
    const b = await inRoom("team-anusa-1");
    const c = await inRoom("team-anusa-2");
    const board = (m: { t: string; kind?: unknown }) => m.t === "action" && m.kind === "whiteboard";
    a.s.send({ t: "whiteboard" });
    b.s.send({ t: "whiteboard" });
    c.s.send({ t: "whiteboard" });
    const [ua, ub, uc] = (await Promise.all([a.s.next(board), b.s.next(board), c.s.next(board)])).map((m) => m.url as string);
    expect(ua).toMatch(/^https:\/\/excalidraw\.com\/#room=[0-9a-f]{20},[A-Za-z0-9_-]{22}$/);
    expect(ub).toBe(ua);
    expect(uc).not.toBe(ua);
  });

  it("keeps the Career Hub's interview rooms to the invited, like counselling rooms", async () => {
    const host = await inRoom("career-2");
    const b = await visitor();
    const sb = await connect(b.token);
    await sb.next((m) => m.t === "welcome");
    sb.send({ t: "enter", space: "career-2", x: 0, z: 0 });
    await expect(sb.next(refused("career-2", "not invited"))).resolves.toBeTruthy();
    host.s.send({ t: "invite", name: b.name });
    await host.s.next((m) => m.t === "action" && m.kind === "room" && ((m.room as { invited: string[] }).invited ?? []).includes(b.name));
    sb.send({ t: "enter", space: "career-2", x: 0, z: 0 });
    await expect(sb.next(opened("career-2"))).resolves.toBeTruthy();
  });

  it("keeps a counselling room to the people invited in", async () => {
    const room = "counsel-6";
    const host = await inRoom(room);
    const [b, c] = await Promise.all([visitor(), visitor()]);
    const sb = await connect(b.token);
    const sc = await connect(c.token);
    await Promise.all([sb.next((m) => m.t === "welcome"), sc.next((m) => m.t === "welcome")]);

    sb.send({ t: "enter", space: room, x: 0, z: 0 });
    await expect(sb.next(refused(room, "not invited"))).resolves.toBeTruthy();

    host.s.send({ t: "invite", name: b.name.toUpperCase() });
    await host.s.next((m) => m.t === "action" && m.kind === "room" && ((m.room as { invited: string[] }).invited ?? []).includes(b.name));
    sb.send({ t: "enter", space: room, x: 0, z: 0 });
    const welcome = await sb.next(opened(room));
    expect((welcome.room as { host: string }).host).toBe(host.name);

    // Being invited is per person: the third still can't come in.
    sc.send({ t: "enter", space: room, x: 0, z: 0 });
    await expect(sc.next(refused(room, "not invited"))).resolves.toBeTruthy();
  });

  it("saves a room's chat for the member who asks, tells the room, and shows it to nobody else", async () => {
    const room = "team-library-2";
    const a = await inRoom(room);
    const b = await inRoom(room);
    a.s.send({ t: "chat", text: "Shall we split the slides?" });
    await b.s.next((m) => m.t === "chat" && m.text === "Shall we split the slides?");
    b.s.send({ t: "save-chat" });
    const saved = await b.s.next((m) => m.t === "action" && m.kind === "chat-saved");
    expect(saved.ok).toBe(true);
    // Everyone inside hears that it was saved.
    await a.s.next((m) => m.t === "action" && m.kind === "room-line" && String((m.line as { text: string }).text).includes("saved this chat"));
    const bList = (await (await api("/api/chats", "POST", { token: b.token })).json()) as { id: number; space: string }[];
    expect(bList[0]).toMatchObject({ id: saved.id, space: room });
    const one = (await (await api(`/api/chats/${saved.id}`, "POST", { token: b.token })).json()) as { lines: { text: string }[] };
    expect(one.lines.map((l) => l.text)).toContain("Shall we split the slides?");
    expect((await api(`/api/chats/${saved.id}`, "POST", { token: a.token })).status).toBe(404);
    expect((await api(`/api/chats/${saved.id}`, "DELETE", { token: a.token })).status).toBe(404);
    expect((await api(`/api/chats/${saved.id}`, "DELETE", { token: b.token })).status).toBe(200);
    // A guest can't save one.
    const g = await inRoom("team-library-1", guest);
    g.s.send({ t: "save-chat" });
    expect((await g.s.next((m) => m.t === "action" && m.kind === "chat-saved")).ok).toBe(false);
  });

  it("shares one set of notes in a room, last write wins, and drops them when the room empties", async () => {
    const room = "team-library-3";
    const a = await inRoom(room);
    const b = await inRoom(room);
    a.s.send({ t: "pad", text: "# Plan\n- slides: Kim" });
    await expect(b.s.next((m) => m.t === "action" && m.kind === "pad")).resolves.toMatchObject({ text: "# Plan\n- slides: Kim", by: a.name });
    // The notes can be saved on their own: one line, marked as notes, only the saver's.
    b.s.send({ t: "save-chat", what: "notes" });
    const saved = await b.s.next((m) => m.t === "action" && m.kind === "chat-saved");
    expect(saved).toMatchObject({ ok: true, what: "notes" });
    const kept = (await (await api(`/api/chats/${saved.id}`, "POST", { token: b.token })).json()) as { kind: string; lines: { text: string }[] };
    expect(kept.kind).toBe("notes");
    expect(kept.lines.map((l) => l.text)).toEqual(["# Plan\n- slides: Kim"]);
    expect((await api(`/api/chats/${saved.id}`, "POST", { token: a.token })).status).toBe(404);
    // Someone coming in gets them on the way in.
    const cv = await visitor();
    const cs = await connect(cv.token);
    await cs.next((m) => m.t === "welcome");
    cs.send({ t: "enter", space: room, x: 0, z: 0 });
    expect(((await cs.next(opened(room))).pad as { text: string }).text).toBe("# Plan\n- slides: Kim");
    const c = { s: cs };
    a.s.ws.close();
    b.s.ws.close();
    c.s.ws.close();
    await new Promise((r) => setTimeout(r, 300));
    const d = await connect((await visitor()).token);
    await d.next((m) => m.t === "welcome");
    d.send({ t: "enter", space: room, x: 0, z: 0 });
    const opened2 = await d.next(opened(room));
    expect((opened2.pad as { text: string }).text).toBe("");
  });

  it("refuses an invite from outside a counselling room", async () => {
    const a = await inRoom("team-library-3");
    const b = await visitor();
    a.s.send({ t: "invite", name: b.name });
    await expect(a.s.next(refused("team-library-3", "not in a counselling room"))).resolves.toBeTruthy();
  });

  it("shows a newcomer what was said while they weren't there, and forgets it once the room empties", async () => {
    const room = "counsel-5";
    const a = await inRoom(room);
    const b = await visitor();
    a.s.send({ t: "chat", text: "first line" });
    await a.s.next((m) => m.t === "chat" && m.text === "first line");
    a.s.send({ t: "invite", name: b.name });
    await a.s.next((m) => m.t === "action" && m.kind === "room-line" && String((m.line as { text: string }).text).includes("invited"));

    const sb = await connect(b.token);
    await sb.next((m) => m.t === "welcome");
    sb.send({ t: "enter", space: room, x: 0, z: 0 });
    const seen = await sb.next(opened(room));
    expect((seen.lines as { text: string }[]).map((l) => l.text)).toContain("first line");

    // Everyone out: the chat, the host and the invites all go.
    sb.send({ t: "enter", space: "hub", x: 0, z: 0 });
    a.s.send({ t: "enter", space: "hub", x: 0, z: 0 });
    await new Promise((r) => setTimeout(r, 200));
    const c = await inRoom(room);
    const fresh = await c.s.next(opened(room));
    expect((fresh.lines as { text: string }[]).some((l) => l.text === "first line")).toBe(false);
    expect((fresh.room as { host: string }).host).toBe(c.name);
    sb.send({ t: "enter", space: room, x: 0, z: 0 });
    await expect(sb.next(refused(room, "not invited"))).resolves.toBeTruthy();
  });

  it("never puts anyone in a room that doesn't exist", async () => {
    const v = await visitor();
    const s = await connect(v.token);
    await s.next((m) => m.t === "welcome");
    s.send({ t: "enter", space: "counsel-9", x: 0, z: 0 });
    s.send({ t: "enter", space: "team-nosuch-1", x: 0, z: 0 });
    expect(await s.sees((m) => m.t === "action" && m.kind === "room-open", 500)).toBe(false);
  });
});
