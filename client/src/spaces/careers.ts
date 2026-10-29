import * as THREE from "three";
import { block, doorway, floor, lightPool, place, poster, SHARED_BGM, SOFA_TOP, solid, texMat, textPlane, type Box, type SpaceDef } from "../world.ts";
import { BOOKCASE_H, fillShelves } from "./library.ts";
import { CAREER_DOORS, roomDoors } from "./meeting.ts";
import { roomShell } from "./room.ts";

// The Career Hub (plan 111): internships and jobs, in the Lowitja O'Donoghue
// Cultural Centre's lit ground floor north of the road (its door, outdoor.ts).
// Between the ANUSA lounge and the Student Hub in size (the user's call,
// 10/30). At the back, the careers adviser (Alex, an AI assistant,
// server/npcs.ts) behind a reception desk with its name on the front; two
// PCs in the north-west corner open ANU's Career Central and the STEM
// internships page (new tabs: both refuse to be framed); a coffee bar and
// full bookcases in the north-east. A waiting lounge in the middle, study
// tables to the south, six interview rooms down the sides like the Student
// Hub's counselling rooms (invite only, for mock interviews and CV reviews).
// The way out is on the south wall, the camera's side.

const HALF = { halfX: 15, halfZ: 10 };
/** The reception desk, along the back. */
const DESK = { x: 0, z: -6.4 };
/** The way out, on the south wall. */
const EXIT = { x: 0, z: HALF.halfZ - 1.1 };
/** The two PCs, on a desk in the north-west corner, used from the south. */
const PCS = [
  { x: -10.6, label: "Career Central", sub: "jobs · events · appointments", url: "https://careercentral.anu.edu.au/" },
  { x: -8, label: "STEM internships", sub: "for-credit work experience", url: "https://systems.anu.edu.au/stem-internships-work-experience" },
];
const PC_Z = -8.9;
const NAVY = 0x23404f;

export function buildCareers(): SpaceDef {
  const g = new THREE.Group();
  const colliders: Box[] = [];
  roomShell(g, colliders, HALF.halfX, HALF.halfZ, texMat("ai/carpet.jpg", 11, 7.5, 0x9aa7b3), { tint: 0xeceae4, trim: NAVY });
  const back = -HALF.halfZ + 0.01;

  const sign = textPlane(["Career Hub", "internships · jobs · advice · an unofficial, fan-made space"], 8, 1.3, { bg: "#23404f", fg: "#ffffff", font: 0.4 });
  sign.position.set(0, 3.1, back);
  g.add(sign);

  // Reception: a navy desk with a pale top, the adviser behind it; its name on the front, facing you.
  block(g, colliders, [6, 1, 0.9], [DESK.x, DESK.z], NAVY);
  block(g, null, [6.2, 0.05, 1.05], [DESK.x, DESK.z, 1], 0xe8e2d4);
  place(g, "computerScreen.glb", 0.5, DESK.x - 1.6, DESK.z - 0.1, 0, true, 1.05);
  place(g, "laptop.glb", 0.22, DESK.x + 1.6, DESK.z, Math.PI, true, 1.05);
  place(g, "computerKeyboard.glb", 0.03, DESK.x - 1.6, DESK.z + 0.25, 0, true, 1.05);
  place(g, "plantSmall1.glb", 0.3, DESK.x + 2.6, DESK.z + 0.1, 0, true, 1.05);
  const tag = textPlane(["Careers adviser", "ask about internships and jobs"], 2.6, 0.5, { bg: "#1f2d3d", fg: "#ffffff", font: 0.17 });
  tag.position.set(DESK.x, 0.55, DESK.z + 0.46);
  g.add(tag);
  lightPool(g, DESK.x, DESK.z + 0.5, 7, 3, 0xffe2b0, 0.2);

  // North-west: two PCs on a desk, each with its name over it.
  block(g, colliders, [5, 0.85, 0.8], [-9.3, PC_Z], 0xb08a64);
  for (const pc of PCS) {
    place(g, "computerScreen.glb", 0.5, pc.x, PC_Z - 0.1, 0, true, 0.85);
    place(g, "chairDesk.glb", 1, pc.x, PC_Z + 0.95, Math.PI, true, 0, { carpet: 0x2f5a7a });
    const t = textPlane([pc.label, pc.sub], 2.2, 0.48, { bg: "#23404f", fg: "#ffffff", font: 0.17 });
    t.position.set(pc.x, 2, back + 0.01);
    g.add(t);
  }
  place(g, "pottedPlant.glb", 1.3, -13.6, -8.8);
  solid(colliders, 0.7, 0.7, -13.6, -8.8);

  // North-east: a coffee bar and two bookcases full of books.
  for (const x of [6.4, 7.4]) place(g, "kitchenBar.glb", 0.95, x, -HALF.halfZ + 0.5);
  place(g, "kitchenCoffeeMachine.glb", 0.4, 6.4, -HALF.halfZ + 0.5, 0, true, 0.95);
  solid(colliders, 2.2, 0.8, 6.9, -HALF.halfZ + 0.5);
  const shelves: [number, number][] = [10.4, 12.35].map((x) => [x, -HALF.halfZ + 0.4]);
  for (const [x, z] of shelves) place(g, "bookcaseClosedWide.glb", BOOKCASE_H, x, z);
  fillShelves(g, shelves);
  solid(colliders, 4, 0.7, 11.4, -HALF.halfZ + 0.4);
  const art = poster("ai/poster_art.jpg", 2.4, 1.75);
  art.position.set(-4.6, 1.9, back + 0.01);
  g.add(art);

  // The waiting lounge, in the middle: two sofa corners on rugs, each round a coffee table, a floor lamp each.
  ([
    [-4.5, 0x3f6f73],
    [4.5, 0xb5654a],
  ] as const).forEach(([x, rug]) => {
    const z = 1.2;
    floor(g, 4.4, 4.6, x, z, rug, 0.015);
    place(g, "loungeSofa.glb", 0.8, x, z - 1.6, 0);
    place(g, "loungeSofa.glb", 0.8, x, z + 1.6, Math.PI);
    place(g, "tableCoffeeGlass.glb", 0.45, x, z);
    place(g, "plantSmall2.glb", 0.4, x + 0.3, z, 0, true, 0.45);
    place(g, "lampRoundFloor.glb", 1.7, x + 1.9, z - 1.9);
    lightPool(g, x, z, 4.6, 4.6, 0xffe2b0, 0.22);
    solid(colliders, 2.4, 0.9, x, z - 1.6, SOFA_TOP);
    solid(colliders, 2.4, 0.9, x, z + 1.6, SOFA_TOP);
    solid(colliders, 1.4, 0.9, x, z, SOFA_TOP);
  });

  // South: study tables either side of the way out, for working on a CV.
  for (const cx of [-8.5, 8.5]) {
    for (const dx of [-1.2, 1.2]) {
      place(g, "desk.glb", 0.75, cx + dx, 6.6, Math.PI);
      place(g, "chairDesk.glb", 1, cx + dx, 7.45, Math.PI, true, 0, { carpet: 0x2f5a7a });
      place(g, "laptop.glb", 0.2, cx + dx, 6.5, 0, true, 0.75);
    }
    solid(colliders, 4.4, 0.8, cx, 6.6);
    lightPool(g, cx, 6.9, 4.4, 2, 0xffcf8a, 0.18);
  }

  // The interview rooms' doors, numbered on the wall over each.
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
  floor(g, 3, 1.4, EXIT.x, HALF.halfZ - 1, 0x5a4636, 0.016); // a doormat
  for (const [x, z] of [
    [13.6, -8.8],
    [-13.6, 8.8],
    [13.6, 8.8],
    [-2.6, 8.9],
  ] as const) {
    place(g, "pottedPlant.glb", 1.3, x, z);
    solid(colliders, 0.7, 0.7, x, z);
  }
  place(g, "coatRackStanding.glb", 1.8, 2.6, HALF.halfZ - 0.6);
  solid(colliders, 0.6, 0.6, 2.6, HALF.halfZ - 0.6);
  for (const [x, z] of [
    [-12.8, 4.6],
    [12.8, 4.6],
  ] as const) {
    place(g, "trashcan.glb", 0.6, x, z);
    solid(colliders, 0.5, 0.5, x, z);
  }

  return {
    id: "careers",
    title: "Career Hub",
    group: g,
    colliders,
    doors: [
      // Back out under the O'Donoghue centre's front (outdoor.ts), facing the road.
      { x: EXIT.x, z: EXIT.z, label: "Go outside", to: "outdoor", arrive: { x: 18, z: -37.6 } },
      ...roomDoors("career", CAREER_DOORS, (n) => `Enter interview room ${n}`),
    ],
    links: PCS.map((pc) => ({ x: pc.x, z: PC_Z + 1.5, label: `Open ${pc.label} (new tab)`, url: pc.url, embeddable: false })),
    ...HALF,
    background: 0xd9d4c6,
    camera: new THREE.Vector3(0, 6.5, 7.5),
    bgm: SHARED_BGM,
    floor: "carpet",
    noNotes: true,
    seats: [-4.5, 4.5].flatMap((x) =>
      [-0.55, 0.55].flatMap((dx) => [
        { x: x + dx, z: 1.2 - 1.6, rot: 0, y: 0.4 },
        { x: x + dx, z: 1.2 + 1.6, rot: Math.PI, y: 0.4 },
      ]),
    ),
  };
}
