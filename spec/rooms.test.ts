import { afterEach, describe, expect, it } from "vitest";
import { closeAll, connect, guest, visitor, type Msg, type Socket } from "./helpers.ts";

// The meeting rooms (plan 21, 6a, 26a, 30): six people at most, and the
// counselling rooms let in only whoever someone inside has invited. The
// server decides, so these talk to it over real sockets. Each test uses its
// own room, since rooms are shared state on the running app.

afterEach(closeAll);

const opened = (space: string) => (m: Msg) => m.t === "action" && m.kind === "room-open" && m.space === space;
const refused = (space: string, reason: string) => (m: Msg) =>
  m.t === "action" && m.kind === "room-refused" && m.space === space && m.reason === reason;

async function inRoom(space: string, who: () => Promise<{ name: string; token: string }> = visitor): Promise<{ name: string; s: Socket }> {
  const v = await who();
  const s = await connect(v.token);
  await s.next((m) => m.t === "welcome");
  s.send({ t: "enter", space, x: 0, z: 0 });
  await s.next(opened(space));
  return { name: v.name, s };
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
