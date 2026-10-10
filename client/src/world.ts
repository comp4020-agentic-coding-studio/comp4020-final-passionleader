import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// Building blocks shared by every space (client/src/spaces/): collision
// boxes, doors, signs, simple furniture, the player figure and sticky notes.
// A space is a group of meshes plus the boxes you can't walk through and the
// doors you can walk through.

export type SpaceId = "outdoor" | "hub" | "comp8020";

/** Axis-aligned footprint on the floor plane, used for simple player collision. */
export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Door {
  /** Where you stand to use it. */
  x: number;
  z: number;
  /** What the E hint says, e.g. "Enter the Student Hub". */
  label: string;
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
  background: number;
  /** Camera offset from the player: further back outside, closer indoors. */
  camera: THREE.Vector3;
  bgm: string;
  /** Outdoors: a real sky and haze toward the horizon. Indoors: neither. */
  outdoor?: boolean;
  /** Spots where E opens a web page in a new tab (e.g. the classroom whiteboard). */
  links?: { x: number; z: number; label: string; url: string }[];
}

/** Pushes a circle (the player) out of every collider. Two passes settle corners. */
export function pushOut(pos: THREE.Vector3, radius: number, colliders: Box[]): void {
  for (let pass = 0; pass < 2; pass++) {
    for (const b of colliders) {
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
export const glassMat = (tint = 0xb7d0e0): THREE.MeshPhysicalMaterial =>
  new THREE.MeshPhysicalMaterial({ color: tint, roughness: 0.08, metalness: 0.15, envMapIntensity: 1.6, clearcoat: 1, clearcoatRoughness: 0.05 });

// CC0 textures from assets/tex (credited in assets/CREDITS.md), tiled by
// world size so a brick is the same size on every wall.
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
 * Light concrete paving drawn on a canvas: large pale slabs with thin joints
 * and a little speckle, like the paving around Kambri. Generated, so there's
 * no asset to credit.
 */
let paving: THREE.CanvasTexture | null = null;
export function pavingMat(repeatX: number, repeatY: number, tint = 0xffffff): THREE.MeshStandardMaterial {
  if (!paving) {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#d9d5cd";
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) {
      const v = 200 + Math.floor(Math.random() * 30);
      ctx.fillStyle = `rgb(${v},${v - 3},${v - 8})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    ctx.strokeStyle = "#b9b4aa";
    ctx.lineWidth = 3;
    // Two rows of long slabs, offset like a running bond.
    ctx.strokeRect(0, 0, 256, 128);
    ctx.strokeRect(0, 128, 256, 128);
    ctx.beginPath();
    ctx.moveTo(128, 0);
    ctx.lineTo(128, 128);
    ctx.moveTo(0, 128);
    ctx.lineTo(0, 256);
    ctx.moveTo(256, 128);
    ctx.lineTo(256, 256);
    ctx.stroke();
    paving = new THREE.CanvasTexture(c);
    paving.colorSpace = THREE.SRGBColorSpace;
    paving.wrapS = paving.wrapT = THREE.RepeatWrapping;
    paving.anisotropy = 4;
  }
  const map = paving.clone();
  map.repeat.set(repeatX, repeatY);
  const m = new THREE.MeshStandardMaterial({ map, color: tint, roughness: 0.92 });
  m.userData.unique = true;
  return m;
}

/** A collision footprint with nothing drawn, for furniture drawn by a model. */
export function solid(colliders: Box[], w: number, d: number, x: number, z: number): void {
  colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
}

/** Places a model once it loads (it's drawn a moment later than the room). */
export function place(g: THREE.Group, file: string, height: number, x: number, z: number, rotY = 0): void {
  void loadModel(file, height).then((model) => {
    if (!model) return;
    const m = model.clone(true);
    m.position.set(x, 0, z);
    m.rotation.y = rotY;
    enableShadows(m);
    g.add(m);
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
  const size = (opts.font ?? 0.35) * scale;
  ctx.font = `700 ${size}px system-ui, sans-serif`;
  lines.forEach((line, i) => {
    ctx.fillText(line, canvas.width / 2, canvas.height / 2 + (i - (lines.length - 1) / 2) * size * 1.25);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
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
  const el = document.createElement("div");
  el.className = "door-label";
  el.textContent = label;
  const tag = new CSS2DObject(el);
  tag.position.set(0, 3.1, 0.2);
  d.add(tag);
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

const NOTE_COLORS = [0xfff07a, 0xffc6e0, 0xb9f0c8, 0xbfe1ff, 0xffd6a5];

/** A sticky note lying on the floor, its colour picked from the note id. */
export function buildNote(id: number): THREE.Group {
  const g = new THREE.Group();
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.02, 0.7), mat(NOTE_COLORS[id % NOTE_COLORS.length]!));
  paper.position.y = 0.02;
  // A slight curl at one corner so it reads as paper, not a tile.
  const curl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.2), mat(0xffffff));
  curl.position.set(0.25, 0.05, 0.25);
  curl.rotation.z = 0.4;
  g.add(paper, curl);
  g.rotation.y = ((id * 37) % 30) * (Math.PI / 180) - Math.PI / 12;
  return g;
}
