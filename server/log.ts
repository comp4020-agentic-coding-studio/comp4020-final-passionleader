// The activity log: one JSON line on stdout per thing a person does, so
// `flyctl logs` (or any terminal running the server) shows who did what,
// where and when, and a misbehaving deploy can be read back afterwards.
//
// Each line names the person by their visitor name and a short tag of their
// browser's token (never the token itself), so two people are told apart even
// when one of them comes back from a second browser. Chat lines record that
// someone spoke and how long it was, never what they said: chat is never
// stored. Positions aren't logged at all (ten a second per person).

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
  | "post-removed"
  | "post-comment"
  | "post-comment-removed"
  | "game-join"
  | "classroom-created"
  | "classroom-removed"
  | "room-invite"
  | "room-closed"
  | "refused";

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
export function log(event: Event, who: Who | null, details: Record<string, unknown> = {}): void {
  const line: Record<string, unknown> = { at: new Date().toISOString(), event };
  if (who) {
    line.who = who.name;
    if (who.token) line.browser = browserTag(who.token);
    if (who.role && who.role !== "user") line.role = who.role;
  }
  sink(JSON.stringify({ ...line, ...details }));
}
