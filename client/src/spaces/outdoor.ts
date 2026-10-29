import * as THREE from "three";
import { chalkboard, doorway, floor, mat, scatter, solid, texMat, textPlane, type Box, type SpaceDef, type Spot } from "../world.ts";
import { HIGH } from "../settings.ts";
import { buildBackdrop } from "./backdrop.ts";
import { DOG_SPOT, addDog } from "./dog.ts";
import { HOUSING_TENT, SPORT_PC, housingTent, sportsTent } from "./sportstent.ts";
import { building } from "./buildings.ts";
import { CAFE_MENU, buildLabCoffee } from "./labcoffee.ts";
import { SEAT_WALL_SEATS, buildStreetscape } from "./streetscape.ts";
import { BADGER, LAWN_WEST_X, PICNIC_SEATS, buildCreek } from "./creek.ts";

// A stretch of the ANU campus, laid out from my own sketch and a satellite
// view (used only as a reference, never shipped): the lawn to the north-west,
// building 155 (Marie Reay Teaching Centre) to the south-west, building 154
// (Di Riddell Student Centre, home of the Brian Kenyon Student Space) to the
// east, and the path between them. Simplified, not surveyed.

/** The paved square between the buildings that the scenery is laid out on. */
const OUTDOOR = { halfX: 32, halfZ: 24 };

// Where you can walk: the lawn and the road north of it, the road in front of
// the O'Donoghue centre, and the path south between 155 and 154, over the
// bridge to the library's door; nothing west of the white building's west end (the
// creek in creek.ts is scenery). Same as OUTDOOR_AREAS in server/spaces.ts.
const OUTDOOR_AREAS: Box[] = [
  { minX: LAWN_WEST_X, maxX: 5, minZ: -39.4, maxZ: -2 }, // the lawn, west to the white building's west end (the creek is scenery past it)
  { minX: 5, maxX: 26, minZ: -39.4, maxZ: -20 },
  { minX: -9.6, maxX: 5.4, minZ: -2, maxZ: 26.6 },
];

export function buildOutdoor(): SpaceDef {
  const g = new THREE.Group();
  const colliders: Box[] = [];

  // Grass out to the horizon (the fog hides where it ends), the paved campus
  // on top of it, a lighter path between the buildings, and the lawn.
  // One paving tile is about 2 m (40 x 20 cm pavers); one grass tile 2.5-4 m.
  // Both stop short of the sunken level at z 17..26 (see backdrop.ts).
  const grass = (w: number, d: number, x: number, z: number): void => {
    floor(g, w, d, x, z, texMat("ai/grass.jpg", w / 3.9, d / 3.9, 0xb4c49c), -0.02);
  };
  // The creek's channel (x -75.2..-57.6, z -160..60, creek.ts) is left open: its water lies below the grass.
  // South of the avenue (z -22) it bends west, and creek.ts lays the ground west of x -57.6 along the bend.
  grass(274.8, 328, -212.6, -186); // x -350..-75.2, z -350..-22
  grass(407.6, 354, 146.2, -173); // x -57.6..350, z -350..4
  // z 4..17, leaving the ramp down to the sunken road open (x 31.5..40.5, backdrop.ts).
  grass(89.1, 13, -13.05, 10.5); // x -57.6..31.5
  grass(309.5, 13, 195.25, 10.5); // x 40.5..350
  grass(17.6, 190, -66.4, -255); // between them, north of the channel (z -350..-160)
  // Around the sunken road (backdrop.ts buildSouth): its cutting runs x -38..40.5
  // at z 17..26 and turns south at x -38..-31 down to z 60. No grass over it.
  grass(19.6, 9, -47.8, 21.5); // west of the cutting, z 17..26 (x -57.6..-38; west of that, creek.ts)
  grass(309.5, 9, 195.25, 21.5); // east of it (x 40.5..350)
  grass(19.6, 34, -47.8, 43); // south, west of the turn, east of the creek (x -57.6..-38, z 26..60)
  grass(312, 290, -194, 205); // south of the creek's end (x -350..-38, z 60..350)
  grass(381, 324, 159.5, 188); // south, east of the turn (x -31..350)
  grass(7, 290, -34.5, 205); // south of where the turn ends (z 60..350)
  // The campus paving (x -35..35, z -27..17; the grass round Badger & Co's
  // picnic tables shows west of it), open over the ramp down to the sunken
  // road (x 31.5..40.5, z 4..17).
  floor(g, 70, 31, 0, -11.5, texMat("ai/paving.jpg", 35, 15.5, 0xd6d2ca)); // z -27..4
  floor(g, 66.5, 13, -1.75, 10.5, texMat("ai/paving.jpg", 33, 6.5, 0xd6d2ca)); // z 4..17, x -35..31.5
  // A paved strip south of the cutting (backdrop.ts, z 17..26), in front of the library (moved 3 m south, 10/30).
  floor(g, 70, 2, 0, 27, texMat("ai/paving.jpg", 35, 1, 0xd6d2ca)); // x -35..35
  // The path runs from the north edge to the library's forecourt (backdrop.ts,
  // from z 26.2), and stops there so the two don't overlap and flicker.
  const pathFrom = -OUTDOOR.halfZ - 3;
  const pathTo = 26.2;
  floor(g, 14, pathTo - pathFrom, -2, (pathFrom + pathTo) / 2, texMat("ai/paving.jpg", 7, (pathTo - pathFrom) / 3.2), 0.01);
  // The lawn, the same deeper green as the grass by Badger & Co (the user's call, 10/30: one lawn, one colour).
  floor(g, 20, 16, -19, -14, texMat("ai/grass.jpg", 8, 6.4, 0xb4c49c), 0.02);
  // The path between Badger & Co's picnic lawn and the lawn (x -35..-29) curves
  // toward Badger & Co going south, joining its old line at the road (the user's
  // call, 10/30): paving over the picnic lawn's corner, grass over the path's old west side.
  const curveX = (x0: number, z: number): number => x0 - 5 * ((z + 22) / 16) ** 2;
  const wedge = (x0: number, y: number, material: THREE.Material, outward: number): void => {
    const shape = new THREE.Shape();
    shape.moveTo(x0, 22);
    for (let z = -22; z <= -6.001; z += 1) shape.lineTo(curveX(x0, z), -z);
    shape.lineTo(curveX(x0, -6), 6);
    shape.lineTo(x0 + outward, 6);
    shape.lineTo(x0 + outward, 22);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2); // shape's y becomes -z
    const uv = geo.attributes.position!;
    const uvs: number[] = [];
    for (let i = 0; i < uv.count; i++) uvs.push(uv.getX(i) / 2.5, uv.getZ(i) / 2.5);
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    const m = new THREE.Mesh(geo, material);
    m.position.y = y;
    m.receiveShadow = true;
    g.add(m);
  };
  const lawnTex = texMat("ai/grass.jpg", 1, 1, 0xb4c49c);
  const paveTex = texMat("ai/paving.jpg", 1, 1, 0xd6d2ca);
  wedge(-35, 0.006, paveTex, 0); // the picnic lawn gives up the curve's west side to paving
  wedge(-29, 0.021, lawnTex, 0); // the lawn grows into the path's old east side
  buildBackdrop(g, colliders);
  // Bushes and flowers (Quaternius, CC0), laid out evenly: flowers in a grid
  // on the lawn, and bushes round each building's foot, stopping short of the
  // doors. No trees on the paving (the user's call): creek.ts plants them on
  // the grass west of it.

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
  // The noticeboard, where anyone posts events, clubs and the like (one tab,
  // unofficial): against the flower bed east of Broger's, facing the main
  // road, so you see it walking between the lawn and 154. Notes keep 2 m off it.
  adBoard(g, colliders, LAWN_BOARD, 0);
  // Beside 155's door, facing the path: the study-group board.
  noticeboard(g, colliders, STUDY_BOARD, Math.PI / 2, ["Study groups", "start one · join one"]);
  // ANU Sport's blue tent at the north-west end, south of Symposium's bed.
  sportsTent(g, colliders);
  housingTent(g, colliders);
  if (HIGH) scatter(g, "nature/Flower_3_Group.glb", 0.45, clumps, false);

  // Bushes every 3 m round each building, a metre out from the wall, with
  // gaps at the doors (and their canopies).
  const hedge: Spot[] = [];
  const ring = (minX: number, maxX: number, minZ: number, maxZ: number, gap: (x: number, z: number) => boolean, halfX = OUTDOOR.halfX): void => {
    const add = (x: number, z: number): void => {
      if (!gap(x, z) && Math.abs(x) < halfX && Math.abs(z) < OUTDOOR.halfZ) hedge.push({ x, z, rotY: x * 3 + z });
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
  ring(6, 26, -20, 14, (x, z) => x < 7 && (Math.abs(z - 3) < 3.6 || Math.abs(z + 5) < 3)); // 154: the Hub's door and the lounge's, both west
  // Badger & Co (creek.ts) has no door you use; like 155, none at the sunken edge.
  ring(BADGER.minX, BADGER.maxX, BADGER.minZ, BADGER.maxZ, (_x, z) => z > 16, 52);
  scatter(g, "nature/Bush_Hedge.glb", 0.9, hedge);

  // Benches on the lawn's south side; its east side gets a seat wall.
  bench(g, colliders, -23, -5.2, 0);
  bench(g, colliders, -16, -5.2, 0);
  buildStreetscape(g, colliders);
  buildCreek(g, colliders);
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
  // Its name board between the Hub's door and the lounge's, up over the colonnade.
  sign(g, ["154", "Di Riddell Student Centre", "Brian Kenyon Student Space"], 5.7, 5.4, -1, -Math.PI / 2);
  // Lab Coffee, along 154's north side and round its north-west corner.
  buildLabCoffee(g, colliders);
  doorway(g, 5.7, 3, -Math.PI / 2, "154 · Student Hub");
  // North of the Hub's door, under the same colonnade: the ANUSA Student
  // Lounge, with a canopy of its own (like the Hub's, a lip 1.3 m deep) and
  // a green name board over it.
  doorway(g, 5.7, -5, -Math.PI / 2, "ANUSA Student Lounge");
  // A plain grey door on 154's north face past Lab Coffee, no label (it's a
  // secret), just a small "Staff only" plate. The camera looks north, so
  // it's seen from behind: a solid slab reads the same from both sides.
  const staffDoor = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.2, 0.1), mat(0x9a9ea3));
  staffDoor.position.set(24.5, 1.1, -20.05);
  const plate = textPlane(["Staff only"], 0.7, 0.18, { bg: "#ffffff", fg: "#333333", font: 0.11 });
  plate.position.set(24.5, 1.6, -20.11);
  plate.rotation.y = Math.PI;
  g.add(staffDoor, plate);
  const loungeCanopy = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.25, 4), mat(0xf4f3ef));
  loungeCanopy.position.set(6 - 0.65, 3.3, -5);
  loungeCanopy.castShadow = true;
  g.add(loungeCanopy);
  // Each door's name on its canopy's front edge, the edge's own size.
  fascia(g, ["ANUSA Student Lounge"], 4, "#1e6b52", -5);
  fascia(g, ["Student Hub"], 5, "#1f2d3d", 3);
  // Chifley Library's front door, facing the bridge.
  doorway(g, -2, 27.85, Math.PI, "Chifley Library"); // on its front (z 28; moved 3 m south, 10/30)

  return {
    id: "outdoor",
    title: "ANU campus",
    group: g,
    colliders,
    doors: [
      { x: -8.6, z: 7, label: "Enter 155 (pick a classroom)", to: "classroom", arrive: { x: 8.4, z: 6 } },
      { x: 4.6, z: 3, label: "Enter 154 (Student Hub)", to: "hub", arrive: { x: -18.4, z: 6 } },
      // North of the Hub's door, on the ground floor: the ANUSA Student Lounge.
      { x: 4.6, z: -5, label: "Enter the ANUSA Student Lounge", to: "anusa", arrive: { x: -8.4, z: 5 } },
      // The Career Hub (plan 111), in the O'Donoghue centre's lit ground floor across the road.
      // Its door is in the centre's front, on the north road (the user's call, 10/30).
      { x: 18, z: -39, label: "Enter the Career Hub", to: "careers", arrive: { x: 0, z: 7.6 } },
      // An easter egg: an unmarked staff door at the far end of Lab Coffee.
      { x: 24.5, z: -21, label: "Staff only", to: "poop", arrive: { x: 6, z: -4.5 }, secret: true },
      // E at the end of the bridge: you stop 3 m short of the library, so it never fades.
      { x: -2, z: 26.4, label: "Enter Chifley Library", to: "library", arrive: { x: 0, z: -8.5 } },
    ],
    halfX: 89,
    halfZ: 40,
    areas: OUTDOOR_AREAS,
    // Same as server/spaces.ts: no notes in 155, 154 or Badger & Co's footprint, or on the dog.
    noteBuildings: [
      { minX: -28, maxX: -10, minZ: -2, maxZ: 16 },
      { minX: 6, maxX: 26, minZ: -20, maxZ: 14 },
      { minX: -50, maxX: -38, minZ: -2, maxZ: 16 },
    ],
    noteKeepClear: [DOG_SPOT, LAWN_BOARD, CAFE_MENU, SPORT_PC, HOUSING_TENT, STUDY_BOARD],
    tick: dog,
    spots: [
      { ...DOG_SPOT, id: "dog", label: "Pat the dog" },
      { x: LAWN_BOARD.x, z: LAWN_BOARD.z + 0.9, id: "board", label: "Open the advertising board" },
      { x: STUDY_BOARD.x + 0.9, z: STUDY_BOARD.z, id: "study-groups", label: "Open the study-group board" },
      { x: CAFE_MENU.x, z: CAFE_MENU.z + 0.9, id: "cafes", label: "Read Lab Coffee's board (cafés on campus)" },
    ],
    // ANU Sport's site won't be framed, so a new tab.
    links: [{ x: SPORT_PC.x, z: SPORT_PC.z + 0.9, label: "Open ANU Sport (gym, clubs, classes; new tab)", url: "https://anu-sport.com.au/", embeddable: false }],
    background: 0xbfdcf2,
    // Lower and further back than indoors, so the sky and the buildings' height show.
    camera: new THREE.Vector3(0, 5.5, 10.5),
    // Chifley Library closes the south: walking up the bridge to its door,
    // the camera climbs over your head instead of going into the building.
    southWall: { from: 16.6, z: 26.6 },
    bgm: ["Noon_On_The_Green.mp3", "Dappled_Sunlight_Trail.mp3", "Windows_Down_in_July.mp3", "Along_the_Griffin_Lake.mp3"],
    outdoor: true,
    // The two lawn benches, two people each.
    seats: [...[-23, -16].flatMap((x) => [-0.55, 0.55].map((dx) => ({ x: x + dx, z: -5.2, rot: 0, y: 0.46 }))), ...SEAT_WALL_SEATS, ...PICNIC_SEATS],
  };
}

/** A building sign on a facade, facing the way `rotY` points. */
/** A name along the front edge of one of 154's west canopies (1.3 m out, 0.25 m deep), `width` long, centred on z. */
function fascia(g: THREE.Group, lines: string[], width: number, bg: string, z: number): void {
  const plate = textPlane(lines, width, 0.25, { bg, fg: "#ffffff", font: 0.17 });
  plate.position.set(6 - 1.3 - 0.01, 3.3, z);
  plate.rotation.y = -Math.PI / 2;
  g.add(plate);
}

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

/** The advertising board, south of the flower bed east of Broger's (server/spaces.ts keeps notes off it too). */
const LAWN_BOARD = { x: 1.75, z: -31.6 };

/**
 * The study-group board, beside 155's entrance (north of its door), facing
 * the path (+x): where people starting a course look for others to study
 * with. Notes keep 2 m off it too (server/spaces.ts).
 */
const STUDY_BOARD = { x: -8.6, z: 2.3 };

/**
 * The advertising board: a steel-framed billboard on two posts, a green
 * title strip over a face pasted with bright posters (drawn, made up: no
 * real events or logos), its face toward `facing` like the noticeboards.
 */
function adBoard(g: THREE.Group, colliders: Box[], at: { x: number; z: number }, facing: number): void {
  const board = new THREE.Group();
  const steel = mat(0x4a5058);
  for (const dx of [-1.55, 1.55]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.9, 0.12), steel);
    post.position.set(dx, 1.45, -0.06);
    board.add(post);
  }
  const frame = new THREE.Mesh(new THREE.BoxGeometry(3.3, 1.9, 0.1), steel);
  frame.position.set(0, 1.85, -0.03);
  const strip = textPlane(["Advertising board", "events · clubs · anything to promote"], 3.1, 0.42, { bg: "#1e6b52", fg: "#ffffff", font: 0.16 });
  strip.position.set(0, 2.55, 0.03);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 1.3), new THREE.MeshBasicMaterial({ map: postersTexture(), toneMapped: false }));
  face.position.set(0, 1.65, 0.03);
  // A little roof over it, against the rain.
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.08, 0.45), steel);
  roof.position.set(0, 2.84, 0.1);
  board.add(frame, strip, face, roof);
  board.position.set(at.x, 0, at.z);
  board.rotation.y = facing;
  g.add(board);
  const across = Math.abs(Math.sin(facing)) > 0.5;
  solid(colliders, across ? 0.3 : 3.4, across ? 3.4 : 0.3, at.x, at.z);
}

/** A wall of made-up posters: bright blocks, a few lines and a pin each, slightly askew. */
function postersTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 620;
  canvas.height = 260;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#e9e4d8";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const posters: [number, number, number, number, string, string, string][] = [
    [18, 18, 120, 160, "#e84a5f", "#fff", "GIG"],
    [150, 30, 110, 140, "#ffb400", "#3b2a12", "FAIR"],
    [272, 14, 130, 110, "#3d8bfd", "#fff", "CLUB"],
    [282, 134, 120, 110, "#2fb380", "#fff", "SALE"],
    [414, 22, 92, 150, "#a55eea", "#fff", "QUIZ"],
    [516, 30, 88, 120, "#ff7f50", "#fff", "YOGA"],
    [40, 190, 210, 56, "#fffaf0", "#3b2a12", "ROOM FOR RENT"],
    [430, 184, 170, 64, "#1f2d3d", "#fff", "OPEN MIC"],
  ];
  for (const [x, y, w, h, bg, fg, word] of posters) {
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate((Math.random() - 0.5) * 0.08);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(-w / 2 + 3, -h / 2 + 4, w, h);
    ctx.fillStyle = bg;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.font = `800 ${Math.min(30, w / 4)}px system-ui, sans-serif`;
    ctx.fillText(word, 0, h > 80 ? -h / 6 : 8);
    if (h > 80) {
      ctx.globalAlpha = 0.6;
      for (let i = 0; i < 3; i++) ctx.fillRect(-w / 2 + 14, h / 8 + i * 13, w - 28 - i * 14, 5);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = "#c0392b";
    ctx.beginPath();
    ctx.arc(0, -h / 2 + 7, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A chalkboard on two timber legs, its face toward `facing` (radians about y; 0 faces +z). */
function noticeboard(g: THREE.Group, colliders: Box[], at: { x: number; z: number }, facing: number, lines: string[]): void {
  const board = new THREE.Group();
  for (const dx of [-1.6, 1.6]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.5, 0.14), mat(0x8a5a32));
    leg.position.set(dx, 1.25, -0.05);
    board.add(leg);
  }
  const face = chalkboard(lines, 3, 1.6, 0.22);
  face.position.set(0, 1.6, 0);
  board.add(face);
  board.position.set(at.x, 0, at.z);
  board.rotation.y = facing;
  g.add(board);
  const across = Math.abs(Math.sin(facing)) > 0.5;
  solid(colliders, across ? 0.3 : 3.4, across ? 3.4 : 0.3, at.x, at.z);
}
