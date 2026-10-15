import { describe, expect, it } from "vitest";
import { browserTag, captureLog, log } from "../server/log.ts";

// The activity log is what the crit is narrated from, so its shape is a
// contract: every line is JSON with a time, an event and who did it, two
// browsers are told apart, and nothing secret or private gets in.

function lines(f: () => void): Record<string, unknown>[] {
  const out: string[] = [];
  const stop = captureLog((l) => out.push(l));
  try {
    f();
  } finally {
    stop();
  }
  return out.map((l) => JSON.parse(l));
}

describe("activity log", () => {
  it("writes one JSON line with when, what and who", () => {
    const [line] = lines(() => log("note", { name: "ann", token: "secret-token-a" }, { space: "hub", note: 7 }));
    expect(line).toMatchObject({ event: "note", who: "ann", space: "hub", note: 7 });
    expect(Number.isNaN(Date.parse(line!.at as string))).toBe(false);
  });

  it("tells two browsers apart without ever writing the token", () => {
    const out = lines(() => {
      log("connect", { name: "ann", token: "secret-token-a" });
      log("connect", { name: "bob", token: "secret-token-b" });
    });
    expect(out[0]!.browser).not.toBe(out[1]!.browser);
    expect(out[0]!.browser).toBe(browserTag("secret-token-a"));
    expect(JSON.stringify(out)).not.toContain("secret-token");
  });

  it("marks the admin, and leaves ordinary users unmarked", () => {
    const [admin, user] = lines(() => {
      log("classroom-created", { name: "qa_master", token: "t1", role: "admin" }, { code: "COMP6300" });
      log("chat", { name: "ann", token: "t2", role: "user" }, { chars: 5 });
    });
    expect(admin!.role).toBe("admin");
    expect(user!.role).toBeUndefined();
  });
});
