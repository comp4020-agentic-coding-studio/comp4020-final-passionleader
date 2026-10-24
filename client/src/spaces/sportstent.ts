import * as THREE from "three";
import { block, mat, place, solid, textPlane, type Box } from "../world.ts";

// ANU Sport's blue tent, the kind that goes up at O-Week, at the campus's
// north-west end just south of Symposium's flower bed: a pop-up gazebo (four
// straight legs, a shallow pyramid roof, a valance with the name), a feather
// banner beside it, and a folding table with a PC that opens ANU Sport's site
// (in a new tab: it refuses to be framed). All our own shapes and type, no
// logo. One of the AI campus assistants will stand beside it.

/** The PC on the tent's table; E from the south of it. */
export const SPORT_PC = { x: -26, z: -30.2 };

const BLUE = 0x1f5fae;
const BANNER_BLUE = 0x1a73e8;

export function sportsTent(g: THREE.Group, colliders: Box[]): void {
  const cx = SPORT_PC.x;
  const cz = SPORT_PC.z - 0.4; // the table is at the tent's back
  const w = 4;
  const d = 3;
  const legH = 2.4;
  const pole = mat(0xd8dde3);
  for (const [dx, dz] of [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [-w / 2, d / 2],
    [w / 2, d / 2],
  ] as const) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, legH, 8), pole);
    p.position.set(cx + dx, legH / 2, cz + dz);
    p.castShadow = true;
    g.add(p);
  }

  // The roof: a flat slab and a shallow four-sided pyramid on it, both a little
  // wider than the legs. The cone's square base is turned to line up with the
  // axes first, then stretched to the footprint (rotating the stretched mesh
  // instead is what made the old one lopsided).
  const rw = w + 0.2;
  const rd = d + 0.2;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.04, rd), mat(BLUE));
  slab.position.set(cx, legH, cz);
  const peakH = 0.45;
  const peakGeo = new THREE.ConeGeometry(Math.SQRT1_2, peakH, 4, 1);
  peakGeo.rotateY(Math.PI / 4);
  const peak = new THREE.Mesh(peakGeo, mat(BLUE));
  peak.scale.set(rw, 1, rd);
  peak.position.set(cx, legH + 0.02 + peakH / 2, cz);
  peak.castShadow = true;
  g.add(slab, peak);

  // The valance: a skirt 0.35 m deep hanging from the roof edge, all round.
  const vh = 0.35;
  const vy = legH - vh / 2;
  for (const sz of [-1, 1]) {
    const v = new THREE.Mesh(new THREE.BoxGeometry(rw, vh, 0.04), mat(BLUE));
    v.position.set(cx, vy, cz + (sz * rd) / 2);
    g.add(v);
  }
  for (const sx of [-1, 1]) {
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.04, vh, rd), mat(BLUE));
    v.position.set(cx + (sx * rw) / 2, vy, cz);
    g.add(v);
  }
  // The name on the front valance, big enough to read from the road (+z).
  const name = textPlane(["ANU Sport"], rw - 0.3, vh - 0.03, { bg: "#1f5fae", fg: "#ffffff", font: 0.28 });
  name.position.set(cx, vy, cz + rd / 2 + 0.025);
  g.add(name);

  // A folding table across the back with the PC, and a tag over it.
  const tableZ = cz - 0.6;
  const tableD = 0.7;
  block(g, colliders, [2.4, 0.75, tableD], [cx, tableZ], 0xe9ecef);
  place(g, "computerScreen.glb", 0.5, SPORT_PC.x, cz - 0.65, 0, true, 0.75);
  // Kai's end of the table: a laptop and a box of flyers (Kenney, CC0).
  place(g, "laptop.glb", 0.22, cx + 0.9, cz - 0.55, Math.PI, true, 0.75);
  place(g, "cardboardBoxClosed.glb", 0.35, cx + 1.6, cz - 1.2, 0.3);
  const tag = textPlane(["ANU Sport", "gym · clubs · classes"], 1.6, 0.42, { bg: "#1f2d3d", fg: "#ffffff", font: 0.17 });
  tag.position.set(SPORT_PC.x, 1.7, cz - 0.95);
  g.add(tag);
  // A cloth sign on the front of the table, facing south (the PC above it stays visible).
  const cloth = textPlane(["ANU Sport"], 1.4, 0.55, { bg: "#1f5fae", fg: "#ffffff", font: 0.32 });
  cloth.position.set(cx, 0.4, tableZ + tableD / 2 + 0.01);
  g.add(cloth);

  featherBanner(g, colliders, cx - 2.6, cz + 1.2);
}

/** A tall feather banner on a pole: blue flag with "ANU" large over "Sport", hanging west of the pole, readable from both sides. */
function featherBanner(g: THREE.Group, colliders: Box[], x: number, z: number): void {
  const poleH = 3.6;
  const fw = 0.7;
  const fh = 2.6;
  const flagY = 0.9; // the flag's bottom edge
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, poleH, 8), mat(0xd8dde3));
  post.position.set(x, poleH / 2, z);
  post.castShadow = true;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.05, 12), mat(0x454c55));
  foot.position.set(x, 0.025, z);
  g.add(post, foot);
  solid(colliders, 0.3, 0.3, x, z);

  // The flag's outline: straight where it meets the pole, sweeping up and over at the top like a feather.
  const outline = new THREE.Shape();
  outline.moveTo(0, 0);
  outline.lineTo(-fw, 0);
  outline.lineTo(-fw, fh - 0.8);
  outline.quadraticCurveTo(-fw, fh, 0, fh);
  outline.lineTo(0, 0);
  const flag = new THREE.Mesh(
    new THREE.ShapeGeometry(outline),
    new THREE.MeshStandardMaterial({ color: BANNER_BLUE, roughness: 0.85, metalness: 0, side: THREE.DoubleSide }),
  );
  flag.position.set(x, flagY, z);
  flag.castShadow = true;
  g.add(flag);

  // Text on both faces, so it reads from the road and from behind.
  const bg = "#1a73e8";
  for (const side of [1, -1]) {
    const face = new THREE.Group();
    const anu = textPlane(["ANU"], fw, 0.9, { bg, fg: "#ffffff", font: 0.34 });
    anu.position.set(0, 1.35, 0);
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.025), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    bar.position.set(0, 0.85, 0);
    const sport = textPlane(["Sport"], fw, 0.45, { bg, fg: "#ffffff", font: 0.17 });
    sport.position.set(0, 0.6, 0);
    face.add(anu, bar, sport);
    // Centred on the flag (half a flag west of the pole), so turning it round keeps it there.
    face.position.set(x - fw / 2, flagY, z + side * 0.005);
    if (side === -1) face.rotation.y = Math.PI;
    g.add(face);
  }
}
