import * as THREE from "three";
import { chalkboard, doorway, floor, mat, scatter, solid, texMat, textPlane, type Box, type SpaceDef, type Spot } from "../world.ts";
import { HIGH } from "../settings.ts";
import { buildBackdrop } from "./backdrop.ts";
import { DOG_SPOT, addDog } from "./dog.ts";
import { building } from "./buildings.ts";
import { CAFE_MENU, buildLabCoffee } from "./labcoffee.ts";
import { buildStreetscape } from "./streetscape.ts";

// A stretch of the ANU campus, laid out from my own sketch and a satellite
// view (used only as a reference, never shipped): the lawn to the north-west,
// building 155 (Marie Reay Teaching Centre) to the south-west, building 154
// (Di Riddell Student Centre, home of the Brian Kenyon Student Space) to the
// east, and the path between them. Simplified, not surveyed.

/** The paved square between the buildings that the scenery is laid out on. */
const OUTDOOR = { halfX: 32, halfZ: 24 };

// Where you can walk: the lawn and the road north of it, the road in front of
// the O'Donoghue centre, and the path south between 155 and 154, over the
// bridge to the library's door. Same as OUTDOOR_AREAS in server/spaces.ts.
const OUTDOOR_AREAS: Box[] = [
  { minX: -29.5, maxX: 5, minZ: -39.4, maxZ: -2 },
  { minX: 5, maxX: 26, minZ: -39.4, maxZ: -20 },
  { minX: -9.6, maxX: 5.4, minZ: -2, maxZ: 22 },
];

export function buildOutdoor(): SpaceDef {
  const g = new THREE.Group();
  const colliders: Box[] = [];

  // Grass out to the horizon (the fog hides where it ends), the paved campus
  // on top of it, a lighter path between the buildings, and the lawn.
  // One paving tile is about 2 m (40 x 20 cm pavers); one grass tile 2.5-4 m.
  // Both stop short of the sunken level at z 17..23 (see backdrop.ts).
  const grass = (w: number, d: number, x: number, z: number): void => {
    floor(g, w, d, x, z, texMat("ai/grass.jpg", w / 3.9, d / 3.9, 0xb4c49c), -0.02);
  };
  grass(700, 367, 0, -166.5);
  grass(700, 327, 0, 186.5);
  grass(315, 6, -192.5, 20);
  grass(315, 6, 192.5, 20);
  floor(g, OUTDOOR.halfX * 2 + 6, 44, 0, -5, texMat("ai/paving.jpg", 35, 22, 0xd6d2ca));
  floor(g, OUTDOOR.halfX * 2 + 6, 4, 0, 25, texMat("ai/paving.jpg", 35, 2, 0xd6d2ca));
  // The path runs from the north edge to the library's forecourt (backdrop.ts,
  // from z 23.2), and stops there so the two don't overlap and flicker.
  const pathFrom = -OUTDOOR.halfZ - 3;
  const pathTo = 23.2;
  floor(g, 14, pathTo - pathFrom, -2, (pathFrom + pathTo) / 2, texMat("ai/paving.jpg", 7, (pathTo - pathFrom) / 3.2), 0.01);
  floor(g, 20, 16, -19, -14, texMat("ai/grass.jpg", 8, 6.4), 0.02);
  buildBackdrop(g, colliders);
  // Trees, bushes and flowers (Quaternius, CC0), laid out evenly: trees in
  // a row down the map's west edge,
  // flowers in a grid on the lawn, and bushes round each building's foot,
  // stopping short of the doors.
  const trees = ["CommonTree_3.glb", "CommonTree_4.glb", "CommonTree_5.glb"];
  const edge: Spot[][] = [[], [], []];
  const ex = OUTDOOR.halfX + 0.6;
  const ez = OUTDOOR.halfZ + 0.6;
  let n = 0;
  const addTree = (x: number, z: number): void => {
    edge[n % 3]!.push({ x, z, rotY: (n * 1.7) % (Math.PI * 2), scale: 0.9 + ((n * 7) % 4) * 0.07 });
    n++;
  };
  // Only down the west side now: roads run along the north and east, and
  // the sunken level and the library close the south.
  for (let z = -ez + (ez * 2) / 8; z < 16; z += (ez * 2) / 8) addTree(-ex, z);
  edge.forEach((spots, i) => scatter(g, `nature/${trees[i]}`, 7.5, spots));
  // The far belt is scenery: no shadows, and only on High.
  if (HIGH) {
    const belt: Spot[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const z = Math.sin(a) * 33;
      // North of the lawn the backdrop buildings stand where these would.
      if (z < -20 || z > 14 || Math.cos(a) * 42 > 25) continue;
      belt.push({ x: Math.cos(a) * 42, z, rotY: i, scale: 1 + (i % 3) * 0.12 });
    }
    scatter(g, `nature/${trees[1]}`, 8, belt, false);
  }

  // The lawn (x -29..-9, z -22..-6, stopping where the path's paving
  // starts): flowering bushes on a grid, flower clumps between them on High.
  const lawnBushes: Spot[] = [];
  const clumps: Spot[] = [];
  for (let x = -26; x <= -12; x += 4.6) {
    for (let z = -19.5; z <= -8.5; z += 5.5) {
      lawnBushes.push({ x, z, rotY: x + z });
      if (x + 2.3 < -10 && z + 2.75 < -7) clumps.push({ x: x + 2.3, z: z + 2.75, rotY: x });
    }
  }
  scatter(g, "nature/Bush_Common_Flowers.glb", 1.1, lawnBushes);
  // On the lawn's north edge, facing it: the noticeboard, where anyone posts
  // events, clubs and the like (one tab, unofficial). Notes keep 2 m off it.
  noticeboard(g, colliders);
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
  ring(-28, -10, -2, 16, (x, z) => (x > -11 && Math.abs(z - 7) < 3.6) || z > 16); // 155: door east, none at the sunken edge
  ring(6, 26, -20, 14, (x, z) => x < 7 && Math.abs(z - 3) < 3.6); // 154: door west
  scatter(g, "nature/Bush_Hedge.glb", 0.9, hedge);

  // Benches on the lawn's south side; its east side gets a seat wall.
  bench(g, colliders, -23, -5.2, 0);
  bench(g, colliders, -16, -5.2, 0);
  buildStreetscape(g, colliders);
  const dog = addDog(g, colliders);

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
  doorway(g, -9.7, 7, Math.PI / 2, "155 · Classrooms");

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
    bodyTex: "ai/facade_154.jpg",
    colonnade: 0x6f7378,
    glass: 0x9fbfd2,
    roofOverhang: 0.5,
    apex: { color: 0xb07a48 },
    entrance: { side: "west", at: 6, color: 0xf4f3ef }, // z = 3, over the door
  });
  sign(g, ["154", "Di Riddell Student Centre", "Brian Kenyon Student Space"], 5.7, 4.6, 3, -Math.PI / 2);
  // Lab Coffee, along 154's north side and round its north-west corner.
  buildLabCoffee(g, colliders);
  doorway(g, 5.7, 3, -Math.PI / 2, "154 · Student Hub");
  // Chifley Library's front door, facing the bridge.
  doorway(g, -2, 24.85, Math.PI, "Chifley Library");

  return {
    id: "outdoor",
    title: "ANU campus",
    group: g,
    colliders,
    doors: [
      { x: -8.6, z: 7, label: "Enter 155 (pick a classroom)", to: "classroom", arrive: { x: 8.4, z: 6 } },
      { x: 4.6, z: 3, label: "Enter 154 (Student Hub)", to: "hub", arrive: { x: -18.4, z: 6 } },
      // E at the end of the bridge: you stop 3 m short of the library, so it never fades.
      { x: -2, z: 21.6, label: "Enter Chifley Library", to: "library", arrive: { x: 0, z: -8.5 } },
    ],
    halfX: 30,
    halfZ: 40,
    areas: OUTDOOR_AREAS,
    // Same as server/spaces.ts: no notes in 155 or 154's footprint, or on the dog.
    noteBuildings: [
      { minX: -28, maxX: -10, minZ: -2, maxZ: 16 },
      { minX: 6, maxX: 26, minZ: -20, maxZ: 14 },
    ],
    noteKeepClear: [DOG_SPOT, LAWN_BOARD, CAFE_MENU],
    tick: dog,
    spots: [
      { ...DOG_SPOT, id: "dog", label: "Pat the dog" },
      { x: LAWN_BOARD.x, z: LAWN_BOARD.z + 0.9, id: "board", label: "Open the lawn noticeboard" },
      { x: CAFE_MENU.x, z: CAFE_MENU.z + 0.9, id: "cafes", label: "Read Lab Coffee's board (cafés on campus)" },
    ],
    background: 0xbfdcf2,
    // Lower and further back than indoors, so the sky and the buildings' height show.
    camera: new THREE.Vector3(0, 5.5, 10.5),
    // Chifley Library closes the south: walking up the bridge to its door,
    // the camera climbs over your head instead of going into the building.
    southWall: { from: 12, z: 22 },
    bgm: ["Noon_On_The_Green.mp3", "Dappled_Sunlight_Trail.mp3", "Windows_Down_in_July.mp3"],
    outdoor: true,
    // The two lawn benches, two people each.
    seats: [-23, -16].flatMap((x) => [-0.55, 0.55].map((dx) => ({ x: x + dx, z: -5.2, rot: 0, y: 0.46 }))),
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

/** The lawn noticeboard, on its north edge (server/spaces.ts keeps notes off it too). */
const LAWN_BOARD = { x: -19.5, z: -22.6 };

/** A chalkboard on two timber legs, facing the lawn (+z). */
function noticeboard(g: THREE.Group, colliders: Box[]): void {
  const { x, z } = LAWN_BOARD;
  for (const dx of [-1.6, 1.6]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.5, 0.14), mat(0x8a5a32));
    leg.position.set(x + dx, 1.25, z - 0.05);
    g.add(leg);
  }
  const face = chalkboard(["Lawn noticeboard", "events · clubs · anything"], 3, 1.6, 0.22);
  face.position.set(x, 1.6, z);
  g.add(face);
  solid(colliders, 3.4, 0.3, x, z);
}
