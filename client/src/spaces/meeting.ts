import * as THREE from "three";
import { block, doorway, lightPool, place, poster, solid, texMat, textPlane, type Box, type Door, type SpaceDef, type SpaceId } from "../world.ts";
import { roomShell } from "./room.ts";

// The small meeting rooms: six counselling rooms off the Student Hub
// (invite-only) and team rooms off every classroom (three) and the library
// (four), open to anyone. Each is a space of its own, so its people and its
// chat stay inside; six at most. The server decides who gets in
// (server/realtime.ts) and knows the same door spots (server/spaces.ts
// roomOf). Inside: one table with six chairs, and the way out on the side
// you came in by: walk in through an east-facing door and the room's own
// door is on its west wall, behind you, with a screen on the far wall.

const HALF = { halfX: 5, halfZ: 4 };
export const ROOM_CAP = 6;

export type RoomKind = "counselling" | "team";

/** Where you stand to open each room's door, in the space it opens off. Same spots as server/spaces.ts. */
export const COUNSEL_DOORS = [-10, -6, -2, 2, 6, 10].map((z) => ({ x: 18.9, z }));
export const CLASSROOM_TEAM_DOORS = [-3, 0.5, 4].map((z) => ({ x: -8.9, z }));
export const LIBRARY_TEAM_DOORS = [
  { x: -14.9, z: -1.5 },
  { x: -14.9, z: 2.5 },
  { x: 14.9, z: -1.5 },
  { x: 14.9, z: 2.5 },
];
/** Where the room's own door is along its side wall. */
const INNER_DOOR_Z = -1.5;
/** -1 if the room's door is on its west wall (you came in heading east), +1 if east. */
const innerSide = (parentDoor: { x: number }): number => (parentDoor.x > 0 ? -1 : 1);

export interface RoomRef {
  kind: RoomKind;
  /** What the window and the HUD call it. */
  title: string;
  parent: SpaceId;
  door: { x: number; z: number };
}

/** The meeting room behind a space id, if it is one; `classroomCode` names a classroom's code. */
export function roomRef(id: SpaceId, classroomCode: (space: SpaceId) => string | undefined): RoomRef | undefined {
  const counsel = /^counsel-([1-9])$/.exec(id);
  if (counsel) {
    const n = Number(counsel[1]);
    const door = COUNSEL_DOORS[n - 1];
    return door && { kind: "counselling", title: `Counselling room ${n}`, parent: "hub", door };
  }
  const team = /^team-([a-z0-9]+)-([1-9])$/.exec(id);
  if (!team) return undefined;
  const parent = team[1]!;
  const n = Number(team[2]);
  const code = parent === "library" ? "Library" : classroomCode(parent);
  const doors = parent === "library" ? LIBRARY_TEAM_DOORS : code ? CLASSROOM_TEAM_DOORS : [];
  const door = doors[n - 1];
  return door && code ? { kind: "team", title: `${code} · Team room ${n}`, parent, door } : undefined;
}

/** The doors into a space's rooms, for that space's `doors`. */
export function roomDoors(prefix: string, doors: { x: number; z: number }[], label: (n: number) => string): Door[] {
  return doors.map((d, i) => ({
    ...d,
    label: label(i + 1),
    to: `${prefix}-${i + 1}`,
    // Just inside the room's door, out of its reach, so a second E doesn't
    // walk you straight back out.
    arrive: { x: innerSide(d) * (HALF.halfX - 2.9), z: INNER_DOOR_Z },
  }));
}

export function buildMeetingRoom(id: SpaceId, ref: RoomRef): SpaceDef {
  const g = new THREE.Group();
  const colliders: Box[] = [];
  const counselling = ref.kind === "counselling";
  roomShell(g, colliders, HALF.halfX, HALF.halfZ, texMat("ai/carpet.jpg", 4, 3.2, counselling ? 0x9fb4c8 : 0xc9b79c), {
    tint: counselling ? 0xdfe8f0 : 0xf2eadc,
    trim: counselling ? 0x2f4a66 : 0x5a4030,
  });

  const sign = textPlane([ref.title, counselling ? "invite only · up to 6" : "open to all · up to 6"], 4.4, 0.9, {
    bg: counselling ? "#2f5d8a" : "#5b3a24",
    fg: "#ffffff",
    font: 0.3,
  });
  sign.position.set(0, 3.1, -HALF.halfZ + 0.01);
  g.add(sign);
  const side = innerSide(ref.door);
  doorway(g, side * (HALF.halfX - 0.05), INNER_DOOR_Z, side < 0 ? Math.PI / 2 : -Math.PI / 2, "Leave the room");

  // The table and six chairs, three a side.
  block(g, colliders, [3.6, 0.75, 1.4], [0, 1], texMat("ai/wood_tabletop.jpg", 2, 1, 0xc9a27a));
  const fabric = { carpet: counselling ? 0x3f6f9a : 0xb5654a };
  for (const x of [-1.2, 0, 1.2]) {
    place(g, "chairDesk.glb", 1, x, 1 - 1.15, 0, true, 0, fabric);
    place(g, "chairDesk.glb", 1, x, 1 + 1.15, Math.PI, true, 0, fabric);
  }
  solid(colliders, 3.8, 3.4, 0, 1);
  // A pendant light's glow on the table, and a small plant on it.
  lightPool(g, 0, 1, 4.6, 3.2, 0xffe2b0, 0.28);
  place(g, "plantSmall1.glb", 0.3, 0.9, 1.2, 0, true, 0.75);
  // A picture on the far wall (where a shared screen may go one day).
  const art = poster("ai/poster_meeting.jpg", 2.7, 1.5);
  art.position.set(-side * (HALF.halfX - 0.01), 1.9, 0.6);
  art.rotation.y = side * (Math.PI / 2);
  g.add(art);
  place(g, "pottedPlant.glb", 1.3, -HALF.halfX + 0.6, HALF.halfZ - 0.6);
  solid(colliders, 0.7, 0.7, -HALF.halfX + 0.6, HALF.halfZ - 0.6);

  return {
    id,
    title: ref.title,
    group: g,
    colliders,
    doors: [{ x: side * (HALF.halfX - 1.1), z: INNER_DOOR_Z, label: "Leave the room", to: ref.parent, arrive: { x: ref.door.x + (ref.door.x > 0 ? -1.8 : 1.8), z: ref.door.z } }],
    ...HALF,
    background: 0xd9d4c6,
    camera: new THREE.Vector3(0, 5.5, 6.5),
    // No tracks of its own: the music of the space outside carries on.
    bgm: [],
    floor: "carpet",
    noNotes: true,
    seats: [-1.2, 0, 1.2].flatMap((x) => [
      { x, z: 1 - 1.2, rot: 0, y: 0.45 },
      { x, z: 1 + 1.2, rot: Math.PI, y: 0.45 },
    ]),
  };
}
