import * as THREE from "three";
import { glassMat, mat, type Box } from "../world.ts";
import { markOccluderGroup } from "./occluders.ts";

// A procedural modern campus building: a glass curtain wall between floor
// slabs, vertical mullions, solid cladding where a facade needs it, a roof
// with an overhang, and an entrance canopy. Simplified, not surveyed: it's
// meant to read as the real building's type, not to be a copy of it.

export interface BuildingSpec {
  cx: number;
  cz: number;
  w: number; // along x
  d: number; // along z
  floors: number;
  floorH?: number;
  frame: number; // slabs, mullions, roof edge
  glass?: number;
  /** Facades clad solid instead of glazed, by the side they face. */
  solid?: Partial<Record<"north" | "south" | "east" | "west", { color: number; from?: number; to?: number }>>;
  /** Spacing of the vertical mullions. */
  bay?: number;
  roofOverhang?: number;
  /** Entrance canopy: which side, and where along it (offset from centre). */
  entrance?: { side: "north" | "south" | "east" | "west"; at: number; color?: number };
}

const SLAB = 0.42;

export function building(g: THREE.Group, colliders: Box[], s: BuildingSpec): THREE.Group {
  const b = new THREE.Group();
  const floorH = s.floorH ?? 3.8;
  const H = s.floors * floorH;
  const frame = mat(s.frame);
  const bay = s.bay ?? 2.4;

  // The glazed body, set back a little behind the slab edges.
  const body = new THREE.Mesh(new THREE.BoxGeometry(s.w - 0.5, H, s.d - 0.5), glassMat(s.glass ?? 0x8fb2c8));
  body.position.set(s.cx, H / 2, s.cz);
  b.add(body);

  // Floor slabs and the roof edge, proud of the glass.
  for (let f = 0; f <= s.floors; f++) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(s.w, SLAB, s.d), frame);
    slab.position.set(s.cx, f * floorH + (f === 0 ? SLAB / 2 : 0), s.cz);
    b.add(slab);
  }

  // Vertical mullions round all four faces, as one instanced mesh.
  const along: { x: number; z: number; ry: number }[] = [];
  for (let x = -s.w / 2 + bay / 2; x < s.w / 2; x += bay) {
    along.push({ x: s.cx + x, z: s.cz + s.d / 2 - 0.22, ry: 0 }, { x: s.cx + x, z: s.cz - s.d / 2 + 0.22, ry: 0 });
  }
  for (let z = -s.d / 2 + bay / 2; z < s.d / 2; z += bay) {
    along.push({ x: s.cx + s.w / 2 - 0.22, z: s.cz + z, ry: Math.PI / 2 }, { x: s.cx - s.w / 2 + 0.22, z: s.cz + z, ry: Math.PI / 2 });
  }
  const mull = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, H, 0.24), frame, along.length);
  const m4 = new THREE.Matrix4();
  along.forEach((p, i) => {
    m4.makeRotationY(p.ry).setPosition(p.x, H / 2, p.z);
    mull.setMatrixAt(i, m4);
  });
  // Thin enough not to need a shadow, and instanced depth shaders are fussy on some GPUs.
  mull.userData.noShadow = true;
  b.add(mull);

  // Solid cladding panels on chosen faces (optionally only some floors).
  for (const [side, spec] of Object.entries(s.solid ?? {})) {
    if (!spec) continue;
    const from = (spec.from ?? 0) * floorH;
    const to = (spec.to ?? s.floors) * floorH;
    const h = to - from;
    const ns = side === "north" || side === "south";
    const panel = new THREE.Mesh(new THREE.BoxGeometry(ns ? s.w - 0.3 : 0.3, h - SLAB, ns ? 0.3 : s.d - 0.3), mat(spec.color));
    const off = (ns ? s.d : s.w) / 2 - 0.2;
    const sign = side === "south" || side === "east" ? 1 : -1;
    panel.position.set(s.cx + (ns ? 0 : sign * off), from + h / 2, s.cz + (ns ? sign * off : 0));
    b.add(panel);
  }

  // A thin roof plate with an overhang, and a plant room on top.
  const o = s.roofOverhang ?? 1.2;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(s.w + o * 2, 0.3, s.d + o * 2), frame);
  roof.position.set(s.cx, H + 0.3, s.cz);
  b.add(roof);
  const plant = new THREE.Mesh(new THREE.BoxGeometry(s.w * 0.3, 1.6, s.d * 0.25), mat(0x9aa3a8));
  plant.position.set(s.cx + s.w * 0.15, H + 1.25, s.cz - s.d * 0.15);
  b.add(plant);

  if (s.entrance) {
    const { side, at } = s.entrance;
    const ns = side === "north" || side === "south";
    const sign = side === "south" || side === "east" ? 1 : -1;
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(ns ? 5 : 2.6, 0.25, ns ? 2.6 : 5), mat(s.entrance.color ?? s.frame));
    canopy.position.set(
      s.cx + (ns ? at : sign * (s.w / 2 + 1.3)),
      3.3,
      s.cz + (ns ? sign * (s.d / 2 + 1.3) : at),
    );
    b.add(canopy);
  }

  g.add(b);
  colliders.push({ minX: s.cx - s.w / 2, maxX: s.cx + s.w / 2, minZ: s.cz - s.d / 2, maxZ: s.cz + s.d / 2 });
  markOccluderGroup(g, b);
  return b;
}
