import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { block, doorway, floor, pavingMat, place, solid, texMat, textPlane, type Box, type SpaceDef } from "../world.ts";
import { building } from "./buildings.ts";

// A stretch of the ANU campus, laid out from my own sketch and a satellite
// view (used only as a reference, never shipped): the lawn to the north-west,
// building 155 (Marie Reay Teaching Centre) to the south-west, building 154
// (Di Riddell Student Centre, home of the Brian Kenyon Student Space) to the
// east, and the path between them. Simplified, not surveyed.

export const OUTDOOR = { halfX: 32, halfZ: 24 };

export function buildOutdoor(): SpaceDef {
  const g = new THREE.Group();
  const colliders: Box[] = [];

  // Grass out to the horizon (the fog hides where it ends), the paved campus
  // on top of it, a lighter path between the buildings, and the lawn.
  floor(g, 700, 700, 0, 0, texMat("grass.jpg", 180, 180, 0x9fb38a), -0.02);
  floor(g, OUTDOOR.halfX * 2 + 6, OUTDOOR.halfZ * 2 + 6, 0, 0, pavingMat(18, 26));
  floor(g, 14, OUTDOOR.halfZ * 2 + 6, -2, 0, pavingMat(4, 28, 0xf3efe6), 0.01);
  floor(g, 20, 16, -16, -14, texMat("grass.jpg", 14, 11, 0xa9bd8f), 0.02);
  // Trees, bushes and flowers (Quaternius, CC0): a row along the lawn, a few
  // between the buildings, and a belt round the edge of the map.
  const trees = ["CommonTree_3.glb", "CommonTree_4.glb", "CommonTree_5.glb"];
  const tree = (x: number, z: number, h: number, i: number): void => {
    place(g, `nature/${trees[i % trees.length]}`, h, x, z, (i * 1.7) % (Math.PI * 2));
    solid(colliders, 0.8, 0.8, x, z);
  };
  [
    [-24, -20, 8.5],
    [-9, -20, 7.5],
    [-24, -8, 7],
    [-13, -10, 6.5],
    [-27, -14, 9],
    [-3, -19, 6],
    [-9.5, 16, 6.5],
    [5.5, 21, 7],
  ].forEach(([x, z, h], i) => tree(x!, z!, h!, i));
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    tree(Math.cos(a) * 40, Math.sin(a) * 31, 7 + ((i * 7) % 4), i);
  }
  for (const [x, z, f] of [
    [-20, -6.4, 1],
    [-12, -6.4, 0],
    [-7, -12, 1],
    [-26, -3, 0],
    [5, 15, 1],
    [5, -15, 0],
  ] as const) {
    place(g, f ? "nature/Bush_Common_Flowers.glb" : "nature/Bush_Common.glb", 1.1, x, z, x);
  }
  for (let i = 0; i < 14; i++) {
    place(g, i % 3 ? "nature/Grass_Common_Tall.glb" : "nature/Flower_3_Group.glb", 0.45, -24 + ((i * 5.3) % 17), -21 + ((i * 3.7) % 13), i);
  }
  // A couple of benches on the lawn edge.
  block(g, colliders, [2.4, 0.5, 0.7], [-16, -5.5], 0x6b4a2b);
  block(g, colliders, [2.4, 0.5, 0.7], [-20, -5.5], 0x6b4a2b);

  // Building 155: Marie Reay Teaching Centre.
  building(g, colliders, {
    cx: -19,
    cz: 7,
    w: 18,
    d: 18,
    floors: 3,
    frame: 0xe9e6df,
    glass: 0xb5cfdf,
    solid: { west: { color: 0xc9b79c }, north: { color: 0xc9b79c, from: 1 } },
    entrance: { side: "east", at: 0 },
  });
  sign(g, ["155", "Marie Reay Teaching Centre"], -9.7, 4.2, 7, Math.PI / 2);
  doorway(g, -9.7, 7, Math.PI / 2, "155 · COMP8020 classroom");

  // Building 154: Di Riddell Student Centre (Brian Kenyon Student Space).
  building(g, colliders, {
    cx: 16,
    cz: -3,
    w: 20,
    d: 34,
    floors: 4,
    frame: 0xf2f0ea,
    glass: 0xa9c6d8,
    solid: { east: { color: 0xa0724b } },
    entrance: { side: "west", at: 3 },
  });
  sign(g, ["154", "Di Riddell Student Centre", "Brian Kenyon Student Space"], 5.7, 4.6, -3, -Math.PI / 2);
  doorway(g, 5.7, 3, -Math.PI / 2, "154 · Student Hub");

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
      { x: -8.6, z: 7, label: "Enter 155 (COMP8020 classroom)", to: "comp8020", arrive: { x: -8.4, z: 6 } },
      { x: 4.6, z: 3, label: "Enter 154 (Student Hub)", to: "hub", arrive: { x: -10.4, z: 6 } },
    ],
    ...OUTDOOR,
    background: 0xbfdcf2,
    // Lower and further back than indoors, so the sky and the buildings' height show.
    camera: new THREE.Vector3(0, 5.5, 10.5),
    bgm: "Outdoor_Map.mp3",
    outdoor: true,
  };
}

/** A building sign on a facade, facing the way `rotY` points. */
function sign(g: THREE.Group, lines: string[], x: number, y: number, z: number, rotY: number): void {
  const plate = textPlane(lines, 6.5, lines.length * 0.75, { bg: "#1f2d3d", fg: "#ffffff", font: 0.42 });
  plate.position.set(x, y, z);
  plate.rotation.y = rotY;
  g.add(plate);
}
