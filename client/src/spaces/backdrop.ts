import * as THREE from "three";
import { floor, mat, solid, texMat, textPlane, type Box } from "../world.ts";
import { markOccluderGroup } from "./occluders.ts";

// Scenery past the map's edges, laid out from my own sketch and photos (kept
// out of the repo), not surveyed, so the campus ends in buildings rather than
// a bare horizon. North: an east-west road past the lawn and 154, then a long
// row of seven-storey pale-brick buildings; at 154's end of the row, a
// passage under the building and the Lowitja O'Donoghue Cultural Centre, a
// low glass pavilion under a timber-lined roof, built onto it. East of 154,
// another road. South: the ground drops to a sunken outdoor level below 155
// and 154, the path crosses it on a bridge to Chifley Library's front door.

const FLOOR_H = 3.3;
/** One canvas tile is two window bays (6 m) wide and two storeys high. */
const TILE_W = 6;

const facades = new Map<string, THREE.CanvasTexture>();

/** Brick wall with a grid of windows, drawn on a canvas (nothing to credit). */
function facadeTexture(wall: string, joint: string, glass: string, frame: string): THREE.CanvasTexture {
  const key = wall + glass;
  const hit = facades.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, 256, 256);
  // Faint brick courses.
  ctx.strokeStyle = joint;
  ctx.lineWidth = 1;
  for (let y = 4; y < 256; y += 8) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }
  // Two storeys of two windows each, deep-set with a light frame.
  for (const row of [0, 128]) {
    for (const col of [0, 128]) {
      ctx.fillStyle = frame;
      ctx.fillRect(col + 30, row + 30, 68, 70);
      ctx.fillStyle = glass;
      ctx.fillRect(col + 35, row + 35, 58, 60);
      ctx.fillStyle = frame;
      ctx.fillRect(col + 62, row + 35, 4, 60);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  facades.set(key, t);
  return t;
}

function facadeMat(tex: THREE.CanvasTexture, len: number, storeys: number): THREE.MeshStandardMaterial {
  const map = tex.clone();
  map.needsUpdate = true;
  map.repeat.set(len / TILE_W, storeys / 2);
  return new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0 });
}

/** A block of `storeys` floors starting `fromStorey` floors up, windows on every face. */
function block(
  g: THREE.Group,
  tex: THREE.CanvasTexture,
  x: number,
  z: number,
  w: number,
  d: number,
  storeys: number,
  fromStorey = 0,
  roof = 0xb9ad98,
): void {
  const h = storeys * FLOOR_H;
  const sides = facadeMat(tex, d, storeys);
  const front = facadeMat(tex, w, storeys);
  const top = mat(roof);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [sides, sides, top, top, front, front]);
  m.position.set(x, fromStorey * FLOOR_H + h / 2, z);
  g.add(m);
}

export function buildBackdrop(g: THREE.Group, colliders: Box[]): void {
  const backdrop = new THREE.Group();
  const road = (w: number, d: number, x: number, z: number): void => {
    floor(backdrop, w, d, x, z, texMat("ai/paving.jpg", w / 2, d / 2), 0.006);
  };

  // The east-west road north of the lawn and 154 (z -40..-22: a narrow path
  // along the buildings, a row of flower beds, then the main road, 1:1:3; the
  // beds are in streetscape.ts), and the road east of 154.
  road(78, 18, -1, -31);
  road(11, 64, 32, -8);

  // The row of pale-brick buildings along the road's north side, with a
  // two-storey passage under it in line with 154's west side.
  const beige = facadeTexture("#d9c8a9", "#cbb995", "#3d4a55", "#ece2cf");
  block(backdrop, beige, -18, -47, 44, 14, 7);
  block(backdrop, beige, 7, -47, 6, 14, 5, 2);
  road(6, 22, 7, -51);
  block(backdrop, beige, 7, -68, 18, 12, 5); // seen through the passage
  block(backdrop, beige, 20, -57, 20, 14, 7);

  // The pavilion, built onto the row east of the passage, as wide as 154:
  // dark glass upstairs, a warm lit ground floor, and a thin dark roof
  // overhanging on three sides with warm timber underneath.
  const px = 18;
  const pz = -45;
  const pw = 16;
  const pd = 10;
  const ph = 7.6;
  const upper = new THREE.Mesh(
    new THREE.BoxGeometry(pw, ph / 2, pd),
    new THREE.MeshStandardMaterial({ color: 0x2a3743, roughness: 0.25, metalness: 0.3 }),
  );
  upper.position.set(px, ph * 0.75, pz);
  const lobby = new THREE.Mesh(
    new THREE.BoxGeometry(pw - 0.6, ph / 2, pd - 0.6),
    new THREE.MeshStandardMaterial({ color: 0x4a4436, emissive: 0x3a2c18, roughness: 0.4 }),
  );
  lobby.position.set(px, ph / 4, pz);
  backdrop.add(upper, lobby);
  const mullion = mat(0x2b2b2b);
  for (let x = -pw / 2 + 1.5; x < pw / 2; x += 2.2) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, ph, 0.12), mullion);
    m.position.set(px + x, ph / 2, pz + pd / 2 + 0.06);
    backdrop.add(m);
  }
  const band = new THREE.Mesh(new THREE.BoxGeometry(pw + 0.1, 0.35, pd + 0.1), mullion);
  band.position.set(px, ph * 0.5, pz);
  backdrop.add(band);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(pw + 4, 0.7, pd + 3), mat(0x23272b));
  roof.position.set(px, ph + 0.35, pz + 1.5);
  backdrop.add(roof);
  const soffit = new THREE.Mesh(
    new THREE.PlaneGeometry(pw + 4, pd + 3),
    new THREE.MeshStandardMaterial({ color: 0xc89a62, emissive: 0x5a3818, roughness: 0.8 }),
  );
  soffit.rotation.x = Math.PI / 2; // faces down
  soffit.position.set(px, ph - 0.01, pz + 1.5);
  backdrop.add(soffit);
  // Its name in white on the dark glass, facing the road.
  const name = textPlane(["Lowitja O'Donoghue", "Cultural Centre"], 11, 2.3, { bg: "#2a3743", fg: "#ffffff", font: 0.8 });
  name.position.set(px + 1.5, ph * 0.75, pz + pd / 2 + 0.1);
  backdrop.add(name);

  // Low red-brick buildings beyond the east road.
  const red = facadeTexture("#9b5a44", "#8a4d39", "#2f3a42", "#d8cfc2");
  block(backdrop, red, 50, -40, 16, 12, 3, 0, 0x6f6a64);
  block(backdrop, red, 52, -62, 20, 14, 4, 0, 0x6f6a64);

  buildSouth(backdrop, colliders, g);

  backdrop.traverse((o) => {
    o.userData.noShadow = true;
  });
  g.add(backdrop);
}

/** The south: a sunken outdoor level, the path's bridge over it, Chifley Library. */
function buildSouth(g: THREE.Group, colliders: Box[], space: THREE.Group): void {
  const DEPTH = 2.6;
  const z0 = 17;
  const z1 = 23;
  const wallMat = mat(0xbdb8ae);
  const steel = mat(0x1d1f22);
  const rail = (x0: number, x1: number, za: number, zb: number): void => {
    const len = Math.hypot(x1 - x0, zb - za);
    const along = new THREE.Group();
    for (const y of [1.05, 0.15]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.05), steel);
      r.position.y = y;
      along.add(r);
    }
    for (let t = 0; t <= len + 0.01; t += 0.5) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.05, 0.03), steel);
      post.position.set(t - len / 2, 0.55, 0);
      along.add(post);
    }
    along.position.set((x0 + x1) / 2, 0, (za + zb) / 2);
    along.rotation.y = -Math.atan2(zb - za, x1 - x0);
    g.add(along);
  };
  // Two pits, either side of the bridge (the path runs x -9..5).
  for (const [x0, x1] of [
    [-35, -9],
    [5, 35],
  ] as const) {
    const w = x1 - x0;
    const cx = (x0 + x1) / 2;
    floor(g, w, z1 - z0, cx, (z0 + z1) / 2, texMat("ai/paving.jpg", w / 2, 3, 0x9a968e), -DEPTH);
    for (const z of [z0, z1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, DEPTH, 0.3), wallMat);
      wall.position.set(cx, -DEPTH / 2, z + (z === z0 ? 0.15 : -0.15));
      g.add(wall);
      rail(x0, x1, z, z);
    }
    for (const x of [x0, x1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.3, DEPTH, z1 - z0), wallMat);
      wall.position.set(x + (x === x0 ? 0.15 : -0.15), -DEPTH / 2, (z0 + z1) / 2);
      g.add(wall);
    }
    solid(colliders, w, z1 - z0, cx, (z0 + z1) / 2);
  }
  // The bridge: a deck with railings either side.
  const deck = new THREE.Mesh(new THREE.BoxGeometry(14, 0.6, z1 - z0), wallMat);
  deck.position.set(-2, -0.3, (z0 + z1) / 2);
  g.add(deck);
  rail(-9, -9, z0, z1);
  rail(5, 5, z0, z1);

  // Chifley Library across the end of the path, its door at the bridge. You
  // can walk up to the door, so it fades when the camera ends up inside it.
  const library = new THREE.Group();
  const brown = facadeTexture("#8a6a50", "#7a5c45", "#2c3338", "#b9a58c");
  const lib = new THREE.Mesh(new THREE.BoxGeometry(66, 4 * FLOOR_H, 14), [
    facadeMat(brown, 14, 4),
    facadeMat(brown, 14, 4),
    mat(0x8f857a),
    mat(0x8f857a),
    facadeMat(brown, 66, 4),
    facadeMat(brown, 66, 4),
  ]);
  lib.position.set(3, 2 * FLOOR_H, 32);
  library.add(lib);
  const door = new THREE.Mesh(new THREE.BoxGeometry(6, 3.2, 0.2), mat(0x1c2328));
  door.position.set(-2, 1.6, 24.95);
  library.add(door);
  const sign = textPlane(["Chifley Library"], 7, 1.1, { bg: "#2a2420", fg: "#ffffff", font: 0.7 });
  sign.position.set(-2, 4, 24.85);
  sign.rotation.y = Math.PI;
  library.add(sign);
  g.add(library);
  solid(colliders, 66, 14, 3, 32);
  markOccluderGroup(space, library);
}
