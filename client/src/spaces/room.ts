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

/**
 * Square windows in the west wall (x = `wall`), at each z in `zs`, with the
 * afternoon sun coming in through them: a shaft of light falling east across
 * the floor onto a bright patch, as in the library. Unlit additive materials,
 * so it costs next to nothing on Low. Returns the per-frame tick.
 */
export function westWindows(g: THREE.Group, wall: number, zs: number[], size = { w: 2.6, h: 2, y: 1.1 }): (dt: number) => void {
  const { w, h, y } = size;
  const glass = new THREE.MeshBasicMaterial({ color: 0xfff4dc });
  const frame = new THREE.MeshStandardMaterial({ color: 0x2f3438, roughness: 0.6 });
  const shaft = new THREE.MeshBasicMaterial({ map: shaftTexture(), color: 0xffdcaa, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const patch = new THREE.MeshBasicMaterial({ map: patchTexture(), color: 0xffd8a0, transparent: true, opacity: 0.38, blending: THREE.AdditiveBlending, depthWrite: false });
  const drop = 4.5; // how far east the light lands from the wall at floor level
  const lean = 1.2; // how far south it drifts on the way
  const x = wall + 0.02;
  for (const z of zs) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.2, h + 0.2), frame);
    f.position.set(x, y + h / 2, z);
    f.rotation.y = Math.PI / 2;
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glass);
    pane.position.set(x + 0.01, y + h / 2, z);
    pane.rotation.y = Math.PI / 2;
    // Mullions: one upright, one across.
    const up = new THREE.Mesh(new THREE.PlaneGeometry(0.06, h), frame);
    up.position.set(x + 0.02, y + h / 2, z);
    up.rotation.y = Math.PI / 2;
    const across = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.06), frame);
    across.position.set(x + 0.02, y + h * 0.55, z);
    across.rotation.y = Math.PI / 2;
    g.add(f, pane, up, across);

    // The shaft: from the window's upper part down to its patch on the floor.
    const top = y + h * 0.85;
    const hw = w / 2;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([x, top, z - hw, x, top, z + hw, x + drop + y, 0.02, z + lean + hw * 1.3, x + drop + y, 0.02, z + lean - hw * 1.3], 3),
    );
    geo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
    geo.setIndex([0, 3, 2, 0, 2, 1]);
    const beam = new THREE.Mesh(geo, shaft);
    beam.userData.noShadow = true;
    beam.renderOrder = 2;
    const spot = new THREE.Mesh(new THREE.PlaneGeometry(drop * 0.9, w * 1.4), patch);
    spot.rotation.x = -Math.PI / 2;
    spot.position.set(x + drop * 0.75 + 0.6, 0.015, z + lean * 0.75);
    spot.userData.noShadow = true;
    spot.renderOrder = 1;
    g.add(beam, spot);
  }
  let t = 0;
  return (dt) => {
    t += dt;
    shaft.opacity = 0.26 + Math.sin(t * 0.5) * 0.03;
  };
}

/** Soft at the edges, fading towards the floor: the look of a shaft of light. */
export function shaftTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  for (let x = 0; x < 64; x++) {
    const edge = Math.sin((x / 63) * Math.PI) ** 1.5;
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, `rgba(255,255,255,${edge})`);
    grad.addColorStop(1, `rgba(255,255,255,${edge * 0.25})`);
    ctx.fillStyle = grad;
    ctx.fillRect(x, 0, 1, 128);
  }
  return new THREE.CanvasTexture(c);
}

/** A soft-edged rectangle with the window's bars as darker lines. */
export function patchTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  const grad = ctx.createRadialGradient(32, 64, 4, 32, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.7, "rgba(255,255,255,0.6)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 128);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(31, 10, 2, 108);
  ctx.fillRect(10, 50, 44, 2);
  ctx.fillRect(10, 82, 44, 2);
  return new THREE.CanvasTexture(c);
}
