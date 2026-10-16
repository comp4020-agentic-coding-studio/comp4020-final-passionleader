import * as THREE from "three";
import { block, floor, texMat, type Box } from "../world.ts";
import { markOccluder } from "./occluders.ts";

// The shell every indoor space shares: a floor, full-height back and side
// walls, and a low front wall on the camera's side so it never blocks the
// view. Walls are painted plaster (a Gemini texture, tinted per room) unless
// a room passes its own, with a dark skirting board along the floor and a
// cornice along the top, so a room reads as a room, not a box.

const WALL_H = 4;
const T = 0.3;
/** About how many metres one tile of a wall texture covers. */
const WALL_TILE = 2.5;

export interface Walls {
  /** A texture in assets/tex, tiled about every 2.5 m; plain plaster if left out. */
  texture?: string;
  /** Multiplied with the texture: the room's paint colour. */
  tint: number;
  /** Skirting board and cornice. */
  trim?: number;
}

export function roomShell(g: THREE.Group, colliders: Box[], halfX: number, halfZ: number, floorColor: number | THREE.Material, wall: number | Walls): void {
  const w: Walls = typeof wall === "number" ? { tint: wall } : wall;
  const file = w.texture ?? "ai/interior_wall.jpg";
  const paint = (len: number, h: number): THREE.Material => texMat(file, Math.max(1, Math.round(len / WALL_TILE)), Math.max(1, Math.round(h / WALL_TILE)), w.tint);
  const trim = w.trim ?? 0x5a4632;

  floor(g, halfX * 2 + 2, halfZ * 2 + 2, 0, 0, floorColor);
  block(g, colliders, [halfX * 2 + 2 * T, WALL_H, T], [0, -halfZ - T / 2], paint(halfX * 2, WALL_H));
  for (const side of [-1, 1]) {
    const sideWall = block(g, colliders, [T, WALL_H, halfZ * 2], [side * (halfX + T / 2), 0], paint(halfZ * 2, WALL_H));
    markOccluder(g, sideWall);
  }
  block(g, colliders, [halfX * 2 + 2 * T, 0.9, T], [0, halfZ + T / 2], paint(halfX * 2, 0.9));

  // Skirting and cornice on the back wall, and the skirting along the sides
  // (thin strips, not colliders; the side ones fade with their walls).
  const strip = (w2: number, h: number, d: number, x: number, z: number, y: number): THREE.Mesh => block(g, null, [w2, h, d], [x, z, y], trim);
  strip(halfX * 2, 0.14, 0.05, 0, -halfZ + 0.025, 0);
  strip(halfX * 2, 0.12, 0.08, 0, -halfZ + 0.04, WALL_H - 0.12);
  for (const side of [-1, 1]) markOccluder(g, strip(0.05, 0.14, halfZ * 2, side * (halfX - 0.025), 0, 0));
}

/** A potted plant: a pot and a round green top. */
export function plant(g: THREE.Group, colliders: Box[], x: number, z: number): void {
  block(g, colliders, [0.6, 0.6, 0.6], [x, z], 0x8a5a3c);
  const top = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), new THREE.MeshStandardMaterial({ color: 0x4f8a3c, roughness: 0.9 }));
  top.position.set(x, 1.15, z);
  g.add(top);
}
