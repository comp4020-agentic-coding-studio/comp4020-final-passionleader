import * as THREE from "three";

/**
 * Walls and buildings that would hide the player from the camera fade out
 * while they're in the way. Each occluder gets its own material so fading one
 * doesn't fade every wall of that colour.
 */
export interface Occluder {
  mesh: THREE.Mesh;
  box: THREE.Box3;
}
const occluders = new WeakMap<THREE.Group, Occluder[]>();

export function markOccluder(group: THREE.Group, mesh: THREE.Mesh): void {
  mesh.material = (mesh.material as THREE.MeshLambertMaterial).clone();
  (mesh.material as THREE.MeshLambertMaterial).transparent = true;
  mesh.updateMatrixWorld(true);
  const list = occluders.get(group) ?? [];
  list.push({ mesh, box: new THREE.Box3().setFromObject(mesh) });
  occluders.set(group, list);
}

export const occludersOf = (group: THREE.Group): Occluder[] => occluders.get(group) ?? [];
