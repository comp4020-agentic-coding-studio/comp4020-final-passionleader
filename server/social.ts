// Interest tags, following and office hours: the fixed lists and the pure rules, kept apart from
// the database and the sockets so the specs and the code read the same rule. Nothing here is free
// text: a person picks from these lists and the server checks every pick against them.

/** Most interest tags one member may show. */
export const MAX_TAGS = 3;

/** Course codes the campus knows, then interests. The client draws exactly these, as sent by /api/tags. */
export const COURSE_TAGS = ["COMP1100", "COMP1110", "COMP2100", "COMP2300", "COMP3600", "COMP4020", "COMP8020"] as const;
export const INTEREST_TAGS = [
  "badminton", "gym", "music", "coffee", "gaming", "hiking", "photography", "AI",
  "web dev", "research", "internships", "exchange", "cooking", "reading", "languages",
] as const;
const TAG_SET: ReadonlySet<string> = new Set<string>([...COURSE_TAGS, ...INTEREST_TAGS]);

/** The tags if every one is on the list, none repeats and there are at most three; else null. */
export function validTags(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length > MAX_TAGS) return null;
  if (!v.every((t) => typeof t === "string" && TAG_SET.has(t))) return null;
  return new Set(v).size === v.length ? (v as string[]) : null;
}
