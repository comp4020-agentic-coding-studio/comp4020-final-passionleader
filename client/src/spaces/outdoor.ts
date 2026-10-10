import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { block, doorway, floor, texMat, textPlane, tree, type Box, type SpaceDef } from "../world.ts";
import { markOccluder } from "./occluders.ts";

// A stretch of the ANU campus, laid out from my own sketch and a satellite
// view (used only as a reference, never shipped): the lawn to the north-west,
// building 155 (Marie Reay Teaching Centre) to the south-west, building 154
// (Di Riddell Student Centre, home of the Brian Kenyon Student Space) to the
// east, and the path between them. Simplified, not surveyed.

export const OUTDOOR = { halfX: 32, halfZ: 24 };

export function buildOutdoor(): SpaceDef {
  const g = new THREE.Group();
  const colliders: Box[] = [];

  floor(g, OUTDOOR.halfX * 2 + 20, OUTDOOR.halfZ * 2 + 20, 0, 0, texMat("pavement.jpg", 28, 22, 0xd8d2c6));
  // The path between the two buildings, a shade darker.
  floor(g, 14, OUTDOOR.halfZ * 2, -2, 0, texMat("pavement.jpg", 5, 16, 0xb8b0a2), 0.01);
  // The lawn.
  floor(g, 20, 16, -16, -14, texMat("grass.jpg", 6, 5), 0.02);
  for (const [x, z, s] of [
    [-24, -20, 1.1],
    [-9, -20, 1],
    [-24, -8, 0.9],
    [-13, -10, 0.8],
  ] as const) {
    tree(g, colliders, x, z, s);
  }
  // A couple of benches on the lawn edge.
  block(g, colliders, [2.4, 0.5, 0.7], [-16, -5.5], 0x6b4a2b);
  block(g, colliders, [2.4, 0.5, 0.7], [-20, -5.5], 0x6b4a2b);

  // Building 155: Marie Reay Teaching Centre.
  const b155 = block(g, colliders, [18, 9, 18], [-19, 7], texMat("brick.jpg", 6, 3, 0xe8d6bd));
  markOccluder(g, b155);
  windows(g, -19, 7 + 9.01, 18, 9, 0);
  const sign155 = textPlane(["155", "Marie Reay Teaching Centre"], 6, 1.6, { bg: "#1f2d3d", fg: "#ffffff", font: 0.45 });
  sign155.position.set(-9.94, 6.5, 7);
  sign155.rotation.y = Math.PI / 2;
  g.add(sign155);
  doorway(g, -9.94, 7, Math.PI / 2, "155 · COMP8280 classroom");

  // Building 154: Di Riddell Student Centre (Brian Kenyon Student Space).
  const b154 = block(g, colliders, [20, 12, 34], [16, -3], texMat("brick.jpg", 10, 4, 0xc4d2de));
  markOccluder(g, b154);
  windows(g, 16, -3 + 17.01, 20, 12, 0);
  const sign154 = textPlane(["154", "Di Riddell Student Centre", "Brian Kenyon Student Space"], 7, 2.2, {
    bg: "#1f2d3d",
    fg: "#ffffff",
    font: 0.4,
  });
  sign154.position.set(5.94, 7, 0);
  sign154.rotation.y = -Math.PI / 2;
  g.add(sign154);
  doorway(g, 5.94, 0, -Math.PI / 2, "154 · Student Hub");

  // A signpost south, toward the library just off this map.
  block(g, colliders, [0.15, 2.4, 0.15], [-2, 21], 0x555555);
  const post = document.createElement("div");
  post.className = "door-label";
  post.textContent = "Chifley Library ↓";
  const postTag = new CSS2DObject(post);
  postTag.position.set(-2, 2.8, 21);
  g.add(postTag);

  return {
    id: "outdoor",
    title: "ANU campus",
    group: g,
    colliders,
    doors: [
      { x: -8.9, z: 7, label: "Enter 155 (COMP8280 classroom)", to: "comp8280", arrive: { x: -8.4, z: 6 } },
      { x: 4.9, z: 0, label: "Enter 154 (Student Hub)", to: "hub", arrive: { x: -10.4, z: 6 } },
    ],
    ...OUTDOOR,
    background: 0xbfdcf2,
    camera: new THREE.Vector3(0, 9, 11),
    bgm: "Outdoor_Map.mp3",
  };
}

/** Rows of dark window strips on the face of a building that looks toward +z. */
function windows(g: THREE.Group, cx: number, faceZ: number, width: number, height: number, y0: number): void {
  const geo = new THREE.PlaneGeometry(width - 2, 0.9);
  const glass = new THREE.MeshLambertMaterial({ color: 0x2f4a63 });
  for (let y = y0 + 2; y < y0 + height - 1; y += 2.4) {
    const w = new THREE.Mesh(geo, glass);
    w.position.set(cx, y, faceZ);
    g.add(w);
  }
}
