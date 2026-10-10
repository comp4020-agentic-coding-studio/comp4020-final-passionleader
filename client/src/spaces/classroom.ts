import * as THREE from "three";
import { block, doorway, place, solid, texMat, textPlane, type Box, type SpaceDef } from "../world.ts";
import { roomShell } from "./room.ts";

// The COMP8020 classroom, inside building 155: rows of desks facing a
// whiteboard, a centre aisle, and a lectern. Course classrooms will be
// created by the admin later; this one is fixed for crit 9.

const HALF = { halfX: 10, halfZ: 8 };

export function buildClassroom(): SpaceDef {
  const g = new THREE.Group();
  const colliders: Box[] = [];
  roomShell(g, colliders, HALF.halfX, HALF.halfZ, texMat("carpet.jpg", 6, 5, 0xc9d3e0), 0xefeae0);

  const board = textPlane(["COMP8020", "press E here for the course page"], 7, 2.2, { bg: "#fbfbf7", fg: "#1f2d3d", font: 0.55 });
  board.position.set(0, 2.2, -HALF.halfZ + 0.01);
  g.add(board);

  // Beside the whiteboard: the spot for a board of classmates' final
  // projects and a guestbook. Only the place exists this week.
  const projects = textPlane(["Classmates' final projects", "(board coming soon)"], 3.4, 1.6, { bg: "#c8a26b", fg: "#3b2a12", font: 0.28 });
  projects.position.set(6.4, 2.6, -HALF.halfZ + 0.01);
  g.add(projects);
  const guestbook = textPlane(["Guestbook", "(coming soon)"], 3.4, 1, { bg: "#e9dcc0", fg: "#3b2a12", font: 0.26 });
  guestbook.position.set(6.4, 1.2, -HALF.halfZ + 0.01);
  g.add(guestbook);
  block(g, colliders, [1, 1.2, 0.8], [-5, -6], 0x6b4a2b);

  // Four rows of desks either side of the centre aisle, a chair behind each,
  // facing the board (Kenney models, CC0).
  for (const z of [-3.5, -1, 1.5, 4]) {
    for (const x of [-6.5, -3.5, 3.5, 6.5]) {
      place(g, "desk.glb", 0.75, x, z, Math.PI);
      place(g, "chairDesk.glb", 1, x, z + 0.8, Math.PI);
      solid(colliders, 2, 0.8, x, z);
    }
  }
  place(g, "pottedPlant.glb", 1.3, 9.2, 6.8);
  solid(colliders, 0.7, 0.7, 9.2, 6.8);

  doorway(g, -HALF.halfX + 0.05, 6, Math.PI / 2, "Exit to campus");

  return {
    id: "comp8020",
    title: "COMP8020 classroom",
    group: g,
    colliders,
    doors: [{ x: -8.9, z: 6, label: "Go outside", to: "outdoor", arrive: { x: -8.4, z: 7 } }],
    ...HALF,
    background: 0xe6e1d4,
    camera: new THREE.Vector3(0, 6.5, 7.5),
    bgm: "Classroom.mp3",
    links: [
      {
        x: 0,
        z: -6.7,
        label: "Open the COMP4020/8020 course page",
        url: "https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/",
      },
    ],
  };
}
