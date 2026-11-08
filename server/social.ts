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

/** One knock per student per staff member a minute. */
export const KNOCK_GAP_MS = 60_000;

/** Office hours may name one of the Student Hub's six counselling rooms (1 to 6), or none (null); undefined when it is neither. */
export function validOfficeRoom(v: unknown): number | null | undefined {
  if (v === undefined || v === null) return null;
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 6 ? v : undefined;
}

/** Most people one member may follow. */
export const MAX_FOLLOWS = 20;
/** One "is on the campus" notice per follower and person every ten minutes, so a reload can't nag. */
export const PRESENCE_GAP_MS = 10 * 60_000;

/**
 * Whether a follower is told that the followed person came on. By default only a mutual follow is
 * told; when the followed person turns "only people I follow back" off, anyone who follows them is.
 */
export const mayTell = (followedFollowsBack: boolean, mutualOnly: boolean): boolean => followedFollowsBack || !mutualOnly;
