import * as THREE from "three";
import { block, doorway, place, solid, texMat, textPlane, type Box, type SpaceDef } from "../world.ts";
import { roomShell } from "./room.ts";

// The Student Hub, inside building 154: a lounge to run into people in. Not
// a copy of the real one, and not an official ANU service. Along the east
// wall, six doors for the counselling rooms (invite-only group chats, a
// later step); only the doors exist for now.

const HALF = { halfX: 20, halfZ: 13 };

export function buildHub(): SpaceDef {
  const g = new THREE.Group();
  const colliders: Box[] = [];
  roomShell(g, colliders, HALF.halfX, HALF.halfZ, texMat("woodfloor.jpg", 10, 7), 0xe8e4da);
  const back = -HALF.halfZ + 0.01;

  // The desk at the back, with the sign above it, and the noticeboard.
  block(g, colliders, [6, 1.1, 1.2], [0, -HALF.halfZ + 1.4], 0x2f5d8a);
  const sign = textPlane(["Student Hub", "an unofficial, fan-made space"], 6, 1.4, { bg: "#2f5d8a", fg: "#ffffff", font: 0.42 });
  sign.position.set(0, 2.9, back);
  g.add(sign);
  const board = textPlane(["Noticeboard", "(boards coming soon)"], 3.2, 1.8, { bg: "#c8a26b", fg: "#3b2a12", font: 0.32 });
  board.position.set(-10, 2.2, back);
  g.add(board);

  // Two lounge corners: sofas facing a coffee table (Kenney models, CC0).
  for (const [x, z] of [
    [-13, -3],
    [-6, 6],
  ] as const) {
    place(g, "loungeSofa.glb", 0.9, x, z - 1.8, 0);
    place(g, "loungeSofa.glb", 0.9, x, z + 1.8, Math.PI);
    place(g, "tableCoffee.glb", 0.45, x, z);
    solid(colliders, 3, 1, x, z - 1.8);
    solid(colliders, 3, 1, x, z + 1.8);
    solid(colliders, 1.6, 0.9, x, z);
  }

  // Study tables with chairs, in a grid on the east side.
  for (const x of [3, 7.5, 12]) {
    for (const z of [-6, -1, 4]) {
      place(g, "table.glb", 0.75, x, z);
      place(g, "chair.glb", 0.9, x - 0.6, z + 0.9, Math.PI);
      place(g, "chair.glb", 0.9, x + 0.6, z + 0.9, Math.PI);
      solid(colliders, 1.6, 1, x, z);
    }
  }
  for (const x of [9, 12]) {
    place(g, "bookcaseOpen.glb", 2, x, -HALF.halfZ + 0.6);
    solid(colliders, 2, 1, x, -HALF.halfZ + 0.6);
  }

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
    bgm: "StudentHub.mp3",
  };
}
