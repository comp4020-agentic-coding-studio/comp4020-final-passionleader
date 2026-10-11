import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { block, doorway, floor, mat, pavingMat, scatter, texMat, textPlane, type Box, type SpaceDef, type Spot } from "../world.ts";
import { HIGH } from "../settings.ts";
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
  // Trees, bushes and flowers (Quaternius, CC0), laid out evenly: trees in
  // a row round the edge of the map (leaving the path open north and south),
  // flowers in a grid on the lawn, and bushes round each building's foot,
  // stopping short of the doors.
  const trees = ["CommonTree_3.glb", "CommonTree_4.glb", "CommonTree_5.glb"];
  const edge: Spot[][] = [[], [], []];
  const ex = OUTDOOR.halfX + 0.6;
  const ez = OUTDOOR.halfZ + 0.6;
  const onPath = (x: number): boolean => Math.abs(x + 2) < 8;
  let n = 0;
  const addTree = (x: number, z: number): void => {
    edge[n % 3]!.push({ x, z, rotY: (n * 1.7) % (Math.PI * 2), scale: 0.9 + ((n * 7) % 4) * 0.07 });
    n++;
  };
  for (let x = -ex; x <= ex + 0.01; x += (ex * 2) / 10) {
    if (!onPath(x)) addTree(x, -ez);
    if (!onPath(x)) addTree(x, ez);
  }
  for (let z = -ez + (ez * 2) / 8; z < ez - 0.01; z += (ez * 2) / 8) {
    addTree(-ex, z);
    addTree(ex, z);
  }
  edge.forEach((spots, i) => scatter(g, `nature/${trees[i]}`, 7.5, spots));
  // The far belt is scenery: no shadows, and only on High.
  if (HIGH) {
    const belt: Spot[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      belt.push({ x: Math.cos(a) * 42, z: Math.sin(a) * 33, rotY: i, scale: 1 + (i % 3) * 0.12 });
    }
    scatter(g, `nature/${trees[1]}`, 8, belt, false);
  }

  // The lawn (x -26..-6, z -22..-6): flowering bushes on a grid, grass and
  // flower clumps between them on High.
  const lawnBushes: Spot[] = [];
  const clumps: Spot[] = [];
  for (let x = -23; x <= -9; x += 4.6) {
    for (let z = -19.5; z <= -8.5; z += 5.5) {
      lawnBushes.push({ x, z, rotY: x + z });
      if (x + 2.3 < -7 && z + 2.75 < -7) clumps.push({ x: x + 2.3, z: z + 2.75, rotY: x });
    }
  }
  scatter(g, "nature/Bush_Common_Flowers.glb", 1.1, lawnBushes);
  if (HIGH) scatter(g, "nature/Flower_3_Group.glb", 0.45, clumps, false);

  // Bushes every 3 m round each building, a metre out from the wall, with
  // gaps at the doors (and their canopies).
  const hedge: Spot[] = [];
  const ring = (minX: number, maxX: number, minZ: number, maxZ: number, gap: (x: number, z: number) => boolean): void => {
    const add = (x: number, z: number): void => {
      if (!gap(x, z) && Math.abs(x) < OUTDOOR.halfX && Math.abs(z) < OUTDOOR.halfZ) hedge.push({ x, z, rotY: x * 3 + z });
    };
    for (let x = minX + 1; x <= maxX - 1; x += 3) {
      add(x, minZ - 1);
      add(x, maxZ + 1);
    }
    for (let z = minZ + 1; z <= maxZ - 1; z += 3) {
      add(minX - 1, z);
      add(maxX + 1, z);
    }
  };
  ring(-28, -10, -2, 16, (x, z) => x > -11 && Math.abs(z - 7) < 3.6); // 155: door east
  ring(6, 26, -20, 14, (x, z) => x < 7 && Math.abs(z - 3) < 3.6); // 154: door west
  scatter(g, "nature/Bush_Hedge.glb", 0.9, hedge);

  // Benches round the lawn, facing the path and the paving.
  bench(g, colliders, -20, -5.2, 0);
  bench(g, colliders, -13, -5.2, 0);
  bench(g, colliders, -5.2, -17, Math.PI / 2);
  bench(g, colliders, -5.2, -11, Math.PI / 2);

  // Building 155: Marie Reay Teaching Centre. Six storeys of glass with the
  // timber structure showing through (warm mullions and floor edges), as
  // offset stacked volumes, and a taller glass top floor under timber trusses.
  const TIMBER = 0xb07a48;
  building(g, colliders, {
    cx: -19,
    cz: 7,
    w: 18,
    d: 18,
    floors: 3,
    frame: TIMBER,
    slabEdge: 0x8a5a32,
    glass: 0xbcd3e0,
    bay: 1.8,
    roofOverhang: 0.4,
    bareRoof: true,
    entrance: { side: "east", at: 0, color: 0xe9e6df },
  });
  building(g, colliders, {
    cx: -20.5,
    cz: 5.5,
    w: 16,
    d: 16,
    floors: 3,
    y0: 3 * 3.8,
    frame: TIMBER,
    slabEdge: 0x8a5a32,
    glass: 0xbcd3e0,
    bay: 1.8,
    roofOverhang: 0.6,
    apex: { color: TIMBER },
  });
  sign(g, ["155", "Marie Reay Teaching Centre"], -9.7, 4.2, 7, Math.PI / 2);
  doorway(g, -9.7, 7, Math.PI / 2, "155 · COMP8020 classroom");

  // Building 154: Di Riddell Student Centre (Brian Kenyon Student Space). A
  // sleek white block on a slender steel colonnade, ribbon windows, and a
  // taller top floor under timber trusses.
  building(g, colliders, {
    cx: 16,
    cz: -3,
    w: 20,
    d: 34,
    floors: 4,
    frame: 0xf4f3ef,
    solidBody: 0xf6f5f1,
    colonnade: 0x6f7378,
    glass: 0x9fbfd2,
    roofOverhang: 0.5,
    apex: { color: 0xb07a48 },
    entrance: { side: "west", at: 3, color: 0xf4f3ef },
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

/**
 * A park bench: timber slats on two dark steel frames, with a backrest.
 * `rotY` 0 faces +z (south).
 */
function bench(g: THREE.Group, colliders: Box[], x: number, z: number, rotY: number): void {
  const b = new THREE.Group();
  const wood = mat(0x9a6a3e);
  const steel = mat(0x2f3336);
  for (let i = 0; i < 3; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 0.13), wood);
    slat.position.set(0, 0.46, -0.16 + i * 0.16);
    b.add(slat);
  }
  for (let i = 0; i < 2; i++) {
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.05), wood);
    back.position.set(0, 0.66 + i * 0.17, -0.3);
    back.rotation.x = -0.18;
    b.add(back);
  }
  for (const sx of [-0.95, 0.95]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.44, 0.5), steel);
    leg.position.set(sx, 0.22, 0);
    const upright = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), steel);
    upright.position.set(sx, 0.7, -0.32);
    upright.rotation.x = -0.18;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.45), steel);
    arm.position.set(sx * 1.03, 0.66, -0.06);
    b.add(leg, upright, arm);
  }
  b.position.set(x, 0, z);
  b.rotation.y = rotY;
  g.add(b);
  const across = Math.abs(Math.sin(rotY)) > 0.5;
  colliders.push({
    minX: x - (across ? 0.4 : 1.15),
    maxX: x + (across ? 0.4 : 1.15),
    minZ: z - (across ? 1.15 : 0.4),
    maxZ: z + (across ? 1.15 : 0.4),
  });
}
