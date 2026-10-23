import * as THREE from "three";
import { block, doorway, floor, lightPool, place, poster, SHARED_BGM, SOFA_TOP, solid, texMat, textPlane, type Box, type SpaceDef, type SpaceId } from "../world.ts";
import { CLASSROOM_TEAM_DOORS, roomDoors } from "./meeting.ts";
import { roomShell } from "./room.ts";

// A classroom inside building 155: rows of desks facing a whiteboard, a
// centre aisle, and a lectern; COMMON, the room for anyone, is a lounge
// instead. Every classroom the admin opens (COMP8020, COMMON, ...) is this
// same room with its own code on the board. In COMP8020 the whiteboard opens
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
  const lounge = code === "COMMON";
  roomShell(g, colliders, HALF.halfX, HALF.halfZ, texMat("ai/carpet.jpg", 10, 8), { tint: 0xf4efe4, trim: 0x4a3a2a });

  const board = textPlane([code, lounge ? "open to everyone" : "course page"], 7, 2.2, { bg: "#fbfbf7", fg: "#1f2d3d", font: 0.55 });
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
  // Where the guestbook will go (plan 11b): a poster on the side wall until then.
  const guestbook = poster("ai/poster_classroom.jpg", 1.4, 2.1);
  guestbook.position.set(HALF.halfX - 0.01, 2, -3.2);
  guestbook.rotation.y = -Math.PI / 2;
  // Left of the whiteboard: this classroom's board (Q&A, Notices, Board), on
  // a PC on a small desk, like the Hub's reception PCs.
  block(g, colliders, [1.6, 0.9, 0.8], [-6.4, -HALF.halfZ + 0.6], texMat("ai/wood_tabletop.jpg", 1, 1, 0xb07a4a));
  place(g, "computerScreen.glb", 0.5, -6.4, -HALF.halfZ + 0.55, 0, true, 0.9);
  const boardTag = textPlane([`${code} board`, "Q&A · Notices · Board"], 2.2, 0.5, { bg: "#1f2d3d", fg: "#ffffff", font: 0.17 });
  boardTag.position.set(-6.4, 2.0, -HALF.halfZ + 0.04);
  g.add(boardTag);
  g.add(guestbook);
  block(g, colliders, [1, 1.2, 0.8], [3.8, -6], texMat("ai/wood_tabletop.jpg", 1, 1, 0xb07a4a)); // the lectern

  if (lounge) furnishLounge(g, colliders);
  else {
    // Four rows of desks either side of the centre aisle, a chair behind
    // each, facing the board (Kenney models, CC0).
    for (const z of [-3.5, -1, 1.5, 4]) {
      for (const x of [-6.5, -3.5, 3.5, 6.5]) {
        place(g, "desk.glb", 0.75, x, z, Math.PI);
        place(g, "chairDesk.glb", 1, x, z + 0.8, Math.PI, true, 0, { carpet: 0x34495e });
        solid(colliders, 2, 0.8, x, z);
      }
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
    seats: lounge ? LOUNGE_SEATS : DESK_SEATS,
    spots: [
      { x: -6.4, z: -6.7, id: "board", label: `Open the ${code} board` },
      page
        ? { x: 6.4, z: -6.7, id: "projects", label: "See classmates' final projects" }
        : { x: 6.4, z: -6.7, id: "side-link", label: "Open what the staff put here" },
      ...(page ? [] : [{ x: 0, z: -6.7, id: "board-link", label: `Open the ${code} whiteboard` }]),
    ],
  };
}

// Chairs at the desks face the board (-z); in COMMON, the sofas face each
// other, the stools face the table, the armchairs face the shelves.
const DESK_SEATS = [-3.5, -1, 1.5, 4].flatMap((z) => [-6.5, -3.5, 3.5, 6.5].map((x) => ({ x, z: z + 0.8, rot: Math.PI, y: 0.45 })));
const LOUNGE_SEATS = [
  ...[-5.6, 5.6].flatMap((x) =>
    [-0.7, 0.7].flatMap((dx) => [
      { x: x + dx, z: 0.65, rot: 0, y: 0.42 },
      { x: x + dx, z: 4.25, rot: Math.PI, y: 0.42 },
    ]),
  ),
  ...[-1.8, -0.2, 1.4, 3].flatMap((z) => [
    { x: -1.45, z, rot: Math.PI / 2, y: 0.7 },
    { x: 1.45, z, rot: -Math.PI / 2, y: 0.7 },
  ]),
  ...[-4.6, -2].map((z) => ({ x: 7.4, z, rot: Math.PI / 2, y: 0.42 })),
];

/**
 * COMMON, the room for anyone: a lounge rather than a lecture room. Two
 * sofa corners on rugs, a long reading table with stools down the middle,
 * and a reading corner of open shelves, armchairs and a lamp on the right
 * (the left wall has the team rooms' doors). Kenney models, CC0.
 */
function furnishLounge(g: THREE.Group, colliders: Box[]): void {
  // Sofa corners either side, facing each other across a coffee table.
  for (const [x, rug] of [
    [-5.6, 0x3f6f73],
    [5.6, 0xb5654a],
  ] as const) {
    floor(g, 4.2, 4.6, x, 2.4, rug, 0.015);
    const fabric = { carpet: x < 0 ? 0x2f7d7a : 0xc8912a };
    place(g, "loungeSofaLong.glb", 0.85, x, 0.6, 0, true, 0, fabric);
    place(g, "loungeSofa.glb", 0.85, x, 4.3, Math.PI, true, 0, fabric);
    place(g, "tableCoffeeGlass.glb", 0.45, x, 2.4);
    solid(colliders, 3, 0.9, x, 0.6, SOFA_TOP);
    solid(colliders, 2.2, 0.9, x, 4.3, SOFA_TOP);
    solid(colliders, 1.4, 0.9, x, 2.4, SOFA_TOP);
  }
  // The big reading table down the middle, stools along both sides.
  block(g, colliders, [2, 0.8, 6.2], [0, 0.6], texMat("ai/wood_tabletop.jpg", 1, 3, 0xd9b48a));
  for (const z of [-1.8, -0.2, 1.4, 3]) {
    for (const x of [-1.45, 1.45]) place(g, "stoolBar.glb", 0.75, x, z, 0, true, 0, { carpet: 0x3a3f4a });
  }
  solid(colliders, 3.6, 6.4, 0, 0.6);
  for (const z of [-1.3, 2.2]) place(g, "plantSmall1.glb", 0.35, 0, z, 0, true, 0.8);
  // The reading corner, right-hand wall: shelves, two armchairs, a lamp.
  for (const z of [-4.4, -2.2]) {
    place(g, "bookcaseOpen.glb", 1.9, 9.55, z, -Math.PI / 2);
    solid(colliders, 0.7, 2, 9.55, z);
  }
  for (const z of [-4.6, -2]) {
    place(g, "loungeChair.glb", 0.8, 7.4, z, Math.PI / 2, true, 0, { carpet: 0x8a2f2f });
    solid(colliders, 1, 1, 7.4, z);
  }
  place(g, "lampRoundFloor.glb", 1.7, 8.9, -0.6);
  lightPool(g, 8.4, -1.6, 3.6, 3.6);
  for (const z of [-1.3, 2.2]) lightPool(g, 0, z, 2.4, 2.2, 0xfff0c8, 0.22);
  solid(colliders, 0.5, 0.5, 8.9, -0.6);
}
