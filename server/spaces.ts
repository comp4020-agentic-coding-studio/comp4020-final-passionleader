// The places you can be, and how far each one reaches. The client draws them
// (client/src/spaces/); the server only needs their names and bounds, so it
// can refuse a space that doesn't exist and clamp a position that wanders
// outside one. Doors between spaces are the client's business.
//
// Three kinds: the fixed spaces (the campus outside, the Student Hub, the
// library), classrooms in building 155, which the admin adds and removes
// (db.ts keeps the list), and meeting rooms off some of those (below). Every
// classroom is the same room; its space id is its course code in lower case
// ("comp8020"), so notes and last spots key on that.

export type SpaceId = string;

export interface Area {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Space {
  label: string;
  halfX: number;
  halfZ: number;
  /** Where you can walk, if not the whole halfX x halfZ rectangle. */
  areas?: Area[];
  spawn: { x: number; z: number };
}

// Outside: the lawn and the road north of it, the road in front of the
// O'Donoghue centre, and the path south between 155 and 154, over the bridge
// to the library's door, and west along University Avenue over the creek's
// bridge. Same as OUTDOOR_AREAS in client/src/spaces/outdoor.ts (creek.ts).
const OUTDOOR_AREAS: Area[] = [
  { minX: -51.8, maxX: 5, minZ: -39.4, maxZ: -2 }, // the lawn, carried west to Sullivans Creek's bank
  { minX: 5, maxX: 26, minZ: -39.4, maxZ: -20 },
  { minX: -9.6, maxX: 5.4, minZ: -2, maxZ: 22 },
  { minX: -61.4, maxX: -50.8, minZ: -36.8, maxZ: -32.2 }, // the footbridge's deck
  { minX: -73, maxX: -60.4, minZ: -38, maxZ: -31 }, // the far bank's path
];

export const SPACES: Record<string, Space> = {
  outdoor: { label: "ANU campus", halfX: 73, halfZ: 40, areas: OUTDOOR_AREAS, spawn: { x: -6, z: 10 } },
  hub: { label: "Student Hub", halfX: 20, halfZ: 13, spawn: { x: 0, z: 9 } },
  library: { label: "Chifley Library", halfX: 16, halfZ: 11, spawn: { x: 0, z: -8.5 } },
  // On 154's ground floor, north of the Hub's door (client/src/spaces/anusa.ts).
  anusa: { label: "ANUSA Student Lounge", halfX: 10, halfZ: 7, spawn: { x: -8.4, z: 5 } },
  // An easter egg (plan 62): crit 8's Poop Room, behind a "Staff only" door
  // at the far end of Lab Coffee (client/src/spaces/poop.ts).
  poop: { label: "a small room", halfX: 6, halfZ: 4.5, spawn: { x: 0, z: 2.4 } },
};

/** Every classroom's bounds (client/src/spaces/classroom.ts). */
export const CLASSROOM: Omit<Space, "label"> = { halfX: 10, halfZ: 8, spawn: { x: 0, z: 5.5 } };

// Course codes like COMP6300 or MGMP2222 (four letters, four digits). The
// old COMMON "classroom for anyone" is gone: the ANUSA Student Lounge took its place.
export const CLASSROOM_CODE = /^[A-Z]{4}[0-9]{4}$/;
export const OLD_COMMON = "COMMON";

const classrooms = new Map<SpaceId, string>(); // space id -> course code

/** db.ts tells this module which classrooms exist, at start and on each change. */
export function setClassrooms(codes: string[]): void {
  classrooms.clear();
  for (const code of codes) classrooms.set(classroomSpace(code), code);
}

export const classroomSpace = (code: string): SpaceId => code.toLowerCase();

// First-timers start outside, on the path between the two buildings.
export const FIRST_SPACE: SpaceId = "outdoor";

export function spaceInfo(id: SpaceId): Space | undefined {
  if (Object.hasOwn(SPACES, id)) return SPACES[id];
  const code = classrooms.get(id);
  if (code) return { label: `${code} classroom`, ...CLASSROOM };
  return roomOf(id) ? { label: "meeting room", ...ROOM } : undefined;
}

// --- meeting rooms -----------------------------------------------------------
// Small rooms off a bigger space, each a space of its own so its people and
// its chat stay in it: six counselling rooms off the Student Hub (invite-only),
// three team rooms off every classroom and four off the library (open to
// anyone). Six people at most. realtime.ts decides who gets in. The door
// spots are the client's too (client/src/spaces/meeting.ts).

export const ROOM_CAP = 6;
export const ROOM: Omit<Space, "label"> = { halfX: 5, halfZ: 4, spawn: { x: 0, z: -2 } };
const COUNSEL_DOORS = [-10, -6, -2, 2, 6, 10].map((z) => ({ x: 18.9, z }));
const CLASSROOM_TEAM_DOORS = [-3, 0.5, 4].map((z) => ({ x: -8.9, z }));
const LIBRARY_TEAM_DOORS = [
  { x: -14.9, z: -1.5 },
  { x: -14.9, z: 2.5 },
  { x: 14.9, z: -1.5 },
  { x: 14.9, z: 2.5 },
];
// The ANUSA Student Lounge's two meeting rooms, on its east wall (client/src/spaces/anusa.ts).
const ANUSA_TEAM_DOORS = [
  { x: 8.9, z: -2.5 },
  { x: 8.9, z: 5.2 },
];

export interface Room {
  kind: "counselling" | "team";
  /** The space its door is in, where you go when you leave. */
  parent: SpaceId;
  /** Where its door is, in the parent space. */
  door: { x: number; z: number };
}

/** The meeting room behind a space id ("counsel-3", "team-comp8020-1", "team-library-5"), if it is one. */
export function roomOf(id: unknown): Room | undefined {
  if (typeof id !== "string") return undefined;
  const counsel = /^counsel-([1-9])$/.exec(id);
  if (counsel) {
    const door = COUNSEL_DOORS[Number(counsel[1]) - 1];
    return door && { kind: "counselling", parent: "hub", door };
  }
  const team = /^team-([a-z0-9]+)-([1-9])$/.exec(id);
  if (!team) return undefined;
  const parent = team[1]!;
  const doors = parent === "library" ? LIBRARY_TEAM_DOORS : parent === "anusa" ? ANUSA_TEAM_DOORS : classrooms.has(parent) ? CLASSROOM_TEAM_DOORS : [];
  const door = doors[Number(team[2]) - 1];
  return door && { kind: "team", parent, door };
}

/** The team rooms off a classroom, so closing it can empty them too. */
export const teamRoomsOf = (classroom: SpaceId): SpaceId[] => CLASSROOM_TEAM_DOORS.map((_, i) => `team-${classroom}-${i + 1}`);

export const isSpace = (s: unknown): s is SpaceId => typeof s === "string" && spaceInfo(s) !== undefined;
export const isClassroom = (s: unknown): s is SpaceId => typeof s === "string" && classrooms.has(s);

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

export function clampTo(space: SpaceId, x: number, z: number): { x: number; z: number } {
  const info = spaceInfo(space) ?? SPACES[FIRST_SPACE]!;
  const { halfX, halfZ, areas } = info;
  return clampToAreas(areas ?? [{ minX: -halfX, maxX: halfX, minZ: -halfZ, maxZ: halfZ }], x, z);
}

/** The nearest point that lies in one of `areas` (the point itself if it already does). */
export function clampToAreas(areas: Area[], x: number, z: number): { x: number; z: number } {
  let best = { x, z };
  let bestD = Infinity;
  for (const a of areas) {
    const p = { x: clamp(x, a.minX, a.maxX), z: clamp(z, a.minZ, a.maxZ) };
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bestD) [best, bestD] = [p, d];
  }
  return best;
}

// --- where a sticky note may go --------------------------------------------
// Anywhere but the Student Hub, which is for sitting together, not papering.
// Outside, never inside a building's footprint; everywhere, never within 2 m
// of something you press E at (a door, the whiteboard, the dog), so a note
// can't hide it or fight it for the E key. The client checks the same spots
// first (client/src/main.ts noteSpotError), so people get told straight away.

export const NOTE_CLEARANCE = 2;
export const NO_NOTE_SPACES: ReadonlySet<SpaceId> = new Set(["hub", "anusa", "poop"]);
const BUILDINGS: Area[] = [
  { minX: -28, maxX: -10, minZ: -2, maxZ: 16 }, // 155
  { minX: 6, maxX: 26, minZ: -20, maxZ: 14 }, // 154
  { minX: -45, maxX: -33, minZ: -2, maxZ: 16 }, // Badger & Co (client/src/spaces/creek.ts)
];
const OUTDOOR_KEEP_CLEAR: { x: number; z: number }[] = [
  { x: -8.6, z: 7 }, // 155's door
  { x: 4.6, z: 3 }, // 154's door
  { x: 4.6, z: -5 }, // the ANUSA Student Lounge's door, north of the Hub's
  { x: -8.6, z: 2.3 }, // the study-group board beside 155's door (client/src/spaces/outdoor.ts STUDY_BOARD)
  { x: 24.5, z: -21 }, // a "Staff only" door at Lab Coffee's far end (the easter egg)
  { x: 3.4, z: -9 }, // the dog in front of 154 (client/src/spaces/dog.ts)
  { x: -2, z: 21.6 }, // Chifley Library's front door (E at the end of the bridge)
  { x: 1.75, z: -31.6 }, // the lawn noticeboard, south of the bed east of Broger's (client/src/spaces/outdoor.ts LAWN_BOARD)
  { x: 12, z: -21.4 }, // Lab Coffee's menu board (client/src/spaces/labcoffee.ts CAFE_MENU)
  { x: -26, z: -30.2 }, // ANU Sport's tent PC (client/src/spaces/sportstent.ts SPORT_PC)
  { x: -24.8, z: -28.8 }, // in front of ANU Sport's assistant (server/npcs.ts)
];
const LIBRARY_KEEP_CLEAR: { x: number; z: number }[] = [
  { x: 0, z: -9.9 }, // the way out, on the north wall
  // The search computers south of reception (client/src/spaces/library.ts
  // COMPUTERS: x -9, z -4), used from their south side.
  { x: -11, z: -2.8 },
  { x: -9, z: -2.8 },
  { x: -7, z: -2.8 },
  { x: -9, z: -5.7 }, // in front of the library's assistant (server/npcs.ts)
  ...LIBRARY_TEAM_DOORS,
];
const CLASSROOM_KEEP_CLEAR: { x: number; z: number }[] = [
  { x: 8.9, z: 6 }, // the way out
  { x: 0, z: -6.7 }, // the whiteboard
  { x: -6.4, z: -6.7 }, // the board
  { x: 6.4, z: -6.7 }, // the board to its right (projects, or the staff's page)
  ...CLASSROOM_TEAM_DOORS,
];

/** Why a note can't go here, or null if it can. */
export function noteSpotError(space: SpaceId, x: number, z: number): string | null {
  if (NO_NOTE_SPACES.has(space)) return space === "anusa" ? "No sticky notes in the ANUSA Student Lounge." : space === "poop" ? "Not in here." : "No sticky notes in the Student Hub.";
  if (roomOf(space)) return "No sticky notes in meeting rooms.";
  const outside = space === "outdoor";
  if (outside && BUILDINGS.some((b) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ)) return "Not inside a building.";
  const clear = outside ? OUTDOOR_KEEP_CLEAR : space === "library" ? LIBRARY_KEEP_CLEAR : CLASSROOM_KEEP_CLEAR;
  if (clear.some((p) => Math.hypot(p.x - x, p.z - z) < NOTE_CLEARANCE)) return "Too close to a door or something you can use. Step away a little.";
  return null;
}
