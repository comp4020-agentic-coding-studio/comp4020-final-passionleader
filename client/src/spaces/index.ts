import type { SpaceDef, SpaceId } from "../world.ts";
import { buildAnusa } from "./anusa.ts";
import { buildCareers } from "./careers.ts";
import { buildClassroom } from "./classroom.ts";
import { buildHub } from "./hub.ts";
import { buildLibrary } from "./library.ts";
import { buildMeetingRoom, roomRef, type RoomRef } from "./meeting.ts";
import { buildOutdoor } from "./outdoor.ts";
import { buildPoop } from "./poop.ts";

// Every space is built once, on first visit, and reused after that.
// Bounds must match server/spaces.ts, which clamps positions to them.
// Classrooms are whatever the admin has opened (GET /api/classrooms): each is
// the same room with its own course code on the board, and its space id is
// that code in lower case. Meeting rooms ("counsel-3", "team-comp8020-1")
// are built from their id (meeting.ts).

const fixed: Record<string, () => SpaceDef> = {
  outdoor: buildOutdoor,
  hub: buildHub,
  library: buildLibrary,
  anusa: buildAnusa,
  careers: buildCareers,
  poop: buildPoop,
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
    const room = meetingRoom(id);
    def = code ? buildClassroom(id, code) : room ? buildMeetingRoom(id, room) : fixed[id]!();
    built.set(id, def);
  }
  return def;
}

/** The meeting room behind a space id, if it is one. */
export const meetingRoom = (id: SpaceId): RoomRef | undefined => roomRef(id, (space) => classrooms.get(space));

export const isSpaceId = (s: unknown): s is SpaceId =>
  typeof s === "string" && (Object.hasOwn(fixed, s) || classrooms.has(s) || meetingRoom(s) !== undefined);
