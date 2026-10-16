import { afterAll, describe, expect, it } from "vitest";
import { api, closeAll, visitor } from "./helpers.ts";

// Each classroom's board: Q&A, Notices and Board. Anyone posts in Q&A and
// Board and comments anywhere; only lecturers and staff (the admin, for now)
// post in Notices, and the server refuses everyone else whatever the page
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

  it("keeps posts to 500 words", async () => {
    const v = await visitor();
    expect((await post(v.token, "board", words(501))).status).toBe(400);
    expect((await post(v.token, "board", words(500))).status).toBe(201);
  });

  it("keeps each classroom's board to itself", async () => {
    const v = await visitor();
    const created = await (await post(v.token, "board", "Only in COMMON", "common")).json();
    const there = (await (await api("/api/board?space=comp8020&tab=board")).json()) as { id: number }[];
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

// The Student Hub's board, where staff and students find each other, and the
// lawn's noticeboard. Anyone posts in every tab (there's no staff role yet,
// so "Labs looking for students" is open too); both say they're unofficial.
describe("Hub and lawn boards", () => {
  it("gives the Hub three tabs, open to anyone, and says it's unofficial", async () => {
    const config = (await (await api("/api/board-config?space=hub")).json()) as { tabs: { id: string; staffOnly?: boolean }[]; notice: string };
    expect(config.tabs.map((t) => t.id)).toEqual(["labs", "students", "ask"]);
    expect(config.tabs.some((t) => t.staffOnly)).toBe(false);
    expect(config.notice).toMatch(/Not an official ANU service.*identities aren't verified/);
    const v = await visitor();
    expect((await post(v.token, "labs", "We need a research assistant.", "hub")).status).toBe(201);
    const labs = (await (await api("/api/board?space=hub&tab=labs")).json()) as { author: string }[];
    expect(labs.map((p) => p.author)).toContain(v.name);
  });

  it("gives the lawn one noticeboard tab, unofficial too", async () => {
    const config = (await (await api("/api/board-config?space=outdoor")).json()) as { tabs: { id: string }[]; notice: string };
    expect(config.tabs.map((t) => t.id)).toEqual(["board"]);
    expect(config.notice).toMatch(/Not an official ANU service/);
    const v = await visitor();
    expect((await post(v.token, "board", "Club fair on Friday", "outdoor")).status).toBe(201);
  });

  it("refuses a classroom's tab on another board", async () => {
    const v = await visitor();
    expect((await post(v.token, "notices", "Not a Hub tab", "hub")).status).toBe(400);
  });
});
