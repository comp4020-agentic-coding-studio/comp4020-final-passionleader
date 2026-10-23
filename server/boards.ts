import { isClassroom } from "./spaces.ts";

// Every board in one place: which spaces have one, its tabs, and who posts in
// each. Anyone reads every tab and comments anywhere; a tab marked staffOnly
// takes posts from lecturers and staff only (until there's a staff role, the
// admin), checked in main.ts. The client draws its tabs from this
// (GET /api/board-config), so a new board is a new entry here.

export interface BoardTabDef {
  id: string;
  label: string;
  staffOnly?: boolean;
}
export interface BoardDef {
  title: string;
  tabs: readonly BoardTabDef[];
  /** A line under the tabs, e.g. that the board is unofficial. */
  notice?: string;
  /** "grid": posts as thumbnails (a post's first picture, else its title), two a row. */
  layout?: "grid";
  /** Posts go after this many days (the lawn's, like the files in the bucket); unset: they stay. */
  keepDays?: number;
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
  // The noticeboard on the lawn: events, clubs, anything to promote. A
  // poster is for now, so posts go after 30 days, the same as their files.
  outdoor: {
    title: "Lawn noticeboard",
    tabs: [{ id: "board", label: "Noticeboard" }],
    notice: `${UNOFFICIAL} Posts are removed after 30 days.`,
    layout: "grid",
    keepDays: 30,
  },
};

/** The boards whose posts expire, and after how many days. */
export const expiringBoards = (): [string, number][] =>
  Object.entries(FIXED).flatMap(([space, b]) => (b.keepDays ? [[space, b.keepDays] as [string, number]] : []));

export function boardOf(space: unknown): BoardDef | undefined {
  if (typeof space !== "string") return undefined;
  if (isClassroom(space)) return { title: `${space.toUpperCase()} board`, tabs: CLASSROOM_TABS };
  return FIXED[space];
}

export const tabOf = (board: BoardDef, tab: unknown): BoardTabDef | undefined =>
  typeof tab === "string" ? board.tabs.find((t) => t.id === tab) : undefined;

export const mayPostIn = (v: { role: string }, tab: BoardTabDef): boolean => !tab.staffOnly || v.role === "admin";
