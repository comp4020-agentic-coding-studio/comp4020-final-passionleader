import { isClassroom } from "./spaces.ts";

// Every board in one place: which spaces have one, its tabs, and who posts in
// each. Anyone reads every tab and comments anywhere; a tab marked staffOnly
// takes posts from staff (signed up as ANU staff) and the admin only,
// checked in main.ts. The client draws its tabs from this
// (GET /api/board-config), so a new board is a new entry here.

export interface BoardTabDef {
  id: string;
  label: string;
  staffOnly?: boolean;
}

// A board's posts are stored under its key, which is its space's id, except
// the enquiry PC behind the Hub's desk: a second board in the Hub, kept as
// "hub-desk" so its posts don't mix with the matching board's.
export interface BoardDef {
  title: string;
  tabs: readonly BoardTabDef[];
  /** A line under the tabs, e.g. that the board is unofficial. */
  notice?: string;
  /** "grid": posts as thumbnails (a post's first picture, else its title), two a row. */
  layout?: "grid";
  /** Posts go after this many days (the lawn's, like the files in the bucket); unset: they stay. */
  keepDays?: number;
  /** Writers may mark a post private: only they and staff (and the admin) see it, and its comments and files. */
  allowPrivate?: boolean;
  /** Where people stand to use it, for live updates (its key, unless set). */
  space?: string;
  /** Posts are study groups: the writer sets how many people (2-20) and others join. */
  groups?: boolean;
  /** A button in the board's header to a page elsewhere (a classroom's: Canvas, plan 98), opened in a new tab. */
  link?: { label: string; url: string };
}

const UNOFFICIAL = "Not an official ANU service. Posters' identities aren't verified.";

const CLASSROOM_TABS: readonly BoardTabDef[] = [
  { id: "qa", label: "Q&A" },
  { id: "notices", label: "Notices", staffOnly: true },
  { id: "board", label: "Board" },
];

const FIXED: Record<string, BoardDef> = {
  // The Student Hub's reception: where labs and students find each other.
  // Questions for the Hub itself go to the enquiry PC behind the desk.
  hub: {
    title: "Lab matching board",
    tabs: [
      { id: "labs", label: "Labs looking for students" },
      { id: "students", label: "Students looking for labs" },
    ],
    notice: UNOFFICIAL,
  },
  // Behind the Hub's desk: questions for the Hub, public or private. A
  // private one is for the writer and staff (and the admin) only, checked on the server for the post, its comments and
  // its files.
  "hub-desk": {
    title: "Ask the Hub",
    tabs: [{ id: "ask", label: "Questions for the Hub" }],
    notice: "Not an official ANU service. Tick \"Private\" and only you and the Hub's staff see your question and the answers.",
    allowPrivate: true,
    space: "hub",
  },
  // The study-group board, outside beside 155's entrance: a post is a group
  // with a size, and anyone joins (or leaves) with a button until it's full.
  // Stored as "study-groups"; its live updates go to the campus outside.
  "study-groups": {
    title: "Study groups",
    tabs: [{ id: "groups", label: "Study groups" }],
    notice: `${UNOFFICIAL} Start a group, say how many people, and others can join.`,
    groups: true,
    space: "outdoor",
  },
  // The advertising board by the lawn: events, clubs, anything to promote.
  // A poster is for now, so posts go after 30 days, the same as their files.
  outdoor: {
    title: "Advertising board",
    tabs: [{ id: "board", label: "Ads" }],
    notice: `${UNOFFICIAL} Posts are removed after 30 days.`,
    layout: "grid",
    keepDays: 30,
  },
};

/** The boards whose posts expire, and after how many days. */
export const expiringBoards = (): [string, number][] =>
  Object.entries(FIXED).flatMap(([space, b]) => (b.keepDays ? [[space, b.keepDays] as [string, number]] : []));

export function boardOf(key: unknown): BoardDef | undefined {
  if (typeof key !== "string") return undefined;
  if (isClassroom(key)) return { title: `${key.toUpperCase()} board`, tabs: CLASSROOM_TABS, link: { label: "Open Canvas", url: "https://canvas.anu.edu.au/" } };
  return Object.hasOwn(FIXED, key) ? FIXED[key] : undefined;
}

/** The space whose people see a board's live updates. */
export const spaceOfBoard = (key: string): string => boardOf(key)?.space ?? key;

/** Staff and the admin (same as db.ts isStaff; kept here so this file needs no database). */
const isStaff = (v: { role: string } | null | undefined): boolean => !!v && (v.role === "staff" || v.role === "admin");

/** Whether `v` may see a post: anyone, unless it's private (then its author and staff). */
export const maySeePost = (v: { name: string; role: string } | null | undefined, post: { author: string; private?: boolean }): boolean =>
  !post.private || isStaff(v) || (!!v && v.name.toLowerCase() === post.author.toLowerCase());

export const tabOf = (board: BoardDef, tab: unknown): BoardTabDef | undefined =>
  typeof tab === "string" ? board.tabs.find((t) => t.id === tab) : undefined;

export const mayPostIn = (v: { role: string }, tab: BoardTabDef): boolean => !tab.staffOnly || isStaff(v);
