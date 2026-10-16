import * as THREE from "three";
import { block, chalkboard, doorway, floor, lightPool, mat, place, poster, SHARED_BGM, solid, texMat, textPlane, type Box, type SpaceDef } from "../world.ts";
import { COUNSEL_DOORS, roomDoors } from "./meeting.ts";
import { roomShell } from "./room.ts";

// The Student Hub, inside building 154: an office at the back and a lounge
// at the front, to run into people in. Not a copy of the real one, and not
// an official ANU service. Along the east
// wall, six doors to the counselling rooms (meeting.ts): invite-only group
// chats, six people at most.

const HALF = { halfX: 20, halfZ: 13 };
/** The Hub's upholstery: navy, against its pale walls. */
const HUB_FABRIC = { carpet: 0x2f4f78 };

export function buildHub(): SpaceDef {
  const g = new THREE.Group();
  const colliders: Box[] = [];
  roomShell(g, colliders, HALF.halfX, HALF.halfZ, texMat("ai/wood_floor.jpg", 16, 10.4), { tint: 0xe6e8ea, trim: 0x2f3e4f });
  const back = -HALF.halfZ + 0.01;

  // The desk at the back, with the sign above it. The
  // reception PC on the desk opens the admin's log and bug reports (the
  // server only answers the admin).
  block(g, colliders, [6, 1.1, 1.2], [0, -HALF.halfZ + 1.4], 0x2f5d8a);
  place(g, "computerScreen.glb", 0.5, -1.5, -HALF.halfZ + 1.3, 0, true, 1.1);
  const pcTag = textPlane(["Reception PC", "staff only"], 1.6, 0.42, { bg: "#1f2d3d", fg: "#ffffff", font: 0.17 });
  pcTag.position.set(-1.5, 1.85, -HALF.halfZ + 0.82);
  g.add(pcTag);
  const sign = textPlane(["Student Hub", "an unofficial, fan-made space"], 6, 1.4, { bg: "#2f5d8a", fg: "#ffffff", font: 0.42 });
  sign.position.set(0, 2.9, back);
  g.add(sign);
  // The Hub's board, where staff and students find each other (Labs looking
  // for students, Students looking for labs, Ask the Hub), and beside it a
  // desk whose PC opens ANU's researcher search in a new tab.
  const cork = chalkboard(["Student Hub board", "Labs · Students · Ask the Hub", "press E to read and post"], 3.4, 2.2, 0.25);
  cork.position.set(-10, 2.1, back + 0.03);
  g.add(cork);
  block(g, colliders, [1.6, 0.8, 0.8], [-6, -HALF.halfZ + 0.5], 0x6b4a2b);
  place(g, "computerScreen.glb", 0.5, -6, -HALF.halfZ + 0.5, 0, true, 0.8);
  const findTag = textPlane(["Find a researcher", "opens a new tab"], 1.6, 0.42, { bg: "#1f2d3d", fg: "#ffffff", font: 0.17 });
  findTag.position.set(-6, 1.85, back);
  g.add(findTag);
  // The poster that held the board's place, now on the west wall.
  const art = poster("ai/poster_hub.jpg", 1.6, 2.4);
  art.position.set(-HALF.halfX + 0.01, 2, -4);
  art.rotation.y = Math.PI / 2;
  g.add(art);

  // The office half, at the back: two pods of three desks facing each
  // other, each with a monitor and a chair, and closed bookcases on the wall
  // (Kenney models, CC0).
  for (const cx of [-12, 8.5]) {
    for (const dx of [-1.5, 0, 1.5]) {
      const x = cx + dx;
      place(g, "desk.glb", 0.75, x, -7, Math.PI);
      place(g, "chairDesk.glb", 1, x, -6.1, Math.PI, true, 0, HUB_FABRIC);
      place(g, "computerScreen.glb", 0.45, x, -7.25, 0, true, 0.75);
      place(g, "desk.glb", 0.75, x, -8.1);
      place(g, "chairDesk.glb", 1, x, -9, 0, true, 0, HUB_FABRIC);
      place(g, "computerScreen.glb", 0.45, x, -7.85, Math.PI, true, 0.75);
    }
    solid(colliders, 4.6, 2.3, cx, -7.55);
  }
  for (const x of [12.5, 15]) {
    place(g, "bookcaseClosedWide.glb", 1.9, x, -HALF.halfZ + 0.4);
    solid(colliders, 2, 0.7, x, -HALF.halfZ + 0.4);
  }
  // A coffee bar in the back corner.
  for (const x of [-18, -17]) place(g, "kitchenBar.glb", 0.95, x, -HALF.halfZ + 0.5);
  place(g, "kitchenCoffeeMachine.glb", 0.4, -18, -HALF.halfZ + 0.5, 0, true, 0.95);
  solid(colliders, 2.2, 0.8, -17.5, -HALF.halfZ + 0.5);

  // The lounge half, at the front: three corners of two sofas facing each
  // other across a glass coffee table, on a rug, with a floor lamp.
  const rugs = [0x3f6f73, 0xb5654a, 0xc9a13b];
  [-11, -2, 7].forEach((x, i) => {
    const z = 5;
    floor(g, 3.4, 4.8, x, z, rugs[i]!, 0.015);
    place(g, "loungeDesignSofa.glb", 0.8, x, z - 1.7, 0);
    place(g, "loungeDesignSofa.glb", 0.8, x, z + 1.7, Math.PI);
    place(g, "tableCoffeeGlass.glb", 0.45, x, z);
    place(g, "plantSmall1.glb", 0.4, x + 0.3, z, 0, true, 0.45);
    place(g, "lampRoundFloor.glb", 1.7, x + 1.9, z - 1.9);
    lightPool(g, x + 1.9, z - 1.9, 3.2, 3.2);
    solid(colliders, 2.4, 0.9, x, z - 1.7);
    solid(colliders, 2.4, 0.9, x, z + 1.7);
    solid(colliders, 1.4, 0.9, x, z);
  });

  // The counselling rooms' doors, 4 m apart down the east wall, signed on
  // the wall itself: six floating labels would pile up seen end-on.
  const wallX = HALF.halfX - 0.02;
  [-10, -6, -2, 2, 6, 10].forEach((z, i) => {
    doorway(g, HALF.halfX - 0.05, z, -Math.PI / 2, "");
    const num = textPlane([String(i + 1)], 0.6, 0.5, { bg: "#2f5d8a", fg: "#ffffff", font: 0.36 });
    num.position.set(wallX, 2.95, z);
    num.rotation.y = -Math.PI / 2;
    g.add(num);
  });
  const rooms = textPlane(["Counselling rooms · invite only"], 14, 0.6, { bg: "#e8e4da", fg: "#2f5d8a", font: 0.4 });
  rooms.position.set(wallX, 3.55, 0);
  rooms.rotation.y = -Math.PI / 2;
  g.add(rooms);

  // A row of arcade machines against the back wall, each opening a game in
  // the in-app window.
  for (const game of GAMES) arcade(g, colliders, game.x, -HALF.halfZ + 0.6, game.screen, game.marquee);

  for (const [x, z] of [
    [-19, -12],
    [17, -12],
    [17, 12],
    [-19, 12],
  ] as const) {
    place(g, "pottedPlant.glb", 1.3, x, z);
    solid(colliders, 0.7, 0.7, x, z);
  }

  doorway(g, -HALF.halfX + 0.05, 6, Math.PI / 2, "Exit to campus");

  // Small things that make it lived-in: bins, a coat stand, plants on the
  // desks, books, and a rug at the door.
  for (const [x, z] of [
    [-16.5, -9],
    [5.5, 11.5],
    [-18.5, 2.5],
  ] as const) {
    place(g, "trashcan.glb", 0.6, x, z);
    solid(colliders, 0.5, 0.5, x, z);
  }
  place(g, "coatRackStanding.glb", 1.8, -18.8, 9.6);
  solid(colliders, 0.6, 0.6, -18.8, 9.6);
  place(g, "rugRectangle.glb", 0.05, -17.6, 6, Math.PI / 2, false);
  for (const [x, z] of [
    [-13.5, -7.7],
    [10, -7.4],
  ] as const) place(g, "plantSmall2.glb", 0.35, x, z, 0, true, 0.75);
  place(g, "books.glb", 0.12, 7, -7.5, 0.4, true, 0.75);
  place(g, "books.glb", 0.12, -10.5, -8, 1.2, true, 0.75);

  return {
    id: "hub",
    title: "Student Hub",
    group: g,
    colliders,
    doors: [
      { x: -HALF.halfX + 1.1, z: 6, label: "Go outside", to: "outdoor", arrive: { x: 4.1, z: 3 } },
      ...roomDoors("counsel", COUNSEL_DOORS, (n) => `Enter counselling room ${n}`),
    ],
    ...HALF,
    background: 0xd9d4c6,
    camera: new THREE.Vector3(0, 6.5, 7.5),
    bgm: SHARED_BGM,
    floor: "wood",
    // A place to sit together; notes go up outside and in classrooms.
    noNotes: true,
    seats: [-11, -2, 7].flatMap((x) =>
      [-0.5, 0.5].flatMap((dx) => [
        { x: x + dx, z: 5 - 1.75, rot: 0, y: 0.4 },
        { x: x + dx, z: 5 + 1.75, rot: Math.PI, y: 0.4 },
      ]),
    ),
    // The arcade machines: E opens each game in the in-app window.
    links: [
      ...GAMES.map((game) => ({ x: game.x, z: -HALF.halfZ + 1.9, label: `Play ${game.title}`, url: game.url, embeddable: true })),
      { x: -1.5, z: -HALF.halfZ + 2.6, label: "Use the reception PC (activity log, bug reports)", url: "/admin/", embeddable: true },
      // The research portal won't be framed, so a new tab.
      { x: -6, z: -HALF.halfZ + 1.6, label: "Find an ANU researcher (new tab)", url: "https://researchportalplus.anu.edu.au/", embeddable: false },
    ],
    spots: [{ x: -10, z: -HALF.halfZ + 1.4, id: "board", label: "Open the Student Hub board" }],
  };
}

// Sketch & Guess runs on this server; the other two are my earlier course
// games on GitHub Pages: Two-Tone (riff 5, made with my pod) and Retro Run &
// Gun (my crit 5). Both let themselves be shown inside another page.
const GAMES = [
  { x: 4.5, title: "Two-Tone", url: "https://passionleader.github.io/anu-agentic-coding-studio/riff5-passionleader/modified/", screen: ["Two-Tone", "press E"], marquee: 0x40c0ff },
  { x: 7, title: "Sketch & Guess", url: "/minigame/sketch/", screen: ["Sketch", "& Guess", "press E"], marquee: 0xff5fa2 },
  { x: 9.5, title: "Retro Run & Gun", url: "https://passionleader.github.io/anu-agentic-coding-studio/crit5-passionleader/", screen: ["Retro", "Run & Gun", "press E"], marquee: 0xffb030 },
];

/**
 * An arcade cabinet against the back wall, facing the room (+z), built from
 * boxes: a dark body, a lit screen showing the game's name, a control deck
 * and a marquee.
 */
function arcade(g: THREE.Group, colliders: Box[], x: number, z: number, lines: string[], glow: number): void {
  const cab = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.9, 0.8), mat(0x2b2350));
  body.position.y = 0.95;
  const screen = textPlane(lines, 0.66, 0.56, { bg: "#141a3a", fg: "#ffd84a", font: 0.12 });
  screen.position.set(0, 1.42, 0.405);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.36), mat(0x3d3470));
  deck.position.set(0, 1.02, 0.52);
  deck.rotation.x = -0.25;
  const marquee = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.24, 0.1),
    new THREE.MeshStandardMaterial({ color: glow, emissive: glow, emissiveIntensity: 0.6 }),
  );
  marquee.position.set(0, 1.98, 0.36);
  const buttons = [0xff4040, 0x40c0ff, 0x60e060].map((c, i) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 12), mat(c));
    b.position.set(-0.15 + i * 0.15, 1.08, 0.56);
    return b;
  });
  cab.add(body, screen, deck, marquee, ...buttons);
  cab.position.set(x, 0, z);
  g.add(cab);
  solid(colliders, 1, 1.1, x, z + 0.1);
}
