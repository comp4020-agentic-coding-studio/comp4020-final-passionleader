import { describe, expect, it } from "vitest";
import { api, closeAll, connect, freshName, guest, visitor } from "./helpers.ts";

// Names, sticky notes and comments, checked over HTTP against the running app.

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

describe("guests and signing up", () => {
  it("lets a guest in as guestNNN, and the same browser back as the same guest", async () => {
    const g = await guest();
    expect(g.name).toMatch(/^guest\d{3}$/);
    const again = (await (await api("/api/guest", "POST", { token: g.token })).json()) as { name: string };
    expect(again.name).toBe(g.name);
  });

  it("has no free names any more: you sign up, or come in as a guest", async () => {
    expect((await api("/api/join", "POST", { name: freshName() })).status).toBe(404);
    expect((await api("/api/join", "POST", { name: "qa_" + freshName().slice(0, 5) })).status).toBe(403);
  });

  it("signs a student up with a code sent to their ANU email, then lets them in with name and password", async () => {
    const v = await visitor();
    expect(v.email).toMatch(/^u\d{7}@anu\.edu\.au$/);
    const back = await api("/api/join", "POST", { name: v.name, password: "correct horse 1" });
    expect(back.status).toBe(200);
    expect((await back.json()).role).toBe("student");
    expect((await api("/api/join", "POST", { name: v.name, password: "wrong one!" })).status).toBe(401);
    // The same email can't sign up twice.
    expect((await api("/api/signup/start", "POST", { studentNo: v.studentNo })).status).toBe(409);
  });

  it("refuses a wrong code, a short password, a guest's or a qa_ name, and non-ANU addresses", async () => {
    expect((await api("/api/signup/start", "POST", { studentNo: "1234567" })).status).toBe(400);
    expect((await api("/api/signup/start", "POST", { staff: true, email: "someone@gmail.com" })).status).toBe(400);
    expect((await api("/api/signup/start", "POST", { staff: true, email: "u1234567@anu.edu.au" })).status).toBe(400);
    const studentNo = `u${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
    expect((await api("/api/signup/start", "POST", { studentNo })).status).toBe(200);
    expect((await api("/api/signup/start", "POST", { studentNo })).status).toBe(429); // one a minute
    const mail = (await (await api(`/api/test/mail?to=${studentNo}@anu.edu.au`)).json()) as { text: string };
    const code = /\b(\d{6})\b/.exec(mail.text)![1]!;
    expect((await api("/api/signup/finish", "POST", { studentNo, code: code === "000000" ? "111111" : "000000", name: freshName(), password: "long enough" })).status).toBe(401);
    expect((await api("/api/signup/finish", "POST", { studentNo, code, name: freshName(), password: "short" })).status).toBe(400);
    expect((await api("/api/signup/finish", "POST", { studentNo, code, name: "guest123", password: "long enough" })).status).toBe(400);
    expect((await api("/api/signup/finish", "POST", { studentNo, code, name: "Guest_1", password: "long enough" })).status).toBe(400);
    expect((await api("/api/signup/finish", "POST", { studentNo, code, name: freshName(), password: "long enough" })).status).toBe(201);
  });

  it("resets a forgotten password by an emailed code, and the old browsers sign in again", async () => {
    const v = await visitor();
    // A tab already open on the old token is put out at once.
    const open = await connect(v.token);
    await open.next((m) => m.t === "welcome");
    const closed = new Promise<number>((r) => open.ws.addEventListener("close", (e) => r(e.code)));
    expect((await api("/api/password/start", "POST", { studentNo: v.studentNo })).status).toBe(200);
    const mail = (await (await api(`/api/test/mail?to=${v.email}`)).json()) as { text: string };
    const code = /\b(\d{6})\b/.exec(mail.text)![1]!;
    const res = await api("/api/password/finish", "POST", { studentNo: v.studentNo, code, password: "a new long one" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { token: string }).token).not.toBe(v.token);
    expect((await api("/api/join", "POST", { name: v.name, password: "a new long one" })).status).toBe(200);
    expect(await closed).toBe(4004);
    closeAll();
  });

  it("refuses a guest notes, posts and reports about someone, but takes their bug report", async () => {
    const g = await guest();
    const note = await api("/api/notes", "POST", { token: g.token, space: "comp8020", x: 2, z: 1, text: "a guest's note" });
    expect(note.status).toBe(403);
    expect((await note.json()).signup).toBe(true);
    const post = await api("/api/board", "POST", { token: g.token, space: "comp8020", tab: "board", title: "Hi", text: "Hello" });
    expect(post.status).toBe(403);
    expect((await post.json()).signup).toBe(true);
    expect((await api("/api/bugs", "POST", { token: g.token, text: "rude", about: "someone" })).status).toBe(403);
    // A bug report is fine from anyone.
    expect((await api("/api/bugs", "POST", { token: g.token, text: "the door sticks" })).status).toBe(201);
  });
});

describe("sticky notes", () => {
  it("is still there on the next visit", async () => {
    const { name, token } = await visitor();
    const res = await api("/api/notes", "POST", { token, space: "comp8020", x: 1.5, z: -2, text: "Anyone doing COMP8020?" });
    expect(res.status).toBe(201);
    const notes = await (await api("/api/notes?space=comp8020")).json();
    expect(notes).toContainEqual(expect.objectContaining({ author: name, x: 1.5, z: -2, text: "Anyone doing COMP8020?" }));
  });

  it("belongs to the space it was stuck in", async () => {
    const { token } = await visitor();
    const { note } = await (await api("/api/notes", "POST", { token, space: "comp8020", x: 0, z: 0, text: "here" })).json();
    const outdoor = await (await api("/api/notes?space=outdoor")).json();
    expect(outdoor.map((n: { id: number }) => n.id)).not.toContain(note.id);
  });

  it("allows up to 100 words, not 101, and not one endless word", async () => {
    const a = await visitor();
    expect((await api("/api/notes", "POST", { token: a.token, space: "outdoor", x: 0, z: 0, text: words(101) })).status).toBe(400);
    expect((await api("/api/notes", "POST", { token: a.token, space: "outdoor", x: 0, z: 0, text: "x".repeat(601) })).status).toBe(400);
    expect((await api("/api/notes", "POST", { token: a.token, space: "outdoor", x: 0, z: 0, text: words(100) })).status).toBe(201);
  });

  it("is one every 30 seconds per person", async () => {
    const { token } = await visitor();
    expect((await api("/api/notes", "POST", { token, space: "outdoor", x: 0, z: 0, text: "one" })).status).toBe(201);
    expect((await api("/api/notes", "POST", { token, space: "outdoor", x: 1, z: 1, text: "two" })).status).toBe(429);
  });

  it("stays inside the space", async () => {
    const { token } = await visitor();
    const { note } = await (await api("/api/notes", "POST", { token, space: "comp8020", x: -999, z: -999, text: "edge" })).json();
    expect(note).toMatchObject({ x: -10, z: -8 });
  });

  it("can be removed by its author but not by someone else", async () => {
    const [a, b] = await Promise.all([visitor(), visitor()]);
    const { note } = await (await api("/api/notes", "POST", { token: a.token, space: "outdoor", x: 2, z: 2, text: "mine" })).json();
    expect((await api(`/api/notes/${note.id}`, "DELETE", { token: b.token })).status).toBe(403);
    expect((await api(`/api/notes/${note.id}`, "DELETE", { token: a.token })).status).toBe(200);
    const notes = await (await api("/api/notes?space=outdoor")).json();
    expect(notes.map((n: { id: number }) => n.id)).not.toContain(note.id);
  });

  it("can't go up in the Student Hub, inside a building, or right by a door", async () => {
    const v = await visitor();
    const post = (space: string, x: number, z: number) => api("/api/notes", "POST", { token: v.token, space, x, z, text: "here?" });
    expect((await post("hub", 0, 0)).status).toBe(400);
    expect((await post("comp8020", 8.5, 6)).status).toBe(400); // the classroom's way out
    expect((await post("comp8020", 0, -6.5)).status).toBe(400); // the whiteboard
    expect((await post("outdoor", -8, 7)).status).toBe(400); // 155's door
  });

  it("says when it disappears: a month after it was stuck", async () => {
    const v = await visitor();
    const { note } = await (await api("/api/notes", "POST", { token: v.token, space: "outdoor", x: -3, z: -14, text: "a month" })).json();
    const days = (Date.parse(note.expiresAt + "Z") - Date.parse(note.createdAt + "Z")) / 86_400_000;
    expect(days).toBe(30);
  });

  it("needs a name first", async () => {
    expect((await api("/api/notes", "POST", { token: "nope", space: "hub", x: 0, z: 0, text: "hi" })).status).toBe(401);
  });
});

describe("comments", () => {
  it("can be added to a note and read back, one every 10 seconds", async () => {
    const [a, b] = await Promise.all([visitor(), visitor()]);
    const { note } = await (await api("/api/notes", "POST", { token: a.token, space: "comp8020", x: 3, z: 3, text: "Study group?" })).json();
    expect((await api(`/api/notes/${note.id}/comments`, "POST", { token: b.token, text: "Count me in" })).status).toBe(201);
    expect((await api(`/api/notes/${note.id}/comments`, "POST", { token: b.token, text: "Again" })).status).toBe(429);
    const comments = await (await api(`/api/notes/${note.id}/comments`)).json();
    expect(comments).toEqual([expect.objectContaining({ author: b.name, text: "Count me in" })]);
  });

  it("allows 100 words, not 101", async () => {
    const [a, b] = await Promise.all([visitor(), visitor()]);
    const { note } = await (await api("/api/notes", "POST", { token: a.token, space: "comp8020", x: 4, z: 4, text: "q" })).json();
    expect((await api(`/api/notes/${note.id}/comments`, "POST", { token: b.token, text: words(101) })).status).toBe(400);
  });

  it("can be removed by its author but not by the note's author", async () => {
    const [a, b] = await Promise.all([visitor(), visitor()]);
    const { note } = await (await api("/api/notes", "POST", { token: a.token, space: "comp8020", x: 5, z: 5, text: "q" })).json();
    const comment = await (await api(`/api/notes/${note.id}/comments`, "POST", { token: b.token, text: "reply" })).json();
    expect((await api(`/api/comments/${comment.id}`, "DELETE", { token: a.token })).status).toBe(403);
    expect((await api(`/api/comments/${comment.id}`, "DELETE", { token: b.token })).status).toBe(200);
  });
});
