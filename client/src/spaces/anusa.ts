import * as THREE from "three";
import { block, doorway, floor, lightPool, place, poster, SHARED_BGM, SOFA_TOP, solid, texMat, textPlane, type Box, type SpaceDef } from "../world.ts";
import { ANUSA_TEAM_DOORS, roomDoors } from "./meeting.ts";
import { roomShell } from "./room.ts";

// The ANUSA Student Lounge: the students' association, on 154's ground floor
// north of the Hub's door (it replaced COMMON, the "classroom for anyone"). A place for students
// to come and rest, and for the association's people to meet: a reception
// counter with a PC to ANUSA's site (it may be framed), where one of the AI
// campus assistants will stand; a sign pointing to the study-group board
// (outside, beside 155's door); a lounge of sofa corners, armchairs and a coffee bar; a long work table; and
// two meeting rooms off the east wall (meeting.ts: open, six people at most).
// Not a copy of the real office, and not ANUSA's service.

export const ANUSA = { halfX: 10, halfZ: 7 };
/** The PC on the counter; E from the south of it. */
export const ANUSA_PC = { x: -4, z: -4.9 };
/** A sign on the north wall pointing to the study-group board outside. */
const STUDY_SIGN = { x: 4.5, z: -6.7 };

const GREEN = 0x1e6b52;

export function buildAnusa(): SpaceDef {
  const g = new THREE.Group();
  const colliders: Box[] = [];
  const { halfX, halfZ } = ANUSA;
  roomShell(g, colliders, halfX, halfZ, texMat("ai/carpet.jpg", 10, 7, 0xc9d6cf), { tint: 0xf1f3ef, trim: 0x2f4a3f });

  const sign = textPlane(["ANUSA Student Lounge", "an unofficial, fan-made space"], 6, 1.2, { bg: "#1e6b52", fg: "#ffffff", font: 0.36 });
  sign.position.set(-4, 2.9, -halfZ + 0.01);
  g.add(sign);

  // Reception, north-west: a counter with the PC, a plant and a coat stand.
  block(g, colliders, [4.4, 1, 0.8], [ANUSA_PC.x, ANUSA_PC.z - 0.35], texMat("ai/wood_tabletop.jpg", 2, 1, 0x7a5236));
  place(g, "computerScreen.glb", 0.5, ANUSA_PC.x, ANUSA_PC.z - 0.4, 0, true, 1);
  const pcTag = textPlane(["ANUSA", "clubs · advocacy · events"], 1.7, 0.42, { bg: "#1f2d3d", fg: "#ffffff", font: 0.17 });
  pcTag.position.set(ANUSA_PC.x, 1.95, ANUSA_PC.z - 0.77);
  g.add(pcTag);
  place(g, "plantSmall2.glb", 0.4, ANUSA_PC.x + 1.8, ANUSA_PC.z - 0.4, 0, true, 1);
  // Sam's side, behind the counter's east end: a laptop, a lamp, and a
  // cupboard and boxes against the wall (Kenney, CC0).
  place(g, "laptop.glb", 0.22, -2.4, ANUSA_PC.z - 0.3, Math.PI, true, 1);
  place(g, "lampSquareTable.glb", 0.45, -2.2 + 1.1, ANUSA_PC.z - 0.45, 0, true, 1);
  place(g, "bookcaseClosedDoors.glb", 1.9, -0.6, -6.6, 0);
  solid(colliders, 1, 0.6, -0.6, -6.6);
  place(g, "cardboardBoxClosed.glb", 0.35, 0.6, -6.5, 0.3);
  place(g, "coatRackStanding.glb", 1.8, -8.8, -6.2);
  solid(colliders, 0.5, 0.5, -8.8, -6.2);

  // A sign: the study-group board is outside, beside 155's door.
  const wall = textPlane(["Study groups →", "board outside, beside 155's door"], 3.4, 1.2, { bg: "#1e6b52", fg: "#ffffff", font: 0.24 });
  wall.position.set(STUDY_SIGN.x, 1.9, -halfZ + 0.02);
  g.add(wall);
  const art = poster("ai/poster_hub.jpg", 1.4, 2.1);
  art.position.set(halfX - 0.01, 2, -4.4);
  art.rotation.y = -Math.PI / 2;
  g.add(art);

  // A coffee bar, north-east corner.
  place(g, "kitchenBar.glb", 1, 8.4, -6.1, 0);
  place(g, "kitchenCoffeeMachine.glb", 0.4, 8.4, -6.1, 0, true, 1);
  solid(colliders, 2, 0.8, 8.4, -6.1);
  for (const x of [7.5, 9.1]) place(g, "stoolBar.glb", 0.75, x, -5.2, Math.PI, true, 0, { carpet: GREEN });

  // The lounge, south: two sofa corners on rugs, each round a coffee table.
  const corners: [number, number][] = [
    [-4.5, 0x3f6f73],
    [4.5, 0xb5654a],
  ];
  for (const [x, rug] of corners) {
    floor(g, 4.6, 4.6, x, 3.8, rug, 0.015);
    const fabric = { carpet: x < 0 ? 0x2f7d6a : 0xc8912a };
    place(g, "loungeSofaLong.glb", 0.85, x, 2.0, 0, true, 0, fabric);
    place(g, "loungeSofa.glb", 0.85, x, 5.6, Math.PI, true, 0, fabric);
    place(g, "tableCoffeeGlass.glb", 0.45, x, 3.8);
    place(g, "plantSmall1.glb", 0.35, x + 0.3, 3.8, 0, true, 0.45);
    solid(colliders, 3, 0.9, x, 2.0, SOFA_TOP);
    solid(colliders, 2.2, 0.9, x, 5.6, SOFA_TOP);
    solid(colliders, 1.4, 0.9, x, 3.8, SOFA_TOP);
  }
  // Armchairs by the east wall, round a lamp.
  for (const z of [1.2, 3.2]) {
    place(g, "loungeChair.glb", 0.8, 8.6, z, -Math.PI / 2, true, 0, { carpet: 0x2f4f78 });
    solid(colliders, 1, 1, 8.6, z, SOFA_TOP);
  }
  place(g, "lampRoundFloor.glb", 1.7, 9.2, 2.2);
  solid(colliders, 0.5, 0.5, 9.2, 2.2);
  for (const [x, z] of [
    [-4.5, 3.8],
    [4.5, 3.8],
    [8.4, 2.2],
  ] as const)
    lightPool(g, x, z, 3.6, 3.6, 0xfff0c8, 0.25);

  // The work table, middle: where a group spreads out, stools both sides.
  block(g, colliders, [5, 0.8, 1.6], [0, -1.8], texMat("ai/wood_tabletop.jpg", 3, 1, 0xd9b48a));
  for (const x of [-1.8, -0.6, 0.6, 1.8]) {
    for (const z of [-2.95, -0.65]) place(g, "stoolBar.glb", 0.75, x, z, z < -1.8 ? 0 : Math.PI, true, 0, { carpet: 0x3a3f4a });
  }
  solid(colliders, 5.4, 2.6, 0, -1.8);
  lightPool(g, 0, -1.8, 5, 2.4, 0xfff0c8, 0.22);

  // Shelves and plants along the south wall.
  for (const x of [-1.2, 1.2]) {
    place(g, "bookcaseOpen.glb", 1.9, x, halfZ - 0.4, Math.PI);
    solid(colliders, 2, 0.7, x, halfZ - 0.4);
  }
  for (const [x, z] of [
    [-9.2, 6.2],
    [9.2, 6.2],
    [-0.0, -4.6],
  ] as const) {
    place(g, "pottedPlant.glb", 1.3, x, z);
    solid(colliders, 0.7, 0.7, x, z);
  }

  // The way out, on the west wall: you came in heading east from campus.
  doorway(g, -halfX + 0.05, 5, Math.PI / 2, "Out to campus");
  // The two meeting rooms, on the east wall.
  ANUSA_TEAM_DOORS.forEach((d, i) => doorway(g, halfX - 0.05, d.z, -Math.PI / 2, `Meeting room ${i + 1}`));

  // Sofas face each other over their tables; the armchairs face west.
  const seats = corners.flatMap(([x]) =>
    [-0.7, 0.7].flatMap((dx) => [
      { x: x + dx, z: 2.05, rot: 0, y: 0.42 },
      { x: x + dx, z: 5.55, rot: Math.PI, y: 0.42 },
    ]),
  );
  seats.push(...[1.2, 3.2].map((z) => ({ x: 8.5, z, rot: -Math.PI / 2, y: 0.42 })));
  seats.push(...[-1.8, -0.6, 0.6, 1.8].flatMap((x) => [{ x, z: -2.95, rot: 0, y: 0.7 }, { x, z: -0.65, rot: Math.PI, y: 0.7 }]));

  return {
    id: "anusa",
    title: "ANUSA Student Lounge",
    group: g,
    colliders,
    doors: [
      { x: -halfX + 1.1, z: 5, label: "Go out to campus", to: "outdoor", arrive: { x: 3.6, z: -5 } },
      ...roomDoors("team-anusa", ANUSA_TEAM_DOORS, (n) => `Enter meeting room ${n}`),
    ],
    halfX,
    halfZ,
    background: 0xe4ebe6,
    camera: new THREE.Vector3(0, 7, 8.5),
    bgm: SHARED_BGM,
    floor: "carpet",
    seats,
    links: [{ x: ANUSA_PC.x, z: ANUSA_PC.z + 1.3, label: "Open ANUSA's site", url: "https://anusa.com.au/", embeddable: true }],
    // A place to sit and talk; notes go up outside and in classrooms.
    noNotes: true,
  };
}
