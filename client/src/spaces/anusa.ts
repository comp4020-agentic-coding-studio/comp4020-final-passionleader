import * as THREE from "three";
import { block, doorway, floor, lightPool, place, SHARED_BGM, SOFA_TOP, solid, texMat, textPlane, type Box, type SpaceDef } from "../world.ts";
import { roomShell } from "./room.ts";

// The ANUSA office: the students' association, up the stairs on 154's
// colonnade, north of the Student Hub's door (replacing COMMON, which had
// been doing this job as a "classroom for anyone"). A reception counter with
// a PC to ANUSA's own site (it may be framed), where one of the AI campus
// assistants will stand; a wall for the study-group board; and a lounge to
// sit and meet in. Not a copy of the real office, and not ANUSA's service.

export const ANUSA = { halfX: 7, halfZ: 5 };
/** The PC on the counter; E from the south of it. */
export const ANUSA_PC = { x: -3, z: -2.9 };
/** The study-group wall (68a): where its board will go. */
export const STUDY_WALL = { x: 3.4, z: -4.6 };

const ANUSA_GREEN = 0x1e6b52;

export function buildAnusa(): SpaceDef {
  const g = new THREE.Group();
  const colliders: Box[] = [];
  const { halfX, halfZ } = ANUSA;
  roomShell(g, colliders, halfX, halfZ, texMat("ai/carpet.jpg", 7, 5, 0xc9d6cf), { tint: 0xf1f3ef, trim: 0x2f4a3f });

  const sign = textPlane(["ANUSA office", "an unofficial, fan-made space"], 5, 1.2, { bg: "#1e6b52", fg: "#ffffff", font: 0.36 });
  sign.position.set(-3, 2.9, -halfZ + 0.01);
  g.add(sign);

  // Reception: a counter across the north-west with the PC on it.
  block(g, colliders, [4, 1, 0.8], [ANUSA_PC.x, ANUSA_PC.z - 0.3], texMat("ai/wood_tabletop.jpg", 2, 1, 0x7a5236));
  place(g, "computerScreen.glb", 0.5, ANUSA_PC.x, ANUSA_PC.z - 0.35, 0, true, 1);
  const pcTag = textPlane(["ANUSA", "clubs · advocacy · events"], 1.7, 0.42, { bg: "#1f2d3d", fg: "#ffffff", font: 0.17 });
  pcTag.position.set(ANUSA_PC.x, 1.95, ANUSA_PC.z - 0.72);
  g.add(pcTag);

  // The study-group wall, north-east: a green panel with its name.
  const wall = textPlane(["Study groups", "find people to study with"], 3.2, 1.6, { bg: "#1e6b52", fg: "#ffffff", font: 0.3 });
  wall.position.set(STUDY_WALL.x, 1.9, -halfZ + 0.02);
  g.add(wall);

  // The lounge, south: two sofas facing over a coffee table on a rug.
  floor(g, 5, 4, 0, 2.2, ANUSA_GREEN, 0.015);
  const fabric = { carpet: 0x2f7d6a };
  place(g, "loungeSofaLong.glb", 0.85, 0, 0.6, 0, true, 0, fabric);
  place(g, "loungeSofa.glb", 0.85, 0, 3.8, Math.PI, true, 0, fabric);
  place(g, "tableCoffeeGlass.glb", 0.45, 0, 2.2);
  solid(colliders, 3, 0.9, 0, 0.6, SOFA_TOP);
  solid(colliders, 2.2, 0.9, 0, 3.8, SOFA_TOP);
  solid(colliders, 1.4, 0.9, 0, 2.2, SOFA_TOP);
  place(g, "lampRoundFloor.glb", 1.7, 3.2, 2.2);
  lightPool(g, 2.6, 2.2, 3.4, 3.4);
  solid(colliders, 0.5, 0.5, 3.2, 2.2);
  place(g, "pottedPlant.glb", 1.3, -6.2, 4.2);
  solid(colliders, 0.7, 0.7, -6.2, 4.2);

  // The way out: back down the stairs, on the east wall.
  doorway(g, halfX - 0.05, 2.5, -Math.PI / 2, "Down to campus");

  return {
    id: "anusa",
    title: "ANUSA office",
    group: g,
    colliders,
    doors: [{ x: halfX - 1.1, z: 2.5, label: "Go back down to campus", to: "outdoor", arrive: { x: 4.6, z: -3.4 } }],
    halfX,
    halfZ,
    background: 0xe4ebe6,
    camera: new THREE.Vector3(0, 6, 7),
    bgm: SHARED_BGM,
    floor: "carpet",
    seats: [-0.7, 0.7].flatMap((dx) => [
      { x: dx, z: 0.65, rot: 0, y: 0.42 },
      { x: dx, z: 3.75, rot: Math.PI, y: 0.42 },
    ]),
    links: [{ x: ANUSA_PC.x, z: ANUSA_PC.z + 1.3, label: "Open ANUSA's site", url: "https://anusa.com.au/", embeddable: true }],
    spots: [{ x: STUDY_WALL.x, z: STUDY_WALL.z + 1.2, id: "board", label: "Open the ANUSA board (study groups)" }],
    // A place to sit and talk; notes go up outside and in classrooms.
    noNotes: true,
  };
}
