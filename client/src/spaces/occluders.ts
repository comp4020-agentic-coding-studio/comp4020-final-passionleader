import * as THREE from "three";

/**
 * Walls and buildings that would hide the player from the camera fade out
 * while they're in the way. An occluder is one box (for the ray test) and the
 * meshes that fade together, so a building made of many parts fades as one.
 */
export interface Occluder {
  meshes: THREE.Mesh[];
  box: THREE.Box3;
}
const occluders = new WeakMap<THREE.Group, Occluder[]>();

/** Makes a mesh's material safe to fade on its own, and transparent-capable. */
function own(mesh: THREE.Mesh): void {
  // Shared colour materials are copied; textured ones are already unique, and
  // copying them would lose the texture that arrives after loading.
  const m = mesh.material as THREE.MeshStandardMaterial;
  if (!m.userData.unique) {
    mesh.material = m.clone();
    (mesh.material as THREE.Material).userData.unique = true;
  }
  (mesh.material as THREE.MeshStandardMaterial).transparent = true;
}

export function markOccluder(group: THREE.Group, mesh: THREE.Mesh): void {
  own(mesh);
  mesh.updateMatrixWorld(true);
  const list = occluders.get(group) ?? [];
  list.push({ meshes: [mesh], box: new THREE.Box3().setFromObject(mesh) });
  occluders.set(group, list);
}

/** Every mesh under `part` fades together when `part`'s bounding box is in the way. */
export function markOccluderGroup(group: THREE.Group, part: THREE.Object3D): void {
  const meshes: THREE.Mesh[] = [];
  part.updateMatrixWorld(true);
  part.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      own(o as THREE.Mesh);
      meshes.push(o as THREE.Mesh);
    }
  });
  const list = occluders.get(group) ?? [];
  list.push({ meshes, box: new THREE.Box3().setFromObject(part) });
  occluders.set(group, list);
}

export const occludersOf = (group: THREE.Group): Occluder[] => occluders.get(group) ?? [];
