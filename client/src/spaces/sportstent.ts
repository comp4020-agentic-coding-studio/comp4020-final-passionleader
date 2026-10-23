import * as THREE from "three";
import { block, mat, place, textPlane, type Box } from "../world.ts";

// ANU Sport's blue tent, the kind that goes up at O-Week, at the campus's
// north-west end just south of Symposium's flower bed: four poles, a peaked
// blue canopy, a banner with the name (no logo), and a folding table with a
// PC that opens ANU Sport's site (in a new tab: it refuses to be framed).
// One of the AI campus assistants will stand beside it.

/** The PC on the tent's table; E from the south of it. */
export const SPORT_PC = { x: -26, z: -30.2 };

const BLUE = 0x1f5fae;

export function sportsTent(g: THREE.Group, colliders: Box[]): void {
  const cx = SPORT_PC.x;
  const cz = SPORT_PC.z - 0.4; // the table is at the tent's back
  const w = 4;
  const d = 3;
  const pole = mat(0xd8dde3);
  for (const [dx, dz] of [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [-w / 2, d / 2],
    [w / 2, d / 2],
  ] as const) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 8), pole);
    p.position.set(cx + dx, 1.2, cz + dz);
    p.castShadow = true;
    g.add(p);
  }
  // The canopy: a low four-sided peak over a short blue valance.
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(w, d) / 2 + 0.1, 0.7, 4, 1), mat(BLUE));
  canopy.rotation.y = Math.PI / 4;
  canopy.scale.set(1, 1, d / w);
  canopy.position.set(cx, 2.75, cz);
  canopy.castShadow = true;
  const valance = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.3, d + 0.1), mat(BLUE));
  valance.position.set(cx, 2.3, cz);
  g.add(canopy, valance);
  // The name on the front valance, facing the road (+z).
  const banner = textPlane(["ANU Sport"], w - 0.4, 0.28, { bg: "#1f5fae", fg: "#ffffff", font: 0.2 });
  banner.position.set(cx, 2.3, cz + d / 2 + 0.06);
  g.add(banner);
  // A folding table across the back with the PC, and a tag over it.
  block(g, colliders, [2.4, 0.75, 0.7], [cx, cz - 0.6], 0xe9ecef);
  place(g, "computerScreen.glb", 0.5, SPORT_PC.x, cz - 0.65, 0, true, 0.75);
  const tag = textPlane(["ANU Sport", "gym · clubs · classes"], 1.6, 0.42, { bg: "#1f2d3d", fg: "#ffffff", font: 0.17 });
  tag.position.set(SPORT_PC.x, 1.7, cz - 0.95);
  g.add(tag);
}
