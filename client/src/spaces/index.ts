import type { SpaceDef, SpaceId } from "../world.ts";
import { buildClassroom } from "./classroom.ts";
import { buildHub } from "./hub.ts";
import { buildOutdoor } from "./outdoor.ts";

// Every space is built once, on first visit, and reused after that.
// Bounds must match server/spaces.ts, which clamps positions to them.
// Classrooms are whatever the admin has opened (GET /api/classrooms): each is
// the same room with its own course code on the board, and its space id is
// that code in lower case.

const fixed: Record<string, () => SpaceDef> = {
  outdoor: buildOutdoor,
  hub: buildHub,
};
const built = new Map<SpaceId, SpaceDef>();
/** Space id -> course code, for the classrooms open right now. */
const classrooms = new Map<SpaceId, string>();

export function setClassrooms(list: { code: string; space: SpaceId }[]): void {
  classrooms.clear();
  for (const c of list) classrooms.set(c.space, c.code);
}

export function getSpace(id: SpaceId): SpaceDef {
  let def = built.get(id);
  if (!def) {
    const code = classrooms.get(id);
    def = code ? buildClassroom(id, code) : fixed[id]!();
    built.set(id, def);
  }
  return def;
}

export const isSpaceId = (s: unknown): s is SpaceId =>
  typeof s === "string" && (Object.hasOwn(fixed, s) || classrooms.has(s));
