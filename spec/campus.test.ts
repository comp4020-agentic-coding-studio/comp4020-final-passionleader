import { describe, expect, it } from "vitest";
import { api, freshName, visitor } from "./helpers.ts";

// Names, sticky notes and comments, checked over HTTP against the running app.

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

describe("names", () => {
  it("accepts letters, digits and underscores, up to eight", async () => {
    expect((await api("/api/join", "POST", { name: freshName().slice(0, 5) + "_42" })).status).toBe(200);
  });

  it.each(["", "ninechars", "has space", "한글", "dot.dot"])("rejects %j", async (name) => {
    expect((await api("/api/join", "POST", { name })).status).toBe(400);
  });

  it("can't be taken twice, whatever the case", async () => {
    const name = freshName();
    await api("/api/join", "POST", { name });
    expect((await api("/api/join", "POST", { name: name.toUpperCase() })).status).toBe(409);
  });

  it("can be reclaimed by the browser that took it, back where it left", async () => {
    const { name, token } = await visitor();
    const res = await api("/api/join", "POST", { name, token });
    expect(res.status).toBe(200);
    expect((await res.json()).spawn).toMatchObject({ space: "outdoor" });
  });

  it("keeps qa_ names for the password accounts", async () => {
    expect((await api("/api/join", "POST", { name: "qa_" + freshName().slice(0, 5) })).status).toBe(403);
  });
});

describe("sticky notes", () => {
  it("is still there on the next visit", async () => {
    const { name, token } = await visitor();
    const res = await api("/api/notes", "POST", { token, space: "hub", x: 1.5, z: -2, text: "Anyone doing COMP8020?" });
    expect(res.status).toBe(201);
    const notes = await (await api("/api/notes?space=hub")).json();
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
    const { note } = await (await api("/api/notes", "POST", { token, space: "hub", x: 999, z: -999, text: "edge" })).json();
    expect(note).toMatchObject({ x: 12, z: -9 });
  });

  it("can be removed by its author but not by someone else", async () => {
    const [a, b] = await Promise.all([visitor(), visitor()]);
    const { note } = await (await api("/api/notes", "POST", { token: a.token, space: "outdoor", x: 2, z: 2, text: "mine" })).json();
    expect((await api(`/api/notes/${note.id}`, "DELETE", { token: b.token })).status).toBe(403);
    expect((await api(`/api/notes/${note.id}`, "DELETE", { token: a.token })).status).toBe(200);
    const notes = await (await api("/api/notes?space=outdoor")).json();
    expect(notes.map((n: { id: number }) => n.id)).not.toContain(note.id);
  });

  it("needs a name first", async () => {
    expect((await api("/api/notes", "POST", { token: "nope", space: "hub", x: 0, z: 0, text: "hi" })).status).toBe(401);
  });
});

describe("comments", () => {
  it("can be added to a note and read back, one every 10 seconds", async () => {
    const [a, b] = await Promise.all([visitor(), visitor()]);
    const { note } = await (await api("/api/notes", "POST", { token: a.token, space: "hub", x: 3, z: 3, text: "Study group?" })).json();
    expect((await api(`/api/notes/${note.id}/comments`, "POST", { token: b.token, text: "Count me in" })).status).toBe(201);
    expect((await api(`/api/notes/${note.id}/comments`, "POST", { token: b.token, text: "Again" })).status).toBe(429);
    const comments = await (await api(`/api/notes/${note.id}/comments`)).json();
    expect(comments).toEqual([expect.objectContaining({ author: b.name, text: "Count me in" })]);
  });

  it("allows 100 words, not 101", async () => {
    const [a, b] = await Promise.all([visitor(), visitor()]);
    const { note } = await (await api("/api/notes", "POST", { token: a.token, space: "hub", x: 4, z: 4, text: "q" })).json();
    expect((await api(`/api/notes/${note.id}/comments`, "POST", { token: b.token, text: words(101) })).status).toBe(400);
  });

  it("can be removed by its author but not by the note's author", async () => {
    const [a, b] = await Promise.all([visitor(), visitor()]);
    const { note } = await (await api("/api/notes", "POST", { token: a.token, space: "hub", x: 5, z: 5, text: "q" })).json();
    const comment = await (await api(`/api/notes/${note.id}/comments`, "POST", { token: b.token, text: "reply" })).json();
    expect((await api(`/api/comments/${comment.id}`, "DELETE", { token: a.token })).status).toBe(403);
    expect((await api(`/api/comments/${comment.id}`, "DELETE", { token: b.token })).status).toBe(200);
  });
});
