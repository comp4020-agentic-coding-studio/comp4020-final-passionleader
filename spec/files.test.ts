import { afterEach, describe, expect, it } from "vitest";
import { cleanName, fileError, keyFor, s3Message } from "../server/files.ts";
import { api, closeAll, connect, visitor } from "./helpers.ts";

// Attached files: a screenshot on a bug report, files on a board post, and
// files shared in a meeting room. Whether S3 is set up depends on where the
// app runs (CI has no AWS keys), so these check what the server decides
// before it ever asks S3: who may attach what, to what, of which type and
// size, and that without S3 the answer is the "tell the admin" message.

afterEach(closeAll);

const ask = (token: string | undefined, target: Record<string, unknown>, name: string, size: number) =>
  api("/api/files", "POST", { token, ...target, name, size });

describe("which files may be uploaded", () => {
  it("takes images, PDF, documents and zips up to 200 MB, and nothing that runs", () => {
    for (const name of ["a.png", "b.JPG", "c.pdf", "notes.md", "d.docx", "e.pptx", "f.xlsx", "g.zip", "h.txt"]) {
      expect(fileError("board", name, 1000)).toBeNull();
    }
    for (const name of ["setup.exe", "page.html", "page.htm", "run.sh", "x.js", "x.svg", "noext", "a.bat", "a.msi", "a.apk"]) {
      expect(fileError("board", name, 1000)).not.toBeNull();
    }
    expect(fileError("board", "big.zip", 200 * 1024 * 1024)).toBeNull();
    expect(fileError("board", "big.zip", 200 * 1024 * 1024 + 1)).toMatch(/200 MB/);
    expect(fileError("board", "empty.txt", 0)).not.toBeNull();
    // A bug report's screenshot must be an image.
    expect(fileError("bug", "shot.png", 1000)).toBeNull();
    expect(fileError("bug", "log.txt", 1000)).toMatch(/image/);
  });

  it("keeps names to a plain file name, and keys under the right folder", () => {
    expect(cleanName("../../etc/passwd.txt")).toBe("passwd.txt");
    expect(cleanName('C:\\Users\\me\\"slides".pptx')).toBe("slides.pptx");
    expect(cleanName("")).toBeNull();
    expect(cleanName("x".repeat(121))).toBeNull();
    expect(keyFor("bug", "id1", "a.PNG")).toBe("bug-shots/id1.png");
    expect(keyFor("board", "id2", "b.pdf")).toBe("board-files/id2.pdf");
    expect(keyFor("room", "id3", "c.zip")).toBe("room-files/id3.zip");
    expect(s3Message("S3-CONFIG")).toBe("Uploads aren't available right now. Please tell the admin. Error code: S3-CONFIG");
  });
});

describe("who may attach what", () => {
  it("refuses an upload from someone who hasn't joined, and a type that isn't allowed", async () => {
    expect((await ask(undefined, { kind: "board", post: 1 }, "a.pdf", 10)).status).toBe(401);
    const v = await visitor();
    expect((await ask(v.token, { kind: "board", post: 1 }, "a.exe", 10)).status).toBe(400);
    expect((await ask(v.token, { kind: "board", post: 1 }, "a.zip", 200 * 1024 * 1024 + 1)).status).toBe(400);
    expect((await ask(v.token, { kind: "nothing" }, "a.png", 10)).status).toBe(400);
  });

  it("lets a screenshot onto your own bug report only", async () => {
    const [a, b] = await Promise.all([visitor(), visitor()]);
    const res = await api("/api/bugs", "POST", { token: a.token, text: "spec: a report with a screenshot" });
    const { id } = await res.json();
    expect((await ask(b.token, { kind: "bug", bug: id }, "shot.png", 10)).status).toBe(403);
    // The author gets a link if S3 is set up here, or the "tell the admin" message if not.
    const mine = await ask(a.token, { kind: "bug", bug: id }, "shot.png", 10);
    expect([201, 503]).toContain(mine.status);
    if (mine.status === 503) expect((await mine.json()).error).toMatch(/Please tell the admin\. Error code: S3-/);
  });

  it("lets files onto your own board post only", async () => {
    const [a, b] = await Promise.all([visitor(), visitor()]);
    const res = await api("/api/board", "POST", { token: a.token, space: "comp8020", tab: "board", title: "spec: files", text: "a post with a file" });
    expect(res.status).toBe(201);
    const post = await res.json();
    expect((await ask(b.token, { kind: "board", post: post.id }, "slides.pdf", 10)).status).toBe(403);
    expect([201, 503]).toContain((await ask(a.token, { kind: "board", post: post.id }, "slides.pdf", 10)).status);
    await api(`/api/board/${post.id}`, "DELETE", { token: a.token });
  });

  it("shares files in a meeting room only from inside one", async () => {
    const v = await visitor();
    const s = await connect(v.token);
    await s.next((m) => m.t === "welcome");
    // Outside, on the campus: refused.
    expect((await ask(v.token, { kind: "room" }, "notes.pdf", 10)).status).toBe(403);
    s.send({ t: "enter", space: "team-library-3", x: 0, z: 0 });
    await s.next((m) => m.t === "action" && m.kind === "room-open");
    expect([201, 503]).toContain((await ask(v.token, { kind: "room" }, "notes.pdf", 10)).status);
  });

  it("never hands out a file that isn't there", async () => {
    const v = await visitor();
    expect((await api("/api/files/not-a-file/link", "POST", { token: v.token })).status).toBe(404);
    expect((await api("/api/files/not-a-file/done", "POST", { token: v.token })).status).toBe(404);
  });
});
