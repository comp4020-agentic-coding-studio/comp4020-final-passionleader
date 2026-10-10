import * as THREE from "three";
import { block, doorway, place, solid, texMat, textPlane, type Box, type SpaceDef } from "../world.ts";
import { roomShell } from "./room.ts";

// The Student Hub, inside building 154: a lounge to run into people in. Not
// a copy of the real one, and not an official ANU service.

const HALF = { halfX: 12, halfZ: 9 };

export function buildHub(): SpaceDef {
  const g = new THREE.Group();
  const colliders: Box[] = [];
  roomShell(g, colliders, HALF.halfX, HALF.halfZ, texMat("woodfloor.jpg", 6, 5), 0xe8e4da);

  // The desk at the back, with the sign above it.
  block(g, colliders, [6, 1.1, 1.2], [0, -7.6], 0x2f5d8a);
  const sign = textPlane(["Student Hub", "an unofficial, fan-made space"], 6, 1.4, { bg: "#2f5d8a", fg: "#ffffff", font: 0.42 });
  sign.position.set(0, 2.9, -HALF.halfZ + 0.01);
  g.add(sign);
  const board = textPlane(["Noticeboard", "(boards coming soon)"], 3.2, 1.8, { bg: "#c8a26b", fg: "#3b2a12", font: 0.32 });
  board.position.set(-8, 2.2, -HALF.halfZ + 0.01);
  g.add(board);

  // Lounge corner: two sofas facing a coffee table (Kenney models, CC0).
  place(g, "loungeSofa.glb", 0.9, -7.5, 0.2, 0);
  place(g, "loungeSofa.glb", 0.9, -7.5, 3.8, Math.PI);
  place(g, "tableCoffee.glb", 0.45, -7.5, 2);
  solid(colliders, 3, 1, -7.5, 0.2);
  solid(colliders, 3, 1, -7.5, 3.8);
  solid(colliders, 1.6, 0.9, -7.5, 2);

  // Study tables with chairs.
  for (const [x, z] of [
    [4, -2],
    [8, -2],
    [4, 3],
    [8, 3],
  ] as const) {
    place(g, "table.glb", 0.75, x, z);
    place(g, "chair.glb", 0.9, x - 0.6, z + 0.9, Math.PI);
    place(g, "chair.glb", 0.9, x + 0.6, z + 0.9, Math.PI);
    solid(colliders, 1.6, 1, x, z);
  }
  place(g, "bookcaseOpen.glb", 2, 10.6, -4, -Math.PI / 2);
  solid(colliders, 1, 2, 10.6, -4);

  for (const [x, z] of [
    [-11, -8],
    [11, -8],
    [11, 8],
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
    doors: [{ x: -10.9, z: 6, label: "Go outside", to: "outdoor", arrive: { x: 4.1, z: 3 } }],
    ...HALF,
    background: 0xd9d4c6,
    camera: new THREE.Vector3(0, 6.5, 7.5),
    bgm: "StudentHub.mp3",
  };
}
