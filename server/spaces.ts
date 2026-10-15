// The places you can be, and how far each one reaches. The client draws them
// (client/src/spaces/); the server only needs their names and bounds, so it
// can refuse a space that doesn't exist and clamp a position that wanders
// outside one. Doors between spaces are the client's business.
//
// Two kinds: the fixed spaces (the campus outside and the Student Hub), and
// classrooms in building 155, which the admin adds and removes (db.ts keeps
// the list). Every classroom is the same room; its space id is its course
// code in lower case ("comp8020"), so notes and last spots key on that.

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
// to the library's door. Same as OUTDOOR_AREAS in client/src/spaces/outdoor.ts.
const OUTDOOR_AREAS: Area[] = [
  { minX: -29.5, maxX: 5, minZ: -39.4, maxZ: -2 },
  { minX: 5, maxX: 26, minZ: -39.4, maxZ: -20 },
  { minX: -9.6, maxX: 5.4, minZ: -2, maxZ: 24.4 },
];

export const SPACES: Record<string, Space> = {
  outdoor: { label: "ANU campus", halfX: 30, halfZ: 40, areas: OUTDOOR_AREAS, spawn: { x: -6, z: 10 } },
  hub: { label: "Student Hub", halfX: 20, halfZ: 13, spawn: { x: 0, z: 9 } },
};

/** Every classroom's bounds (client/src/spaces/classroom.ts). */
export const CLASSROOM: Omit<Space, "label"> = { halfX: 10, halfZ: 8, spawn: { x: 0, z: 5.5 } };

// Course codes like COMP6300 or MGMP2222 (four letters, four digits), and
// COMMON, the room for anyone, which can't be removed.
export const CLASSROOM_CODE = /^([A-Z]{4}[0-9]{4}|COMMON)$/;
export const COMMON = "COMMON";

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
  return code ? { label: `${code} classroom`, ...CLASSROOM } : undefined;
}

export const isSpace = (s: unknown): s is SpaceId => typeof s === "string" && spaceInfo(s) !== undefined;

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
export const NO_NOTE_SPACES: ReadonlySet<SpaceId> = new Set(["hub"]);
const BUILDINGS: Area[] = [
  { minX: -28, maxX: -10, minZ: -2, maxZ: 16 }, // 155
  { minX: 6, maxX: 26, minZ: -20, maxZ: 14 }, // 154
];
const OUTDOOR_KEEP_CLEAR: { x: number; z: number }[] = [
  { x: -8.6, z: 7 }, // 155's door
  { x: 4.6, z: 3 }, // 154's door
  { x: 4.6, z: -9 }, // the dog in front of 154
];
const CLASSROOM_KEEP_CLEAR: { x: number; z: number }[] = [
  { x: 8.9, z: 6 }, // the way out
  { x: 0, z: -6.7 }, // the whiteboard
];

/** Why a note can't go here, or null if it can. */
export function noteSpotError(space: SpaceId, x: number, z: number): string | null {
  if (NO_NOTE_SPACES.has(space)) return "No sticky notes in the Student Hub.";
  const outside = space === "outdoor";
  if (outside && BUILDINGS.some((b) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ)) return "Not inside a building.";
  const clear = outside ? OUTDOOR_KEEP_CLEAR : CLASSROOM_KEEP_CLEAR;
  if (clear.some((p) => Math.hypot(p.x - x, p.z - z) < NOTE_CLEARANCE)) return "Too close to a door or something you can use. Step away a little.";
  return null;
}
