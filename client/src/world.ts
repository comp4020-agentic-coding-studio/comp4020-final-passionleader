import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HIGH } from "./settings.ts";

// Building blocks shared by every space (client/src/spaces/): collision
// boxes, doors, signs, simple furniture, the player figure and sticky notes.
// A space is a group of meshes plus the boxes you can't walk through and the
// doors you can walk through.

/** "outdoor", "hub", or a classroom's course code in lower case ("comp8020"). */
export type SpaceId = string;

/** Axis-aligned footprint on the floor plane, used for simple player collision. */
export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** How tall it is, for low things you can jump over (sofas). Unset: a wall. */
  top?: number;
  /** You can stand on its top (a flower bed's kerb), not only jump over it. */
  standOn?: boolean;
}

/** The ground under a point: the top of anything you can stand on there, else the floor. */
export function groundAt(x: number, z: number, colliders: Box[]): number {
  let y = 0;
  for (const b of colliders) if (b.standOn && b.top !== undefined && x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && b.top > y) y = b.top;
  return y;
}

export interface Door {
  /** Where you stand to use it. */
  x: number;
  z: number;
  /** What the E hint says, e.g. "Enter the Student Hub". */
  label: string;
  /** The space it leads to, or "classroom" for 155's door, which asks which classroom. */
  to: SpaceId;
  /** Where you appear on the other side. */
  arrive: { x: number; z: number };
}

export interface SpaceDef {
  id: SpaceId;
  title: string;
  group: THREE.Group;
  colliders: Box[];
  doors: Door[];
  halfX: number;
  halfZ: number;
  /** Where you can walk, if not the whole halfX x halfZ rectangle. */
  areas?: Box[];
  background: number;
  /** Camera offset from the player: further back outside, closer indoors. */
  camera: THREE.Vector3;
  /**
   * Where a wall closes the space to the south (+z): walking toward it, the
   * camera rises and leans in, looking down on you at the edge `z` (where
   * walking stops). `from` is where the rise starts.
   */
  southWall?: { from: number; z: number };
  /** Background tracks in client/public/assets/, played in turn. */
  bgm: string[];
  /** Outdoors: a real sky and haze toward the horizon. Indoors: neither. */
  outdoor?: boolean;
  /**
   * Where sticky notes may go: never in a space with `noNotes`, never inside
   * one of `noteBuildings`, never within 2 m of a door, a link or a
   * `noteKeepClear` spot. The server checks the same (server/spaces.ts).
   */
  noNotes?: boolean;
  /** Indoors: how bright the room is lit, 1 being normal (the library is dimmer, so its windows glow). */
  light?: number;
  /** What your feet sound like on this space's floor (outside: paving). */
  floor?: "concrete" | "wood" | "carpet";
  /** Called every frame while this space is shown (animated scenery, like the dog). */
  tick?: (dt: number) => void;
  /** Spots where E does something particular to this space (the dog), by name. */
  spots?: { x: number; z: number; id: string; label: string }[];
  noteBuildings?: Box[];
  noteKeepClear?: { x: number; z: number }[];
  /** Spots where E opens a web page in a new tab (e.g. the classroom whiteboard). */
  /**
   * Spots where E opens a web page: in a window over the game when the site
   * allows being framed (`embeddable`), otherwise in a new tab.
   */
  links?: { x: number; z: number; label: string; url: string; embeddable: boolean }[];
  /**
   * Places to sit: E nearby sits you down, facing `rot` (0 = +z), at seat
   * height `y`. Numbered by their order here; the server keeps one person
   * per seat ("<space>:<index>").
   */
  seats?: Seat[];
}

export interface Seat {
  x: number;
  z: number;
  rot: number;
  y: number;
}

/** The nearest point that lies in one of `areas`, written back into `pos`. */
export function keepIn(pos: THREE.Vector3, areas: Box[]): void {
  let bx = pos.x;
  let bz = pos.z;
  let bestD = Infinity;
  for (const a of areas) {
    const x = THREE.MathUtils.clamp(pos.x, a.minX, a.maxX);
    const z = THREE.MathUtils.clamp(pos.z, a.minZ, a.maxZ);
    const d = (x - pos.x) ** 2 + (z - pos.z) ** 2;
    if (d < bestD) [bx, bz, bestD] = [x, z, d];
  }
  pos.x = bx;
  pos.z = bz;
}

/**
 * Pushes a circle (the player) out of every collider. Two passes settle
 * corners. A collider with a `top` is skipped while the player is above it
 * (mid-jump), so low furniture can be jumped over; land on it and you slide off.
 */
export function pushOut(pos: THREE.Vector3, radius: number, colliders: Box[]): void {
  for (let pass = 0; pass < 2; pass++) {
    for (const b of colliders) {
      if (b.top !== undefined && pos.y >= b.top - 0.01) continue;
      const cx = THREE.MathUtils.clamp(pos.x, b.minX, b.maxX);
      const cz = THREE.MathUtils.clamp(pos.z, b.minZ, b.maxZ);
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d = Math.hypot(dx, dz);
      if (d >= radius) continue;
      if (d > 1e-6) {
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
      } else {
        // Centre is inside the box: leave through the nearest face.
        const out = [
          [pos.x - b.minX, -1, 0],
          [b.maxX - pos.x, 1, 0],
          [pos.z - b.minZ, 0, -1],
          [b.maxZ - pos.z, 0, 1],
        ].sort((a, c) => a[0]! - c[0]!)[0]!;
        pos.x += out[1]! * (out[0]! + radius);
        pos.z += out[2]! * (out[0]! + radius);
      }
    }
  }
}

export const boxFrom = (o: THREE.Object3D, pad = 0): Box => {
  o.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(o);
  return { minX: b.min.x - pad, maxX: b.max.x + pad, minZ: b.min.z - pad, maxZ: b.max.z + pad };
};

/** Where the sun sits relative to whatever it follows: the sky shader uses the same direction. */
/**
 * The playlist the Student Hub, the classrooms, the ANUSA Student Lounge and their meeting
 * rooms share: walking between them keeps the song playing, and each visit
 * starts on one of the four at random.
 */
export const SHARED_BGM = ["Margin_Notes.mp3", "Common_Room_Afternoon.mp3", "The_Library_Window.mp3", "The_Velvet_Clearing.mp3"];
/** The library's two, shared with its team rooms the same way. */
export const LIBRARY_BGM = ["Sunlight_on_Glass.mp3", "Where_The_Light_Settles.mp3"];

export const SUN_DIR = new THREE.Vector3(0.55, 0.75, 0.35).normalize();

/**
 * Daylight: a soft sky/ground fill and one sun. The sun casts shadows over a
 * box that follows the player (the caller moves it), so the shadow map stays
 * sharp without covering the whole campus.
 */
export function addLights(scene: THREE.Scene, shadows: boolean): THREE.DirectionalLight {
  scene.add(new THREE.HemisphereLight(0xdfefff, 0x8a7a62, 0.9));
  const sun = new THREE.DirectionalLight(0xfff3e0, 2.6);
  sun.castShadow = shadows;
  sun.shadow.mapSize.set(2048, 2048);
  const c = sun.shadow.camera;
  c.left = c.bottom = -22;
  c.right = c.top = 22;
  c.near = 1;
  c.far = 90;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  return sun;
}

/** Turns on shadows for everything in a group: floors only receive them. */
export function enableShadows(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    const m = o as THREE.Mesh;
    const flat = m.geometry instanceof THREE.PlaneGeometry;
    m.castShadow = !flat && !o.userData.noShadow;
    m.receiveShadow = true;
  });
}

const mats = new Map<number, THREE.MeshStandardMaterial>();
export const mat = (color: number): THREE.MeshStandardMaterial => {
  let m = mats.get(color);
  if (!m) mats.set(color, (m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 })));
  return m;
};

/** Window glass: dark, a little blue, and reflective under the environment map. */
export const glassMat = (tint = 0xb7d0e0): THREE.MeshStandardMaterial =>
  !HIGH
    ? new THREE.MeshStandardMaterial({ color: tint, roughness: 0.15, metalness: 0.2 })
    : new THREE.MeshPhysicalMaterial({ color: tint, roughness: 0.08, metalness: 0.15, envMapIntensity: 1.6, clearcoat: 1, clearcoatRoughness: 0.05 });

// Textures from assets/tex (credited in assets/CREDITS.md), tiled by
// world size so a paver or a floorboard is the same size everywhere.
// Each material gets its own clone (its own repeat) of one shared image,
// attached only once the image has arrived: cloning flags a texture for
// upload, and uploading one with no image yet makes three.js warn.
const loaderTex = new THREE.TextureLoader();
const textures = new Map<string, { image: THREE.Texture | null; waiting: (() => void)[] }>();
export function texMat(file: string, repeatX: number, repeatY: number, tint = 0xffffff, roughness = 0.9): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color: tint, roughness, metalness: 0 });
  // One material per call, never shared: occluders may fade it in place.
  material.userData.unique = true;
  let entry = textures.get(file);
  if (!entry) {
    const e: { image: THREE.Texture | null; waiting: (() => void)[] } = { image: null, waiting: [] };
    loaderTex.load(`${import.meta.env.BASE_URL}assets/tex/${file}`, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      // Floors are seen at a low angle: keep them sharp into the distance.
      tex.anisotropy = 4;
      e.image = tex;
      for (const attach of e.waiting.splice(0)) attach();
    });
    textures.set(file, (entry = e));
  }
  const e = entry;
  const attach = (): void => {
    const map = e.image!.clone();
    map.repeat.set(repeatX, repeatY);
    material.map = map;
    material.needsUpdate = true;
  };
  if (e.image) attach();
  else e.waiting.push(attach);
  return material;
}

/**
 * A framed picture on a wall: the image (from assets/tex) on a plane, a thin
 * dark frame behind it. Placed like textPlane: set its position and rotation.
 */
export function poster(file: string, w: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.12, h + 0.12), mat(0x3b2a1a));
  const picture = new THREE.Mesh(new THREE.PlaneGeometry(w, h), texMat(file, 1, 1, 0xffffff, 0.8));
  picture.position.z = 0.006;
  g.add(frame, picture);
  return g;
}

/**
 * Fake light: a soft warm glow on the floor (under a lamp, below a window),
 * drawn additively so it brightens what's under it. No real light, so it
 * costs almost nothing, and Low gets it too.
 */
let poolTexture: THREE.CanvasTexture | null = null;
export function lightPool(g: THREE.Group, x: number, z: number, w: number, d: number, colour = 0xffd9a0, strength = 0.35): THREE.Mesh {
  if (!poolTexture) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d")!;
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.6, "rgba(255,255,255,0.45)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    poolTexture = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({ map: poolTexture, color: colour, transparent: true, opacity: strength, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.02, z);
  m.userData.noShadow = true;
  m.renderOrder = 1;
  g.add(m);
  return m;
}

/** A collision footprint with nothing drawn, for furniture drawn by a model. */
export function solid(colliders: Box[], w: number, d: number, x: number, z: number, top?: number): void {
  colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, ...(top === undefined ? {} : { top }) });
}

/**
 * Sofas and coffee tables: low enough to jump over. A jump peaks at about
 * 1.2 m and spends 0.46 s above 0.7 m, so even walking (4.2 m/s) carries you
 * the 1.7 m across a sofa and your own width; at 0.85 m (the backrest) a
 * walking jump fell just short.
 */
export const SOFA_TOP = 0.7;

/**
 * Colours by the model's material name: Kenney's furniture calls its fabric
 * "carpet" (a coral pink in every model), so `{ carpet: 0x2f5d8a }` gives a
 * room its own upholstery.
 */
export type Tint = Partial<Record<string, number>>;
const tinted = new Map<string, THREE.Material>();
function applyTint(root: THREE.Object3D, tint: Tint): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const swap = (m: THREE.Material): THREE.Material => {
      const colour = tint[m.name];
      if (colour === undefined) return m;
      // One copy per material and colour, shared by every chair that wants it.
      const key = `${m.uuid}:${colour}`;
      let copy = tinted.get(key);
      if (!copy) {
        copy = (m as THREE.MeshStandardMaterial).clone();
        (copy as THREE.MeshStandardMaterial).color.setHex(colour);
        tinted.set(key, copy);
      }
      return copy;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  });
}

/** Places a model once it loads (it's drawn a moment later than the room); `y` lifts it onto a table. */
export function place(g: THREE.Group, file: string, height: number, x: number, z: number, rotY = 0, shadow = true, y = 0, tint?: Tint): void {
  void loadModel(file, height).then((model) => {
    if (!model) return;
    const m = model.clone(true);
    if (tint) applyTint(m, tint);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    if (shadow) enableShadows(m);
    else m.traverse((o) => void (o.userData.noShadow = true));
    g.add(m);
  });
}

/** Where one copy of a scattered model goes. */
export interface Spot {
  x: number;
  z: number;
  rotY?: number;
  scale?: number;
}

/**
 * Places many copies of one model as instanced meshes: one draw call per
 * part of the model however many copies there are, which keeps a lawn full
 * of bushes cheap on Low.
 */
export function scatter(g: THREE.Group, file: string, height: number, spots: Spot[], shadow = true): void {
  if (spots.length === 0) return;
  void loadModel(file, height).then((model) => {
    if (!model) return;
    model.updateMatrixWorld(true);
    const at = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const inst = new THREE.InstancedMesh(mesh.geometry, mesh.material, spots.length);
      spots.forEach((s, i) => {
        q.setFromAxisAngle(up, s.rotY ?? 0);
        at.compose(new THREE.Vector3(s.x, 0, s.z), q, new THREE.Vector3().setScalar(s.scale ?? 1));
        inst.setMatrixAt(i, at.multiply(mesh.matrixWorld));
      });
      inst.computeBoundingSphere();
      inst.castShadow = shadow;
      inst.receiveShadow = true;
      inst.userData.noShadow = !shadow;
      g.add(inst);
    });
  });
}

/** A box sitting on the floor at (x, z). Solid ones are added to colliders. */
export function block(
  g: THREE.Group,
  colliders: Box[] | null,
  size: [w: number, h: number, d: number],
  at: [x: number, z: number, y?: number],
  color: number | THREE.Material,
): THREE.Mesh {
  const [w, h, d] = size;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === "number" ? mat(color) : color);
  m.position.set(at[0], (at[2] ?? 0) + h / 2, at[1]);
  g.add(m);
  if (colliders) colliders.push(boxFrom(m));
  return m;
}

/** A flat floor rectangle, slightly lifted so layers don't flicker. */
export function floor(g: THREE.Group, w: number, d: number, x: number, z: number, color: number | THREE.Material, y = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), typeof color === "number" ? mat(color) : color);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

/** Text painted on a canvas and used as a texture: signs, whiteboards. */
export function textPlane(lines: string[], w: number, h: number, opts: { bg?: string; fg?: string; font?: number } = {}): THREE.Mesh {
  const scale = 128;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = opts.bg ?? "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = opts.fg ?? "#222222";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Shrink the type until the longest line fits, rather than clip it.
  let size = (opts.font ?? 0.35) * scale;
  ctx.font = `700 ${size}px system-ui, sans-serif`;
  const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
  if (widest > canvas.width * 0.92) size *= (canvas.width * 0.92) / widest;
  ctx.font = `700 ${size}px system-ui, sans-serif`;
  lines.forEach((line, i) => {
    ctx.fillText(line, canvas.width / 2, canvas.height / 2 + (i - (lines.length - 1) / 2) * size * 1.25);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
}

/**
 * A chalkboard: dark green slate with chalk-white writing, a timber frame and
 * a chalk ledge, facing +z from its centre. The boards people post on (a
 * classroom's, the Hub's, the lawn's) all use it, so they read as the same
 * kind of thing wherever they hang.
 */
/**
 * A pile of papers on a desk: a few loose sheets, slightly turned, with a
 * folder on the bottom. For guides and forms (AI essentials, research ethics)
 * that aren't a computer. `y` is the desk top.
 */
export function paperPile(g: THREE.Group, x: number, z: number, y: number): void {
  const folder = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.38), mat(0x2f5d8a));
  folder.position.set(x, y + 0.015, z);
  folder.castShadow = true;
  g.add(folder);
  const sheet = new THREE.MeshStandardMaterial({ color: 0xf7f4ea, roughness: 0.95 });
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.012, 0.3), sheet);
    p.position.set(x + Math.sin(i * 2.1) * 0.03, y + 0.036 + i * 0.013, z + Math.cos(i * 1.7) * 0.025);
    p.rotation.y = Math.sin(i * 1.3) * 0.18;
    p.castShadow = true;
    g.add(p);
  }
}

export function chalkboard(lines: string[], w: number, h: number, font = 0.26): THREE.Group {
  const board = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, h + 0.2, 0.06), mat(0x8a5a32));
  const slate = textPlane(lines, w, h, { bg: "#2f4a3a", fg: "#f2f0e6", font });
  slate.position.z = 0.035;
  const ledge = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.05, 0.14), mat(0x8a5a32));
  ledge.position.set(0, -h / 2 - 0.08, 0.08);
  // A stick of chalk and a duster on the ledge.
  const chalk = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.025), mat(0xf4f1e8));
  chalk.position.set(w / 2 - 0.4, -h / 2 - 0.04, 0.09);
  const duster = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.08), mat(0x3b3b3b));
  duster.position.set(-w / 2 + 0.45, -h / 2 - 0.03, 0.09);
  board.add(frame, slate, ledge, chalk, duster);
  return board;
}

/**
 * A door in a wall: a dark frame with a lit panel and a floating label. `facing`
 * is the direction (radians around y) the door's front looks toward.
 */
export function doorway(g: THREE.Group, x: number, z: number, facing: number, label: string): void {
  const d = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.6, 0.12), mat(0x2b2b2b));
  frame.position.y = 1.3;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.3), new THREE.MeshBasicMaterial({ color: 0xbfe3ff }));
  panel.position.set(0, 1.2, 0.07);
  d.add(frame, panel);
  // An empty label means the door is signed some other way.
  if (label) {
    const el = document.createElement("div");
    el.className = "door-label";
    el.textContent = label;
    const tag = new CSS2DObject(el);
    tag.position.set(0, 3.1, 0.2);
    d.add(tag);
  }
  d.position.set(x, 0, z);
  d.rotation.y = facing;
  g.add(d);
}

export function tree(g: THREE.Group, colliders: Box[], x: number, z: number, s = 1): void {
  block(g, colliders, [0.4 * s, 1.6 * s, 0.4 * s], [x, z], 0x6b4a2b);
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4 * s, 1), mat(0x4f8a3c));
  crown.position.set(x, 2.6 * s, z);
  g.add(crown);
}

/**
 * Loads a GLB scaled to a target height, centred on x/z with its base at y=0.
 * Null when the file can't be loaded, so callers keep their primitive version.
 */
const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Group | null>>();
export function loadModel(file: string, height: number): Promise<THREE.Group | null> {
  const key = `${file}@${height}`;
  let p = cache.get(key);
  if (!p) {
    p = loader
      .loadAsync(`${import.meta.env.BASE_URL}assets/${file}`)
      .then((gltf) => {
        const model = gltf.scene;
        let box = new THREE.Box3().setFromObject(model);
        model.scale.setScalar(height / (box.max.y - box.min.y));
        box = new THREE.Box3().setFromObject(model);
        const c = box.getCenter(new THREE.Vector3());
        model.position.set(-c.x, -box.min.y, -c.z);
        const g = new THREE.Group();
        g.add(model);
        return g;
      })
      .catch(() => null);
    cache.set(key, p);
  }
  return p;
}

// --- people and notes -------------------------------------------------------

const CLAY = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 1, metalness: 0 });

export function buildPlayer(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.6, 6, 16), CLAY);
  body.position.y = 0.95;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 16), CLAY);
  head.position.y = 1.72;
  const armGeo = new THREE.CapsuleGeometry(0.09, 0.4, 4, 8);
  const legGeo = new THREE.CapsuleGeometry(0.12, 0.35, 4, 8);
  const left = new THREE.Mesh(armGeo, CLAY);
  left.position.set(-0.46, 1.0, 0);
  left.name = "armL";
  const right = left.clone();
  right.position.x = 0.46;
  right.name = "armR";
  const legL = new THREE.Mesh(legGeo, CLAY);
  legL.position.set(-0.17, 0.3, 0);
  const legR = legL.clone();
  legR.position.x = 0.17;
  // Two dark dots on the face so the facing direction (+z) is readable.
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
  const eyeGeo = new THREE.SphereGeometry(0.04, 8, 8);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.1, 1.77, 0.25);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.1;
  g.add(body, head, left, right, legL, legR, eyeL, eyeR);
  return g;
}

const NOTE_COLORS = [0xffe100, 0xff2f8e, 0x22c55e, 0x1e90ff, 0xff7a00];
const noteMats = new Map<number, THREE.MeshBasicMaterial>();

/** A sticky note lying on the floor, its colour picked from the note id. */
export function buildNote(id: number): THREE.Group {
  const g = new THREE.Group();
  // Unlit and outside tone mapping, so the colours stay vivid in any light.
  const color = NOTE_COLORS[id % NOTE_COLORS.length]!;
  let paperMat = noteMats.get(color);
  if (!paperMat) noteMats.set(color, (paperMat = new THREE.MeshBasicMaterial({ color, toneMapped: false })));
  // 42 cm square: big enough to spot, small enough not to carpet a path.
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 0.42), paperMat);
  paper.position.y = 0.02;
  // A dark rim just below the paper, so a note stands out on pale paving.
  const rim = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.016, 0.45), mat(0x3a3530));
  rim.position.y = 0.012;
  g.add(rim);
  // A slight curl at one corner so it reads as paper, not a tile.
  const curl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.12), mat(0xffffff));
  curl.position.set(0.15, 0.05, 0.15);
  curl.rotation.z = 0.4;
  g.add(paper, curl);
  g.rotation.y = ((id * 37) % 30) * (Math.PI / 180) - Math.PI / 12;
  return g;
}
