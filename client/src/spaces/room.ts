import * as THREE from "three";
import { block, floor, type Box } from "../world.ts";
import { markOccluder } from "./occluders.ts";

// The shell every indoor space shares: a floor, full-height back and side
// walls, and a low front wall on the camera's side so it never blocks the view.

const WALL_H = 4;
const T = 0.3;

export function roomShell(g: THREE.Group, colliders: Box[], halfX: number, halfZ: number, floorColor: number, wallColor: number): void {
  floor(g, halfX * 2 + 2, halfZ * 2 + 2, 0, 0, floorColor);
  block(g, colliders, [halfX * 2 + 2 * T, WALL_H, T], [0, -halfZ - T / 2], wallColor);
  for (const side of [-1, 1]) {
    const wall = block(g, colliders, [T, WALL_H, halfZ * 2], [side * (halfX + T / 2), 0], wallColor);
    markOccluder(g, wall);
  }
  block(g, colliders, [halfX * 2 + 2 * T, 0.9, T], [0, halfZ + T / 2], wallColor);
}

/** A potted plant: a pot and a round green top. */
export function plant(g: THREE.Group, colliders: Box[], x: number, z: number): void {
  block(g, colliders, [0.6, 0.6, 0.6], [x, z], 0x8a5a3c);
  const top = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), new THREE.MeshLambertMaterial({ color: 0x4f8a3c }));
  top.position.set(x, 1.15, z);
  g.add(top);
}
