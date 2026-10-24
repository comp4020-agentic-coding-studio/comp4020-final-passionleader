import * as THREE from "three";
import { block, enableShadows, floor, loadModel, mat, scatter, solid, texMat, textPlane, type Box, type Spot } from "../world.ts";
import { HIGH } from "../settings.ts";
import { markOccluderGroup } from "./occluders.ts";

// West of the lawn: the lawn carries on, and the white road north of it
// (University Avenue, z -40..-22) runs on west and crosses Sullivans Creek on
// a flat bridge as wide as the road, with a stretch of it on the far bank.
// Checked against OpenStreetMap (the avenue goes straight over the creek, the
// creek a good 15 m across); squeezed like the rest of the map, not surveyed.
// Simple shapes and the lawn's tree models, so Low stays smooth.

/** The creek: its centre line, how far from it the bank's top edge is, the water's width and how far below the grass it lies. */
const CREEK = { x: -60.4, bankTop: 8.8, water: 8, depth: 2.2 };
/** The creek runs from the road's north edge (z -40, out from under the bridge; buildings beyond) to z 14. */
export const CREEK_Z = { from: -40, to: 14 };
/** The avenue and its bridge: centre z, and the width of the paving (the north road's, backdrop.ts). */
const AVE = { z: -31, w: 18 };
/** The top edges of the banks: nobody walks past them (areas stop short of them). */
const EAST_TOP = CREEK.x + CREEK.bankTop; // -51.6
const WEST_TOP = CREEK.x - CREEK.bankTop; // -69.2

/**
 * What can be walked on out here, besides the lawn's extension (which outdoor.ts
 * and server/spaces.ts widen to x -51.8, 0.2 m short of the east bank's top
 * edge): the bridge's deck (between the rails) and the road on the far bank.
 * Same numbers as the end of OUTDOOR_AREAS in server/spaces.ts.
 */
export const CREEK_AREAS: Box[] = [
  { minX: -70.2, maxX: -50.8, minZ: -39.3, maxZ: -22.7 },
  { minX: -82, maxX: -69.2, minZ: -39.4, maxZ: -22.6 },
];
/** The lawn's new west limit. */
export const LAWN_WEST_X = -51.8;

/**
 * Badger & Co, at the north-east corner of the Health and Well-Being Centre:
 * per OpenStreetMap it stands just west of 155 across a lane, level with
 * 155, its rounded corner facing the lawn (a solid, not enterable).
 */
export const BADGER = { minX: -45, maxX: -33, minZ: -2, maxZ: 16 };

const WATER = 0x5d7568;
const CONCRETE = 0xe6e4de;
const RAIL = 0x2c3034;
const UP = new THREE.Vector3(0, 1, 0);

interface Inst {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  rot: number;
}

/** One instanced mesh for many copies of a shape (a draw call, however many trees). */
function instanced(g: THREE.Group, geo: THREE.BufferGeometry, material: THREE.Material, items: Inst[]): void {
  const m = new THREE.InstancedMesh(geo, material, items.length);
  const at = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  items.forEach((s, i) => {
    q.setFromAxisAngle(UP, s.rot);
    at.compose(new THREE.Vector3(s.x, s.y, s.z), q, new THREE.Vector3(s.sx, s.sy, s.sz));
    m.setMatrixAt(i, at);
  });
  m.computeBoundingSphere();
  m.castShadow = HIGH;
  m.receiveShadow = HIGH;
  m.userData.noShadow = !HIGH;
  g.add(m);
}

export function buildCreek(g: THREE.Group, colliders: Box[]): void {
  const { x: cx, bankTop, water, depth } = CREEK;
  const len = CREEK_Z.to - CREEK_Z.from;
  const mz = (CREEK_Z.from + CREEK_Z.to) / 2;

  // ---- The channel: dull green-brown water, and a sloping grassy bank each side ----
  const w = new THREE.Mesh(new THREE.PlaneGeometry(water, len), new THREE.MeshStandardMaterial({ color: WATER, roughness: 0.3, metalness: 0.1 }));
  w.rotation.x = -Math.PI / 2;
  w.position.set(cx, -depth, mz);
  g.add(w);
  const run = bankTop - water / 2;
  const slopeLen = Math.hypot(run, depth);
  for (const side of [-1, 1]) {
    const geo = new THREE.PlaneGeometry(slopeLen, len);
    geo.rotateX(-Math.PI / 2); // lie flat: width along x, length along z
    const slope = new THREE.Mesh(geo, texMat("ai/grass.jpg", 1, len / 3.9, 0x9fb08a));
    slope.position.set(cx + side * (water / 2 + run / 2), -depth / 2, mz);
    slope.rotation.z = side * Math.atan2(depth, run); // rises away from the water
    g.add(slope);
  }
  // Where the channel meets the building at its north end: a concrete wall with a dark culvert mouth.
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(bankTop * 2, depth + 0.05), mat(0x5a5e62));
  wall.position.set(cx, -depth / 2, CREEK_Z.from + 0.02);
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.5), mat(0x15181a));
  mouth.position.set(cx, -depth + 0.75, CREEK_Z.from + 0.04);
  g.add(wall, mouth);

  // ---- The avenue: the north road's paving carried west to the far bank, a planter row and lamps ----
  const paving = (x0: number, x1: number): void => {
    floor(g, x1 - x0, AVE.w, (x0 + x1) / 2, AVE.z, texMat("ai/paving.jpg", (x1 - x0) / 2, AVE.w / 2), 0.012);
  };
  paving(EAST_TOP + 1.4, -40); // from the bridge's east end to the north road at -40
  paving(-84, WEST_TOP - 1.4);
  // A planter row along the road's south edge, where it meets the grass.
  const shrubs: Spot[] = [];
  const z = AVE.z + AVE.w / 2 + 0.35;
  for (const [x0, x1] of [
    [-48.5, -42],
    [-81, -72.5],
  ] as const) {
    block(g, null, [x1 - x0, 0.4, 0.5], [(x0 + x1) / 2, z], CONCRETE);
    for (let x = x0 + 0.8; x < x1; x += 2.4) shrubs.push({ x, z, rotY: x * 2.3 });
  }
  scatter(g, "nature/Bush_Hedge.glb", 0.9, shrubs, false);
  lamp(g, colliders, -45.5, AVE.z - 7.5);
  lamp(g, colliders, -76, AVE.z + 7.5);

  // ---- The bridge: the avenue's paving over the creek, dark rails, white end pillars ----
  const bx0 = WEST_TOP - 1.4;
  const bx1 = EAST_TOP + 1.4;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(bx1 - bx0, 0.5, AVE.w), texMat("ai/paving.jpg", (bx1 - bx0) / 2, AVE.w / 2));
  deck.position.set((bx0 + bx1) / 2, -0.25 + 0.01, AVE.z);
  g.add(deck);
  const steel = mat(RAIL);
  for (const side of [-1, 1]) {
    const z = AVE.z + side * (AVE.w / 2 - 0.1);
    for (const y of [1.0, 0.55]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(bx1 - bx0 - 1.6, 0.06, 0.06), steel);
      r.position.set((bx0 + bx1) / 2, y, z);
      g.add(r);
    }
    const posts: Inst[] = [];
    for (let x = bx0 + 1; x <= bx1 - 0.9; x += 0.6) posts.push({ x, y: 0.5, z, sx: 1, sy: 1, sz: 1, rot: 0 });
    instanced(g, new THREE.BoxGeometry(0.04, 1, 0.04), steel, posts);
    for (const x of [bx0 + 0.7, bx1 - 0.7]) {
      const pz = AVE.z + side * (AVE.w / 2 + 0.1);
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.5, 1.4), mat(CONCRETE));
      pillar.position.set(x, 0.75, pz);
      g.add(pillar);
      solid(colliders, 1.4, 1.4, x, pz);
    }
  }

  // ---- The far bank: the path stops at a low hedge ----
  const hedge: Spot[] = [];
  for (let z = -39; z <= -22.5; z += 1.2) hedge.push({ x: -82.6, z, rotY: z });
  scatter(g, "nature/Bush_Hedge.glb", 1.2, hedge, false);

  // ---- Trees ----
  // Big ones on the lawn's extension (the models the lawn's edge uses).
  const big: [string, number, Spot[]][] = [
    ["CommonTree_3.glb", 8, [{ x: -36, z: -27, rotY: 0.4, scale: 1.1 }, { x: -49.5, z: -18, rotY: 2, scale: 1.0 }]],
    ["CommonTree_5.glb", 8.5, [{ x: -42, z: -23.5, rotY: 1, scale: 1.1 }, { x: -48.5, z: -6.5, rotY: 3, scale: 1.0 }, { x: -31, z: -14, rotY: 5, scale: 0.9 }]],
    ["CommonTree_4.glb", 7.5, [{ x: -38, z: -16, rotY: 4, scale: 1.0 }]],
  ];
  for (const [file, h, spots] of big) {
    scatter(g, `nature/${file}`, h, spots);
    for (const s of spots) solid(colliders, 0.9, 0.9, s.x, s.z);
  }
  // Willows (golden, wide, drooping) and Lombardy poplars (tall narrow columns) along the banks.
  const willows = [
    { x: EAST_TOP + 0.7, z: -22 },
    { x: EAST_TOP + 0.9, z: -10 },
    { x: WEST_TOP - 0.7, z: -17 },
    { x: WEST_TOP - 0.9, z: -5 },
  ];
  const poplars = [
    { x: EAST_TOP + 0.5, z: -19 },
    { x: EAST_TOP + 0.5, z: -16 },
    { x: EAST_TOP + 0.5, z: -5 },
    { x: WEST_TOP - 0.5, z: -11 },
    { x: WEST_TOP - 0.5, z: 1 },
    { x: -75, z: -14 },
    { x: -78, z: -3 },
  ];
  // The lawn's own tree models, so they sit with the rest: willows a wide
  // CommonTree_4 with golden leaves, poplars a CommonTree_5 squeezed narrow
  // and stretched tall.
  for (const [i, p] of willows.entries()) tree(g, "CommonTree_4.glb", p, 7, 1.5, 1, 0xc8b04a, i * 1.9);
  for (const [i, p] of poplars.entries()) tree(g, "CommonTree_5.glb", p, 9, 0.45, 1.35, 0x5f8a3c, i * 1.3);
  for (const p of [...willows, ...poplars]) if (p.x > EAST_TOP - 1) solid(colliders, 0.8, 0.8, p.x, p.z);

  buildBadger(g, colliders);
}

/** A tall black lamp post, like the campus's (streetscape.ts), arm over the avenue. */
/** One tree model at `p`, `height` tall, its width times `wide` and height times `tall`, its leaves `leaves`. */
function tree(g: THREE.Group, file: string, p: { x: number; z: number }, height: number, wide: number, tall: number, leaves: number, rotY: number): void {
  void loadModel(`nature/${file}`, height).then((model) => {
    if (!model) return;
    const m = model.clone(true);
    m.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !/leaves/i.test((mesh.material as THREE.Material).name)) return;
      const copy = (mesh.material as THREE.MeshStandardMaterial).clone();
      copy.color.setHex(leaves);
      mesh.material = copy;
    });
    m.scale.set(m.scale.x * wide, m.scale.y * tall, m.scale.z * wide);
    m.position.set(p.x, 0, p.z);
    m.rotation.y = rotY;
    enableShadows(m);
    g.add(m);
  });
}

function lamp(g: THREE.Group, colliders: Box[], x: number, z: number): void {
  const steel = mat(0x23272b);
  const l = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 5.4, 10), steel);
  pole.position.y = 2.7;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.06), steel);
  arm.position.set(0.28, 5.3, 0);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.18, 12), steel);
  head.position.set(0.55, 5.22, 0);
  l.add(pole, arm, head);
  l.position.set(x, 0, z);
  g.add(l);
  solid(colliders, 0.3, 0.3, x, z);
}

/** Badger & Co: three storeys of pale panels with tall dark slots, a dark café floor, a rounded north-east corner. */
function buildBadger(g: THREE.Group, colliders: Box[]): void {
  const { minX, maxX, minZ, maxZ } = BADGER;
  const b = new THREE.Group();
  const floorH = 3.6;
  const storeys = 3;
  const h = storeys * floorH;
  const R = 6;
  const roofMat = mat(0xcfcdc7);
  /** A box's side faces carry the panel texture, each tiled to its own length. */
  const wallBox = (x0: number, x1: number, z0: number, z1: number): THREE.Mesh => {
    const wx = x1 - x0;
    const wz = z1 - z0;
    const m = new THREE.Mesh(new THREE.BoxGeometry(wx, h, wz), [panel(wz), panel(wz), roofMat, roofMat, panel(wx), panel(wx)]);
    m.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
    return m;
  };
  // The west part full depth; the east part from the corner's centre south; and the quarter cylinder between.
  const cutX = maxX - R;
  const cutZ = minZ + R;
  b.add(wallBox(minX, cutX, minZ, maxZ), wallBox(cutX, maxX, cutZ, maxZ));
  const arc = new THREE.Mesh(new THREE.CylinderGeometry(R, R, h, 16, 1, false, Math.PI / 2, Math.PI / 2), [panel(R * (Math.PI / 2)), roofMat, roofMat]);
  arc.position.set(cutX, h / 2, cutZ);
  b.add(arc);
  // The dark café front along the north face's ground floor (toward the
  // lawn, where you see it from), with its name over it.
  const frontLen = cutX - minX - 1.5;
  const front = new THREE.Mesh(new THREE.BoxGeometry(frontLen, floorH - 0.5, 0.12), mat(0x23282c));
  front.position.set(minX + 0.75 + frontLen / 2, (floorH - 0.5) / 2, minZ - 0.05);
  const sign = textPlane(["BADGER & CO."], 5.5, 0.6, { bg: "#23282c", fg: "#e8e4d8", font: 0.36 });
  sign.position.set(minX + 0.75 + frontLen / 2, floorH - 0.28, minZ - 0.13);
  sign.rotation.y = Math.PI;
  // The camera faces north, so the lane by 155 (the east face) is where
  // people see it from: its name there too, on the curve's side.
  const side = textPlane(["BADGER & CO."], 4, 0.5, { bg: "#23282c", fg: "#e8e4d8", font: 0.3 });
  side.position.set(maxX + 0.13, floorH - 0.28, cutZ + 3);
  side.rotation.y = Math.PI / 2;
  b.add(side);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(maxX - minX + 0.5, 0.3, maxZ - minZ + 0.5), roofMat);
  roof.position.set((minX + maxX) / 2, h + 0.15, (minZ + maxZ) / 2);
  b.add(front, sign, roof);
  g.add(b);
  colliders.push({ minX, maxX, minZ, maxZ });
  markOccluderGroup(g, b, new THREE.Box3(new THREE.Vector3(minX, 0, minZ), new THREE.Vector3(maxX, h, maxZ)));
}

/** The panel tile (one 3 m bay wide, one 3.6 m storey high), repeated along `length`. */
let panelTex: THREE.CanvasTexture | null = null;
function panel(length: number): THREE.MeshStandardMaterial {
  if (!panelTex) {
    const c = document.createElement("canvas");
    c.width = 96;
    c.height = 128;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#e5e4df";
    ctx.fillRect(0, 0, 96, 128);
    ctx.fillStyle = "#cfcec8";
    ctx.fillRect(0, 124, 96, 4);
    ctx.fillRect(0, 0, 2, 128);
    ctx.fillStyle = "#2b3137";
    ctx.fillRect(38, 14, 20, 100);
    panelTex = new THREE.CanvasTexture(c);
    panelTex.colorSpace = THREE.SRGBColorSpace;
    panelTex.wrapS = panelTex.wrapT = THREE.RepeatWrapping;
    panelTex.anisotropy = 4;
  }
  const map = panelTex.clone();
  map.needsUpdate = true;
  map.repeat.set(Math.max(1, Math.round(length / 3)), 3);
  const m = new THREE.MeshStandardMaterial({ map, roughness: 0.9, metalness: 0 });
  m.userData.unique = true;
  return m;
}
