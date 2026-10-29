import * as THREE from "three";
import { block, doorway, floor, mat, place, solid, textPlane, type Box, type SpaceDef } from "../world.ts";
import { roomShell } from "./room.ts";

// An easter egg (plan 62): crit 8's Poop Room, where this project began,
// now a washroom with four stalls, behind an unmarked "Staff only" door at
// the far end of Lab Coffee. In here the Q menu's first item poops instead of sticking a
// note; one poop each (a new one replaces your last), five seconds apart,
// kept 30 days (server/db.ts). Since plan 104 it's half as big again, the
// way out on the north wall and the stalls down the west wall, so the camera
// sees into them.

const HALF = { halfX: 9, halfZ: 6.75 };
/** The stalls' middles down the west wall. */
const STALLS = [-4.5, -1.5, 1.5, 4.5];
/** The way out, on the north wall's east end. */
const EXIT_X = 6;

export function buildPoop(): SpaceDef {
  const g = new THREE.Group();
  const colliders: Box[] = [];
  roomShell(g, colliders, HALF.halfX, HALF.halfZ, 0xe8eef2, { tint: 0xdfe8ec, trim: 0x8a9aa8 });
  // Checked tiles on the floor.
  for (let x = -HALF.halfX; x < HALF.halfX; x++)
    for (let z = Math.floor(-HALF.halfZ); z < HALF.halfZ; z++) if (((x + z) % 2 + 2) % 2 === 0) floor(g, 1, 1, x + 0.5, z + 0.5, 0xc9d4da, 0.012);
  const white = mat(0xf7f9fa);
  const panel = 0x7d9bb0;
  const wallX = -HALF.halfX;
  // Kenney's toilet, as in crit 8, in each stall, facing east into the room.
  STALLS.forEach((z) => {
    place(g, "toilet.glb", 1, wallX + 0.45, z, Math.PI / 2);
    solid(colliders, 0.9, 0.7, wallX + 0.5, z);
  });
  // Partitions between the stalls (and at both ends), 1.7 m high, 2 m deep from the wall.
  for (const z of [-5.95, -3, 0, 3, 5.95]) block(g, colliders, [2, 1.7, 0.06], [wallX + 1, z, 0.15], panel);
  // Sinks and a mirror on the east wall.
  for (const z of [0.5, 2.3, 4.1]) {
    block(g, colliders, [0.7, 0.15, 0.5], [HALF.halfX - 0.3, z, 0.8], white);
    block(g, null, [0.12, 0.8, 0.5], [HALF.halfX - 0.3, z, 0], white);
  }
  block(g, null, [0.04, 0.9, 4.4], [HALF.halfX - 0.03, 1.4, 2.3], 0xbcd2dc);
  // The sign over the stalls, on the west wall.
  const sign = textPlane(["Poop Room", "where it all began · crit 8"], 3, 0.6, { bg: "#ffffff", fg: "#5a3a22", font: 0.18 });
  sign.position.set(wallX + 0.01, 2.5, 0);
  sign.rotation.y = Math.PI / 2;
  g.add(sign);
  doorway(g, EXIT_X, -HALF.halfZ + 0.05, 0, "Back out");

  return {
    id: "poop",
    title: "a small room",
    group: g,
    colliders,
    doors: [{ x: EXIT_X, z: -HALF.halfZ + 1.1, label: "Go back out", to: "outdoor", arrive: { x: 24.5, z: -21.6 } }],
    ...HALF,
    background: 0xe8eef2,
    camera: new THREE.Vector3(0, 6, 7.5),
    bgm: ["Calm_Loop.mp3"],
    floor: "concrete",
    noNotes: true,
  };
}

/** One poop: three brown swirls, smallest on top, with its owner's name. */
export function poopMesh(): THREE.Group {
  const g = new THREE.Group();
  const brown = mat(0x6b4423);
  [
    [0.2, 0.06],
    [0.15, 0.16],
    [0.09, 0.25],
  ].forEach(([r, y]) => {
    const swirl = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), brown);
    swirl.scale.y = 0.6;
    swirl.position.y = y;
    g.add(swirl);
  });
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 10), brown);
  tip.position.y = 0.32;
  g.add(tip);
  return g;
}
