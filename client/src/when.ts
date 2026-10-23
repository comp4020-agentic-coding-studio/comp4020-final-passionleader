// Times the server stores are UTC: SQLite's "YYYY-MM-DD HH:MM:SS" (no zone)
// or an ISO string. Everyone on campus reads them in Canberra time, whatever
// their own device is set to.

const ZONE = "Australia/Canberra";

/** Parses a stored UTC time; SQLite's form has no zone, so it's read as UTC. */
export function parseUtc(utc: string): Date | null {
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(utc) ? utc : utc.replace(" ", "T") + "Z";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "24 Oct 2026, 2:05 pm" in Canberra time, or the input unchanged if it isn't a time. */
export function canberraTime(utc: string): string {
  const d = parseUtc(utc);
  if (!d) return utc;
  return d.toLocaleString("en-AU", { timeZone: ZONE, day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** "16 Nov" in Canberra time. */
export function canberraDay(d: Date): string {
  return d.toLocaleDateString("en-AU", { timeZone: ZONE, day: "numeric", month: "short" });
}

/** True when both fall on the same Canberra calendar day. */
export function sameCanberraDay(a: Date, b: Date): boolean {
  const day = (d: Date): string => d.toLocaleDateString("en-AU", { timeZone: ZONE });
  return day(a) === day(b);
}
