import * as THREE from "three";
import { block, enableShadows, floor, loadModel, mat, scatter, solid, texMat, textPlane, type Box, type Spot } from "../world.ts";
import { HIGH } from "../settings.ts";
import { markOccluderGroup } from "./occluders.ts";
import { asphaltMat } from "./backdrop.ts";

// West of the lawn: the lawn carries on, and the white road north of it
// (University Avenue, z -40..-22) runs on west and crosses Sullivans Creek on
// a flat bridge as wide as the road, with a stretch of it on the far bank.
// Checked against OpenStreetMap (the avenue goes straight over the creek, the
// creek a good 15 m across); squeezed like the rest of the map, not surveyed.
// Simple shapes and the lawn's tree models, so Low stays smooth.

/** The creek: its centre line, how far from it the bank's top edge is, the water's width and how far below the grass it lies. */
const CREEK = { x: -66.4, bankTop: 8.8, water: 8, depth: 2.2 };
/** The creek runs on out of sight both ways: north past the white buildings (z -160) and south (z 60). */
export const CREEK_Z = { from: -160, to: 60 };
/** The avenue and its bridge: centre z, and the width of the paving (the north road's, backdrop.ts). */
const AVE = { z: -31, w: 18 };
/**
 * South of the avenue's bridge the creek bends gently west (the user's call,
 * 10/30): walking south toward Badger & Co it draws slowly away from the
 * lawn. North of the bridge it runs straight. Everything along it (water,
 * banks, fences, the paths and the far road) follows the same curve.
 */
const BEND_FROM = -22;
export const bend = (z: number): number => (z <= BEND_FROM ? 0 : -0.0022 * (z - BEND_FROM) ** 2);

/**
 * A long strip along z from z0 to z1, its cross-section from (xa, ya) to
 * (xb, yb), shifted west by the creek's bend as it goes: water, a bank's
 * slope, a path. Short steps where it bends, one where it's straight.
 */
function ribbon(g: THREE.Group, xa: number, xb: number, ya: number, yb: number, z0: number, z1: number, material: THREE.Material, texLen = 0, bendB = true): THREE.Mesh {
  const zs: number[] = [z0];
  if (z0 < BEND_FROM && z1 > BEND_FROM) zs.push(BEND_FROM);
  for (let z = Math.max(z0, BEND_FROM) + 2; z < z1; z += 2) zs.push(z);
  zs.push(z1);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const across = Math.hypot(xb - xa, yb - ya);
  zs.forEach((z, i) => {
    const b = bend(z);
    pos.push(xa + b, ya, z, xb + (bendB ? b : 0), yb, z);
    const v = texLen ? (z - z0) / texLen : i;
    uv.push(0, v, texLen ? across / Math.max(texLen, 0.001) : 1, v);
    if (i) {
      const a = (i - 1) * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, material);
  m.receiveShadow = HIGH;
  g.add(m);
  return m;
}

/** The top edges of the banks: nobody walks past them (areas stop short of them). */
const EAST_TOP = CREEK.x + CREEK.bankTop; // -57.6
const WEST_TOP = CREEK.x - CREEK.bankTop; // -75.2

/** Where walking stops in the west: the white building's west end, north of the avenue (the user's call). The white path, boardwalk and creek past it are scenery. */
export const LAWN_WEST_X = -51;
/** Picnic tables in a row on the grass north of Badger & Co; you sit on their benches (outdoor.ts seats). */
export const PICNIC: [number, number][] = [
  [-47, -12],
  [-43, -12],
  [-39, -12],
];

/** The strip along the east bank, behind the creek's fence: timber boardwalk north of the bridge (up to its end pillar), warm paving south of the avenue past Badger & Co (the user's call). */
const BOARDWALK = { minX: -57.4, maxX: -54.2, minZ: -90, maxZ: -34.4 };
const SOUTH_WALK = { minX: -57.4, maxX: -54.2, minZ: -22, maxZ: 22 };

/**
 * Badger & Co, at the north-east corner of the Health and Well-Being Centre:
 * per OpenStreetMap it stands west of 155 across a lane (10 m here, the
 * user's call), level with 155, its rounded corner facing the lawn (a solid,
 * not enterable).
 */
export const BADGER = { minX: -50, maxX: -38, minZ: -2, maxZ: 16 };

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
  const waterMat = new THREE.MeshStandardMaterial({ color: WATER, roughness: 0.3, metalness: 0.1, side: THREE.DoubleSide });
  ribbon(g, cx - water / 2, cx + water / 2, -depth, -depth, CREEK_Z.from, CREEK_Z.to, waterMat);
  const grass = texMat("ai/grass.jpg", 1, 1, 0x9fb08a);
  grass.side = THREE.DoubleSide;
  ribbon(g, cx - bankTop, cx - water / 2, 0, -depth, CREEK_Z.from, CREEK_Z.to, grass, 3.9);
  ribbon(g, cx + water / 2, cx + bankTop, -depth, 0, CREEK_Z.from, CREEK_Z.to, grass, 3.9);
  void len;
  void mz;
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
  // On the far bank the avenue stops at the footpath: no white paving across the road (the user's call, 10/30).
  // A planter row along the road's south edge, where it meets the grass.
  const shrubs: Spot[] = [];
  const z = AVE.z + AVE.w / 2 + 0.35;
  for (const [x0, x1] of [[-54.5, -42]] as const) {
    block(g, null, [x1 - x0, 0.4, 0.5], [(x0 + x1) / 2, z], CONCRETE);
    for (let x = x0 + 0.8; x < x1; x += 2.4) shrubs.push({ x, z, rotY: x * 2.3 });
  }
  scatter(g, "nature/Bush_Hedge.glb", 0.9, shrubs, false);
  lamp(g, colliders, WEST_TOP - 2.6, AVE.z + 10);

  // ---- The bridge: the avenue's paving over the creek, dark rails, white end pillars ----
  // Narrower than the avenue: its north 6.4 m (two boardwalks' width) cut off (the user's call).
  const BRIDGE = { z: AVE.z + 3.2, w: AVE.w - 6.4 };
  const bx0 = WEST_TOP - 1.4;
  const bx1 = EAST_TOP + 1.4;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(bx1 - bx0, 0.5, BRIDGE.w), texMat("ai/paving.jpg", (bx1 - bx0) / 2, BRIDGE.w / 2));
  deck.position.set((bx0 + bx1) / 2, -0.25 + 0.01, BRIDGE.z);
  g.add(deck);
  const steel = mat(RAIL);
  for (const side of [-1, 1]) {
    const z = BRIDGE.z + side * (BRIDGE.w / 2 - 0.1);
    for (const y of [1.0, 0.55]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(bx1 - bx0 - 1.6, 0.06, 0.06), steel);
      r.position.set((bx0 + bx1) / 2, y, z);
      g.add(r);
    }
    const posts: Inst[] = [];
    for (let x = bx0 + 1; x <= bx1 - 0.9; x += 0.6) posts.push({ x, y: 0.5, z, sx: 1, sy: 1, sz: 1, rot: 0 });
    instanced(g, new THREE.BoxGeometry(0.04, 1, 0.04), steel, posts);
    for (const x of [bx0 + 0.7, bx1 - 0.7]) {
      const pz = BRIDGE.z + side * (BRIDGE.w / 2 + 0.1);
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.5, 1.4), mat(CONCRETE));
      pillar.position.set(x, 0.75, pz);
      g.add(pillar);
      solid(colliders, 1.4, 1.4, x, pz);
    }
  }

  // ---- The far bank (the user's call, 10/30): a footpath along the creek,
  // poured concrete in slabs with a kerb, and beyond it a two-lane asphalt
  // road with a dashed centre line, both running north-south as far as the
  // creek does; the avenue meets the road at a crossing. Scenery only. ----
  const walk = { x0: WEST_TOP - 3.4, x1: WEST_TOP - 0.2 };
  ribbon(g, walk.x0, walk.x1, 0.02, 0.02, CREEK_Z.from, CREEK_Z.to, mat(0xcfccc5));
  // The slabs' joints every 1.5 m, and the kerb on the road side.
  const joints: Inst[] = [];
  for (let z = CREEK_Z.from; z < CREEK_Z.to; z += 1.5) joints.push({ x: (walk.x0 + walk.x1) / 2 + bend(z), y: 0.026, z, sx: 1, sy: 1, sz: 1, rot: Math.atan(bend(z + 0.5) - bend(z - 0.5)) });
  instanced(g, new THREE.BoxGeometry(walk.x1 - walk.x0, 0.004, 0.04), mat(0xa9a6a0), joints);
  ribbon(g, walk.x0 - 0.25, walk.x0, 0.15, 0.15, CREEK_Z.from, CREEK_Z.to, mat(0xbdbab3));
  const road = { x0: walk.x0 - 7.25, x1: walk.x0 - 0.25 };
  const tar = asphaltMat(road.x1 - road.x0, 8);
  ribbon(g, road.x0, road.x1, 0.01, 0.01, CREEK_Z.from, CREEK_Z.to, tar, 8);
  // Two lanes: a dashed white centre line and solid edge lines.
  const dashes: Inst[] = [];
  for (let z = CREEK_Z.from; z < CREEK_Z.to; z += 6) dashes.push({ x: (road.x0 + road.x1) / 2 + bend(z), y: 0.016, z, sx: 1, sy: 1, sz: 1, rot: Math.atan(bend(z + 0.5) - bend(z - 0.5)) });
  instanced(g, new THREE.BoxGeometry(0.15, 0.004, 3), new THREE.MeshBasicMaterial({ color: 0xf2f2f2 }), dashes);
  const white = new THREE.MeshBasicMaterial({ color: 0xe8e8e8 });
  for (const x of [road.x0 + 0.3, road.x1 - 0.3]) ribbon(g, x - 0.06, x + 0.06, 0.015, 0.015, CREEK_Z.from, CREEK_Z.to, white);

  // ---- Trees ----
  // Big ones on the lawn's extension (the models the lawn's edge uses).
  const big: [string, number, Spot[]][] = [
    ["CommonTree_3.glb", 5.5, [{ x: -52.5, z: -17, rotY: 2, scale: 1.0 }]],
    ["CommonTree_5.glb", 8.5, [{ x: -52.5, z: -7, rotY: 3, scale: 1.0 }]],
  ];
  for (const [file, h, spots] of big) {
    scatter(g, `nature/${file}`, h, spots);
    for (const s of spots) solid(colliders, 0.9, 0.9, s.x, s.z);
  }
  // Willows (golden, wide, drooping) and Lombardy poplars (tall narrow columns) along the banks.
  const willows = [
    { x: WEST_TOP - 0.8, z: 8 },
    { x: WEST_TOP - 0.9, z: 20 },
    { x: WEST_TOP - 0.7, z: -17 },
    { x: WEST_TOP - 0.9, z: -5 },
  ];
  const poplars = [
    { x: -52, z: 4 },
    { x: -52, z: 14 },
    { x: WEST_TOP - 0.5, z: 14 },
    { x: WEST_TOP - 0.5, z: -11 },
    { x: WEST_TOP - 0.5, z: 1 },
    { x: -88, z: -14 },
    { x: -89, z: -3 },
  ];
  // The lawn's own tree models, so they sit with the rest: willows a wide
  // CommonTree_4 with golden leaves, poplars a CommonTree_5 squeezed narrow
  // and stretched tall.
  // Those on the creek's banks follow its bend.
  const onBank = (p: { x: number; z: number }) => (p.x < -51.5 ? { x: p.x + bend(p.z), z: p.z } : p);
  for (const [i, p] of willows.entries()) tree(g, "CommonTree_4.glb", onBank(p), 7, 1.5, 1, 0xc8b04a, i * 1.9);
  for (const [i, p] of poplars.entries()) tree(g, "CommonTree_5.glb", onBank(p), 9, 0.45, 1.35, 0x5f8a3c, i * 1.3);
  for (const p of [...willows, ...poplars]) if (p.x > EAST_TOP - 1) solid(colliders, 0.8, 0.8, p.x, p.z);

  // North of Badger & Co, on the grass only (no trees on paving): a row of
  // picnic tables with a row of lower trees behind them (the user's call).
  // South of the grass (z -6), the campus's warm paving runs from the
  // boardwalk to 155, and Badger & Co stands on it.
  const grove: Spot[] = [
    ...[-49, -45, -41, -37].map((x, i) => ({ x, z: -17, rotY: i * 1.7, scale: 1 + (i % 2) * 0.08 })),
  ];
  scatter(g, "nature/CommonTree_3.glb", 5.5, grove.filter((_, i) => i % 2 === 0));
  scatter(g, "nature/CommonTree_5.glb", 5.8, grove.filter((_, i) => i % 2 === 1));
  for (const s of grove) solid(colliders, 0.9, 0.9, s.x, s.z);
  for (const [x, z] of PICNIC) picnicTable(g, colliders, x, z);
  // The same tint as outdoor.ts's paving, which covers from x -35 east; its
  // creek edge follows the bend, so it widens to the south (the user's call).
  const warm = texMat("ai/paving.jpg", 1, 1, 0xd6d2ca);
  warm.side = THREE.DoubleSide;
  ribbon(g, SOUTH_WALK.maxX, -34.9, 0.011, 0.011, -6, 17, warm, 2, false);
  // Grass between the bending walk and the straight lawn edge, north of the paving.
  const lawnGrass = texMat("ai/grass.jpg", 1, 1);
  lawnGrass.side = THREE.DoubleSide;
  ribbon(g, SOUTH_WALK.maxX, -51, 0.006, 0.006, BEND_FROM, -6, lawnGrass, 3, false);

  // Between the white building's west end and the boardwalk north of the avenue: a white path as wide as the deck.
  const path = { minX: -54.2, maxX: -51, minZ: -90, maxZ: -40 };
  floor(g, path.maxX - path.minX, path.maxZ - path.minZ, (path.minX + path.maxX) / 2, (path.minZ + path.maxZ) / 2, texMat("ai/paving.jpg", 1.6, 25), 0.012);
  boardwalk(g, colliders, BOARDWALK);
  const sw = SOUTH_WALK;
  ribbon(g, sw.minX, sw.maxX, 0.011, 0.011, sw.minZ, sw.maxZ, warm, 2);
  bentFence(g, sw.minX + 0.1, sw.minZ, sw.maxZ);

  buildBadger(g, colliders);
}

/**
 * A timber boardwalk along the east bank: slatted decking, a fence of dark posts and rails along its creek
 * side so nobody steps off the bank.
 */
function boardwalk(g: THREE.Group, colliders: Box[], { minX, maxX, minZ, maxZ }: Box): void {
  const w = maxX - minX;
  const len = maxZ - minZ;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, len), texMat("ai/wood_tabletop.jpg", w / 1.2, len / 1.2, 0xa8784c));
  deck.position.set((minX + maxX) / 2, 0.06, (minZ + maxZ) / 2);
  deck.receiveShadow = HIGH;
  g.add(deck);
  // Joints across the boards every 1.2 m, so it reads as decking.
  const joints: Inst[] = [];
  for (let z = minZ + 1.2; z < maxZ; z += 1.2) joints.push({ x: (minX + maxX) / 2, y: 0.125, z, sx: 1, sy: 1, sz: 1, rot: 0 });
  instanced(g, new THREE.BoxGeometry(w, 0.01, 0.04), mat(0x6b4a2e), joints);
  fence(g, colliders, { minX, maxX, minZ, maxZ }, 0.12);
}

/** The steel fence on the creek side (west edge) of a strip, standing on a floor `y` high. */
function fence(g: THREE.Group, colliders: Box[], { minX, minZ, maxZ }: Box, y0: number): void {
  const len = maxZ - minZ;
  const fx = minX + 0.1;
  const steel = mat(RAIL);
  for (const y of [1.0, 0.55]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, len), steel);
    r.position.set(fx, y0 + y, (minZ + maxZ) / 2);
    g.add(r);
  }
  const posts: Inst[] = [];
  for (let z = minZ + 0.3; z <= maxZ; z += 2) posts.push({ x: fx, y: y0 + 0.55, z, sx: 1, sy: 1, sz: 1, rot: 0 });
  instanced(g, new THREE.BoxGeometry(0.08, 1.1, 0.08), steel, posts);
  colliders.push({ minX: fx - 0.1, maxX: fx + 0.1, minZ, maxZ });
}

/** The same steel fence along the creek's bend (south of the bridge): rails as short straight runs, posts every 2 m. Scenery: the walk limit (x -51) keeps people off it. */
function bentFence(g: THREE.Group, x: number, z0: number, z1: number): void {
  const steel = mat(RAIL);
  const posts: Inst[] = [];
  for (let z = z0; z < z1; z += 2) {
    const za = z;
    const zb = Math.min(z + 2, z1);
    const xa = x + bend(za);
    const xb = x + bend(zb);
    const len = Math.hypot(xb - xa, zb - za);
    for (const y of [1.0, 0.55]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, len), steel);
      r.position.set((xa + xb) / 2, y, (za + zb) / 2);
      r.rotation.y = Math.atan2(xb - xa, zb - za);
      g.add(r);
    }
    posts.push({ x: xa, y: 0.55, z: za, sx: 1, sy: 1, sz: 1, rot: 0 });
  }
  instanced(g, new THREE.BoxGeometry(0.08, 1.1, 0.08), steel, posts);
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

/** A timber picnic table with a bench either side, long side along z (as under 154's colonnade). */
function picnicTable(g: THREE.Group, colliders: Box[], x: number, z: number): void {
  const wood = mat(0xd9a066);
  const t = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 1.8), wood);
  top.position.y = 0.74;
  t.add(top);
  for (const side of [-1, 1]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 1.8), wood);
    seat.position.set(side * 0.62, 0.45, 0);
    t.add(seat);
    for (const end of [-0.7, 0.7]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.78, 0.08), wood);
      leg.position.set(side * 0.32, 0.37, end);
      leg.rotation.z = side * 0.45;
      t.add(leg);
    }
  }
  t.position.set(x, 0, z);
  enableShadows(t);
  g.add(t);
  solid(colliders, 0.8, 1.8, x, z);
}

/** Two seats on each bench of each picnic table, facing the table; but the one Seongsu, the author's ghost, sits on (server/npcs.ts). */
export const PICNIC_SEATS = PICNIC.flatMap(([x, z]) =>
  [-1, 1].flatMap((side) => [-0.45, 0.45].map((dz) => ({ x: x + side * 0.62, z: z + dz, rot: side < 0 ? Math.PI / 2 : -Math.PI / 2, y: 0.46 }))),
).filter((s) => !(Math.abs(s.x - -38.38) < 0.01 && Math.abs(s.z - -11.55) < 0.01));
