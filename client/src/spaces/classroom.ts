import * as THREE from "three";
import { block, doorway, place, solid, texMat, textPlane, type Box, type SpaceDef, type SpaceId } from "../world.ts";
import { roomShell } from "./room.ts";

// A classroom inside building 155: rows of desks facing a whiteboard, a
// centre aisle, and a lectern. Every classroom the admin opens (COMP8020,
// COMMON, ...) is this same room with its own code on the board; only
// COMP8020's board links to its course page.

const HALF = { halfX: 10, halfZ: 8 };

const COURSE_PAGES: Record<string, string> = {
  COMP8020: "https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/",
};

export function buildClassroom(id: SpaceId, code: string): SpaceDef {
  const page = COURSE_PAGES[code];
  const g = new THREE.Group();
  const colliders: Box[] = [];
  roomShell(g, colliders, HALF.halfX, HALF.halfZ, texMat("ai/carpet.jpg", 10, 8), 0xefeae0);

  const board = textPlane([code, page ? "press E here for the course page" : code === "COMMON" ? "open to everyone" : ""], 7, 2.2, { bg: "#fbfbf7", fg: "#1f2d3d", font: 0.55 });
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
  place(g, "pottedPlant.glb", 1.3, -9.2, 6.8);
  solid(colliders, 0.7, 0.7, -9.2, 6.8);

  // The way out is on the right-hand wall, at the back.
  doorway(g, HALF.halfX - 0.05, 6, -Math.PI / 2, "Exit to campus");

  return {
    id,
    title: `${code} classroom`,
    group: g,
    colliders,
    doors: [{ x: 8.9, z: 6, label: "Go outside", to: "outdoor", arrive: { x: -8.4, z: 7 } }],
    ...HALF,
    background: 0xe6e1d4,
    camera: new THREE.Vector3(0, 6.5, 7.5),
    bgm: ["The_Library_Window.mp3"],
    links: page
      ? [{ x: 0, z: -6.7, label: `Open the ${code} course page`, url: page, embeddable: true }]
      : [],
  };
}
