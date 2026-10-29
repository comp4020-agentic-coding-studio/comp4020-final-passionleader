import * as THREE from "three";
import { block, doorway, place, poster, SHARED_BGM, solid, texMat, textPlane, type Box, type SpaceDef, type SpaceId } from "../world.ts";
import { CLASSROOM_TEAM_DOORS, roomDoors } from "./meeting.ts";
import { roomShell } from "./room.ts";

// A classroom inside building 155: rows of desks facing a whiteboard, a
// centre aisle, and a lectern. Every classroom the admin opens (COMP8020,
// COMP6300, ...) is this same room with its own code on the board. In COMP8020 the whiteboard opens
// the course page and the board to its right lists classmates' final
// projects; in every other classroom both open whatever page the admin has
// set for them (main.ts, with the links from GET /api/classrooms).

const HALF = { halfX: 10, halfZ: 8 };

const COURSE_PAGES: Record<string, string> = {
  COMP8020: "https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/",
};

export function buildClassroom(id: SpaceId, code: string): SpaceDef {
  const page = COURSE_PAGES[code];
  const g = new THREE.Group();
  const colliders: Box[] = [];
  roomShell(g, colliders, HALF.halfX, HALF.halfZ, texMat("ai/carpet.jpg", 10, 8), { tint: 0xf4efe4, trim: 0x4a3a2a });

  const board = textPlane([code, "course page"], 7, 2.2, { bg: "#fbfbf7", fg: "#1f2d3d", font: 0.55 });
  board.position.set(0, 2.2, -HALF.halfZ + 0.01);
  g.add(board);

  // Right of the whiteboard: COMP8020's classmates' final projects, or a
  // page the staff choose.
  const side = textPlane(page ? ["Classmates' final projects", "the list"] : ["From the staff"], 3.4, 1.6, {
    bg: "#c8a26b",
    fg: "#3b2a12",
    font: 0.28,
  });
  side.position.set(6.4, 2.2, -HALF.halfZ + 0.01);
  g.add(side);
  // Two framed pictures on the bare side wall (plan 110).
  const guestbook = poster("ai/poster_classroom.jpg", 1.4, 2.1);
  guestbook.position.set(HALF.halfX - 0.01, 2, -3.2);
  guestbook.rotation.y = -Math.PI / 2;
  const painting = poster("ai/poster_art.jpg", 2.2, 1.6);
  painting.position.set(HALF.halfX - 0.01, 2, 1.6);
  painting.rotation.y = -Math.PI / 2;
  g.add(painting);
  // Left of the whiteboard: this classroom's board (Q&A, Notices, Board), on
  // a PC on a small desk, like the Hub's reception PCs.
  block(g, colliders, [1.6, 0.9, 0.8], [-6.4, -HALF.halfZ + 0.6], texMat("ai/wood_tabletop.jpg", 1, 1, 0xb07a4a));
  place(g, "computerScreen.glb", 0.5, -6.4, -HALF.halfZ + 0.55, 0, true, 0.9);
  const boardTag = textPlane([`${code} board`, "Q&A · Notices · Board"], 2.2, 0.5, { bg: "#1f2d3d", fg: "#ffffff", font: 0.17 });
  boardTag.position.set(-6.4, 2.0, -HALF.halfZ + 0.04);
  g.add(boardTag);
  g.add(guestbook);
  block(g, colliders, [1, 1.2, 0.8], [3.8, -6], texMat("ai/wood_tabletop.jpg", 1, 1, 0xb07a4a)); // the lectern

  // Four rows of desks either side of the centre aisle, a chair behind
  // each, facing the board (Kenney models, CC0).
  for (const z of [-3.5, -1, 1.5, 4]) {
    for (const x of [-6.5, -3.5, 3.5, 6.5]) {
      place(g, "desk.glb", 0.75, x, z, Math.PI);
      place(g, "chairDesk.glb", 1, x, z + 0.8, Math.PI, true, 0, { carpet: 0x34495e });
      solid(colliders, 2, 0.8, x, z);
    }
  }
  place(g, "pottedPlant.glb", 1.3, -9.2, 6.8);
  solid(colliders, 0.7, 0.7, -9.2, 6.8);
  place(g, "trashcan.glb", 0.6, 9.3, 3.6);
  solid(colliders, 0.5, 0.5, 9.3, 3.6);
  place(g, "books.glb", 0.12, 3.8, -6, 0.3, true, 1.2);

  // The way out is on the right-hand wall, at the back.
  doorway(g, HALF.halfX - 0.05, 6, -Math.PI / 2, "Exit to campus");
  // Team rooms down the left-hand wall: anyone may go in, six at most.
  CLASSROOM_TEAM_DOORS.forEach((d, i) => doorway(g, -HALF.halfX + 0.05, d.z, Math.PI / 2, `Team room ${i + 1}`));

  return {
    id,
    title: `${code} classroom`,
    group: g,
    colliders,
    doors: [
      { x: 8.9, z: 6, label: "Go outside", to: "outdoor", arrive: { x: -8.4, z: 7 } },
      ...roomDoors(`team-${id}`, CLASSROOM_TEAM_DOORS, (n) => `Enter team room ${n}`),
    ],
    ...HALF,
    background: 0xe6e1d4,
    camera: new THREE.Vector3(0, 6.5, 7.5),
    bgm: SHARED_BGM,
    floor: "carpet",
    links: page ? [{ x: 0, z: -6.7, label: `Open the ${code} course page`, url: page, embeddable: true }] : [],
    seats: DESK_SEATS,
    spots: [
      { x: -6.4, z: -6.7, id: "board", label: `Open the ${code} board` },
      page
        ? { x: 6.4, z: -6.7, id: "projects", label: "See classmates' final projects" }
        : { x: 6.4, z: -6.7, id: "side-link", label: "Open what the staff put here" },
      ...(page ? [] : [{ x: 0, z: -6.7, id: "board-link", label: `Open the ${code} whiteboard` }]),
    ],
  };
}

// Chairs at the desks face the board (-z).
const DESK_SEATS = [-3.5, -1, 1.5, 4].flatMap((z) => [-6.5, -3.5, 3.5, 6.5].map((x) => ({ x, z: z + 0.8, rot: Math.PI, y: 0.45 })));

