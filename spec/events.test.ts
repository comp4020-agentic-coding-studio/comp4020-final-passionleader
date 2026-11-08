import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { canberraLocal, canberraToEpoch } from "../server/events.ts";
import { api, guest, staffMember, visitor } from "./helpers.ts";

// The events timetable: a member puts an event on (title up to 80, a space that isn't a meeting
// room, a start in Canberra time within the next 30 days, 15 to 180 minutes), one every 30
// seconds and five upcoming at most; the author or the admin removes it. Checked on the server.

/** A Canberra date and time `minutes` from now, the way the browser's picker sends it. */
const inMinutes = (minutes: number): string => canberraLocal(Date.now() + minutes * 60_000);
const good = (over: Record<string, unknown> = {}) => ({ title: "Study session", space: "library", start: inMinutes(120), minutes: 60, ...over });

describe("Canberra time", () => {
  it("reads a Canberra wall time as the right moment, summer and winter, and refuses times that don't exist", () => {
    // AEDT (UTC+11) in November, AEST (UTC+10) in June.
    expect(new Date(canberraToEpoch("2026-11-12T14:30")! * 1000).toISOString()).toBe("2026-11-12T03:30:00.000Z");
    expect(new Date(canberraToEpoch("2026-06-12T14:30")! * 1000).toISOString()).toBe("2026-06-12T04:30:00.000Z");
    expect(canberraToEpoch("2026-02-30T10:00")).toBeNull();
    // 2:30 on 4 October 2026 never happens in Canberra: the clocks jump from 2:00 to 3:00.
    expect(canberraToEpoch("2026-10-04T02:30")).toBeNull();
    expect(canberraToEpoch("tomorrow")).toBeNull();
    expect(canberraToEpoch(12345)).toBeNull();
  });
});

describe("posting an event", () => {
  it("takes an event from a member, lists it to anyone, and lets only its author (or the admin) remove it", async () => {
    const a = await visitor();
    const b = await visitor();
    const res = await api("/api/events", "POST", { token: a.token, ...good() });
    expect(res.status).toBe(201);
    const made = (await res.json()) as { id: number; title: string; start: number; end: number; author: string };
    expect(made).toMatchObject({ title: "Study session", author: a.name });
    expect(made.end - made.start).toBe(3600);
    // Anyone reads the timetable, signed in or not.
    const list = (await (await api("/api/events")).json()) as { events: { id: number }[]; spaces: { id: string }[] };
    expect(list.events.map((e) => e.id)).toContain(made.id);
    expect(list.spaces.map((s) => s.id)).toContain("library");
    expect(list.spaces.map((s) => s.id)).not.toContain("team-library-1");
    expect(list.spaces.map((s) => s.id)).not.toContain("poop");
    // Someone else can't remove it; the author can.
    expect((await api(`/api/events/${made.id}`, "DELETE", { token: b.token })).status).toBe(403);
    expect((await api(`/api/events/${made.id}`, "DELETE", { token: a.token })).status).toBe(200);
    expect((await api(`/api/events/${made.id}`, "DELETE", { token: a.token })).status).toBe(404);
  });

  it("refuses a guest, someone who hasn't joined, and staff are fine", async () => {
    const g = await guest();
    expect((await api("/api/events", "POST", { token: g.token, ...good() })).status).toBe(403);
    expect((await api("/api/events", "POST", good())).status).toBe(401);
    const s = await staffMember();
    expect((await api("/api/events", "POST", { token: s.token, ...good() })).status).toBe(201);
  });

  it("refuses a past time, more than 30 days ahead, and a time that isn't a Canberra time", async () => {
    const a = await visitor();
    const past = await api("/api/events", "POST", { token: a.token, ...good({ start: inMinutes(-90) }) });
    expect(past.status).toBe(400);
    expect(((await past.json()) as { error: string }).error).toMatch(/passed/);
    expect((await api("/api/events", "POST", { token: a.token, ...good({ start: inMinutes(31 * 24 * 60) }) })).status).toBe(400);
    expect((await api("/api/events", "POST", { token: a.token, ...good({ start: "next Tuesday" }) })).status).toBe(400);
    expect((await api("/api/events", "POST", { token: a.token, ...good({ start: undefined }) })).status).toBe(400);
  });

  it("keeps to the title, place and length rules", async () => {
    const a = await visitor();
    for (const bad of [
      good({ title: "" }),
      good({ title: "   " }),
      good({ title: "x".repeat(81) }),
      good({ title: 42 }),
      good({ space: "team-library-1" }), // a meeting room
      good({ space: "counsel-1" }),
      good({ space: "nowhere" }),
      good({ space: "poop" }),
      good({ minutes: 14 }),
      good({ minutes: 181 }),
      good({ minutes: 30.5 }),
      good({ minutes: "60" }),
    ])
      expect((await api("/api/events", "POST", { token: a.token, ...bad })).status, JSON.stringify(bad)).toBe(400);
    // The edges are fine: an 80-character title, 15 and 180 minutes (one at a time: 30 s apart).
    expect((await api("/api/events", "POST", { token: a.token, ...good({ title: "y".repeat(80), minutes: 15 }) })).status).toBe(201);
  });

  it("allows one event every 30 seconds", async () => {
    const a = await visitor();
    expect((await api("/api/events", "POST", { token: a.token, ...good() })).status).toBe(201);
    const again = await api("/api/events", "POST", { token: a.token, ...good({ title: "Second" }) });
    expect(again.status).toBe(429);
    expect(((await again.json()) as { wait: number }).wait).toBeGreaterThan(0);
  });
});

// The limit of five takes five 30-second gaps over HTTP, so it is checked on the database's
// own code with the wait skipped, the way rules.test.ts does for sticky notes.
const dbPath = join(mkdtempSync(join(tmpdir(), "campus-events-")), "test.db");
process.env.DATABASE_PATH = dbPath;
const db = await import("../server/db.ts");
const raw = new DatabaseSync(dbPath);

describe("five upcoming events per person", () => {
  it("refuses the sixth, counts only the ones that haven't ended, and frees a place when one is removed", () => {
    db.createVisitor("planner", "t-planner");
    const now = Math.floor(Date.now() / 1000);
    const ids: number[] = [];
    for (let i = 0; i < 5; i++) {
      raw.prepare("UPDATE visitors SET last_event_at = NULL WHERE name = 'planner'").run();
      const r = db.addEvent("planner", "hub", `Event ${i}`, now + 3600 * (i + 1), now + 3600 * (i + 1) + 1800);
      expect(r.ok).toBe(true);
      if (r.ok) ids.push(r.event.id);
    }
    raw.prepare("UPDATE visitors SET last_event_at = NULL WHERE name = 'planner'").run();
    expect(db.addEvent("planner", "hub", "Sixth", now + 99_999, now + 100_999)).toEqual({ ok: false, why: "full" });
    // One removed: there is room again.
    db.deleteEvent(ids[0]!);
    raw.prepare("UPDATE visitors SET last_event_at = NULL WHERE name = 'planner'").run();
    expect(db.addEvent("planner", "hub", "Sixth", now + 99_999, now + 100_999).ok).toBe(true);
    // One that has ended no longer counts, and the purge deletes it.
    raw.prepare("UPDATE events SET starts_at = ?, ends_at = ? WHERE id = ?").run(now - 7200, now - 3600, ids[1]);
    expect(db.upcomingEventCount("planner")).toBe(4);
    expect(db.eventsNow().map((e) => e.id)).not.toContain(ids[1]);
    expect(db.purgeEndedEvents()).toBe(1);
    expect(raw.prepare("SELECT COUNT(*) AS n FROM events WHERE id = ?").get(ids[1])).toEqual({ n: 0 });
  });
});
