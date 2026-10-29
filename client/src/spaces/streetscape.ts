import * as THREE from "three";
import { lightPool, mat, scatter, solid, type Box, type Spot } from "../world.ts";

// Street furniture along the path, from my own photos (kept out of the repo):
// tall black lamp posts, a low concrete wall with a timber seat along the
// lawn's edge and small trees behind it, timber picnic tables under 154's
// colonnade, and white planters of red flowers either side of its door.
// North, along the white buildings: a row of low flower beds with gaps to
// walk through, splitting a narrow path at the buildings' feet from the main
// road, and cafe tables and benches on that path.

const steel = (): THREE.MeshStandardMaterial => mat(0x1d1f22);
const timber = (): THREE.MeshStandardMaterial => mat(0xb8743e);

/** A lamp post about 5.5 m tall, its head leaning out over `face` (radians). */
function lamp(g: THREE.Group, colliders: Box[], x: number, z: number, face: number): void {
  const l = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 5.4, 10), steel());
  pole.position.y = 2.7;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.06), steel());
  arm.position.set(0.28, 5.3, 0);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.18, 12), steel());
  head.position.set(0.55, 5.22, 0);
  const bulb = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 0.03, 12),
    new THREE.MeshStandardMaterial({ color: 0xfff1cf, emissive: 0xffd88a, emissiveIntensity: 0.8 }),
  );
  bulb.position.set(0.55, 5.12, 0);
  bulb.userData.lamp = true; // glows at night (daylight.ts)
  l.add(pole, arm, head, bulb);
  l.position.set(x, 0, z);
  l.rotation.y = face;
  g.add(l);
  solid(colliders, 0.3, 0.3, x, z);
  // At night (daylight.ts): a warm pool on the ground under the head and a soft halo round the bulb. A
  // painted glow, not a real light: dozens of real lights would cost every phone its frame rate.
  const under = { x: x + Math.cos(face) * 0.55, z: z - Math.sin(face) * 0.55 };
  const pool = lightPool(g, under.x, under.z, 7, 7, 0xffc878, 0);
  pool.userData.lampPool = true;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd28a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.set(1.6, 1.6, 1);
  halo.position.set(under.x, 5.0, under.z);
  halo.userData.lampHalo = true;
  g.add(halo);
}

let glow: THREE.Texture | null = null;
function glowTexture(): THREE.Texture {
  if (glow) return glow;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.3, "rgba(255,255,255,0.5)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  glow = new THREE.CanvasTexture(c);
  return glow;
}

/**
 * Lamp posts down both sides of the north road, evenly, like a highway's
 * (the user's call, 10/30), every head leaning out over the road. The north
 * row stands at the east end of each flower bed, inside it, so it blocks no
 * gap you walk through. The south row stands opposite, on the road's edge,
 * but only where grass meets it: never across a path's mouth (the path to
 * the library, x -9..5; the curved path by Badger & Co, x -35..-29; the
 * paving east of x 5 in front of Lab Coffee). A spot too near a door, a
 * board or an assistant is skipped.
 */
const PATH_MOUTHS: [number, number][] = [
  [-36, -28],
  [-10, 100],
];
export function roadLamps(g: THREE.Group, colliders: Box[], keepClear: { x: number; z: number }[]): void {
  const north = BED_Z[0] + (BED_Z[1] - BED_Z[0]) / 2;
  const south = -22.6;
  for (const [, x1] of BED_RUNS) {
    const x = x1 - 0.4;
    const ok = (z: number): boolean => !keepClear.some((p) => Math.hypot(p.x - x, p.z - z) < 2.5);
    // The arm points along the lamp's +x, turned by `face`: -π/2 leans it south, π/2 north.
    if (ok(north)) lamp(g, [], x, north, -Math.PI / 2); // in the bed: the bed is already solid
    if (ok(south) && !PATH_MOUTHS.some(([a, b]) => x > a && x < b)) lamp(g, colliders, x, south, Math.PI / 2);
  }
}

/** A timber picnic table with two benches, long side along z; `y` is the floor it stands on. */
function picnicTable(g: THREE.Group, x: number, z: number, y = 0): void {
  const t = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 1.8), timber());
  top.position.y = 0.74;
  t.add(top);
  for (const side of [-1, 1]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 1.8), timber());
    seat.position.set(side * 0.62, 0.45, 0);
    t.add(seat);
    for (const end of [-0.7, 0.7]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.78, 0.08), timber());
      leg.position.set(side * 0.32, 0.37, end);
      leg.rotation.z = side * 0.45;
      t.add(leg);
    }
  }
  t.position.set(x, y, z);
  g.add(t);
}

/** A white timber planter box of red geraniums. */
function planter(g: THREE.Group, colliders: Box[], x: number, z: number): void {
  const p = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 1.2), mat(0xe9e6df));
  box.position.y = 0.275;
  const leaves = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.12, 1.1), mat(0x3f6b34));
  leaves.position.y = 0.6;
  p.add(box, leaves);
  const flower = mat(0xc8141c);
  const blob = new THREE.IcosahedronGeometry(0.13, 0);
  for (let i = 0; i < 9; i++) {
    const f = new THREE.Mesh(blob, flower);
    f.position.set(((i % 3) - 1) * 0.2, 0.7 + (i % 2) * 0.06, (Math.floor(i / 3) - 1) * 0.36);
    p.add(f);
  }
  p.position.set(x, 0, z);
  g.add(p);
  solid(colliders, 0.7, 1.2, x, z);
}

/** A low concrete wall with a timber seat on top, along z, facing +x. */
function seatWall(g: THREE.Group, colliders: Box[], x: number, z0: number, z1: number): void {
  const len = z1 - z0;
  const wall = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, len), mat(0xcfccc4));
  wall.position.set(x, 0.21, (z0 + z1) / 2);
  g.add(wall);
  for (let i = 0; i < 4; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.05, len - 0.4), timber());
    slat.position.set(x - 0.2 + i * 0.13, 0.45, (z0 + z1) / 2);
    g.add(slat);
  }
  // Low: you can jump onto it and over it, and sit on it (SEAT_WALL_SEATS).
  colliders.push({ minX: x - 0.275, maxX: x + 0.275, minZ: z0, maxZ: z1, top: 0.47, standOn: true });
}

/** The lawn's east seat wall (x -9.3, z -21.5..-7): a seat every 2.4 m, facing east over the path. */
export const SEAT_WALL_SEATS = Array.from({ length: 6 }, (_, i) => ({ x: -9.3, z: -20.3 + i * 2.4, rot: Math.PI / 2, y: 0.46 }));

/** The north road's three strips (z): buildings' path, beds, main road; 1:1:3. */
const PATH_Z = [-40, -36.4] as const;
const BED_Z = [-36.4, -32.8] as const;

/**
 * Low concrete-kerbed beds of shrubs, tall grass and flowers, broken by gaps
 * so you can cross to the buildings (one in line with the passage at x 7).
 */
/** The flower beds along the north road, west to east (x from, x to), with gaps to walk through. */
const BED_RUNS: [number, number][] = [
  [-49.5, -42],
  [-39.5, -32],
  [-29.5, -22.5],
  [-20, -13],
  [-10.5, -3.5],
  [-1, 4.5],
  [9.5, 16.5],
  [19, 26],
];

function flowerBeds(g: THREE.Group, colliders: Box[]): void {
  const runs = BED_RUNS;
  const depth = BED_Z[1] - BED_Z[0] - 0.6; // a little paving either side
  const cz = (BED_Z[0] + BED_Z[1]) / 2;
  const kerb = mat(0xcfccc4);
  const soil = mat(0x4a3a2a);
  const bushes: Spot[] = [];
  const grasses: Spot[] = [];
  const flowers: Spot[] = [];
  for (const [x0, x1] of runs) {
    const w = x1 - x0;
    const cx = (x0 + x1) / 2;
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, depth), kerb);
    box.position.set(cx, 0.2, cz);
    const top = new THREE.Mesh(new THREE.BoxGeometry(w - 0.3, 0.02, depth - 0.3), soil);
    top.position.set(cx, 0.41, cz);
    g.add(box, top);
    // A low kerb you can jump up onto and walk along (or jump across).
    colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - depth / 2, maxZ: cz + depth / 2, top: 0.42, standOn: true });
    // Shrubs along the middle, tall grass and flowers either side of them.
    for (let x = x0 + 0.8, i = 0; x < x1 - 0.5; x += 1.5, i++) {
      bushes.push({ x, z: cz + (i % 2 ? 0.25 : -0.25), rotY: x * 2.3, scale: 0.85 + (i % 3) * 0.1 });
      grasses.push({ x: x + 0.7, z: cz - 0.85, rotY: x });
      flowers.push({ x: x + 0.6, z: cz + 0.85, rotY: x * 1.7 });
    }
  }
  scatterOn(g, "nature/Bush_Common_Flowers.glb", 0.95, bushes);
  scatterOn(g, "nature/Grass_Common_Tall.glb", 0.7, grasses);
  scatterOn(g, "nature/Flower_3_Group.glb", 0.45, flowers);
}

/** `scatter`, raised onto the beds' soil. */
function scatterOn(g: THREE.Group, file: string, height: number, spots: Spot[]): void {
  const raised = new THREE.Group();
  raised.position.y = 0.4;
  scatter(raised, file, height, spots);
  g.add(raised);
}

/** A small round cafe table with two chairs, east and west of it. */
export function cafeTable(g: THREE.Group, colliders: Box[], x: number, z: number): void {
  const t = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 18), mat(0xe9e6df));
  top.position.y = 0.74;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.72, 8), steel());
  stem.position.y = 0.36;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.03, 14), steel());
  foot.position.y = 0.015;
  t.add(top, stem, foot);
  for (const side of [-1, 1]) {
    const chair = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.42), timber());
    seat.position.y = 0.45;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.38, 0.42), timber());
    back.position.set(side * 0.2, 0.66, 0);
    chair.add(seat, back);
    for (const [lx, lz] of [
      [-0.18, -0.18],
      [-0.18, 0.18],
      [0.18, -0.18],
      [0.18, 0.18],
    ] as const) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.45, 0.03), steel());
      leg.position.set(lx, 0.225, lz);
      chair.add(leg);
    }
    chair.position.x = side * 0.7;
    t.add(chair);
  }
  t.position.set(x, 0, z);
  g.add(t);
  solid(colliders, 1.9, 0.9, x, z);
}

/** A backless timber bench on steel legs, long side along x. */
function plainBench(g: THREE.Group, colliders: Box[], x: number, z: number): void {
  const b = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, 0.11), timber());
    slat.position.set(0, 0.45, -0.13 + i * 0.13);
    b.add(slat);
  }
  for (const lx of [-0.75, 0.75]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.43, 0.38), steel());
    leg.position.set(lx, 0.215, 0);
    b.add(leg);
  }
  b.position.set(x, 0, z);
  g.add(b);
  solid(colliders, 1.8, 0.4, x, z);
}

export function buildStreetscape(g: THREE.Group, colliders: Box[]): void {
  // The lawn's east edge: a seat wall facing the path, small trees behind.
  seatWall(g, colliders, -9.3, -21.5, -7);
  const trees: Spot[] = [-19, -13.5, -8].map((z, i) => ({ x: -10.6, z, rotY: i * 2.1, scale: 0.9 + i * 0.08 }));
  scatter(g, "nature/CommonTree_5.glb", 5.2, trees);

  // Lamp posts down both sides of the path, clear of the doors.
  for (const z of [-20, -11, 0, 16]) lamp(g, colliders, -8.6, z, 0);
  // East side: clear of the Hub's door (z 3) and the ANUSA lounge's (z -5) and their canopies.
  for (const z of [-15, -9.5, 12, 16]) lamp(g, colliders, 4.6, z, Math.PI);

  // Under 154's colonnade: picnic tables (inside the building's footprint,
  // so they're scenery), and planters either side of its door.
  // (The northern end, z -18..-13, is Lab Coffee: labcoffee.ts.)
  // On the colonnade's floor slab (0.42 m), not sunk into it.
  for (const z of [-11, -6, 9.5, 12.4]) picnicTable(g, 7.2, z, 0.42); // the last clear of the slab's south edge (z 14)
  planter(g, colliders, 4.4, 0.2);
  planter(g, colliders, 4.4, 5.8);

  // North: the flower beds, and on the path in front of the white buildings
  // (west of the passage), cafe tables with benches against the wall.
  flowerBeds(g, colliders);
  for (const x of [-33.5, -25, -16.5, -8, 0]) cafeTable(g, colliders, x, -37.6);
  for (const x of [-45.5, -38, -21, -12.5, -4]) plainBench(g, colliders, x, PATH_Z[0] + 0.35);
}
