import { afterAll, describe, expect, it } from "vitest";
import { api, closeAll, visitor } from "./helpers.ts";

// Classrooms: anyone can list them, only the admin opens or closes one, and
// the server checks that (a request made outside the app gets the same
// answer). The admin side needs qa_master's password, so it's exercised on
// the server's own code in rules.test.ts; here an ordinary visitor is refused.

afterAll(closeAll);

describe("classrooms", () => {
  it("lists COMMON first, then COMP8020", async () => {
    const list = (await (await api("/api/classrooms")).json()) as { code: string; space: string }[];
    expect(list[0]).toEqual(expect.objectContaining({ code: "COMMON", space: "common" }));
    expect(list.map((c) => c.code)).toContain("COMP8020");
  });

  it("refuses to let an ordinary visitor open or close one", async () => {
    const v = await visitor();
    expect((await api("/api/classrooms", "POST", { token: v.token, code: "COMP6300" })).status).toBe(403);
    expect((await api("/api/classrooms/COMP8020", "DELETE", { token: v.token })).status).toBe(403);
    expect((await api("/api/classrooms", "POST", { code: "COMP6300" })).status).toBe(401);
    const list = (await (await api("/api/classrooms")).json()) as { code: string }[];
    expect(list.map((c) => c.code)).not.toContain("COMP6300");
    expect(list.map((c) => c.code)).toContain("COMP8020");
  });

  it("lets only the admin set what a classroom's boards open", async () => {
    const v = await visitor();
    const res = await api("/api/classrooms/COMMON/link", "PUT", { token: v.token, which: "board", url: "https://example.com/" });
    expect(res.status).toBe(403);
    expect((await api("/api/classrooms/COMMON/link", "PUT", { which: "board", url: "https://example.com/" })).status).toBe(401);
    const common = ((await (await api("/api/classrooms")).json()) as { code: string; boardUrl: string | null }[]).find((c) => c.code === "COMMON");
    expect(common?.boardUrl).not.toBe("https://example.com/");
  });

  it("serves the classmates' projects list in its shape", async () => {
    const body = (await (await api("/api/projects")).json()) as { projects: unknown[]; checkedAt: unknown };
    expect(Array.isArray(body.projects)).toBe(true);
    expect(body).toHaveProperty("checkedAt");
  });

  it("keeps notes per classroom: one in COMMON isn't in COMP8020", async () => {
    const v = await visitor();
    const res = await api("/api/notes", "POST", { token: v.token, space: "common", x: 0, z: 0, text: "hello common" });
    expect(res.status).toBe(201);
    const { note } = await res.json();
    const there = (await (await api("/api/notes?space=comp8020")).json()) as { id: number }[];
    expect(there.map((n) => n.id)).not.toContain(note.id);
  });
});
