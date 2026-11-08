import { afterEach, describe, expect, it } from "vitest";
import { api, closeAll, connect, guest, staffMember, visitor, type Msg, type Socket } from "./helpers.ts";

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
  }, 30_000);
});

const inHub = async (token: string): Promise<Socket> => {
  const s = await connect(token);
  await s.next((m) => m.t === "welcome");
  s.send({ t: "enter", space: "hub", x: 0, z: 5 });
  await s.next((m) => m.t === "players" && (m.players as { name: string }[]).length > 0, 2000);
  return s;
};
const officeList = (m: Msg) => m.t === "action" && m.kind === "office-now";
const knockedBy = (name: string) => (m: Msg) => m.t === "action" && m.kind === "knocked" && m.from === name;

describe("office hours", () => {
  it("lets staff open them, shows the Hub who is open, and refuses a student", async () => {
    const [staff, student] = await Promise.all([staffMember(), visitor()]);
    const ss = await inHub(staff.token);
    const st = await inHub(student.token);
    // A student can't set office hours; nobody sees them open.
    st.send({ t: "office", on: true });
    await expect(st.next((m) => m.t === "action" && m.kind === "office-refused")).resolves.toMatchObject({ reason: "staff only" });
    // Staff open them with a room: the badge flag is on their player, the Hub is told.
    ss.send({ t: "office", on: true, room: 2 });
    const list = await st.next((m) => officeList(m) && (m.list as { name: string }[]).some((o) => o.name === staff.name));
    expect(list.list).toEqual([{ name: staff.name, room: 2 }]);
    await expect(st.next((m) => m.t === "players" && (m.players as { name: string; office?: boolean }[]).some((p) => p.name === staff.name && p.office === true))).resolves.toBeTruthy();
    // A room that doesn't exist is refused too.
    ss.send({ t: "office", on: true, room: 99 });
    await expect(ss.next((m) => m.t === "action" && m.kind === "office-refused" && m.reason === "no such room")).resolves.toBeTruthy();
    // Closing clears it.
    ss.send({ t: "office", on: false });
    await expect(st.next((m) => officeList(m) && (m.list as unknown[]).length === 0)).resolves.toBeTruthy();
  });

  it("sends a knock to that staff member alone, once a minute per student", async () => {
    const [staff, other, student, bystander] = await Promise.all([staffMember(), staffMember(), visitor(), visitor()]);
    const ss = await inHub(staff.token);
    const so = await inHub(other.token);
    const st = await inHub(student.token);
    const sb = await inHub(bystander.token);
    ss.send({ t: "office", on: true });
    await st.next((m) => officeList(m) && (m.list as { name: string }[]).some((o) => o.name === staff.name));
    st.send({ t: "knock", name: staff.name });
    await expect(ss.next(knockedBy(student.name))).resolves.toBeTruthy();
    await expect(st.next((m) => m.t === "action" && m.kind === "knock-sent")).resolves.toBeTruthy();
    // Nobody else hears it: not another staff member, not another student in the Hub.
    expect(await so.sees(knockedBy(student.name), 500)).toBe(false);
    expect(await sb.sees(knockedBy(student.name), 500)).toBe(false);
    // A second knock inside the minute is refused.
    st.send({ t: "knock", name: staff.name });
    await expect(st.next((m) => m.t === "action" && m.kind === "knock-refused" && m.reason === "wait")).resolves.toBeTruthy();
    // Knocking on someone whose office hours aren't open is refused.
    st.send({ t: "knock", name: other.name });
    await expect(st.next((m) => m.t === "action" && m.kind === "knock-refused" && m.reason === "not open")).resolves.toBeTruthy();
  });
});
