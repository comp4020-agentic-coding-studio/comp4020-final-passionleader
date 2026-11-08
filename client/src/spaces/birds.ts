import * as THREE from "three";
import { RICH } from "../settings.ts";

// A few small birds circling slowly high over the lawn (RICE v3, 16), Medium
// and High only. Built from a handful of triangles shared by every bird, one
// draw call per mesh and no model file, so they cost next to nothing; they
// don't cast shadows (a moving speck on the grass read as a glitch).

/** The lawn's middle (outdoor.ts: x -29..-9, z -22..-6), what they circle, within 20 m of it. */
const CENTRE = { x: -19, z: -14 };

const bodyMat = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.9, side: THREE.DoubleSide });
const wingMat = new THREE.MeshStandardMaterial({ color: 0xf1f1ec, roughness: 0.9, side: THREE.DoubleSide });

/** A body pointing +z: a stretched, low-detail ball with a short beak. */
function bodyGeometry(): THREE.BufferGeometry {
  const ball = new THREE.SphereGeometry(0.14, 6, 4);
  ball.scale(1, 0.9, 2.1);
  const beak = new THREE.ConeGeometry(0.04, 0.16, 4);
  beak.rotateX(Math.PI / 2);
  beak.translate(0, 0, 0.36);
  const out = new THREE.BufferGeometry();
  const parts = [ball, beak].map((g) => g.toNonIndexed());
  const pos: number[] = [];
  for (const g of parts) pos.push(...(g.getAttribute("position").array as Float32Array));
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.computeVertexNormals();
  return out;
}

/** One wing reaching out along +x from its root, swept back at the tip. Mirrored for the left. */
function wingGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0, 0.2, 0, 0, -0.18, 0.7, 0, -0.34, 0, 0, 0.2, 0.7, 0, -0.34, 0.62, 0, -0.1], 3),
  );
  g.computeVertexNormals();
  return g;
}

interface Bird {
  g: THREE.Group;
  left: THREE.Mesh;
  right: THREE.Mesh;
  /** Where on its circle, how fast (rad/s, signed), its radius, height, and where in the flap. */
  angle: number;
  speed: number;
  radius: number;
  height: number;
  phase: number;
}

/** Adds the birds to `g` (none on Low); returns the per-frame update. */
export function addBirds(g: THREE.Group): (dt: number) => void {
  if (!RICH) return () => {};
  const body = bodyGeometry();
  const wing = wingGeometry();
  const wingL = wingGeometry();
  wingL.scale(-1, 1, 1);
  // Mirroring flips the winding; DoubleSide material means that's fine.
  const count = 3 + Math.floor(Math.random() * 4);
  const birds: Bird[] = [];
  for (let i = 0; i < count; i++) {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(body, bodyMat));
    const right = new THREE.Mesh(wing, wingMat);
    right.position.x = 0.1;
    const left = new THREE.Mesh(wingL, wingMat);
    left.position.x = -0.1;
    group.add(right, left);
    g.add(group);
    const dir = i % 2 ? -1 : 1;
    birds.push({
      g: group,
      left,
      right,
      angle: (i / count) * Math.PI * 2 + Math.random(),
      // About 3 m/s along the circle: a slow, lazy turn.
      speed: dir * (0.2 + Math.random() * 0.08),
      radius: 9 + Math.random() * 6, // stays within 20 m of the lawn centre
      height: 8 + Math.random() * 4,
      phase: Math.random() * 6,
    });
  }
  let t = 0;
  return (dt) => {
    t += dt;
    for (const b of birds) {
      b.angle += b.speed * dt;
      const x = CENTRE.x + Math.cos(b.angle) * b.radius;
      const z = CENTRE.z + Math.sin(b.angle) * b.radius;
      // A gentle rise and fall, so the ring isn't flat.
      b.g.position.set(x, b.height + Math.sin(t * 0.4 + b.phase) * 0.8, z);
      // Facing along its path (tangent), banked a little into the turn.
      const heading = Math.atan2(-Math.sin(b.angle) * Math.sign(b.speed), Math.cos(b.angle) * Math.sign(b.speed));
      b.g.rotation.set(0, heading, -0.18 * Math.sign(b.speed), "YXZ");
      // Mostly gliding, with bursts of quick flapping: a sine wave gated by a slow one.
      const beat = Math.sin(t * 9 + b.phase);
      const flap = (0.15 + 0.5 * Math.max(0, Math.sin(t * 0.7 + b.phase * 2))) * beat;
      b.right.rotation.z = flap;
      b.left.rotation.z = -flap;
    }
  };
}
