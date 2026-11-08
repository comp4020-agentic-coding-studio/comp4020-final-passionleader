import { afterEach, describe, expect, it } from "vitest";
import { api, closeAll, connect, guest, staffMember, visitor, type Msg, type Socket } from "./helpers.ts";

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

  it("asks an invitee who's online, and an invitation is good for one visit", async () => {
    const host = await inRoom("career-5", staffMember);
    const b = await visitor();
    const sb = await connect(b.token);
    await sb.next((m) => m.t === "welcome");
    host.s.send({ t: "invite", name: b.name });
    await expect(sb.next((m) => m.t === "action" && m.kind === "room-invited" && m.space === "career-5" && m.from === host.name)).resolves.toBeTruthy();
    // Asking again at once is refused (ten seconds apart), and nobody is put out of the room for it.
    host.s.send({ t: "invite", name: b.name });
    await expect(host.s.next(refused("career-5", "invited a moment ago"))).resolves.toBeTruthy();
    // Accepting from anywhere takes them straight in.
    sb.send({ t: "enter", space: "career-5", x: 0, z: 0 });
    await expect(sb.next(opened("career-5"))).resolves.toBeTruthy();
    // Out again, the invitation is used up.
    sb.send({ t: "enter", space: "careers", x: 0, z: 5 });
    await sb.next((m) => m.t === "players");
    sb.send({ t: "enter", space: "career-5", x: 0, z: 0 });
    await expect(sb.next(refused("career-5", "not invited"))).resolves.toBeTruthy();
  });

  it("keeps the Career Hub's interview rooms to the invited, like counselling rooms", async () => {
    const host = await inRoom("career-2", staffMember);
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

  it("lets only staff open an empty counselling or interview room; a student comes in when invited", async () => {
    const room = "counsel-4";
    const student = await visitor();
    const ss = await connect(student.token);
    await ss.next((m) => m.t === "welcome");
    ss.send({ t: "enter", space: room, x: 0, z: 0 });
    await expect(ss.next(refused(room, "staff first"))).resolves.toBeTruthy();
    ss.send({ t: "enter", space: "career-4", x: 0, z: 0 });
    await expect(ss.next(refused("career-4", "staff first"))).resolves.toBeTruthy();
    // A member of staff opens it and invites the student, who then comes in.
    const host = await inRoom(room, staffMember);
    host.s.send({ t: "invite", name: student.name });
    await host.s.next((m) => m.t === "action" && m.kind === "room" && ((m.room as { invited: string[] }).invited ?? []).includes(student.name));
    ss.send({ t: "enter", space: room, x: 0, z: 0 });
    await expect(ss.next(opened(room))).resolves.toBeTruthy();
  });

  it("keeps a counselling room to the people invited in", async () => {
    const room = "counsel-6";
    const host = await inRoom(room, staffMember);
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
    const a = await inRoom(room, staffMember);
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
    const c = await inRoom(room, staffMember);
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

// The room's shared pomodoro (RICE v3 #19): started by anyone inside, seen by
// everyone inside and nobody else; the server keeps it, with the room.
describe("room timer", () => {
  const timerMsg = (m: Msg) => m.t === "action" && m.kind === "timer";
  const ask = (s: Socket, op: string) => s.send({ t: "action", kind: "timer", op });

  it("shows a started timer to everyone in the room and to nobody outside it", async () => {
    const a = await inRoom("team-comp8020-1");
    const b = await inRoom("team-comp8020-1");
    // Someone in another room, and someone on the lawn, are not told.
    const other = await inRoom("team-anusa-2");
    const v = await visitor();
    const lawn = await connect(v.token);
    await lawn.next((m) => m.t === "welcome");
    const quiet = [other.s.seesNew(timerMsg, 600), lawn.seesNew(timerMsg, 600)];
    ask(a.s, "start");
    for (const s of [a.s, b.s]) {
      const m = await s.next(timerMsg);
      expect(m.timer).toMatchObject({ phase: "work", running: true, by: a.name });
      expect(m.timer as { left: number }).toSatisfy((t: { left: number }) => t.left > 24 * 60_000 && t.left <= 25 * 60_000);
    }
    expect(await Promise.all(quiet)).toEqual([false, false]);
    // Someone outside the room can't change it either, and a latecomer is handed the timer as it stands.
    ask(lawn, "reset");
    expect(await a.s.seesNew(timerMsg, 400)).toBe(false);
    const late = await visitor();
    const sl = await connect(late.token);
    await sl.next((m) => m.t === "welcome");
    sl.send({ t: "enter", space: "team-comp8020-1", x: 0, z: 0 });
    const open = await sl.next(opened("team-comp8020-1"));
    expect(open.timer).toMatchObject({ phase: "work", running: true });
  });

  it("lets anyone inside pause and reset it, but only once a second each", async () => {
    const a = await inRoom("team-comp8020-2");
    const b = await inRoom("team-comp8020-2");
    ask(a.s, "start");
    await b.s.next(timerMsg);
    // Pressed again at once, the second press is dropped: the room never hears of a pause from a.
    ask(a.s, "pause");
    expect(await b.s.seesNew((m) => timerMsg(m) && (m.timer as { running: boolean } | null)?.running === false, 500)).toBe(false);
    // Another person has their own second.
    ask(b.s, "pause");
    const paused = await a.s.next((m) => timerMsg(m) && (m.timer as { running: boolean } | null)?.running === false);
    expect(paused.timer).toMatchObject({ by: b.name });
    const left = (paused.timer as { left: number }).left;
    await new Promise((r) => setTimeout(r, 1100));
    ask(a.s, "reset");
    const reset = await b.s.next((m) => timerMsg(m) && m.timer === null);
    expect(reset.timer).toBeNull();
    expect(left).toBeGreaterThan(24 * 60_000);
  });

  it("moves by five minutes either way, within a minute and an hour", async () => {
    const a = await inRoom("team-comp8020-3");
    const b = await inRoom("team-comp8020-3");
    // No timer yet: -5 does nothing, +5 sets a paused 30-minute one.
    ask(a.s, "less");
    expect(await b.s.seesNew(timerMsg, 400)).toBe(false);
    await new Promise((r) => setTimeout(r, 1100));
    ask(a.s, "more");
    const set = await b.s.next(timerMsg);
    expect(set.timer).toMatchObject({ phase: "work", running: false, left: 30 * 60_000, by: a.name });
    ask(b.s, "start");
    await a.s.next((m) => timerMsg(m) && (m.timer as { running: boolean } | null)?.running === true);
    await new Promise((r) => setTimeout(r, 1100));
    ask(b.s, "less");
    const less = await a.s.next((m) => timerMsg(m) && (m.timer as { left: number } | null)!.left < 26 * 60_000);
    expect((less.timer as { left: number }).left).toBeGreaterThan(24 * 60_000);
  });

  it("goes when the room empties", async () => {
    const a = await inRoom("team-comp8020-1");
    ask(a.s, "start");
    await a.s.next(timerMsg);
    a.s.ws.close();
    await new Promise((r) => setTimeout(r, 300));
    const b = await inRoom("team-comp8020-1");
    const open = await b.s.next(opened("team-comp8020-1"));
    expect(open.timer).toBeNull();
  });
});
