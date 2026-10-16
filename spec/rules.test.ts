import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { checkPassword, hashPassword, mayRemove, textError } from "../server/accounts.ts";
import { captureLog, keepIn, log } from "../server/log.ts";

// Rules that take too long, or need an admin, to check against the running
// app: exercised directly on the server's own code, with a throwaway database.

const dbPath = join(mkdtempSync(join(tmpdir(), "campus-")), "test.db");
process.env.DATABASE_PATH = dbPath;
const db = await import("../server/db.ts");
const raw = new DatabaseSync(dbPath);
// Skip the 30-second wait between notes, which the HTTP spec already checks.
const skipCooldown = (name: string) => raw.prepare("UPDATE visitors SET last_note_at = NULL WHERE name = ?").run(name);

describe("five notes per person per space", () => {
  it("replaces the oldest when a sixth is stuck, and only in that space", () => {
    db.createVisitor("five", "t-five");
    const ids: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = db.addNote("five", "hub", i, 0, `note ${i}`);
      if (!r.ok) throw new Error("cooldown");
      expect(r.replaced).toBeNull();
      ids.push(r.note.id);
      skipCooldown("five");
    }
    const elsewhere = db.addNote("five", "outdoor", 0, 0, "outside");
    expect(elsewhere.ok && elsewhere.replaced).toBeNull();
    skipCooldown("five");

    const sixth = db.addNote("five", "hub", 9, 9, "sixth");
    expect(sixth.ok && sixth.replaced).toBe(ids[0]);
    expect(db.noteCount("five", "hub")).toBe(5);
    expect(db.notesIn("hub").map((n) => n.id)).not.toContain(ids[0]);
    expect(db.noteCount("five", "outdoor")).toBe(1);
  });

  it("deletes a note's comments with it", () => {
    db.createVisitor("owner", "t-owner");
    db.createVisitor("reply", "t-reply");
    const r = db.addNote("owner", "comp8020", 0, 0, "q");
    if (!r.ok) throw new Error("cooldown");
    db.addComment("reply", r.note.id, "a");
    db.deleteNote(r.note.id);
    expect(db.commentsOn(r.note.id)).toEqual([]);
  });
});

describe("who may remove what", () => {
  it("lets authors remove their own and admins remove anyone's", () => {
    expect(mayRemove({ name: "Ann", role: "user" }, "ann")).toBe(true);
    expect(mayRemove({ name: "Bob", role: "user" }, "ann")).toBe(false);
    expect(mayRemove({ name: "qa_master", role: "admin" }, "ann")).toBe(true);
  });
});

describe("passwords and text", () => {
  it("only stores hashes, and checks them", () => {
    const stored = hashPassword("correct horse");
    expect(stored).not.toContain("correct horse");
    expect(checkPassword("correct horse", stored)).toBe(true);
    expect(checkPassword("wrong", stored)).toBe(false);
    expect(checkPassword("anything", null)).toBe(false);
  });

  it("counts words, not characters, up to the character cap", () => {
    expect(textError("one two three")).toBeNull();
    expect(textError("   ")).not.toBeNull();
    expect(textError(Array(101).fill("w").join(" "))).not.toBeNull();
    expect(textError("x".repeat(601))).not.toBeNull();
  });
});

describe("classrooms the admin opens and closes", () => {
  it("opens one, and closing it takes its notes and sends its visitors outside", async () => {
    const spaces = await import("../server/spaces.ts");
    expect(db.addClassroom("COMP6300", "qa_master")).toBe(true);
    expect(db.addClassroom("COMP6300", "qa_master")).toBe(false);
    expect(spaces.isSpace("comp6300")).toBe(true);

    db.createVisitor("pupil", "t-pupil");
    const r = db.addNote("pupil", "comp6300", 0, 0, "hi class");
    if (!r.ok) throw new Error("cooldown");
    db.saveLastSpot("pupil", "comp6300", 1, 2);

    expect(db.removeClassroom("COMP6300")).toBe(true);
    expect(spaces.isSpace("comp6300")).toBe(false);
    expect(db.findNote(r.note.id)).toBeUndefined();
    expect(db.lastSpot("pupil").space).toBe("outdoor");
  });

  it("keeps the links the admin sets for a classroom's boards, and clears them", () => {
    db.addClassroom("COMP6400", "qa_master");
    expect(db.setClassroomLink("COMP6400", "board", "https://example.com/slides")).toBe(true);
    expect(db.setClassroomLink("COMP6400", "side", "https://example.com/forms")).toBe(true);
    const room = db.classroomList().find((c) => c.code === "COMP6400");
    expect(room).toMatchObject({ boardUrl: "https://example.com/slides", sideUrl: "https://example.com/forms" });
    db.setClassroomLink("COMP6400", "board", null);
    expect(db.classroomList().find((c) => c.code === "COMP6400")?.boardUrl).toBeNull();
    expect(db.setClassroomLink("NOPE1234", "board", "https://example.com/")).toBe(false);
    db.removeClassroom("COMP6400");
  });
});

describe("notes last a month", () => {
  it("hides a note past its month at once, and the hourly purge deletes it", () => {
    db.createVisitor("old", "t-old");
    const r = db.addNote("old", "outdoor", -3, -14, "long ago");
    if (!r.ok) throw new Error("cooldown");
    raw.prepare("UPDATE notes SET created_at = datetime('now', '-31 days') WHERE id = ?").run(r.note.id);
    expect(db.findNote(r.note.id)).toBeUndefined();
    expect(db.notesIn("outdoor").map((n) => n.id)).not.toContain(r.note.id);
    expect(db.purgeExpiredNotes()).toBeGreaterThanOrEqual(1);
    expect(raw.prepare("SELECT COUNT(*) AS n FROM notes WHERE id = ?").get(r.note.id)).toEqual({ n: 0 });
  });
});

describe("where a note may go", () => {
  it("anywhere outside but buildings and doors, in classrooms, never in the Hub", async () => {
    const { noteSpotError } = await import("../server/spaces.ts");
    expect(noteSpotError("outdoor", -3, -14)).toBeNull();
    expect(noteSpotError("outdoor", -19, 7)).not.toBeNull(); // inside 155
    expect(noteSpotError("outdoor", 3.4, -8)).not.toBeNull(); // on the dog
    expect(noteSpotError("outdoor", -19.5, -4.6)).not.toBeNull(); // on the lawn noticeboard
    expect(noteSpotError("comp8020", 0, 2)).toBeNull();
    expect(noteSpotError("hub", 0, 0)).not.toBeNull();
  });
});

describe("the admin's seven-day log", () => {
  it("keeps what people wrote, with the IP, and leaves chat, emotes and moves out", () => {
    keepIn(db.addAudit);
    const stop = captureLog(() => {});
    try {
      log("note", { name: "writer", token: "t-writer" }, { space: "outdoor", note: 1 }, { ip: "203.0.113.7", content: "hello lawn" });
      log("chat", { name: "writer", token: "t-writer" }, { space: "outdoor", chars: 5 }, { ip: "203.0.113.7", content: "secret" });
      log("emote", { name: "writer", token: "t-writer" }, { space: "outdoor", kind: "wave" });
      log("enter", { name: "writer", token: "t-writer" }, { from: "outdoor", space: "hub" });
    } finally {
      stop();
    }
    const mine = db.auditEntries({ who: "writer", limit: 50 });
    expect(mine.map((e) => e.event)).toEqual(["note"]);
    expect(mine[0]).toMatchObject({ ip: "203.0.113.7", content: "hello lawn", space: "outdoor" });
    expect(JSON.stringify(mine)).not.toContain("t-writer");
  });

  it("filters by event and forgets entries older than seven days", () => {
    keepIn(db.addAudit);
    const stop = captureLog(() => {});
    try {
      log("refused", { name: "nosy", token: "t-nosy" }, { action: "remove note", reason: "not the author" }, { ip: "198.51.100.2" });
    } finally {
      stop();
    }
    expect(db.auditEntries({ who: "nosy", events: ["refused"], limit: 10 })).toHaveLength(1);
    expect(db.auditEntries({ who: "nosy", events: ["note"], limit: 10 })).toHaveLength(0);
    raw.prepare("UPDATE audit SET at = '2020-01-01T00:00:00.000Z' WHERE who = 'nosy'").run();
    expect(db.auditEntries({ who: "nosy", limit: 10 })).toHaveLength(0);
    db.purgeOldAudit();
    expect(raw.prepare("SELECT COUNT(*) AS n FROM audit WHERE who = 'nosy'").get()).toEqual({ n: 0 });
  });
});
