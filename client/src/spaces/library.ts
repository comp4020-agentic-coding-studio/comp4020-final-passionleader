import * as THREE from "three";
import { block, doorway, lightPool, place, solid, texMat, textPlane, type Box, type SpaceDef } from "../world.ts";
import { LIBRARY_TEAM_DOORS, roomDoors } from "./meeting.ts";
import { roomShell } from "./room.ts";

// Inside Chifley Library. You come in through the north wall (the front
// door at the end of the bridge). In the middle, the reception desk with
// the search computers beside it; bookcases full of books to the north-east; study desks across the south half (Kenney furniture, CC0); team
// rooms off the side walls (meeting.ts), open to anyone, six at most.
// Simplified, not surveyed. The computers open the library's own sites:
// room booking in a window over the game; the catalogue and the research
// ethics system in a new tab, because those two refuse to be shown inside
// another page. Arched windows high on the
// north wall let the sun in: shafts of light across the room, bright patches
// on the floor, dust drifting in them. The room itself is lit a little dimmer
// than the others, so the windows glow.

const HALF = { halfX: 16, halfZ: 11 };
/** The door, on the north wall (the back wall, facing the camera). */
const DOOR = { x: 0, z: -HALF.halfZ + 1.1 };

export function buildLibrary(): SpaceDef {
  const g = new THREE.Group();
  const colliders: Box[] = [];
  roomShell(g, colliders, HALF.halfX, HALF.halfZ, texMat("ai/library_floor.jpg", 13, 9), { texture: "ai/library_wall.jpg", tint: 0xd8c8b0, trim: 0x2a1c12 });
  const sunlight = windows(g);

  // Beside the door, not over it: the door's own label floats there.
  const sign = textPlane(["Chifley Library", "an unofficial, fan-made space"], 4.6, 1, { bg: "#5b3a24", fg: "#ffffff", font: 0.34 });
  sign.position.set(-4.3, 2.9, -HALF.halfZ + 0.01);
  g.add(sign);
  doorway(g, 0, -HALF.halfZ + 0.05, 0, "Exit to campus");

  // The middle: reception, and the search computers on a desk beside it.
  block(g, colliders, [4, 1.1, 1.2], [-3, 0], texMat("ai/wood_tabletop.jpg", 2, 1, 0x9a6438));
  const reception = textPlane(["Reception"], 2.4, 0.5, { bg: "#7a4e2e", fg: "#ffffff", font: 0.32 });
  reception.position.set(-3, 1.75, 0.61);
  g.add(reception);
  block(g, colliders, [6, 0.9, 1], [4, 0], texMat("ai/wood_tabletop.jpg", 3, 1, 0xb08a64));
  for (const [i, label] of ["Book a room", "Catalogue", "Research ethics"].entries()) {
    const x = 2 + i * 2;
    place(g, "computerScreen.glb", 0.45, x, -0.1, Math.PI, true, 0.9);
    const tag = textPlane([label], 1.7, 0.36, { bg: "#1f2d3d", fg: "#ffffff", font: 0.2 });
    tag.position.set(x, 1.75, 0.51);
    g.add(tag);
  }

  // North-east of the door: rows of bookcases facing the room, full of books.
  // North-west is left open, for the light from the windows to fall on.
  const cases: [number, number][] = [];
  for (const z of [-8, -5]) {
    for (const x of [6.5, 9, 11.5, 14]) {
      place(g, "bookcaseClosedWide.glb", BOOKCASE_H, x, z);
      cases.push([x, z]);
    }
    solid(colliders, 9.6, 0.7, 10.25, z);
  }
  fillShelves(g, cases);

  // South: study desks in rows, a chair at each.
  for (const z of [4, 6.8, 9.4]) {
    for (const x of [-12, -8, -4, 4, 8, 12]) {
      place(g, "desk.glb", 0.75, x, z, Math.PI);
      place(g, "chairDesk.glb", 1, x, z + 0.8, Math.PI, true, 0, { carpet: 0x2f5a3e });
      solid(colliders, 2, 0.8, x, z);
    }
  }
  // Reading lamps' warm light over the study desks, and books on reception.
  for (const z of [4, 6.8, 9.4]) for (const x of [-12, -8, -4, 4, 8, 12]) lightPool(g, x, z, 2.6, 1.8, 0xffcf8a, 0.18);
  place(g, "books.glb", 0.14, -4.2, 0, 0.5, true, 1.1);
  place(g, "plantSmall3.glb", 0.4, -1.6, 0, 0, true, 1.1);
  for (const [x, z] of [
    [-15.2, 10.2],
    [15.2, 10.2],
  ] as const) {
    place(g, "trashcan.glb", 0.6, x, z);
    solid(colliders, 0.5, 0.5, x, z);
  }
  LIBRARY_TEAM_DOORS.forEach((d, i) => doorway(g, d.x + Math.sign(d.x) * 1.05, d.z, -Math.sign(d.x) * (Math.PI / 2), `Team room ${i + 1}`));

  for (const [x, z] of [
    [-15, -10],
    [15, -10],
  ] as const) {
    place(g, "pottedPlant.glb", 1.3, x, z);
    solid(colliders, 0.7, 0.7, x, z);
  }

  return {
    id: "library",
    title: "Chifley Library",
    group: g,
    colliders,
    doors: [
      { ...DOOR, label: "Go outside", to: "outdoor", arrive: { x: -2, z: 22.4 } },
      ...roomDoors("team-library", LIBRARY_TEAM_DOORS, (n) => `Enter team room ${n}`),
    ],
    ...HALF,
    background: 0xc9bda6,
    light: 0.7,
    tick: sunlight,
    camera: new THREE.Vector3(0, 7, 8.5),
    bgm: ["Sunlight_on_Glass.mp3"],
    floor: "wood",
    // A chair at each study desk, facing it (north).
    seats: [4, 6.8, 9.4].flatMap((z) => [-12, -8, -4, 4, 8, 12].map((x) => ({ x, z: z + 0.8, rot: Math.PI, y: 0.45 }))),
    // Each computer works from either side of its desk.
    links: [-1.2, 1.2].flatMap((z) => [
      { x: 2, z, label: "Book a library room", url: "https://anu.libcal.com/", embeddable: true },
      // The catalogue refuses to be shown inside another page (tried 10/16): a new tab.
      { x: 4, z, label: "Search the library catalogue (new tab)", url: "https://anulib.anu.edu.au/", embeddable: false },
      {
        x: 6,
        z,
        label: "Research ethics system (new tab)",
        url: "https://services.anu.edu.au/information-technology/software-systems/research-ethics-management-system",
        embeddable: false,
      },
    ]),
  };
}

// --- books on the shelves ---------------------------------------------------------

const BOOKCASE_H = 1.9;
// The bookcase model's shelves, as fractions of its height, its inside width
// and depth (Kenney's bookcaseClosedWide: 0.79 tall, 0.8 wide, 0.25 deep).
const SHELVES = [0.07, 0.31, 0.55].map((y) => (y / 0.79) * BOOKCASE_H);
const SHELF_GAP = (0.21 / 0.79) * BOOKCASE_H;
const INNER_W = (0.72 / 0.79) * BOOKCASE_H;
const DEPTH = (0.25 / 0.79) * BOOKCASE_H;
const SPINES = [0x7a2e2a, 0x2f4a6b, 0x355e3b, 0x8a6a2c, 0x5a3b5e, 0x9b4a24, 0x3b3b3b, 0xc2a36b, 0x6b2f3f, 0x2c5b5b];

/**
 * Rows of books standing on every shelf of each bookcase, of mixed heights,
 * widths and colours, with the odd gap and the odd one leaning. One instanced
 * mesh for all of them: a few hundred books in a single draw call.
 */
function fillShelves(g: THREE.Group, cases: [number, number][]): void {
  // The same "random" every visit, so the shelves don't reshuffle.
  let seed = 7;
  const rand = (): number => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const books: THREE.Matrix4[] = [];
  const colours: THREE.Color[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const axis = new THREE.Vector3(0, 0, 1);
  for (const [cx, cz] of cases) {
    for (const shelf of SHELVES) {
      let x = cx - INNER_W / 2 + 0.02;
      while (x < cx + INNER_W / 2 - 0.06) {
        if (rand() < 0.06) {
          x += 0.08 + rand() * 0.12; // a gap where a book's out
          continue;
        }
        const w = 0.04 + rand() * 0.05;
        const h = SHELF_GAP * (0.6 + rand() * 0.32);
        const d = DEPTH * (0.62 + rand() * 0.2);
        if (x + w > cx + INNER_W / 2 - 0.02) break;
        const lean = rand() < 0.05 ? -0.25 : 0;
        q.setFromAxisAngle(axis, lean);
        m.compose(new THREE.Vector3(x + w / 2, shelf + h / 2 + 0.01, cz + 0.02), q, new THREE.Vector3(w, h, d));
        books.push(m.clone());
        colours.push(new THREE.Color(SPINES[Math.floor(rand() * SPINES.length)]!).multiplyScalar(0.8 + rand() * 0.35));
        x += w + 0.004 + (lean ? 0.06 : 0);
      }
    }
  }
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.85 }), books.length);
  books.forEach((b, i) => {
    mesh.setMatrixAt(i, b);
    mesh.setColorAt(i, colours[i]!);
  });
  g.add(mesh);
}

// --- the windows and their light ---------------------------------------------

const WIN_Y = 1.3; // the sill
const WIN_W = 1.6;
const WIN_H = 2.3;

/** An arched window's outline, centred on x = 0 with its sill at y = 0. */
function archShape(w: number, h: number): THREE.Shape {
  const r = w / 2;
  const s = new THREE.Shape();
  s.moveTo(-r, 0);
  s.lineTo(r, 0);
  s.lineTo(r, h - r);
  s.absarc(0, h - r, r, 0, Math.PI, false);
  s.lineTo(-r, 0);
  return s;
}

/**
 * Four arched windows on the north wall, either side of the sign, each with a
 * shaft of light falling south-east across the room onto a bright patch of
 * floor, and dust motes drifting in the light. All unlit, additive materials:
 * no real lights, so it costs next to nothing on Low. Returns the per-frame tick.
 */
function windows(g: THREE.Group): (dt: number) => void {
  const wall = -HALF.halfZ + 0.02;
  const glass = new THREE.MeshBasicMaterial({ color: 0xfff1cf });
  const frame = new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 0.8 });
  const shaftTex = shaftTexture();
  const shaft = new THREE.MeshBasicMaterial({
    map: shaftTex,
    color: 0xffd9a0,
    transparent: true,
    opacity: 0.32,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const patch = new THREE.MeshBasicMaterial({
    map: patchTexture(),
    color: 0xffd8a0,
    transparent: true,
    opacity: 0.42,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  // The sun comes from the north (we're south of the equator), high and a
  // little from the west: the light runs down and towards the camera.
  const drop = 4.2; // how far south the light lands from the wall at floor level
  const lean = 1.4; // how far east it drifts on the way
  const shape = archShape(WIN_W, WIN_H);
  const glassGeo = new THREE.ShapeGeometry(shape, 16);
  const frameGeo = new THREE.ShapeGeometry(archShape(WIN_W + 0.24, WIN_H + 0.12), 16);
  const motes: THREE.Points[] = [];

  for (const x of [-12.5, -8.5, 8.5, 12.5]) {
    const f = new THREE.Mesh(frameGeo, frame);
    f.position.set(x, WIN_Y - 0.06, wall);
    const pane = new THREE.Mesh(glassGeo, glass);
    pane.position.set(x, WIN_Y, wall + 0.01);
    // Glazing bars: one upright, two across.
    const bars = new THREE.Group();
    const bar = (w: number, h: number, bx: number, by: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), frame);
      m.position.set(bx, by, 0.02);
      bars.add(m);
    };
    bar(0.06, WIN_H - 0.1, 0, WIN_H / 2 - 0.05);
    bar(WIN_W, 0.06, 0, WIN_H * 0.33);
    bar(WIN_W, 0.06, 0, WIN_H * 0.62);
    bars.position.set(x, WIN_Y, wall + 0.01);
    g.add(f, pane, bars);

    // The shaft: a quad from the window down to its patch on the floor.
    const top = [x, WIN_Y + WIN_H * 0.8, wall];
    const bottom = [x + lean, 0.02, wall + drop + WIN_Y * 0.9];
    const geo = new THREE.BufferGeometry();
    const hw = WIN_W / 2;
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [top[0]! - hw, top[1]!, top[2]!, top[0]! + hw, top[1]!, top[2]!, bottom[0]! + hw * 1.3, bottom[1]!, bottom[2]!, bottom[0]! - hw * 1.3, bottom[1]!, bottom[2]!],
        3,
      ),
    );
    geo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
    geo.setIndex([0, 3, 2, 0, 2, 1]);
    const beam = new THREE.Mesh(geo, shaft);
    beam.userData.noShadow = true;
    beam.renderOrder = 2;
    g.add(beam);

    // Where it lands: a long, soft, window-shaped patch on the floor.
    const spot = new THREE.Mesh(new THREE.PlaneGeometry(WIN_W * 1.5, drop * 0.9), patch);
    spot.rotation.x = -Math.PI / 2;
    spot.position.set(x + lean * 0.75, 0.015, wall + drop * 0.75 + 0.6);
    spot.userData.noShadow = true;
    spot.renderOrder = 1;
    g.add(spot);

    // Dust in the light.
    const n = 40;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const t = Math.random();
      pos[i * 3] = x + lean * t + (Math.random() - 0.5) * WIN_W;
      pos[i * 3 + 1] = top[1]! * (1 - t) + 0.2;
      pos[i * 3 + 2] = wall + 0.3 + (drop + WIN_Y) * t * 0.9;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const dust = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({ color: 0xfff0d0, size: 0.05, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    dust.userData = { noShadow: true, base: pos.slice() };
    motes.push(dust);
    g.add(dust);
  }

  let t = 0;
  return (dt) => {
    t += dt;
    // The light breathes a little, and the dust drifts slowly.
    shaft.opacity = 0.3 + Math.sin(t * 0.5) * 0.03;
    for (const dust of motes) {
      const p = dust.geometry.getAttribute("position") as THREE.BufferAttribute;
      const base = dust.userData.base as Float32Array;
      for (let i = 0; i < p.count; i++) {
        p.setXYZ(i, base[i * 3]! + Math.sin(t * 0.3 + i) * 0.12, base[i * 3 + 1]! + Math.sin(t * 0.21 + i * 1.7) * 0.15, base[i * 3 + 2]! + Math.cos(t * 0.25 + i) * 0.12);
      }
      p.needsUpdate = true;
    }
  };
}

/** Soft at the edges, fading towards the floor: the look of a shaft of light. */
function shaftTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  for (let x = 0; x < 64; x++) {
    const edge = Math.sin((x / 63) * Math.PI) ** 1.5;
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, `rgba(255,255,255,${edge})`);
    grad.addColorStop(1, `rgba(255,255,255,${edge * 0.25})`);
    ctx.fillStyle = grad;
    ctx.fillRect(x, 0, 1, 128);
  }
  return new THREE.CanvasTexture(c);
}

/** A soft-edged rectangle with the window's bars as darker lines. */
function patchTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  const grad = ctx.createRadialGradient(32, 64, 4, 32, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.7, "rgba(255,255,255,0.6)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 128);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(31, 10, 2, 108);
  ctx.fillRect(10, 50, 44, 2);
  ctx.fillRect(10, 82, 44, 2);
  return new THREE.CanvasTexture(c);
}
