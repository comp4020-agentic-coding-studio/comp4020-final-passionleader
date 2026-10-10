// The places you can be, and how far each one reaches. The client draws them
// (client/src/spaces/); the server only needs their names and bounds, so it
// can refuse a space that doesn't exist and clamp a position that wanders
// outside one. Doors between spaces are the client's business.

export type SpaceId = "outdoor" | "hub" | "comp8020";

export interface Space {
  label: string;
  halfX: number;
  halfZ: number;
  spawn: { x: number; z: number };
}

export const SPACES: Record<SpaceId, Space> = {
  outdoor: { label: "ANU campus", halfX: 32, halfZ: 24, spawn: { x: -6, z: 10 } },
  hub: { label: "Student Hub", halfX: 12, halfZ: 9, spawn: { x: 0, z: 6.5 } },
  comp8020: { label: "COMP8020 classroom", halfX: 10, halfZ: 8, spawn: { x: 0, z: 5.5 } },
};

// First-timers start outside, on the path between the two buildings.
export const FIRST_SPACE: SpaceId = "outdoor";

export const isSpace = (s: unknown): s is SpaceId => typeof s === "string" && Object.hasOwn(SPACES, s);

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

export function clampTo(space: SpaceId, x: number, z: number): { x: number; z: number } {
  const { halfX, halfZ } = SPACES[space];
  return { x: clamp(x, -halfX, halfX), z: clamp(z, -halfZ, halfZ) };
}
