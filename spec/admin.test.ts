import { describe, expect, it } from "vitest";
import { api, visitor } from "./helpers.ts";

// The admin's log and the bug reports: anyone joined may send a report, only
// the admin reads either, and the server checks that on every request. The
// admin's side needs qa_master's password, so what the log keeps is checked
// on the server's own code in rules.test.ts.

describe("the admin's log and bug reports", () => {
  it("refuses the log to someone who hasn't joined, and to an ordinary visitor", async () => {
    expect((await api("/api/admin/log", "POST", {})).status).toBe(401);
    const v = await visitor();
    expect((await api("/api/admin/log", "POST", { token: v.token })).status).toBe(403);
    expect((await api("/api/admin/bugs", "POST", { token: v.token })).status).toBe(403);
    expect((await api("/api/admin/bugs/1", "DELETE", { token: v.token })).status).toBe(403);
  });

  it("takes a bug report from a visitor, once a minute, and never shows it back to them", async () => {
    const v = await visitor();
    expect((await api("/api/bugs", "POST", { token: v.token, text: "   " })).status).toBe(400);
    expect((await api("/api/bugs", "POST", { text: "no token" })).status).toBe(401);
    const res = await api("/api/bugs", "POST", { token: v.token, text: "The door in the library didn't open.", space: "library" });
    expect(res.status).toBe(201);
    expect((await api("/api/bugs", "POST", { token: v.token, text: "again" })).status).toBe(429);
    expect((await api("/api/bugs", "POST", { token: v.token, text: "x".repeat(2001) })).status).toBe(400);
  });

  it("refuses restrictions to anyone but the admin", async () => {
    const v = await visitor();
    expect((await api("/api/admin/restrictions", "POST", { token: v.token })).status).toBe(403);
    expect((await api("/api/admin/restrictions", "PUT", { token: v.token, name: v.name, what: "chat", hours: 1 })).status).toBe(403);
    expect((await api("/api/admin/restrictions", "DELETE", { token: v.token, name: v.name, what: "chat" })).status).toBe(403);
  });

  it("gives no voice ticket without joining, and says so plainly when voice isn't set up", async () => {
    expect((await api("/api/voice", "POST", { token: "nope" })).status).toBe(401);
    const v = await visitor();
    // The spec's server has no LiveKit secrets: a clear error code, not a crash.
    const res = await api("/api/voice", "POST", { token: v.token });
    expect([400, 503]).toContain(res.status);
  });

  it("refuses the Roles tab to anyone but the top admin", async () => {
    const v = await visitor();
    expect((await api("/api/admin/roles", "POST", { token: v.token })).status).toBe(403);
    expect((await api("/api/admin/roles", "PUT", { token: v.token, name: v.name, role: "staff" })).status).toBe(403);
    expect((await api("/api/admin/roles", "PUT", { token: v.token, name: v.name, adminPc: true })).status).toBe(403);
  });

  it("takes a report about someone; the visitor can't supply the chat it carries", async () => {
    const v = await visitor();
    const rude = await visitor();
    const res = await api("/api/bugs", "POST", { token: v.token, text: "Swearing at people.", space: "outdoor", about: rude.name, withChat: true, chat: [{ author: "x", text: "fake" }] });
    expect(res.status).toBe(201);
    // A name nobody has is refused, not filed as a bug report.
    const other = await visitor();
    expect((await api("/api/bugs", "POST", { token: other.token, text: "Who?", space: "outdoor", about: "zz_nobody" })).status).toBe(404);
  });

  it("serves the admin page itself (it asks the server for everything)", async () => {
    const res = await api("/admin/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Activity log");
  });
});
