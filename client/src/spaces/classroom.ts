import * as THREE from "three";
import { block, doorway, textPlane, type Box, type SpaceDef } from "../world.ts";
import { plant, roomShell } from "./room.ts";

// The COMP8280 classroom, inside building 155: rows of desks facing a
// whiteboard, a centre aisle, and a lectern. Course classrooms will be
// created by the admin later; this one is fixed for crit 9.

const HALF = { halfX: 10, halfZ: 8 };

export function buildClassroom(): SpaceDef {
  const g = new THREE.Group();
  const colliders: Box[] = [];
  roomShell(g, colliders, HALF.halfX, HALF.halfZ, 0xb08d5f, 0xefeae0);

  const board = textPlane(["COMP8280"], 7, 2.2, { bg: "#fbfbf7", fg: "#1f2d3d", font: 0.9 });
  board.position.set(0, 2.2, -HALF.halfZ + 0.01);
  g.add(board);
  block(g, colliders, [1, 1.2, 0.8], [-5, -6], 0x6b4a2b);

  // Four rows of desks either side of the centre aisle, a chair behind each.
  for (const z of [-3.5, -1, 1.5, 4]) {
    for (const x of [-6.5, -3.5, 3.5, 6.5]) {
      block(g, colliders, [2.2, 0.75, 0.8], [x, z], 0xe9e2cf);
      block(g, null, [0.5, 0.5, 0.5], [x, z + 0.75], 0x3d5a80);
    }
  }
  plant(g, colliders, 9, -7);

  doorway(g, -HALF.halfX + 0.05, 6, Math.PI / 2, "Exit to campus");

  return {
    id: "comp8280",
    title: "COMP8280 classroom",
    group: g,
    colliders,
    doors: [{ x: -8.9, z: 6, label: "Go outside", to: "outdoor", arrive: { x: -8.4, z: 7 } }],
    ...HALF,
    background: 0xe6e1d4,
    camera: new THREE.Vector3(0, 6.5, 7.5),
    bgm: "Classroom.mp3",
  };
}
