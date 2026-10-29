import * as THREE from "three";
import { block, doorway, floor, lightPool, place, poster, SHARED_BGM, SOFA_TOP, solid, texMat, textPlane, type Box, type SpaceDef } from "../world.ts";
import { CAREER_DOORS, roomDoors } from "./meeting.ts";
import { roomShell } from "./room.ts";

// The Career Hub (plan 111): internships and jobs, in the Lowitja O'Donoghue
// Cultural Centre's lit ground floor north of the road (its door, outdoor.ts).
// One open room: the careers adviser (Alex, an AI assistant, server/npcs.ts)
// behind a desk at the back, a waiting lounge, a jobs wall, and six
// counselling rooms down the sides like the Student Hub's (invite-only, for
// mock interviews and CV reviews). The way out is on the south wall, the
// camera's side, so you walk towards the screen to leave. An office playlist.

const HALF = { halfX: 14, halfZ: 10 };
/** The adviser's desk, along the back wall. */
const DESK = { x: 0, z: -6.6 };
/** The way out, on the south wall. */
const EXIT = { x: 0, z: HALF.halfZ - 1.1 };

export function buildCareers(): SpaceDef {
  const g = new THREE.Group();
  const colliders: Box[] = [];
  roomShell(g, colliders, HALF.halfX, HALF.halfZ, texMat("ai/carpet.jpg", 10, 7, 0x9aa7b3), { tint: 0xeceae4, trim: 0x23404f });
  const back = -HALF.halfZ + 0.01;

  const sign = textPlane(["Career Hub", "internships · jobs · advice · an unofficial, fan-made space"], 8, 1.3, { bg: "#23404f", fg: "#ffffff", font: 0.4 });
  sign.position.set(0, 3, back);
  g.add(sign);

  // The adviser's desk: a long counter with a laptop and monitor, a tag over it.
  block(g, colliders, [5, 0.95, 0.9], [DESK.x, DESK.z], 0x23404f);
  place(g, "computerScreen.glb", 0.5, DESK.x - 1.2, DESK.z - 0.1, 0, true, 0.95);
  place(g, "laptop.glb", 0.22, DESK.x + 1.3, DESK.z, Math.PI, true, 0.95);
  place(g, "computerKeyboard.glb", 0.03, DESK.x - 1.2, DESK.z + 0.25, 0, true, 0.95);
  const tag = textPlane(["Careers adviser", "ask about internships and jobs"], 2.4, 0.5, { bg: "#1f2d3d", fg: "#ffffff", font: 0.17 });
  tag.position.set(DESK.x, 2.1, DESK.z - 0.7);
  g.add(tag);
  place(g, "bookcaseClosedDoors.glb", 1.9, -5, -HALF.halfZ + 0.45);
  solid(colliders, 1, 0.6, -5, -HALF.halfZ + 0.45);
  place(g, "bookcaseClosedDoors.glb", 1.9, 5, -HALF.halfZ + 0.45);
  solid(colliders, 1, 0.6, 5, -HALF.halfZ + 0.45);

  // A jobs wall: pinned cards in a grid on the back wall, west of the desk.
  const wall = new THREE.Group();
  const colours = [0xf7d774, 0x9fd3c7, 0xf4a6a6, 0xc5b3e6, 0xa7c7e7];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 5; c++) {
      const card = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.3), new THREE.MeshStandardMaterial({ color: colours[(r * 5 + c) % colours.length], roughness: 0.9 }));
      card.position.set(-11 + c * 0.55, 1.3 + r * 0.42, 0);
      card.rotation.z = (((r * 7 + c * 3) % 5) - 2) * 0.03;
      wall.add(card);
    }
  wall.position.z = back + 0.01;
  g.add(wall);
  const wallTag = textPlane(["Jobs & internships board"], 2.8, 0.4, { bg: "#23404f", fg: "#ffffff", font: 0.2 });
  wallTag.position.set(-9.9, 2.75, back + 0.01);
  g.add(wallTag);
  // A poster on the back wall, east of the desk.
  const art = poster("ai/poster_art.jpg", 2.4, 1.75);
  art.position.set(9.9, 1.9, back + 0.01);
  g.add(art);

  // A waiting lounge in the middle: two sofas facing over a coffee table, on a rug.
  floor(g, 4.6, 4.4, 0, 1.6, 0x3f6f73, 0.015);
  place(g, "loungeSofa.glb", 0.8, 0, 0, 0);
  place(g, "loungeSofa.glb", 0.8, 0, 3.2, Math.PI);
  place(g, "tableCoffeeGlass.glb", 0.45, 0, 1.6);
  place(g, "plantSmall2.glb", 0.4, 0.3, 1.6, 0, true, 0.45);
  solid(colliders, 2.4, 0.9, 0, 0, SOFA_TOP);
  solid(colliders, 2.4, 0.9, 0, 3.2, SOFA_TOP);
  solid(colliders, 1.4, 0.9, 0, 1.6, SOFA_TOP);
  lightPool(g, 0, 1.6, 5, 4.4, 0xffe2b0, 0.22);

  // The counselling rooms' doors, numbered on the wall over each.
  CAREER_DOORS.forEach((d, i) => {
    const west = d.x < 0;
    const wx = west ? -HALF.halfX + 0.05 : HALF.halfX - 0.05;
    doorway(g, wx, d.z, west ? Math.PI / 2 : -Math.PI / 2, "");
    const num = textPlane([String(i + 1)], 0.6, 0.5, { bg: "#23404f", fg: "#ffffff", font: 0.36 });
    num.position.set(west ? -HALF.halfX + 0.02 : HALF.halfX - 0.02, 2.95, d.z);
    num.rotation.y = west ? Math.PI / 2 : -Math.PI / 2;
    g.add(num);
  });
  for (const west of [true, false]) {
    const label = textPlane(["Interview rooms · invite only"], 8, 0.5, { bg: "#e8e4da", fg: "#23404f", font: 0.34 });
    label.position.set(west ? -HALF.halfX + 0.02 : HALF.halfX - 0.02, 3.55, -2);
    label.rotation.y = west ? Math.PI / 2 : -Math.PI / 2;
    g.add(label);
  }

  doorway(g, EXIT.x, HALF.halfZ - 0.05, Math.PI, "Exit to campus");
  for (const [x, z] of [
    [-13, -9],
    [13, -9],
    [-13, 9],
    [13, 9],
  ] as const) {
    place(g, "pottedPlant.glb", 1.3, x, z);
    solid(colliders, 0.7, 0.7, x, z);
  }
  place(g, "coatRackStanding.glb", 1.8, 2.4, HALF.halfZ - 0.6);
  solid(colliders, 0.6, 0.6, 2.4, HALF.halfZ - 0.6);

  return {
    id: "careers",
    title: "Career Hub",
    group: g,
    colliders,
    doors: [
      // Back out under the O'Donoghue centre's front (outdoor.ts), facing the road.
      { x: EXIT.x, z: EXIT.z, label: "Go outside", to: "outdoor", arrive: { x: 7.4, z: -43.5 } },
      ...roomDoors("career", CAREER_DOORS, (n) => `Enter interview room ${n}`),
    ],
    ...HALF,
    background: 0xd9d4c6,
    camera: new THREE.Vector3(0, 6.5, 7.5),
    bgm: SHARED_BGM,
    floor: "carpet",
    noNotes: true,
    seats: [-0.55, 0.55].flatMap((dx) => [
      { x: dx, z: 0, rot: 0, y: 0.4 },
      { x: dx, z: 3.2, rot: Math.PI, y: 0.4 },
    ]),
  };
}
