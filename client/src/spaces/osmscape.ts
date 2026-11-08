import * as THREE from "three";
import { mat, nightGlow, texMat } from "../world.ts";
import { RICH } from "../settings.ts";
import { asphaltMat } from "./backdrop.ts";
import { OSM_BUILDINGS, OSM_ROADS, OSM_TREES } from "./osmscape-data.ts";
import { CREEK_Z, bend } from "./creek.ts";

/** In Sullivans Creek's channel and banks (creek.ts draws it, bending west south of the bridge): nothing from OSM goes there. */
const inCreek = (x: number, z: number): boolean => z >= CREEK_Z.from - 1 && z <= CREEK_Z.to + 1 && x > -75.2 + bend(z) - 1 && x < -57.6 + bend(z) + 1;
const anyInCreek = (pts: number[]): boolean => pts.some((_, i) => i % 2 === 0 && inCreek(pts[i]!, pts[i + 1]!));
/**
 * The north road's pale paving running on east (backdrop.ts, z -40..-22, out to x 340) and the
 * red-brick fronts along its north side: nothing from OSM stands on them (the user, 11/9: trees
 * blocked the road's view east).
 */
const onEastRoad = (x: number, z: number): boolean => x >= 38 && x <= 345 && z >= -58 && z <= -19;
const anyOnEastRoad = (pts: number[]): boolean => pts.some((_, i) => i % 2 === 0 && onEastRoad(pts[i]!, pts[i + 1]!));

// Scenery past the walkable outdoor map, laid out from OpenStreetMap
// (qa-tools/osm/gen_osmscape.py makes osmscape-data.ts; only derived x, z
// coordinates ship, OSM is credited ODbL in assets/CREDITS.md): roads as flat
// ribbons, buildings as extruded footprints with the backdrop's brick-and-window
// look (lit at night), trees as little instanced crowns. Scenery only: nothing
// here is solid and the generator leaves out everything inside the map and
// next to backdrop.ts's hand-made blocks. One mesh per material.

const FLOOR_H = 3.3;
const TILE_W = 6;

/** Positions, uvs and indices gathered across many shapes, then made one mesh. */
class Batch {
  pos: number[] = [];
  uv: number[] = [];
  idx: number[] = [];
  vert(x: number, y: number, z: number, u: number, v: number): number {
    this.pos.push(x, y, z);
    this.uv.push(u, v);
    return this.pos.length / 3 - 1;
  }
  quad(a: number, b: number, c: number, d: number): void {
    this.idx.push(a, b, c, a, c, d);
  }
  mesh(m: THREE.Material): THREE.Mesh | null {
    if (!this.idx.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    geo.setIndex(this.idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, m);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }
}

/** A flat ribbon of `width` along a polyline, mitred at the joints, at height y. UVs are world metres / tile. */
function ribbon(b: Batch, pts: number[], width: number, y: number, tile: number): void {
  const n = pts.length / 2;
  if (n < 2) return;
  const h = width / 2;
  let prev = -1;
  let run = 0;
  for (let i = 0; i < n; i++) {
    const x = pts[i * 2]!, z = pts[i * 2 + 1]!;
    // Direction in and out of this point, averaged for the mitre.
    let dx = 0, dz = 0;
    if (i > 0) { const ax = x - pts[i * 2 - 2]!, az = z - pts[i * 2 - 1]!; const l = Math.hypot(ax, az) || 1; dx += ax / l; dz += az / l; }
    if (i < n - 1) { const ax = pts[i * 2 + 2]! - x, az = pts[i * 2 + 3]! - z; const l = Math.hypot(ax, az) || 1; dx += ax / l; dz += az / l; }
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    // Normal to the averaged direction; a sharp bend is capped so the corner can't spike.
    const nx = -dz, nz = dx;
    if (i > 0) run += Math.hypot(x - pts[i * 2 - 2]!, z - pts[i * 2 - 1]!);
    const a = b.vert(x + nx * h, y, z + nz * h, (x + nx * h) / tile, (z + nz * h) / tile);
    const c = b.vert(x - nx * h, y, z - nz * h, (x - nx * h) / tile, (z - nz * h) / tile);
    // Wound so the faces point up: the other way round they faced the ground and were culled,
    // which hid every OSM road (audit, 11/8).
    if (prev >= 0) b.quad(prev, a, c, prev + 1);
    prev = a;
    void run;
  }
}

let facadeTex: THREE.CanvasTexture | null = null;
let glowTex: THREE.CanvasTexture | null = null;
/** Brick wall with two storeys of two windows (as backdrop.ts's facades) and a matching night glow map. */
function facadeMaps(): { map: THREE.CanvasTexture; glow: THREE.CanvasTexture } {
  if (facadeTex && glowTex) return { map: facadeTex, glow: glowTex };
  const make = (draw: (ctx: CanvasRenderingContext2D) => void, srgb: boolean): THREE.CanvasTexture => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    draw(c.getContext("2d")!);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  };
  facadeTex = make((ctx) => {
    ctx.fillStyle = "#d4c2a2";
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = "#c6b48f";
    for (let y = 4; y < 256; y += 8) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke(); }
    for (const row of [0, 128]) for (const col of [0, 128]) {
      ctx.fillStyle = "#ece2cf"; ctx.fillRect(col + 30, row + 30, 68, 70);
      ctx.fillStyle = "#3d4a55"; ctx.fillRect(col + 35, row + 35, 58, 60);
      ctx.fillStyle = "#ece2cf"; ctx.fillRect(col + 62, row + 35, 4, 60);
    }
  }, true);
  let seed = 4020;
  const rnd = (): number => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  glowTex = make((ctx) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 256, 256);
    for (const row of [0, 128]) for (const col of [0, 128]) {
      if (rnd() < 0.3) continue;
      ctx.fillStyle = ["#ffcf8a", "#ffd9a0", "#f5c27a", "#ffe3b5"][Math.floor(rnd() * 4)]!;
      ctx.fillRect(col + 35, row + 35, 58, 60);
    }
  }, true);
  return { map: facadeTex, glow: glowTex };
}

function ccw(p: number[]): boolean {
  let s = 0;
  const n = p.length / 2;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; s += p[i * 2]! * p[j * 2 + 1]! - p[j * 2]! * p[i * 2 + 1]!; }
  return s > 0;
}

export function addOsmScape(group: THREE.Group): void {
  const scape = new THREE.Group();
  scape.name = "osmscape";

  // Roads: asphalt and paving, a hair above the grass (-0.02) and below the backdrop's (0.006+) so nothing flickers.
  const asphalt = new Batch();
  const paving = new Batch();
  for (const [kind, width, pts] of OSM_ROADS) {
    if (anyInCreek(pts) || anyOnEastRoad(pts)) continue;
    if (kind === 0) ribbon(asphalt, pts, width, 0.003, 8);
    else ribbon(paving, pts, width, 0.004, 2);
  }
  const am = asphaltMat(1, 1);
  am.map?.repeat.set(1, 1);
  const pm = texMat("ai/paving.jpg", 1, 1);
  for (const [b, m] of [[asphalt, am], [paving, pm]] as const) {
    const mesh = b.mesh(m);
    if (mesh) { mesh.receiveShadow = false; scape.add(mesh); }
  }

  // Buildings: walls with the facade texture (one tile = 6 m wide, two storeys), flat roofs.
  const walls = new Batch();
  const roofs = new Batch();
  for (const [levels, p] of OSM_BUILDINGS) {
    if (anyInCreek(p) || anyOnEastRoad(p)) continue;
    const n = p.length / 2;
    const h = levels * FLOOR_H + 0.6;
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) pts.push([p[i * 2]!, p[i * 2 + 1]!]);
    if (!ccw(p)) pts.reverse();
    let run = 0;
    for (let i = 0; i < n; i++) {
      const [x0, z0] = pts[i]!;
      const [x1, z1] = pts[(i + 1) % n]!;
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.01) continue;
      const u0 = run / TILE_W, u1 = (run + len) / TILE_W, v1 = h / (FLOOR_H * 2);
      const a = walls.vert(x0, 0, z0, u0, 0);
      const b = walls.vert(x1, 0, z1, u1, 0);
      const c = walls.vert(x1, h, z1, u1, v1);
      const d = walls.vert(x0, h, z0, u0, v1);
      walls.quad(a, b, c, d);
      run += len;
    }
    // Roof: triangulate the footprint (y up; the shape is in x, -z so it faces up).
    const contour = pts.map(([x, z]) => new THREE.Vector2(x, z));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    const base = roofs.pos.length / 3;
    for (const [x, z] of pts) roofs.vert(x, h, z, 0, 0);
    for (const [a, b, c] of tris) roofs.idx.push(base + a!, base + c!, base + b!);
  }
  const { map, glow } = facadeMaps();
  const wallMat = new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 0, side: THREE.DoubleSide });
  wallMat.userData.unique = true;
  nightGlow.push({ m: wallMat, full: 0.9 });
  const wm = walls.mesh(wallMat);
  if (wm) scape.add(wm);
  const rm = roofs.mesh(mat(0x8f8a80));
  if (rm) scape.add(rm);

  // Trees: OSM maps only a few of them, so the ring just past the map's edges (where you look most)
  // was bare (the user, 11/8). Filler trees go there too, seeded so everyone sees the same, never on
  // a road or inside a building; all as two instanced meshes, so even Low shows them (fewer on Low).
  const spots: number[] = [];
  for (let i = 0; i < OSM_TREES.length; i += 2) {
    const x = OSM_TREES[i]!, z = OSM_TREES[i + 1]!;
    if (!onEastRoad(x, z)) spots.push(x, z);
  }
  const onRoad = (x: number, z: number): boolean => {
    for (const [, width, pts] of OSM_ROADS) {
      for (let i = 0; i + 3 < pts.length; i += 2) {
        const ax = pts[i]!, az = pts[i + 1]!, bx = pts[i + 2]!, bz = pts[i + 3]!;
        const dx = bx - ax, dz = bz - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
        if (Math.hypot(x - (ax + t * dx), z - (az + t * dz)) < width / 2 + 2.5) return true;
      }
    }
    return false;
  };
  const inBuilding = (x: number, z: number): boolean =>
    OSM_BUILDINGS.some(([, p]) => {
      let inside = false;
      for (let i = 0, j = p.length / 2 - 1; i < p.length / 2; j = i++) {
        const xi = p[i * 2]!, zi = p[i * 2 + 1]!, xj = p[j * 2]!, zj = p[j * 2 + 1]!;
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
      }
      return inside;
    });
  // backdrop.ts's hand-made blocks, road and the library's cutting (the generator's keep-out boxes, minX maxX minZ maxZ).
  const HANDMADE: [number, number, number, number][] = [[-66, 77, -90, -26], [-46, 53, 11, 58], [-53, -16, 11, 75], [16, 56, -141, 19]];
  let treeSeed = 4020;
  const rand = (): number => ((treeSeed = (treeSeed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const want = RICH ? 260 : 120;
  for (let tries = 0, made = 0; made < want && tries < want * 12; tries++) {
    // A point 12-75 m past the walkable box (halfX 89, halfZ 40), all the way round.
    const ang = rand() * Math.PI * 2;
    const out = 12 + rand() * 63;
    const x = Math.cos(ang) * (89 + out) * 1.05, z = Math.sin(ang) * (40 + out) * 1.4;
    if (Math.abs(x) < 89 + 10 && Math.abs(z) < 40 + 10) continue;
    if (onRoad(x, z) || inBuilding(x, z) || inCreek(x, z) || onEastRoad(x, z) || HANDMADE.some(([a, b, c, d]) => x >= a && x <= b && z >= c && z <= d)) continue;
    spots.push(x, z);
    made++;
  }
  const n = spots.length / 2;
  if (n) {
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.28, 2.6, 5), mat(0x5a4632), n);
    const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.2, 0), mat(0x5d7f48), n);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const x = spots[i * 2]!, z = spots[i * 2 + 1]!;
      const s = 0.8 + ((i * 37) % 10) / 20;
      trunk.setMatrixAt(i, m4.makeTranslation(x, 1.3, z));
      crown.setMatrixAt(i, m4.makeScale(s, s * 1.15, s).setPosition(x, 3.6 * s + 0.6, z));
    }
    trunk.instanceMatrix.needsUpdate = crown.instanceMatrix.needsUpdate = true;
    scape.add(trunk, crown);
  }

  group.add(scape);
}
