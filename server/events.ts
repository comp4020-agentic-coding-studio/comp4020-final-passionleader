import { MAX_TITLE, textError } from "./accounts.ts";

// The events timetable's rules that need no database: what an event may say, how
// long it may run, and how a start time typed in Canberra's clock becomes a moment.
// db.ts stores them; main.ts checks them on each request (the browser's checks
// are only a courtesy).

export const EVENT_MIN_MINUTES = 15;
export const EVENT_MAX_MINUTES = 180;
/** A start time may be at most this far ahead. */
export const EVENT_AHEAD_DAYS = 30;
export const EVENT_COOLDOWN_SECONDS = 30;
/** Events a person may have on the timetable that haven't ended yet. */
export const EVENTS_PER_PERSON = 5;
/** What the timetable and the Campus Guide show as "Coming up". */
export const COMING_UP = 5;

export const TIME_ZONE = "Australia/Canberra";

/** The title, tidied (one line, single spaces), or why it can't be used. Same text rules as a board post. */
export function eventTitle(title: unknown): { ok: true; title: string } | { ok: false; error: string } {
  const bad = textError(title);
  if (bad) return { ok: false, error: bad.replace("Write something first.", "Give it a title.") };
  const clean = (title as string).trim().replace(/\s+/g, " ");
  if (clean.length > MAX_TITLE) return { ok: false, error: `Keep the title under ${MAX_TITLE} characters.` };
  return { ok: true, title: clean };
}

const zone = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Canberra's wall clock at this moment, as "YYYY-MM-DDTHH:mm". */
export function canberraLocal(ms: number): string {
  const p = Object.fromEntries(zone.formatToParts(ms).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** How far Canberra's clock is ahead of UTC at this moment, in ms (daylight saving included). */
function offsetAt(ms: number): number {
  const p = Object.fromEntries(zone.formatToParts(ms).map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!) - Math.floor(ms / 1000) * 1000;
}

/**
 * The moment (epoch seconds) Canberra's clock reads "YYYY-MM-DDTHH:mm", or null when that
 * isn't a real time there (not a date, or the hour daylight saving skips). Where the clock
 * repeats an hour, the first one counts.
 */
export function canberraToEpoch(local: unknown): number | null {
  if (typeof local !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const guess = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  if (Number.isNaN(guess)) return null;
  let utc = guess - offsetAt(guess);
  utc = guess - offsetAt(utc);
  // Round-tripping catches February 30th and the skipped hour.
  if (canberraLocal(utc) !== local) return null;
  return Math.floor(utc / 1000);
}
