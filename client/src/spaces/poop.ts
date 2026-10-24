import * as THREE from "three";
import { block, doorway, floor, mat, place, solid, textPlane, type Box, type SpaceDef } from "../world.ts";
import { roomShell } from "./room.ts";

// An easter egg (plan 62): crit 8's Poop Room, where this project began,
// now a washroom with four stalls, behind an unmarked "Staff only" door at
// the far end of Lab Coffee. In here the Q menu's first item poops instead of sticking a
// note; one poop each (a new one replaces your last), five seconds apart,
// kept only while the server runs.

export function buildPoop(): SpaceDef {
  const g = new THREE.Group();
  const colliders: Box[] = [];
  const half = { halfX: 6, halfZ: 4.5 };
  roomShell(g, colliders, half.halfX, half.halfZ, 0xe8eef2, { tint: 0xdfe8ec, trim: 0x8a9aa8 });
  // Checked tiles on the floor.
  for (let x = -6; x < 6; x++) for (let z = -4.5; z < 4.5; z++) if ((x + z + 0.5) % 2 === 0) floor(g, 1, 1, x + 0.5, z + 0.5, 0xc9d4da, 0.012);
  // Four stalls along the north wall, open at the front, a toilet in each.
  const white = mat(0xf7f9fa);
  const panel = 0x7d9bb0;
  // Kenney's toilet, as in crit 8, facing the room.
  STALLS.forEach((x) => {
    place(g, "toilet.glb", 1, x, -4.05);
    solid(colliders, 0.7, 0.9, x, -4);
  });
  // Partitions between the stalls (and at both ends), 1.7 m high, 2 m deep.
  for (const x of [-5.95, -3, 0, 3, 5.95]) block(g, colliders, [0.06, 1.7, 2], [x, -3.5, 0.15], panel);
  // Sinks and a mirror on the east wall.
  for (const z of [0.5, 2.3]) {
    block(g, colliders, [0.5, 0.15, 0.7], [5.7, z, 0.8], white);
    block(g, null, [0.5, 0.8, 0.12], [5.7, z + 0.35, 0], white);
  }
  block(g, null, [0.04, 0.9, 2.6], [5.97, 1.4, 1.3], 0xbcd2dc);
  // The sign over the stalls.
  const sign = textPlane(["Poop Room", "where it all began · crit 8"], 3, 0.6, { bg: "#ffffff", fg: "#5a3a22", font: 0.18 });
  sign.position.set(0, 2.5, -4.49);
  g.add(sign);
  doorway(g, -5.95, 2, Math.PI / 2, "Back out");

  return {
    id: "poop",
    title: "a small room",
    group: g,
    colliders,
    doors: [{ x: -5.2, z: 2, label: "Go back out", to: "outdoor", arrive: { x: 24.5, z: -21.6 } }],
    ...half,
    background: 0xe8eef2,
    camera: new THREE.Vector3(0, 5.5, 6.5),
    bgm: ["Calm_Loop.mp3"],
    floor: "concrete",
    noNotes: true,
  };
}

/** The stalls' middles along the north wall. */
const STALLS = [-4.5, -1.5, 1.5, 4.5];

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
