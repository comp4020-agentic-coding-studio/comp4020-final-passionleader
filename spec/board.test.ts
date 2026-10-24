import { afterAll, describe, expect, it } from "vitest";
import { api, closeAll, connect, guest, staffMember, visitor } from "./helpers.ts";

// Each classroom's board: Q&A, Notices and Board. Anyone posts in Q&A and
// Board and comments anywhere; only staff (signed up as ANU staff) and the
// admin post in Notices, and the server refuses everyone else whatever the page
// shows. Posts run to 500 words; only authors and the admin remove them.

afterAll(closeAll);

const words = (n: number): string => Array(n).fill("word").join(" ");
const post = (token: string, tab: string, text = "Is the crit at 9?", space = "comp8020") =>
  api("/api/board", "POST", { token, space, tab, title: "A question", text });

describe("classroom board", () => {
  it("opens Notices with the pinned note on who can post there", async () => {
    const list = (await (await api("/api/board?space=comp8020&tab=notices")).json()) as { pinned?: boolean; text: string }[];
    expect(list[0]).toMatchObject({ pinned: true });
    expect(list[0]!.text).toMatch(/Only lecturers and staff/);
  });

  it("lets anyone ask in Q&A, but not post a notice", async () => {
    const v = await visitor();
    expect((await post(v.token, "qa")).status).toBe(201);
    expect((await post(v.token, "notices")).status).toBe(403);
    const notices = (await (await api("/api/board?space=comp8020&tab=notices")).json()) as { author: string }[];
    expect(notices.map((p) => p.author)).not.toContain(v.name);
  });

  it("lets staff post a notice, open a classroom and read private questions; a student none of these", async () => {
    const [s, v] = await Promise.all([staffMember(), visitor()]);
    expect((await post(s.token, "notices", "Lab moved to Thursday")).status).toBe(201);
    const code = `STAF${Math.floor(1000 + Math.random() * 8999)}`;
    expect((await api("/api/classrooms", "POST", { token: v.token, code })).status).toBe(403);
    expect((await api("/api/classrooms", "POST", { token: s.token, code })).status).toBe(201);
    expect((await api(`/api/classrooms/${code}`, "DELETE", { token: s.token })).status).toBe(200);
    const asked = (await (await api("/api/board", "POST", { token: v.token, space: "hub-desk", tab: "ask", title: "Fees", text: "Can I pay later?", private: true })).json()) as { id: number };
    const seen = (await (await api(`/api/board?space=hub-desk&tab=ask&token=${s.token}`)).json()) as { id: number }[];
    expect(seen.map((p) => p.id)).toContain(asked.id);
  });

  it("keeps posts to 500 words", async () => {
    const v = await visitor();
    expect((await post(v.token, "board", words(501))).status).toBe(400);
    expect((await post(v.token, "board", words(500))).status).toBe(201);
  });

  it("keeps each board to itself: a COMP8020 post isn't on the study-group board", async () => {
    const v = await visitor();
    const created = (await (await post(v.token, "board", "Only in COMP8020")).json()) as { id: number };
    const there = (await (await api("/api/board?space=study-groups&tab=groups")).json()) as { id: number }[];
    expect(there.map((p) => p.id)).not.toContain(created.id);
  });

  it("lets anyone comment, and only the author remove a post", async () => {
    const [a, b] = await Promise.all([visitor(), visitor()]);
    const created = await (await post(a.token, "qa")).json();
    expect((await api(`/api/board/${created.id}/comments`, "POST", { token: b.token, text: "Yes, 9:00." })).status).toBe(201);
    expect((await api(`/api/board/${created.id}`, "DELETE", { token: b.token })).status).toBe(403);
    expect((await api(`/api/board/${created.id}`, "DELETE", { token: a.token })).status).toBe(200);
  });

  it("has no board where none stands", async () => {
    expect((await api("/api/board?space=library&tab=board")).status).toBe(404);
    expect((await api("/api/board-config?space=library")).status).toBe(404);
  });
});

// The Student Hub's lab matching board, where labs and students find each
// other, and the advertising board by the lawn. Anyone posts in every tab (there's no
// staff role yet, so "Labs looking for students" is open too); both say
// they're unofficial, and the lawn's that its posts go after 30 days.
describe("Hub and lawn boards", () => {
  it("gives the Hub's lab matching board two tabs, open to anyone, and says it's unofficial", async () => {
    const config = (await (await api("/api/board-config?space=hub")).json()) as { title: string; tabs: { id: string; staffOnly?: boolean }[]; notice: string };
    expect(config.title).toBe("Lab matching board");
    expect(config.tabs.map((t) => t.id)).toEqual(["labs", "students"]);
    expect((await api("/api/board?space=hub&tab=ask")).status).toBe(400);
    expect(config.tabs.some((t) => t.staffOnly)).toBe(false);
    expect(config.notice).toMatch(/Not an official ANU service.*identities aren't verified/);
    const v = await visitor();
    expect((await post(v.token, "labs", "We need a research assistant.", "hub")).status).toBe(201);
    const labs = (await (await api("/api/board?space=hub&tab=labs")).json()) as { author: string }[];
    expect(labs.map((p) => p.author)).toContain(v.name);
  });

  it("gives the advertising board by the lawn one tab, unofficial too", async () => {
    const config = (await (await api("/api/board-config?space=outdoor")).json()) as { tabs: { id: string }[]; notice: string; layout?: string; keepDays?: number };
    expect(config.tabs.map((t) => t.id)).toEqual(["board"]);
    expect(config).toMatchObject({ layout: "grid", keepDays: 30 });
    expect(config.notice).toMatch(/Not an official ANU service/);
    expect(config.notice).toMatch(/removed after 30 days/);
    const v = await visitor();
    expect((await post(v.token, "board", "Club fair on Friday", "outdoor")).status).toBe(201);
  });

  it("refuses a classroom's tab on another board", async () => {
    const v = await visitor();
    expect((await post(v.token, "notices", "Not a Hub tab", "hub")).status).toBe(400);
  });
});

// Editing: authors fix their own posts and comments (same limits as posting),
// and the board says it was edited. Nobody else edits, not even the admin.
describe("editing posts and comments", () => {
  it("lets the author edit a post, marks it edited, and refuses anyone else", async () => {
    const [a, b] = await Promise.all([visitor(), visitor()]);
    const created = await (await post(a.token, "board")).json();
    expect(created.editedAt).toBeNull();
    const edit = (token: string, text: string) => api(`/api/board/${created.id}`, "PATCH", { token, title: "Fixed title", text });
    expect((await edit(b.token, "Not mine")).status).toBe(403);
    expect((await edit(a.token, words(501))).status).toBe(400);
    const res = await edit(a.token, "The crit is at **10**.");
    expect(res.status).toBe(200);
    const edited = await res.json();
    expect(edited).toMatchObject({ title: "Fixed title", text: "The crit is at **10**." });
    expect(edited.editedAt).toBeTruthy();
  });

  it("lets the author edit a comment, and only the author", async () => {
    const [a, b] = await Promise.all([visitor(), visitor()]);
    const created = await (await post(a.token, "qa")).json();
    const comment = await (await api(`/api/board/${created.id}/comments`, "POST", { token: b.token, text: "Yes, 9:00." })).json();
    expect((await api(`/api/board-comments/${comment.id}`, "PATCH", { token: a.token, text: "Hijacked" })).status).toBe(403);
    const res = await api(`/api/board-comments/${comment.id}`, "PATCH", { token: b.token, text: "Sorry, 10:00." });
    expect(res.status).toBe(200);
    const list = (await (await api(`/api/board/${created.id}/comments`)).json()) as { id: number; text: string; editedAt: string | null }[];
    expect(list.find((c) => c.id === comment.id)).toMatchObject({ text: "Sorry, 10:00." });
    expect(list.find((c) => c.id === comment.id)?.editedAt).toBeTruthy();
  });
});

// Hearts: one per person per comment (a second press takes it back), never
// on your own, and the most-hearted comment comes first.
describe("hearts on comments", () => {
  it("counts one heart each, takes it back on a second press, refuses your own, and puts the most-hearted first", async () => {
    const [a, b, c] = await Promise.all([visitor(), visitor(), visitor()]);
    const created = (await (await post(a.token, "board", "Anyone up for a study group?")).json()) as { id: number };
    const first = (await (await api(`/api/board/${created.id}/comments`, "POST", { token: b.token, text: "Me!" })).json()) as { id: number };
    await new Promise((r) => setTimeout(r, 50));
    const second = (await (await api(`/api/board/${created.id}/comments`, "POST", { token: c.token, text: "Me too, Thursdays?" })).json()) as { id: number };
    expect((await api(`/api/board-comments/${second.id}/heart`, "POST", { token: c.token })).status).toBe(400); // your own
    expect(await (await api(`/api/board-comments/${second.id}/heart`, "POST", { token: a.token })).json()).toEqual({ hearted: true, hearts: 1 });
    expect(await (await api(`/api/board-comments/${second.id}/heart`, "POST", { token: b.token })).json()).toEqual({ hearted: true, hearts: 2 });
    const list = (await (await api(`/api/board/${created.id}/comments`)).json()) as { id: number; heartedBy: string[] }[];
    expect(list.map((x) => x.id)).toEqual([second.id, first.id]); // most-hearted first
    expect(list[0]!.heartedBy.map((n) => n.toLowerCase()).sort()).toEqual([a.name, b.name].map((n) => n.toLowerCase()).sort());
    expect(await (await api(`/api/board-comments/${second.id}/heart`, "POST", { token: a.token })).json()).toEqual({ hearted: false, hearts: 1 });
  });
});

// The Hub's enquiry board: a private question is for its writer and the
// staff (the admin) only, its comments too; public ones are for anyone.
describe("private enquiries", () => {
  it("shows a private question only to its writer, and hides its comments from everyone else", async () => {
    const [a, b] = await Promise.all([visitor(), visitor()]);
    const config = (await (await api("/api/board-config?space=hub-desk")).json()) as { title: string; allowPrivate?: boolean };
    expect(config).toMatchObject({ title: "Ask the Hub", allowPrivate: true });
    const res = await api("/api/board", "POST", { token: a.token, space: "hub-desk", tab: "ask", title: "My visa", text: "Can I enrol part-time?", private: true });
    expect(res.status).toBe(201);
    const mine = (await res.json()) as { id: number; private: boolean };
    expect(mine.private).toBe(true);
    const asA = (await (await api(`/api/board?space=hub-desk&tab=ask&token=${a.token}`)).json()) as { id: number }[];
    expect(asA.map((p) => p.id)).toContain(mine.id);
    const asB = (await (await api(`/api/board?space=hub-desk&tab=ask&token=${b.token}`)).json()) as { id: number }[];
    expect(asB.map((p) => p.id)).not.toContain(mine.id);
    const anon = (await (await api("/api/board?space=hub-desk&tab=ask")).json()) as { id: number }[];
    expect(anon.map((p) => p.id)).not.toContain(mine.id);
    expect((await api(`/api/board/${mine.id}/comments?token=${b.token}`)).status).toBe(404);
    expect((await api(`/api/board/${mine.id}/comments`, "POST", { token: b.token, text: "Peeking" })).status).toBe(404);
    expect((await api(`/api/board/${mine.id}/comments?token=${a.token}`)).status).toBe(200);
    // Activity on it tells the Hub only that the tab changed, never which post.
    const watcher = await connect(b.token);
    await watcher.next((m) => m.t === "welcome");
    watcher.send({ t: "enter", space: "hub", x: 0, z: 0 });
    await watcher.next((m) => m.t === "players");
    await api(`/api/board/${mine.id}/comments`, "POST", { token: a.token, text: "Anyone from the Hub?" });
    const told = await watcher.next((m) => m.t === "action" && m.kind === "board");
    expect(told).not.toHaveProperty("post");
    closeAll();
    // Elsewhere "private" is ignored: a lawn post is public whatever it says.
    const c = await visitor();
    const lawn = (await (await api("/api/board", "POST", { token: c.token, space: "outdoor", tab: "board", title: "Fair", text: "Friday", private: true })).json()) as { private: boolean };
    expect(lawn.private).toBe(false);
  });
});

// The study-group board beside 155's door: a group has a size (2 to 20, its
// writer included); others join or leave, never past it; the writer stays in.
describe("study groups", () => {
  it("lets people join up to the group's size, and leave again; the writer stays in", async () => {
    const [w, a, b] = await Promise.all([visitor(), visitor(), visitor()]);
    const config = (await (await api("/api/board-config?space=study-groups")).json()) as { title: string; groups?: boolean };
    expect(config).toMatchObject({ title: "Study groups", groups: true });
    const noSize = await api("/api/board", "POST", { token: w.token, space: "study-groups", tab: "groups", title: "COMP2100", text: "Thursdays" });
    expect(noSize.status).toBe(400);
    const res = await api("/api/board", "POST", { token: w.token, space: "study-groups", tab: "groups", title: "COMP2100", text: "Thursdays", capacity: 2 });
    expect(res.status).toBe(201);
    const group = (await res.json()) as { id: number; capacity: number; members: string[] };
    expect(group.capacity).toBe(2);
    expect(group.members.map((m) => m.toLowerCase())).toEqual([w.name.toLowerCase()]);
    expect(await (await api(`/api/board/${group.id}/join`, "POST", { token: a.token })).json()).toMatchObject({ joined: true });
    expect((await api(`/api/board/${group.id}/join`, "POST", { token: b.token })).status).toBe(409); // full
    expect((await api(`/api/board/${group.id}/join`, "POST", { token: w.token })).status).toBe(409); // the writer stays in
    expect(await (await api(`/api/board/${group.id}/join`, "POST", { token: a.token })).json()).toMatchObject({ joined: false });
    expect(await (await api(`/api/board/${group.id}/join`, "POST", { token: b.token })).json()).toMatchObject({ joined: true });
    const list = (await (await api("/api/board?space=study-groups&tab=groups")).json()) as { id: number; members: string[] }[];
    expect(list.find((p) => p.id === group.id)?.members.map((m) => m.toLowerCase())).toEqual([w.name, b.name].map((n) => n.toLowerCase()));
  });
});

describe("study groups: resizing", () => {
  it("lets the writer change a group's size on edit, never below who's in it", async () => {
    const [w, a] = await Promise.all([visitor(), visitor()]);
    const group = (await (await api("/api/board", "POST", { token: w.token, space: "study-groups", tab: "groups", title: "MATH1013", text: "Mondays", capacity: 4 })).json()) as { id: number };
    await api(`/api/board/${group.id}/join`, "POST", { token: a.token });
    expect((await api(`/api/board/${group.id}`, "PATCH", { token: w.token, title: "MATH1013", text: "Mondays", capacity: 1 })).status).toBe(400);
    const res = await api(`/api/board/${group.id}`, "PATCH", { token: w.token, title: "MATH1013", text: "Mondays", capacity: 2 });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { capacity: number }).capacity).toBe(2);
  });
});

// The AI campus assistants: where they stand comes from the server, anyone
// joined may ask (guests too), one question every few seconds, and the
// answer comes with their pages.
describe("campus assistants", () => {
  it("lists five, answers a guest with its pages, and slows down a rush", async () => {
    const list = (await (await api("/api/npcs")).json()) as { id: string; space: string; reach?: number; links: unknown[] }[];
    expect(list.map((n) => n.id).sort()).toEqual(["anusa", "careers", "course", "library", "sport"]);
    // Those behind a desk say how far out you stand to talk, so their E spot isn't inside the desk.
    expect(list.find((n) => n.id === "library")?.reach).toBeGreaterThan(2);
    const g = await guest();
    const res = await api("/api/npc/library/ask", "POST", { token: g.token, text: "When are you open?" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { reply: string; links: { url: string }[] };
    expect(body.reply.length).toBeGreaterThan(0);
    expect(body.links.length).toBeGreaterThan(0);
    expect((await api("/api/npc/library/ask", "POST", { token: g.token, text: "Again?" })).status).toBe(429);
    expect((await api("/api/npc/nobody/ask", "POST", { token: g.token, text: "Hi" })).status).toBe(404);
  });
});

// Mail: members only, to someone signed up by name; only its reader sees it
// in their inbox, and may delete it; unread counts.
describe("mail", () => {
  it("goes from one member to another, counts as unread until read, and only its reader can delete it", async () => {
    const [a, b, c] = await Promise.all([visitor(), visitor(), visitor()]);
    const g = await guest();
    expect((await api("/api/mail", "POST", { token: g.token, to: b.name, subject: "Hi", text: "From a guest" })).status).toBe(403);
    expect((await api("/api/mail", "POST", { token: a.token, to: g.name, subject: "Hi", text: "To a guest" })).status).toBe(404);
    const sent = await api("/api/mail", "POST", { token: a.token, to: b.name, subject: "Study group?", text: "Want to join mine on Thursdays?" });
    expect(sent.status).toBe(201);
    const { id } = (await sent.json()) as { id: number };
    expect((await api("/api/mail", "POST", { token: a.token, to: b.name, subject: "Again", text: "too soon" })).status).toBe(429);
    const box = (await (await api("/api/mail/box", "POST", { token: b.token })).json()) as { inbox: { id: number; sender: string }[]; unread: number };
    expect(box.unread).toBe(1);
    expect(box.inbox[0]).toMatchObject({ id, sender: a.name });
    expect((await (await api(`/api/mail/${id}/read`, "POST", { token: b.token })).json()).unread).toBe(0);
    expect((await api(`/api/mail/${id}`, "DELETE", { token: c.token })).status).toBe(404);
    expect((await api(`/api/mail/${id}`, "DELETE", { token: b.token })).status).toBe(200);
    // Gone from the reader's inbox, still in the sender's Sent.
    expect(((await (await api("/api/mail/box", "POST", { token: b.token })).json()) as { inbox: unknown[] }).inbox).toHaveLength(0);
    const sentBox = (await (await api("/api/mail/box", "POST", { token: a.token })).json()) as { sent: { id: number }[] };
    expect(sentBox.sent.map((m) => m.id)).toContain(id);
  });
});
