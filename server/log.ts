// The activity log: one JSON line on stdout per thing a person does, so
// `flyctl logs` (or any terminal running the server) shows who did what,
// where and when, and a misbehaving deploy can be read back afterwards.
//
// Each line names the person by their visitor name and a short tag of their
// browser's token (never the token itself), so two people are told apart even
// when one of them comes back from a second browser. Chat lines record that
// someone spoke and how long it was, never what they said: chat is never
// stored. Positions aren't logged at all (ten a second per person).
//
// Some lines are also kept for the admin, for seven days (db.ts audit): what
// people wrote (notes, comments, posts, and what was removed), sign-ins,
// admin actions, files attached (their names) and refusals. Those keep two
// things stdout never shows: the IP the request came from, and the text
// itself (or the file's name). Moves, emotes, space changes and chat stay out.

import { createHash } from "node:crypto";

export type Event =
  | "join"
  | "join-refused"
  | "connect"
  | "disconnect"
  | "enter"
  | "chat"
  | "emote"
  | "note"
  | "note-replaced"
  | "note-removed"
  | "note-expired"
  | "comment"
  | "comment-removed"
  | "post"
  | "post-edited"
  | "post-removed"
  | "post-expired"
  | "post-comment"
  | "post-comment-edited"
  | "post-comment-removed"
  | "game-join"
  | "classroom-created"
  | "classroom-removed"
  | "classroom-link"
  | "room-invite"
  | "room-closed"
  | "bug-report"
  | "person-report"
  | "file"
  | "restricted"
  | "restriction-lifted"
  | "refused";

/** What the admin's seven-day copy keeps (the rest only goes to stdout). */
const KEPT: ReadonlySet<Event> = new Set<Event>([
  "join",
  "join-refused",
  "connect",
  "disconnect",
  "note",
  "note-replaced",
  "note-removed",
  "note-expired",
  "comment",
  "comment-removed",
  "post",
  "post-edited",
  "post-removed",
  "post-expired",
  "post-comment",
  "post-comment-edited",
  "post-comment-removed",
  "classroom-created",
  "classroom-removed",
  "classroom-link",
  "room-invite",
  "bug-report",
  "person-report",
  "file",
  "restricted",
  "restriction-lifted",
  "refused",
]);

/** Extra for the admin's copy only: where it came from, and the text written or removed. */
export interface Private {
  ip?: string | null;
  content?: string | null;
}

let keep: ((entry: { at: string; event: Event; who: string | null; browser: string | null; role: string | null; ip: string | null; space: string | null; details: Record<string, unknown>; content: string | null }) => void) | null = null;

/** main.ts plugs in the database; the tests and tools that only print leave it out. */
export function keepIn(f: NonNullable<typeof keep>): void {
  keep = f;
}

/** Who did it: a name, and which browser (a hash of the token, not the token). */
export interface Who {
  name: string;
  token?: string;
  role?: string;
}

/** Eight hex characters of the token's hash: enough to tell browsers apart, useless to sign in with. */
export const browserTag = (token: string): string => createHash("sha256").update(token).digest("hex").slice(0, 8);

let sink: (line: string) => void = (line) => process.stdout.write(`${line}\n`);

/** Tests only: catch log lines instead of printing them. */
export function captureLog(f: (line: string) => void): () => void {
  const before = sink;
  sink = f;
  return () => void (sink = before);
}

/** Writes one line: when, who (name, browser, role), what, and any details. */
export function log(event: Event, who: Who | null, details: Record<string, unknown> = {}, extra: Private = {}): void {
  const line: Record<string, unknown> = { at: new Date().toISOString(), event };
  if (who) {
    line.who = who.name;
    if (who.token) line.browser = browserTag(who.token);
    if (who.role && who.role !== "user") line.role = who.role;
  }
  sink(JSON.stringify({ ...line, ...details }));
  if (!keep || !KEPT.has(event)) return;
  const { space, ...rest } = details;
  try {
    keep({
      at: line.at as string,
      event,
      who: (line.who as string | undefined) ?? null,
      browser: (line.browser as string | undefined) ?? null,
      role: (line.role as string | undefined) ?? null,
      ip: extra.ip ?? null,
      space: typeof space === "string" ? space : null,
      details: rest,
      content: extra.content ?? null,
    });
  } catch (err) {
    // The stdout line is already out; a full disk mustn't take the request down with it.
    console.error("audit write failed:", err instanceof Error ? err.message : err);
  }
}
