import * as THREE from "three";
import { block, doorway, floor, mat, SHARED_BGM, solid, textPlane, type Box, type SpaceDef } from "../world.ts";
import { roomShell } from "./room.ts";

// An easter egg (plan 62): crit 8's Poop Room, where this project began, one
// toilet and one poop each, behind a "Staff only" door at the far end of
// Lab Coffee. In here the Q menu's first item poops instead of sticking a
// note; one poop each (a new one replaces your last), five seconds apart,
// kept only while the server runs.

export function buildPoop(): SpaceDef {
  const g = new THREE.Group();
  const colliders: Box[] = [];
  const half = { halfX: 3, halfZ: 3 };
  roomShell(g, colliders, half.halfX, half.halfZ, 0xe8eef2, { tint: 0xdfe8ec, trim: 0x8a9aa8 });
  // Checked tiles on the floor.
  for (let x = -3; x < 3; x++) for (let z = -3; z < 3; z++) if ((x + z) % 2 === 0) floor(g, 1, 1, x + 0.5, z + 0.5, 0xc9d4da, 0.012);
  // The toilet, on the north wall beside the door: bowl, seat and cistern.
  const white = mat(0xf7f9fa);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.42, 18), white);
  bowl.position.set(1.2, 0.21, -2.3);
  const seat = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.05, 8, 20), white);
  seat.rotation.x = Math.PI / 2;
  seat.position.set(1.2, 0.44, -2.3);
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.2), white);
  tank.position.set(1.2, 0.75, -2.72);
  g.add(bowl, seat, tank);
  solid(colliders, 0.7, 0.9, 1.2, -2.45);
  // A mirror and a small sign.
  block(g, colliders, [1, 0.8, 0.05], [2.95, -1.2], 0xbcd2dc);
  const sign = textPlane(["Poop Room", "where it all began · crit 8"], 2.4, 0.6, { bg: "#ffffff", fg: "#5a3a22", font: 0.18 });
  sign.position.set(1.2, 2.4, -2.99);
  g.add(sign);
  doorway(g, -1.5, -2.95, 0, "Back out");

  return {
    id: "poop",
    title: "a small room",
    group: g,
    colliders,
    doors: [{ x: -1.5, z: -2.2, label: "Go back out", to: "outdoor", arrive: { x: 24.5, z: -21.6 } }],
    ...half,
    background: 0xe8eef2,
    camera: new THREE.Vector3(0, 4.5, 5),
    bgm: SHARED_BGM,
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
