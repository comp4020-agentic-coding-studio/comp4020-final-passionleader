import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freshName } from "./helpers.ts";

// Reports on one note, post or comment, and what three of them do: hidden at once for everyone but
// its author and the admin, until the admin restores or removes it. The admin's side needs
// qa_master, whose password isn't known here, so this spec starts a server of its own on a
// throwaway database (seeded with an admin it knows), like rules.test.ts uses its own database.

const dir = mkdtempSync(join(tmpdir(), "review-"));
const dbPath = join(dir, "review.db");
process.env.DATABASE_PATH = dbPath;
const port = 20000 + Math.floor(Math.random() * 20000);
const base = `http://127.0.0.1:${port}`;
let server: ChildProcess;
const ADMIN = "tok-review-admin";

async function call(path: string, method = "GET", body?: unknown): Promise<Response> {
  return fetch(base + path, { method, headers: body === undefined ? undefined : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}
const json = async <T>(path: string, method = "GET", body?: unknown): Promise<T> => (await call(path, method, body)).json() as Promise<T>;

async function member(): Promise<{ name: string; token: string }> {
  const name = freshName();
  const studentNo = `u${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
  expect((await call("/api/signup/start", "POST", { studentNo })).status).toBe(200);
  const mail = await json<{ text: string }>(`/api/test/mail?to=${studentNo}@anu.edu.au`);
  const code = /\b(\d{6})\b/.exec(mail.text)![1]!;
  const res = await call("/api/signup/finish", "POST", { studentNo, code, name, password: "correct horse 1" });
  expect(res.status).toBe(201);
  return { name, ...((await res.json()) as { token: string }) };
}

beforeAll(async () => {
  const db = await import("../server/db.ts");
  const { hashPassword } = await import("../server/accounts.ts");
  db.upsertAccount("qa_master", ADMIN, "admin", hashPassword("not used here"));
  server = spawn(process.execPath, ["server/main.ts"], {
    env: { ...process.env, PORT: String(port), DATABASE_PATH: dbPath, MAIL_TEST_OUTBOX: "1", PROJECTS_CHECK: "0", CRAWL_AUTO: "0" },
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(base + "/api/version");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  throw new Error("the review spec's own server didn't start");
}, 30_000);
afterAll(() => void server?.kill());

const report = (token: string, about: string, item: { kind: string; id: number }) =>
  call("/api/bugs", "POST", { token, text: "This is abusive.", about, item, space: "outdoor" });
const notesFor = async (token?: string) => json<{ id: number; hidden?: boolean }[]>(`/api/notes?space=outdoor${token ? `&token=${token}` : ""}`);

describe("three reports hide it, two don't", () => {
  it("hides a sticky note after three different members report it, but not after two or a repeat", async () => {
    const [author, a, b, c, bystander] = [await member(), await member(), await member(), await member(), await member()];
    const posted = await call("/api/notes", "POST", { token: author.token, space: "outdoor", x: -4, z: 12, text: "rude words" });
    expect(posted.status).toBe(201);
    const note = ((await posted.json()) as { note: { id: number } }).note;
    const item = { kind: "note", id: note.id };

    expect((await report(a.token, author.name, item)).status).toBe(201);
    // The same person again (a minute later in real life) still counts once.
    expect((await report(a.token, author.name, item)).status).toBe(429);
    expect((await report(b.token, author.name, item)).status).toBe(201);
    expect((await notesFor()).map((n) => n.id)).toContain(note.id);

    expect((await report(c.token, author.name, item)).status).toBe(201);
    // Gone for everyone: signed out, another member, a reporter, and a direct ask for its comments.
    expect((await notesFor()).map((n) => n.id)).not.toContain(note.id);
    expect((await notesFor(bystander.token)).map((n) => n.id)).not.toContain(note.id);
    expect((await notesFor(a.token)).map((n) => n.id)).not.toContain(note.id);
    expect((await call(`/api/notes/${note.id}/comments?token=${bystander.token}`)).status).toBe(404);
    expect((await call(`/api/notes/${note.id}/comments`, "POST", { token: bystander.token, text: "hello" })).status).toBe(404);

    // The author still sees it, marked; so does the admin.
    expect((await notesFor(author.token)).find((n) => n.id === note.id)).toMatchObject({ hidden: true });
    expect((await notesFor(ADMIN)).find((n) => n.id === note.id)).toMatchObject({ hidden: true });
    expect((await call(`/api/notes/${note.id}/comments?token=${author.token}`)).status).toBe(200);

    // The admin's list names it and who reported it; a member can't read the list or act on it.
    const list = await json<{ items: { kind: string; id: number; reporters: string[]; author: string }[] }>("/api/admin/hidden", "POST", { token: ADMIN });
    const row = list.items.find((i) => i.kind === "note" && i.id === note.id)!;
    expect(row).toMatchObject({ author: author.name });
    expect(row.reporters.sort()).toEqual([a.name, b.name, c.name].sort());
    expect((await call("/api/admin/hidden", "POST", { token: bystander.token })).status).toBe(403);
    expect((await call(`/api/admin/hidden/note/${note.id}/restore`, "POST", { token: author.token })).status).toBe(403);
    expect((await call(`/api/admin/hidden/note/${note.id}`, "DELETE", { token: author.token })).status).toBe(403);

    // Restore brings it back for everyone, is logged, and stays restored even if reported again.
    expect((await call(`/api/admin/hidden/note/${note.id}/restore`, "POST", { token: ADMIN })).status).toBe(200);
    expect((await notesFor()).find((n) => n.id === note.id)).toBeTruthy();
    expect((await notesFor(bystander.token)).find((n) => n.id === note.id)?.hidden).toBeUndefined();
    const log = await json<{ entries: { event: string; who: string; details: { item?: number } }[] }>("/api/admin/log", "POST", { token: ADMIN, events: ["item-hidden", "item-restored"] });
    expect(log.entries.filter((e) => e.details.item === note.id).map((e) => e.event).sort()).toEqual(["item-hidden", "item-restored"]);
    expect(log.entries.find((e) => e.event === "item-restored")?.who).toBe("qa_master");
    expect((await call(`/api/admin/hidden/note/${note.id}/restore`, "POST", { token: ADMIN })).status).toBe(404);
  }, 30_000);

  it("never counts the author's own, someone else's item, or the same person twice, and Remove deletes it", async () => {
    const [author, other, a, b, c] = [await member(), await member(), await member(), await member(), await member()];
    const posted = (await (await call("/api/notes", "POST", { token: author.token, space: "outdoor", x: 5, z: 12, text: "second" })).json()) as { note: { id: number } };
    const item = { kind: "note", id: posted.note.id };
    expect((await report(author.token, author.name, item)).status).toBe(400); // your own
    expect((await report(a.token, other.name, item)).status).toBe(400); // not theirs
    expect((await report(a.token, author.name, { kind: "note", id: 99999999 })).status).toBe(404);
    for (const m of [a, b, c]) expect((await report(m.token, author.name, item)).status).toBe(201);
    expect((await notesFor()).map((n) => n.id)).not.toContain(posted.note.id);
    expect((await call(`/api/admin/hidden/note/${posted.note.id}`, "DELETE", { token: ADMIN })).status).toBe(200);
    expect((await notesFor(author.token)).map((n) => n.id)).not.toContain(posted.note.id);
    expect((await notesFor(ADMIN)).map((n) => n.id)).not.toContain(posted.note.id);
    const log = await json<{ entries: { event: string; details: { note?: number } }[] }>("/api/admin/log", "POST", { token: ADMIN, events: ["note-removed"] });
    expect(log.entries.some((e) => e.details.note === posted.note.id)).toBe(true);
  }, 30_000);

  it("hides a board post and a comment the same way, for everyone but the author and the admin", async () => {
    const [author, a, b, c, reader] = [await member(), await member(), await member(), await member(), await member()];
    const post = (await (await call("/api/board", "POST", { token: author.token, space: "comp8020", tab: "qa", title: "Spam", text: "buy now" })).json()) as { id: number };
    const nice = (await (await call("/api/board", "POST", { token: reader.token, space: "comp8020", tab: "qa", title: "A fine one", text: "hello" })).json()) as { id: number };
    const ids = async (token?: string) => (await json<{ id: number }[]>(`/api/board?space=comp8020&tab=qa${token ? `&token=${token}` : ""}`)).map((p) => p.id);
    for (const m of [a, b]) expect((await report(m.token, author.name, { kind: "post", id: post.id })).status).toBe(201);
    expect(await ids()).toContain(post.id);
    expect((await report(c.token, author.name, { kind: "post", id: post.id })).status).toBe(201);
    expect(await ids()).not.toContain(post.id);
    expect(await ids(reader.token)).not.toContain(post.id);
    expect(await ids(reader.token)).toContain(nice.id);
    expect(await ids(author.token)).toContain(post.id);
    expect(await ids(ADMIN)).toContain(post.id);
    expect((await call(`/api/board/${post.id}/comments?token=${reader.token}`)).status).toBe(404);
    expect((await call(`/api/board/${post.id}/comments?token=${author.token}`)).status).toBe(200);

    // A comment on the good post, hidden by three reports; the post stays, its count drops.
    const cm = (await (await call(`/api/board/${nice.id}/comments`, "POST", { token: author.token, text: "rude reply" })).json()) as { id: number };
    // Fresh reporters: each member may file one report a minute.
    for (const m of [await member(), await member(), await member()]) expect((await report(m.token, author.name, { kind: "post-comment", id: cm.id })).status).toBe(201);
    const seen = async (token?: string) => (await json<{ id: number }[]>(`/api/board/${nice.id}/comments${token ? `?token=${token}` : ""}`)).map((x) => x.id);
    expect(await seen(reader.token)).not.toContain(cm.id);
    expect(await seen(author.token)).toContain(cm.id);
    expect(await seen(ADMIN)).toContain(cm.id);
    expect((await json<{ id: number; comments: number }[]>(`/api/board?space=comp8020&tab=qa`)).find((p) => p.id === nice.id)?.comments).toBe(0);

    // Both wait on the admin's list; restoring the post leaves the comment hidden.
    const list = await json<{ items: { kind: string; id: number }[] }>("/api/admin/hidden", "POST", { token: ADMIN });
    expect(list.items.map((i) => `${i.kind}:${i.id}`)).toEqual(expect.arrayContaining([`post:${post.id}`, `post-comment:${cm.id}`]));
    expect((await call(`/api/admin/hidden/post/${post.id}/restore`, "POST", { token: ADMIN })).status).toBe(200);
    expect(await ids(reader.token)).toContain(post.id);
    expect(await seen(reader.token)).not.toContain(cm.id);
  }, 40_000);

  it("hides a comment on a sticky note too", async () => {
    const [author, a, b, c, reader] = [await member(), await member(), await member(), await member(), await member()];
    const note = ((await (await call("/api/notes", "POST", { token: reader.token, space: "outdoor", x: 9, z: 12, text: "a fine note" })).json()) as { note: { id: number } }).note;
    const cm = (await (await call(`/api/notes/${note.id}/comments`, "POST", { token: author.token, text: "rude reply" })).json()) as { id: number };
    for (const m of [a, b, c]) expect((await report(m.token, author.name, { kind: "comment", id: cm.id })).status).toBe(201);
    const seen = async (token?: string) => (await json<{ id: number }[]>(`/api/notes/${note.id}/comments${token ? `?token=${token}` : ""}`)).map((x) => x.id);
    expect(await seen(reader.token)).not.toContain(cm.id);
    expect(await seen(author.token)).toContain(cm.id);
    expect(await seen(ADMIN)).toContain(cm.id);
    expect((await notesFor()).find((n) => n.id === note.id)).toMatchObject({ comments: 0 });
    expect((await call(`/api/admin/hidden/comment/${cm.id}/restore`, "POST", { token: ADMIN })).status).toBe(200);
    expect(await seen(reader.token)).toContain(cm.id);
  }, 40_000);
});
