import * as THREE from "three";
import { block, doorway, floor, place, solid, texMat, textPlane, type Box, type SpaceDef } from "../world.ts";
import { roomShell } from "./room.ts";

// The Student Hub, inside building 154: an office at the back and a lounge
// at the front, to run into people in. Not a copy of the real one, and not
// an official ANU service. Along the east
// wall, six doors for the counselling rooms (invite-only group chats, a
// later step); only the doors exist for now.

const HALF = { halfX: 20, halfZ: 13 };

export function buildHub(): SpaceDef {
  const g = new THREE.Group();
  const colliders: Box[] = [];
  roomShell(g, colliders, HALF.halfX, HALF.halfZ, texMat("ai/wood_floor.jpg", 16, 10.4), 0xe8e4da);
  const back = -HALF.halfZ + 0.01;

  // The desk at the back, with the sign above it, and the noticeboard.
  block(g, colliders, [6, 1.1, 1.2], [0, -HALF.halfZ + 1.4], 0x2f5d8a);
  const sign = textPlane(["Student Hub", "an unofficial, fan-made space"], 6, 1.4, { bg: "#2f5d8a", fg: "#ffffff", font: 0.42 });
  sign.position.set(0, 2.9, back);
  g.add(sign);
  const board = textPlane(["Noticeboard", "(boards coming soon)"], 3.2, 1.8, { bg: "#c8a26b", fg: "#3b2a12", font: 0.32 });
  board.position.set(-10, 2.2, back);
  g.add(board);

  // The office half, at the back: two pods of three desks facing each
  // other, each with a monitor and a chair, and closed bookcases on the wall
  // (Kenney models, CC0).
  for (const cx of [-12, 8.5]) {
    for (const dx of [-1.5, 0, 1.5]) {
      const x = cx + dx;
      place(g, "desk.glb", 0.75, x, -7, Math.PI);
      place(g, "chairDesk.glb", 1, x, -6.1, Math.PI);
      place(g, "computerScreen.glb", 0.45, x, -7.25, 0, true, 0.75);
      place(g, "desk.glb", 0.75, x, -8.1);
      place(g, "chairDesk.glb", 1, x, -9, 0);
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
  const rooms = textPlane(["Counselling rooms · coming soon"], 14, 0.6, { bg: "#e8e4da", fg: "#2f5d8a", font: 0.4 });
  rooms.position.set(wallX, 3.55, 0);
  rooms.rotation.y = -Math.PI / 2;
  g.add(rooms);

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

  return {
    id: "hub",
    title: "Student Hub",
    group: g,
    colliders,
    doors: [{ x: -HALF.halfX + 1.1, z: 6, label: "Go outside", to: "outdoor", arrive: { x: 4.1, z: 3 } }],
    ...HALF,
    background: 0xd9d4c6,
    camera: new THREE.Vector3(0, 6.5, 7.5),
    bgm: ["Margin_Notes.mp3"],
  };
}
