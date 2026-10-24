import * as THREE from "three";
import { block, doorway, floor, lightPool, mat, paperPile, place, poster, SHARED_BGM, SOFA_TOP, solid, texMat, textPlane, type Box, type SpaceDef } from "../world.ts";
import { BOOKCASE_H, fillShelves } from "./library.ts";
import { COUNSEL_DOORS, roomDoors } from "./meeting.ts";
import { roomShell } from "./room.ts";

// The Student Hub, inside building 154: an office at the back and a lounge
// at the front, to run into people in. Not a copy of the real one, and not
// an official ANU service. In the north-west, a reception desk shaped like a
// mirrored ㄴ seen from the camera (┘): a long bar running east from the west
// wall, with a short leg going north at its east end. The board PC and the
// researcher-search PC sit on the bar's north edge; visitors stand on its
// south side, staff in the pocket behind it, open to the north. The admin's
// desk is in the far north-west corner, behind that pocket. The office pod of
// six desks is in the middle of the back half, the coffee bar under the sign.
// Along the east wall, six doors to the counselling rooms (meeting.ts):
// invite-only group chats, six people at most.

const HALF = { halfX: 20, halfZ: 13 };
/** The Hub's upholstery: navy, against its pale walls. */
const HUB_FABRIC = { carpet: 0x2f4f78 };
/** The three PCs on reception's bar (north edge, 2.25 m apart): E works from the south of each. */
const BOARD_PC = { x: -17, z: -4.15 };
// West to east along reception: the matching board, the researcher search,
// then ANU's AI guide as a pile of papers.
const FIND_PC = { x: -14.75, z: -4.15 };
const AI_PC = { x: -12.5, z: -4.15 };
// At the bar's east end, the visitors' right: questions for the Hub, public
// or private. The Hub's AI staff will stand in the pocket behind it.
const ASK_PC = { x: -10.1, z: -4.15 };
/** Where you stand to use them: just south of the bar (its south edge is z -3.55). */
const RECEPTION_SPOT_Z = -2.7;

export function buildHub(): SpaceDef {
  const g = new THREE.Group();
  const colliders: Box[] = [];
  roomShell(g, colliders, HALF.halfX, HALF.halfZ, texMat("ai/wood_floor.jpg", 16, 10.4), { tint: 0xe6e8ea, trim: 0x2f3e4f });
  const back = -HALF.halfZ + 0.01;

  // The admin's desk in the far north-west corner, against the back wall.
  // Its PC opens the admin's log and bug reports (the server only answers the
  // admin). The Hub's sign hangs on the back wall at the middle.
  // 8 m long from the corner, so more staff PCs can go on it later; the admin PC is at its west end.
  block(g, colliders, [8, 1.1, 1.2], [-15.9, -HALF.halfZ + 1.4], 0x2f5d8a);
  place(g, "computerScreen.glb", 0.5, -18.4, -HALF.halfZ + 1.3, 0, true, 1.1);
  const pcTag = textPlane(["Admin PC", "staff only"], 1.6, 0.42, { bg: "#1f2d3d", fg: "#ffffff", font: 0.17 });
  pcTag.position.set(-18.4, 1.85, -HALF.halfZ + 0.82);
  g.add(pcTag);
  // The staff's side looks like an office: a laptop, keyboard and lamp along
  // the back desk, a cupboard and archive boxes beyond it, and on reception's
  // short leg a laptop and keyboard facing the two advisers behind it.
  place(g, "laptop.glb", 0.22, -15.5, -HALF.halfZ + 1.4, 0, true, 1.1);
  place(g, "computerKeyboard.glb", 0.03, -16.8, -HALF.halfZ + 1.6, 0, true, 1.1);
  place(g, "computerMouse.glb", 0.03, -16.1, -HALF.halfZ + 1.6, 0, true, 1.1);
  place(g, "lampSquareTable.glb", 0.45, -12.6, -HALF.halfZ + 1.2, 0, true, 1.1);
  place(g, "bookcaseClosedDoors.glb", 1.9, -10.6, -HALF.halfZ + 0.45, 0);
  solid(colliders, 1, 0.6, -10.6, -HALF.halfZ + 0.45);
  place(g, "cardboardBoxClosed.glb", 0.35, -9.4, -HALF.halfZ + 0.5, 0.2);
  place(g, "cardboardBoxClosed.glb", 0.35, -9.4, -HALF.halfZ + 0.5, -0.3, true, 0.35);
  for (const z of [-5.2, -7.2]) {
    place(g, "laptop.glb", 0.22, -8.6, z + 0.35, -Math.PI / 2, true, 0.9);
    place(g, "computerKeyboard.glb", 0.03, -8.7, z - 0.35, -Math.PI / 2, true, 0.9);
  }
  const sign = textPlane(["Student Hub", "an unofficial, fan-made space"], 6, 1.4, { bg: "#2f5d8a", fg: "#ffffff", font: 0.42 });
  sign.position.set(0, 2.9, back);
  g.add(sign);

  // Reception: a mirrored ㄴ (┘) in the north-west. The bar runs along
  // z -4.45..-3.55 from the west wall to x -8; the leg goes north from its
  // east end (x -8.9..-8.0) up to z -8. Staff stand in the pocket west of the
  // leg and north of the bar (open to the north, the admin's desk in the
  // corner beyond); visitors come up from the west door (z 6) across the open
  // floor to the bar's south side. Along the bar's north edge, used from the
  // south (the spots below): the matching board's PC, the researcher search's
  // PC, and the AI guide as a pile of papers.
  const RECEPTION_WOOD = 0x8a5a32;
  block(g, colliders, [12, 0.9, 0.9], [-14, -4], RECEPTION_WOOD);
  block(g, colliders, [0.9, 0.9, 3.55], [-8.45, -6.225], RECEPTION_WOOD);
  place(g, "computerScreen.glb", 0.5, BOARD_PC.x, BOARD_PC.z, 0, true, 0.9);
  const boardTag = textPlane(["Lab matching board", "labs and students"], 1.9, 0.42, { bg: "#1f2d3d", fg: "#ffffff", font: 0.17 });
  boardTag.position.set(BOARD_PC.x, 1.85, BOARD_PC.z);
  g.add(boardTag);
  paperPile(g, AI_PC.x, AI_PC.z, 0.9);
  const aiTag = textPlane(["AI essentials", "ANU guide"], 1.6, 0.42, { bg: "#1f2d3d", fg: "#ffffff", font: 0.17 });
  aiTag.position.set(AI_PC.x, 1.85, AI_PC.z);
  g.add(aiTag);
  place(g, "computerScreen.glb", 0.5, FIND_PC.x, FIND_PC.z, 0, true, 0.9);
  const findTag = textPlane(["Find a researcher"], 1.6, 0.42, { bg: "#1f2d3d", fg: "#ffffff", font: 0.17 });
  findTag.position.set(FIND_PC.x, 1.85, FIND_PC.z);
  g.add(findTag);
  place(g, "computerScreen.glb", 0.5, ASK_PC.x, ASK_PC.z, 0, true, 0.9);
  const askTag = textPlane(["Ask the Hub", "public or private"], 1.6, 0.42, { bg: "#2f5d8a", fg: "#ffffff", font: 0.17 });
  askTag.position.set(ASK_PC.x, 1.85, ASK_PC.z);
  g.add(askTag);
  // A poster on the west wall, in the reception pocket.
  const art = poster("ai/poster_hub.jpg", 1.6, 2.4);
  art.position.set(-HALF.halfX + 0.01, 2, -7.5);
  art.rotation.y = Math.PI / 2;
  g.add(art);

  // The office half, at the back: two pods of three desks facing each
  // other, one in the middle and one to the east, each with a monitor and a chair, and closed bookcases on the wall
  // (Kenney models, CC0).
  for (const cx of [-2, 8.5]) {
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
  // East of the sign, west to east: the calendar, the coffee bar, the
  // arcades, then two bookcases full of books in the corner.
  const shelves: [number, number][] = [15.45, 17.4].map((x) => [x, -HALF.halfZ + 0.4]);
  for (const [x, z] of shelves) place(g, "bookcaseClosedWide.glb", BOOKCASE_H, x, z);
  fillShelves(g, shelves);
  solid(colliders, 4, 0.7, 16.4, -HALF.halfZ + 0.4);
  // A big wall calendar (plan 66): this month, and E opens ANU's university
  // calendar for this year (it won't be framed: a new tab).
  wallCalendar(g, CALENDAR.x, -HALF.halfZ + 0.02);
  // A coffee bar on the back wall, east of the calendar (the north-west corner is the admin's).
  for (const x of [8.5, 9.5]) place(g, "kitchenBar.glb", 0.95, x, -HALF.halfZ + 0.5);
  place(g, "kitchenCoffeeMachine.glb", 0.4, 8.5, -HALF.halfZ + 0.5, 0, true, 0.95);
  solid(colliders, 2.2, 0.8, 9, -HALF.halfZ + 0.5);

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
    solid(colliders, 2.4, 0.9, x, z - 1.7, SOFA_TOP);
    solid(colliders, 2.4, 0.9, x, z + 1.7, SOFA_TOP);
    solid(colliders, 1.4, 0.9, x, z, SOFA_TOP);
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
    [-10.5, -12],
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
    [-3.5, -7.7],
    [10, -7.4],
  ] as const) place(g, "plantSmall2.glb", 0.35, x, z, 0, true, 0.75);
  place(g, "books.glb", 0.12, 7, -7.5, 0.4, true, 0.75);
  place(g, "books.glb", 0.12, -0.5, -8, 1.2, true, 0.75);

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
      { x: -18.4, z: -HALF.halfZ + 2.6, label: "Use the admin PC (activity log, bug reports)", url: "/admin/", embeddable: true },
      // ANU's AI guide sends X-Frame-Options: SAMEORIGIN, so a new tab.
      { x: AI_PC.x, z: RECEPTION_SPOT_Z, label: "Read ANU's AI essentials (new tab)", url: "https://learningandteaching.anu.edu.au/resource-collection/ai-essentials/", embeddable: false },
      // The research portal won't be framed, so a new tab. Used from the
      // south of reception's bar.
      { x: FIND_PC.x, z: RECEPTION_SPOT_Z, label: "Find an ANU researcher (new tab)", url: "https://researchportalplus.anu.edu.au/", embeddable: false },
      // ANU's events listing refuses to be framed: a new tab.
      { x: CALENDAR.x, z: -HALF.halfZ + 1.9, label: "Open ANU's university calendar (new tab)", url: `https://www.anu.edu.au/directories/university-calendar?audience=All&year=${new Date().getFullYear()}`, embeddable: false },
    ],
    // The board PC on reception's bar: you stand south of it.
    spots: [
      { x: BOARD_PC.x, z: RECEPTION_SPOT_Z, id: "board", label: "Open the lab matching board" },
      { x: ASK_PC.x, z: RECEPTION_SPOT_Z, id: "enquiries", label: "Ask the Hub a question" },
    ],
  };
}

/** The wall calendar on the north wall; E from in front. */
const CALENDAR = { x: 5.6 };

/** This month as a wall calendar: a header and a grid of days, today ringed (drawn once, on a canvas). */
function wallCalendar(g: THREE.Group, x: number, z: number): void {
  const now = new Date();
  const month = now.toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "Australia/Canberra" });
  const W = 1024;
  const H = 640;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fbfbf7";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#2f5d8a";
  ctx.fillRect(0, 0, W, 120);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 56px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`Campus events · ${month}`, W / 2, 80);
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  ctx.fillStyle = "#3b2a12";
  ctx.font = "600 30px system-ui, sans-serif";
  days.forEach((d, i) => ctx.fillText(d, 80 + i * 144, 165));
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7;
  const count = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  ctx.font = "500 34px system-ui, sans-serif";
  for (let d = 1; d <= count; d++) {
    const cell = lead + d - 1;
    const cx = 80 + (cell % 7) * 144;
    const cy = 215 + Math.floor(cell / 7) * 80;
    if (d === now.getDate()) {
      ctx.strokeStyle = "#c0392b";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(cx, cy - 12, 30, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = cell % 7 >= 5 ? "#8a8f96" : "#1f2d3d";
    ctx.fillText(String(d), cx, cy);
  }
  ctx.fillStyle = "#6b3f1d";
  ctx.font = "500 26px system-ui, sans-serif";
  ctx.fillText("What's on at ANU: press E", W / 2, H - 22);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.75), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  board.position.set(x, 2.1, z);
  g.add(board);
}

// Sketch & Guess runs on this server; the other two are my earlier course
// games on GitHub Pages: Two-Tone (riff 5, made with my pod) and Retro Run &
// Gun (my crit 5). Both let themselves be shown inside another page.
const GAMES = [
  { x: 11, title: "Two-Tone", url: "https://passionleader.github.io/anu-agentic-coding-studio/riff5-passionleader/modified/", screen: ["Two-Tone"], marquee: 0x40c0ff },
  { x: 12.4, title: "Sketch & Guess", url: "/minigame/sketch/", screen: ["Sketch", "& Guess"], marquee: 0xff5fa2 },
  { x: 13.8, title: "Retro Run & Gun", url: "https://passionleader.github.io/anu-agentic-coding-studio/crit5-passionleader/", screen: ["Retro", "Run & Gun"], marquee: 0xffb030 },
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
