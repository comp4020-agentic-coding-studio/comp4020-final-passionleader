import * as THREE from "three";
import { doorway, floor, mat, solid, texMat, textPlane, type Box } from "../world.ts";
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

/**
 * Chifley Library's face, one 4 m bay, drawn on a canvas: pale concrete upper
 * floors with a tall dark window slot, over a ground floor of round arches on
 * stone piers (after the 1960s building; not surveyed).
 */
let chifleyTex: THREE.CanvasTexture | null = null;
function chifleyMat(len: number): THREE.MeshStandardMaterial {
  if (!chifleyTex) {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 512;
    const ctx = c.getContext("2d")!;
    // Upper three floors: pale render, a tall slot window with mullions.
    ctx.fillStyle = "#e6dccb";
    ctx.fillRect(0, 0, 128, 384);
    ctx.fillStyle = "#3a3229";
    ctx.fillRect(40, 40, 48, 320);
    ctx.fillStyle = "#c9a85a";
    for (const y of [60, 170, 280]) ctx.fillRect(46, y, 36, 70);
    ctx.fillStyle = "#3a3229";
    for (const y of [60, 170, 280]) ctx.fillRect(62, y, 4, 70);
    // A band between the upper floors and the arcade.
    ctx.fillStyle = "#b8ab95";
    ctx.fillRect(0, 372, 128, 16);
    // Ground floor: a pebbly stone pier either side and a round arch, dark inside.
    ctx.fillStyle = "#8f8270";
    ctx.fillRect(0, 388, 128, 124);
    ctx.fillStyle = "#2b2622";
    ctx.beginPath();
    ctx.moveTo(18, 512);
    ctx.lineTo(18, 440);
    ctx.arc(64, 440, 46, Math.PI, 0);
    ctx.lineTo(110, 512);
    ctx.fill();
    ctx.fillStyle = "#d9b45e";
    ctx.fillRect(40, 470, 48, 42);
    chifleyTex = new THREE.CanvasTexture(c);
    chifleyTex.colorSpace = THREE.SRGBColorSpace;
    chifleyTex.wrapS = THREE.RepeatWrapping;
    chifleyTex.anisotropy = 4;
  }
  const map = chifleyTex.clone();
  map.needsUpdate = true;
  map.repeat.set(len / 4, 1);
  return new THREE.MeshStandardMaterial({ map, roughness: 0.9, metalness: 0 });
}

/** Asphalt, drawn on a canvas: dark grey grain, no markings (a one-lane road). */
let asphaltTex: THREE.CanvasTexture | null = null;
export function asphaltMat(w: number, d: number): THREE.MeshStandardMaterial {
  if (!asphaltTex) {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#4a4c4f";
    ctx.fillRect(0, 0, 256, 256);
    // Grain: a few thousand specks a shade lighter or darker.
    let seed = 7;
    const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 4000; i++) {
      const v = 60 + Math.floor(rnd() * 30);
      ctx.fillStyle = `rgb(${v},${v + 1},${v + 3})`;
      ctx.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    asphaltTex = new THREE.CanvasTexture(c);
    asphaltTex.colorSpace = THREE.SRGBColorSpace;
    asphaltTex.wrapS = asphaltTex.wrapT = THREE.RepeatWrapping;
    asphaltTex.anisotropy = 4;
  }
  const map = asphaltTex.clone();
  map.needsUpdate = true;
  // One tile is about 8 m of road.
  map.repeat.set(w / 8, d / 8);
  return new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0 });
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

/**
 * A ground floor of shopfronts facing the road (+z), from x0 to x1 with its
 * glass at z: each shop four tall panes in a dark frame, a coloured awning,
 * and a plain painted name board. Names only, in plain type: no brand logos.
 */
// Left to right as on the real street: a bar, Subway, a burger place.
const SHOPS = [
  { name: "Symposium", w: 13, board: "#2b2b30", fg: "#e8c872", awning: 0x2b2b30 },
  { name: "Subway", w: 13, board: "#00843d", fg: "#ffcc00", awning: 0x00843d },
  { name: "Broger", w: 13, board: "#c8331e", fg: "#ffffff", awning: 0xc8331e },
];
/** West of Symposium: an unlet unit or a nameless office, glass front and a plain grey awning, no name. */
const UNLET = [{ name: "", w: 9, board: "", fg: "", awning: 0x8a8d90 }];

function shopfronts(g: THREE.Group, x0: number, x1: number, z: number, shops = SHOPS): void {
  const h = FLOOR_H;
  const wall = mat(0xd9c8a9);
  const frame = mat(0x2a2a2a);
  const glass = new THREE.MeshStandardMaterial({ color: 0x6f8796, emissive: 0x2a2416, roughness: 0.2, metalness: 0.3 });
  // The storey behind the fronts, so there's no gap above the awnings.
  const base = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, 14), wall);
  base.position.set((x0 + x1) / 2, h / 2, z - 7);
  g.add(base);
  let x = x0 + 1;
  for (const s of shops) {
    if (x + s.w > x1 - 0.5) break;
    const cx = x + s.w / 2;
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(s.w - 0.6, 2.4), glass);
    pane.position.set(cx, 1.3, z + 0.02);
    g.add(pane);
    // Four tall panes per shop: a mullion at each edge and every quarter.
    for (const fx of [0, 0.25, 0.5, 0.75, 1].map((t) => x + 0.3 + t * (s.w - 0.6))) {
      const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.5, 0.08), frame);
      mullion.position.set(fx, 1.3, z + 0.05);
      g.add(mullion);
    }
    const awning = new THREE.Mesh(new THREE.BoxGeometry(s.w - 0.3, 0.08, 1.3), mat(s.awning));
    awning.position.set(cx, 2.72, z + 0.6);
    awning.rotation.x = 0.18;
    g.add(awning);
    if (s.name) {
      const sign = textPlane([s.name], Math.min(s.w - 1, 7), 0.6, { bg: s.board, fg: s.fg, font: 0.4 });
      sign.position.set(cx, 3.05, z + 0.03);
      g.add(sign);
    }
    x += s.w + 0.5;
  }
}

export function buildBackdrop(g: THREE.Group, colliders: Box[]): void {
  const backdrop = new THREE.Group();
  const road = (w: number, d: number, x: number, z: number): void => {
    floor(backdrop, w, d, x, z, texMat("ai/paving.jpg", w / 2, d / 2), 0.006);
  };

  // The east-west road north of the lawn and 154 (z -40..-22: a narrow path
  // along the buildings, a row of flower beds, then the main road, 1:1:3; the
  // beds are in streetscape.ts). Its east end stops at the asphalt road that
  // runs north past 154's east side, between the O'Donoghue centre and the
  // red-brick buildings, with a pale footpath along its west edge.
  road(84.6, 18, -13.8, -31); // x -56.1..28.5 (on west of x -40 it meets creek.ts's avenue paving)
  road(3, 91, 30, -29.5); // footpath x 28.5..31.5, z -75..16
  floor(backdrop, 9, 130, 36, -61, asphaltMat(9, 130), 0.008); // x 31.5..40.5, z -126..4, then down the ramp (buildSouth)
  // The road's pale paving carries on east across the asphalt, as on campus:
  // the asphalt cuts across it (drawn on top), rather than the road ending in grass.
  road(60, 18, 70.5, -31); // x 40.5..100.5

  // The row of pale-brick buildings along the road's north side, with a
  // two-storey passage under it in line with 154's west side.
  const beige = facadeTexture("#d9c8a9", "#cbb995", "#3d4a55", "#ece2cf");
  // Its ground floor along the road is shops and cafes, not windows.
  block(backdrop, beige, -18, -47, 44, 14, 6, 1);
  shopfronts(backdrop, -40, 4, -40);
  // The row carries on west to x -51, leaving a white path and the creek's
  // boardwalk (each 3.2 m) before the creek: the same block over a glass
  // ground floor, an unlet unit or nameless office.
  block(backdrop, beige, -45.5, -47, 11, 14, 6, 1);
  shopfronts(backdrop, -51, -40, -40, UNLET);
  block(backdrop, beige, 7, -47, 6, 14, 5, 2);
  road(6, 22, 7, -51);
  block(backdrop, beige, 7, -68, 18, 12, 5); // seen through the passage
  block(backdrop, beige, 20, -57, 20, 14, 7);

  // The pavilion, built onto the row east of the passage, as wide as 154:
  // dark glass upstairs, a warm lit ground floor, and a thin dark roof
  // overhanging on three sides with warm timber underneath.
  // The pavilion's parts in a group of their own, so it fades when it stands
  // between the camera and you (a turned view looks at it from the north).
  const pavilion = new THREE.Group();
  backdrop.add(pavilion);
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
  pavilion.add(upper, lobby);
  const mullion = mat(0x2b2b2b);
  for (let x = -pw / 2 + 1.5; x < pw / 2; x += 2.2) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, ph, 0.12), mullion);
    m.position.set(px + x, ph / 2, pz + pd / 2 + 0.06);
    pavilion.add(m);
  }
  const band = new THREE.Mesh(new THREE.BoxGeometry(pw + 0.1, 0.35, pd + 0.1), mullion);
  band.position.set(px, ph * 0.5, pz);
  pavilion.add(band);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(pw + 4, 0.7, pd + 3), mat(0x23272b));
  roof.position.set(px, ph + 0.35, pz + 1.5);
  pavilion.add(roof);
  const soffit = new THREE.Mesh(
    new THREE.PlaneGeometry(pw + 4, pd + 3),
    new THREE.MeshStandardMaterial({ color: 0xc89a62, emissive: 0x5a3818, roughness: 0.8 }),
  );
  soffit.rotation.x = Math.PI / 2; // faces down
  soffit.position.set(px, ph - 0.01, pz + 1.5);
  pavilion.add(soffit);
  // Its name in white on the dark glass, facing the road.
  const name = textPlane(["Lowitja O'Donoghue", "Cultural Centre"], 11, 2.3, { bg: "#2a3743", fg: "#ffffff", font: 0.8 });
  name.position.set(px + 1.5, ph * 0.75, pz + pd / 2 + 0.1);
  pavilion.add(name);
  // The Career Hub on its lit ground floor (plan 111): its name over a door in
  // the front, on the north road (the user's call, 10/30).
  const careers = textPlane(["Career Hub", "internships · jobs"], 4, 1.1, { bg: "#23404f", fg: "#ffffff", font: 0.42 });
  careers.position.set(px, 3, pz + pd / 2 + 0.1);
  pavilion.add(careers);
  doorway(pavilion, px, pz + pd / 2 + 0.06, 0, "");

  // Only the walls' box, not the roof's overhang over the pavement: standing at its door, the camera's
  // ray from the south met the overhang first and the whole building faded (the user, 10/30).
  markOccluderGroup(g, pavilion, new THREE.Box3(new THREE.Vector3(px - pw / 2, 0, pz - pd / 2), new THREE.Vector3(px + pw / 2, ph + 0.7, pz + pd / 2 - 0.3)));

  // Low red-brick buildings beyond the east road.
  const red = facadeTexture("#9b5a44", "#8a4d39", "#2f3a42", "#d8cfc2");
  // North of the east-west road (which carries on past them), like the row
  // on its west side.
  block(backdrop, red, 50, -48, 16, 12, 3, 0, 0x6f6a64);
  block(backdrop, red, 52, -66, 20, 14, 4, 0, 0x6f6a64);

  buildSouth(backdrop, colliders);

  backdrop.traverse((o) => {
    o.userData.noShadow = true;
  });
  g.add(backdrop);
}

/** The south: a sunken outdoor level, the path's bridge over it, Chifley Library. */
function buildSouth(g: THREE.Group, colliders: Box[]): void {
  // A sunken one-lane road crosses under the bridge (the user's call, 10/30):
  // the asphalt road east of 154 ramps down into a cutting along the
  // library's front, runs west under the bridge (open beneath, like the
  // creek's), and at the library's west end turns south along its side.
  // All scenery: nobody walks down there.
  const DEPTH = 2.6;
  const z0 = 17;
  const z1 = 26; // a wider cutting than before; the library moved 3 m south for it
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
  const X_WEST = -38; // the cutting turns south here, just past the library's west end (x -30)
  const X_EAST = 40.5; // the east road's far edge
  // The cutting: pale paving on its floor, the one-lane road down its middle,
  // retaining walls along both sides with railings on top.
  const w = X_EAST - X_WEST;
  const cx = (X_WEST + X_EAST) / 2;
  floor(g, w, z1 - z0, cx, (z0 + z1) / 2, texMat("ai/paving.jpg", w / 2, 4, 0x9a968e), -DEPTH);
  const LANE = 4.4;
  const laneZ = (z0 + z1) / 2;
  floor(g, w - 4, LANE, cx + 2, laneZ, asphaltMat(w - 4, LANE), -DEPTH + 0.01);
  for (const z of [z0, z1]) {
    // The north wall stops where the ramp comes down at the east end.
    const x1 = z === z0 ? 31.5 : X_EAST;
    const wl = x1 - X_WEST;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(wl, DEPTH, 0.3), wallMat);
    wall.position.set((X_WEST + x1) / 2, -DEPTH / 2, z + (z === z0 ? 0.15 : -0.15));
    g.add(wall);
    // Railings along the top, but not across the bridge (it has its own).
    for (const [ra, rb] of [
      [X_WEST, -9],
      [5, x1],
    ] as const)
      rail(ra, rb, z, z);
  }
  const eastWall = new THREE.Mesh(new THREE.BoxGeometry(0.3, DEPTH, z1 - z0), wallMat);
  eastWall.position.set(X_EAST - 0.15, -DEPTH / 2, (z0 + z1) / 2);
  g.add(eastWall);
  // Solid either side of the bridge (x -9..5), never across it: the bridge is the way to the library.
  solid(colliders, -9 - X_WEST, z1 - z0, (X_WEST - 9) / 2, (z0 + z1) / 2);
  solid(colliders, X_EAST - 5, z1 - z0, (5 + X_EAST) / 2, (z0 + z1) / 2);
  // The bend south: the cutting runs on down the library's west side.
  const SOUTH_TO = 60;
  const sw = 7;
  const sx = X_WEST + sw / 2;
  floor(g, sw, SOUTH_TO - z1, sx, (z1 + SOUTH_TO) / 2, texMat("ai/paving.jpg", 3, (SOUTH_TO - z1) / 2, 0x9a968e), -DEPTH);
  floor(g, LANE, SOUTH_TO - z0 - 2, sx, (z0 + 2 + SOUTH_TO) / 2, asphaltMat(LANE, SOUTH_TO - z0), -DEPTH + 0.012);
  for (const x of [X_WEST, X_WEST + sw]) {
    const za = x === X_WEST ? z0 : z1;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.3, DEPTH, SOUTH_TO - za), wallMat);
    wall.position.set(x + (x === X_WEST ? 0.15 : -0.15), -DEPTH / 2, (za + SOUTH_TO) / 2);
    g.add(wall);
    rail(x, x, za, SOUTH_TO);
  }
  const westEnd = new THREE.Mesh(new THREE.BoxGeometry(0.3, DEPTH, z1 - z0), wallMat);
  westEnd.position.set(X_WEST + 0.15, -DEPTH / 2, (z0 + z1) / 2);
  g.add(westEnd);
  solid(colliders, sw, SOUTH_TO - z1, sx, (z1 + SOUTH_TO) / 2);
  // The ramp: the east road (x 31.5..40.5) slopes from street level at z 4
  // down to the cutting's floor at its north wall, then turns west into it.
  const RAMP_FROM = 4;
  const rampLen = z0 + 4.5 - RAMP_FROM;
  const slope = Math.atan2(DEPTH, rampLen);
  const ramp = new THREE.Mesh(new THREE.PlaneGeometry(9, Math.hypot(rampLen, DEPTH)), asphaltMat(9, rampLen));
  ramp.rotation.x = -Math.PI / 2 + slope;
  ramp.position.set(36, -DEPTH / 2 + 0.01, RAMP_FROM + rampLen / 2);
  g.add(ramp);
  // Its side walls, rising from nothing to the cutting's depth.
  for (const x of [31.5, 40.5]) {
    const side = new THREE.Shape();
    side.moveTo(0, 0);
    side.lineTo(rampLen, -DEPTH);
    side.lineTo(rampLen, 0);
    side.closePath();
    const wallSide = new THREE.Mesh(new THREE.ShapeGeometry(side), new THREE.MeshStandardMaterial({ color: 0xbdb8ae, side: THREE.DoubleSide }));
    wallSide.rotation.y = -Math.PI / 2;
    wallSide.position.set(x, 0, RAMP_FROM);
    g.add(wallSide);
    rail(x, x, RAMP_FROM + 2, z0);
  }
  solid(colliders, 9, rampLen, 36, RAMP_FROM + rampLen / 2);

  // The bridge: a deck over the cutting with railings either side, open
  // beneath (the road runs under it), on a pier at each bank.
  const deck = new THREE.Mesh(new THREE.BoxGeometry(14.8, 0.6, z1 - z0), wallMat);
  deck.position.set(-2, -0.3, (z0 + z1) / 2);
  g.add(deck);
  for (const x of [-9.2, 5.2]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, z1 - z0), mat(0x8f8a80));
    beam.position.set(x, -0.85, (z0 + z1) / 2);
    g.add(beam);
  }
  rail(-9, -9, z0, z1);
  rail(5, 5, z0, z1);

  // Chifley Library across the end of the path, its door at the bridge. You
  // stop 3 m short of it (outdoor.ts) and it never fades: the end of the map.
  const library = new THREE.Group();
  // Pale concrete over an arcade of round arches, its upper windows in tall
  // dark slots (after the real building, drawn on the wall).
  const lib = new THREE.Mesh(new THREE.BoxGeometry(66, 4 * FLOOR_H, 14), [
    chifleyMat(14),
    chifleyMat(14),
    mat(0xa39886),
    mat(0xa39886),
    chifleyMat(66),
    chifleyMat(66),
  ]);
  lib.position.set(3, 2 * FLOOR_H, 35);
  library.add(lib);
  // A deep cornice along the top.
  const cornice = new THREE.Mesh(new THREE.BoxGeometry(67, 0.5, 1.2), mat(0xcfc3ae));
  cornice.position.set(3, 4 * FLOOR_H + 0.1, 28.2);
  library.add(cornice);
  const door = new THREE.Mesh(new THREE.BoxGeometry(6, 3.2, 0.2), mat(0x1c2328));
  door.position.set(-2, 1.6, 27.95);
  library.add(door);
  g.add(library);
  // Its ground is a beige forecourt, not the campus grass: the building fades
  // when the camera comes close, and grass then showed where the library stands.
  floor(g, 68.5, 16.3, 3.75, 34.35, texMat("ai/paving.jpg", 34, 8, 0xe2d6bc), 0.01); // x -30.5..38
  solid(colliders, 66, 14, 3, 35);
}
