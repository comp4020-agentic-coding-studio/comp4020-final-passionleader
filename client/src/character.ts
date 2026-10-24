import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { buildPlayer } from "./world.ts";

// People: Kenney's "Mini Characters" (CC0, credited in assets/CREDITS.md),
// rigged, with idle, walk, sprint, sit and yes/no clips. Each figure's
// colours come from one small palette texture; a person's look (lookpicker.ts:
// a body and palette indexes for skin, hair, top and bottom, and a hat)
// repaints a copy of that texture, cell by cell, keeping each cell's shading.
// Until the model loads, or if it can't, a figure falls back to the old clay
// one so nobody is invisible.

import { CLOTH, DEFAULT_LOOK, HAIR, QA_HAT, SKIN, type Look } from "./lookpicker.ts";

export type { Look };
export type Motion = "idle" | "walk" | "run" | "sit";
export type Gesture = "yes" | "no";
/** Moves the pack has no clip for, posed from the bones each frame. */
export type Act = "wave" | "dance";
export type Variant = "male-a" | "female-a";

const VARIANTS: Variant[] = ["male-a", "female-a"];
export const variantOf = (look: Look): Variant => VARIANTS[look.body] ?? "male-a";

export const CHARACTER = {
  file: (v: Variant): string => `char/character-${v}.glb`,
  height: 1.7,
  /** Extra turn so the model faces +z like the rest of the game. */
  yaw: 0,
  clips: { idle: /^idle$/i, walk: /^walk$/i, run: /^sprint$/i, sit: /^sit$/i } as Record<Motion, RegExp>,
  gestures: { yes: /^emote-yes$/i, no: /^emote-no$/i } as Record<Gesture, RegExp>,
};

// Which 32-px cells of the 512-px palette paint which part, per body (read
// off the models' UVs). Cells are columns of four shades, light to dark.
type Part = "skin" | "hair" | "top" | "bottom";
const CELLS: Record<Variant, Record<Part, [number, number][]>> = {
  "male-a": {
    skin: [[13, 12], [13, 13], [13, 14], [13, 15]],
    hair: [[1, 12], [1, 13], [1, 14], [1, 15]],
    top: [[3, 8], [3, 9], [3, 10], [3, 11]],
    bottom: [[11, 9], [11, 10]],
  },
  "female-a": {
    skin: [[13, 12], [13, 13], [13, 14], [13, 15], [15, 13], [15, 14]],
    hair: [[1, 12], [1, 13], [1, 14], [1, 15]],
    top: [[15, 8], [15, 9], [15, 10], [15, 11]],
    bottom: [[11, 8], [11, 9], [11, 10], [11, 11]],
  },
};
const CELL = 32;

/** The palette image, once, as pixels to repaint from. */
let palette: Promise<ImageData | null> | null = null;
function paletteImage(): Promise<ImageData | null> {
  palette ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, c.width, c.height));
    };
    img.onerror = () => resolve(null);
    img.src = `${import.meta.env.BASE_URL}assets/char/Textures/colormap.png`;
  });
  return palette;
}

/** One texture per body and look, shared by everyone who looks the same. */
const skins = new Map<string, Promise<THREE.Texture | null>>();
function skinTexture(variant: Variant, look: Look): Promise<THREE.Texture | null> {
  const key = `${variant}:${look.skin}:${look.hair}:${look.top}:${look.bottom}`;
  let t = skins.get(key);
  if (t) return t;
  t = paletteImage().then((base) => {
    if (!base) return null;
    const data = new ImageData(new Uint8ClampedArray(base.data), base.width, base.height);
    const colours: Record<Part, number> = { skin: SKIN[look.skin]!, hair: HAIR[look.hair]!, top: CLOTH[look.top]!, bottom: CLOTH[look.bottom]! };
    for (const part of Object.keys(colours) as Part[]) {
      const cells = CELLS[variant][part];
      // Shade relative to the lightest cell in the same column, so the
      // gradient survives. Per column, not per part: Figure B's legs are a
      // much lighter skin column than her face, and measured against the
      // legs her face came out brown whatever skin was picked.
      const lum = (x: number, y: number): number => {
        const i = (y * base.width + x) * 4;
        return 0.299 * base.data[i]! + 0.587 * base.data[i + 1]! + 0.114 * base.data[i + 2]!;
      };
      const tops = new Map<number, number>();
      for (const [cx, cy] of cells) tops.set(cx, Math.max(tops.get(cx) ?? 1, lum(cx * CELL + 16, cy * CELL + 16)));
      const c = new THREE.Color(colours[part]);
      for (const [cx, cy] of cells) {
        const top = tops.get(cx)!;
        for (let y = cy * CELL; y < (cy + 1) * CELL; y++) {
          for (let x = cx * CELL; x < (cx + 1) * CELL; x++) {
            const k = Math.min(1.15, lum(x, y) / top);
            const i = (y * base.width + x) * 4;
            data.data[i] = Math.round(c.r * 255 * k);
            data.data[i + 1] = Math.round(c.g * 255 * k);
            data.data[i + 2] = Math.round(c.b * 255 * k);
          }
        }
      }
    }
    const canvas = document.createElement("canvas");
    canvas.width = base.width;
    canvas.height = base.height;
    canvas.getContext("2d")!.putImageData(data, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false; // glTF's convention
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    return tex;
  });
  skins.set(key, t);
  return t;
}

interface Template {
  scene: THREE.Object3D;
  clips: THREE.AnimationClip[];
}
const templates = new Map<Variant, Promise<Template | null>>();

function loadTemplate(v: Variant): Promise<Template | null> {
  let template = templates.get(v);
  if (template) return template;
  template = new GLTFLoader()
    .loadAsync(`${import.meta.env.BASE_URL}assets/${CHARACTER.file(v)}`)
    .then((gltf) => {
      const scene = gltf.scene;
      if (v === "female-a") dropProp(scene);
      keepFaceDark(scene);
      const box = new THREE.Box3().setFromObject(scene);
      scene.scale.multiplyScalar(CHARACTER.height / (box.max.y - box.min.y));
      scene.rotation.y = CHARACTER.yaw;
      return { scene, clips: gltf.animations };
    })
    .catch(() => null);
  templates.set(v, template);
  return template;
}

/**
 * Figure B's arm mesh carries a prop: a long blue-and-grey bar (palette
 * columns 7 and 11) held out past her hands, which reads as a rifle. Not on
 * a campus. Its triangles are folded to nothing (every corner moved onto the
 * shoulder), leaving her hands and sleeves as they are.
 */
function dropProp(scene: THREE.Object3D): void {
  scene.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    const uv = mesh.geometry.getAttribute("uv");
    const pos = mesh.geometry.getAttribute("position");
    const joints = mesh.geometry.getAttribute("skinIndex");
    if (!uv || !pos || !joints) return;
    const arms = new Set(mesh.skeleton.bones.flatMap((b, i) => (/^arm-/.test(b.name) ? [i] : [])));
    for (let i = 0; i < uv.count; i++) {
      const col = Math.floor(uv.getX(i) * 16);
      if (arms.has(joints.getX(i)) && (col === 7 || col === 11)) pos.setXYZ(i, Math.sign(pos.getX(i)) * 0.1, 0.3, 0);
    }
    pos.needsUpdate = true;
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  });
}

/**
 * The eyes and mouth are painted from the hair's palette cells, so recolouring
 * the hair recoloured them too: white hair gave white eyes, and black hair on
 * dark skin hid them. Their vertices (the same rule on both bodies: hair
 * column, rows 12-14, on the flat face plane at z ~0.16, below the fringe) now
 * sample a dark cell no look repaints. Each eye and the mouth also get a thin
 * light rim: a copy of their triangles, a little bigger around their centre
 * and just behind them, so they read on dark skin too.
 */
const FACE_DARK_UV: [number, number] = [0.5 / 16, 13.5 / 16]; // cell (0,13), dark grey
const FACE_RIM_UV: [number, number] = [12.5 / 16, 8.5 / 16]; // cell (12,8), off-white
/** How much bigger the light rim is than its eye or mouth: a thin line, not a halo (1.35 looked thick once all of it showed). */
const RIM_GROW = 1.12;

function keepFaceDark(scene: THREE.Object3D): void {
  scene.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || mesh.name !== "head-mesh") return;
    const geo = mesh.geometry;
    const uv = geo.getAttribute("uv");
    const pos = geo.getAttribute("position");
    const index = geo.getIndex();
    if (!uv || !pos || !index) return;
    const face = new Set<number>();
    for (let i = 0; i < uv.count; i++) {
      const col = Math.floor(uv.getX(i) * 16);
      const row = Math.floor(uv.getY(i) * 16);
      const z = pos.getZ(i);
      if (col === 1 && row >= 12 && row <= 14 && z >= 0.155 && z <= 0.165 && pos.getY(i) < 0.52) face.add(i);
    }
    if (face.size === 0) return;
    // The eyes sat exactly on the skin's plane (z 0.160), and the rim 3 mm behind them,
    // i.e. behind the skin: only its corners peeked out. Lift the features 4 mm and the
    // rim 2 mm, both in front of the skin, so the rim shows all the way round.
    for (const i of face) {
      uv.setXY(i, ...FACE_DARK_UV);
      pos.setZ(i, pos.getZ(i) + 0.004);
    }
    pos.needsUpdate = true;
    uv.needsUpdate = true;

    // Group the face triangles into features (two eyes, a mouth) by shared corners.
    const tris: number[][] = [];
    for (let t = 0; t < index.count; t += 3) {
      const tri = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
      if (tri.every((i) => face.has(i))) tris.push(tri);
    }
    const group = new Map<number, number>();
    const find = (i: number): number => {
      while (group.has(i) && group.get(i) !== i) i = group.get(i)!;
      return i;
    };
    for (const tri of tris) for (const i of tri) if (!group.has(i)) group.set(i, i);
    for (const [a, b, c] of tris) {
      group.set(find(b), find(a));
      group.set(find(c), find(a));
    }
    const centre = new Map<number, THREE.Vector3>();
    const count = new Map<number, number>();
    for (const i of face) {
      const g = find(i);
      centre.set(g, (centre.get(g) ?? new THREE.Vector3()).add(new THREE.Vector3(pos.getX(i), pos.getY(i), 0)));
      count.set(g, (count.get(g) ?? 0) + 1);
    }
    for (const [g, c] of centre) c.divideScalar(count.get(g)!);

    // The rim: every face vertex copied, grown a little (RIM_GROW) out from its feature's
    // centre and set 2 mm behind the (lifted) feature, same bones and weights, so it moves with the head.
    const extra = new Map<number, number>();
    const attrs = Object.entries(geo.attributes) as [string, THREE.BufferAttribute][];
    const grown = new Map<string, number[]>(attrs.map(([name, a]) => [name, Array.from(a.array as ArrayLike<number>)]));
    for (const i of face) {
      const n = pos.count + extra.size;
      extra.set(i, n);
      for (const [name, a] of attrs) {
        const arr = grown.get(name)!;
        for (let k = 0; k < a.itemSize; k++) arr.push(a.getComponent(i, k));
        if (name === "position") {
          const c = centre.get(find(i))!;
          arr[n * 3] = c.x + (pos.getX(i) - c.x) * RIM_GROW;
          arr[n * 3 + 1] = c.y + (pos.getY(i) - c.y) * RIM_GROW;
          arr[n * 3 + 2] = pos.getZ(i) - 0.002;
        } else if (name === "uv") {
          arr[n * 2] = FACE_RIM_UV[0];
          arr[n * 2 + 1] = FACE_RIM_UV[1];
        }
      }
    }
    for (const [name, a] of attrs) {
      const Ctor = (a.array as Float32Array).constructor as new (xs: number[]) => THREE.TypedArray;
      geo.setAttribute(name, new THREE.BufferAttribute(new Ctor(grown.get(name)!), a.itemSize, a.normalized));
    }
    const indices = Array.from(index.array as ArrayLike<number>);
    for (const tri of tris) indices.push(...tri.map((i) => extra.get(i)!));
    geo.setIndex(indices);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
  });
}

/** Starts loading every body and the palette, so your own figure is ready by the time you've picked a name. */
export function preloadCharacters(): void {
  for (const v of VARIANTS) void loadTemplate(v);
  void paletteImage();
}

/** Before someone has picked a look: a stable one from their name, so everyone sees the same person. */
export function defaultLookFor(name: string): Look {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) | 0;
  h = Math.abs(h);
  return { ...DEFAULT_LOOK, body: (h % 2) as 0 | 1, skin: (h >> 1) % SKIN.length, hair: (h >> 4) % HAIR.length, top: (h >> 8) % CLOTH.length };
}

/** Puts the look's texture on every mesh of a model (each figure gets its own material). */
function dress(model: THREE.Object3D, variant: Variant, look: Look): void {
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const own = (mesh.material as THREE.MeshStandardMaterial).clone();
    mesh.material = own;
    void skinTexture(variant, look).then((tex) => {
      if (!tex) return;
      own.map = tex;
      own.needsUpdate = true;
    });
  });
}

// --- hats -----------------------------------------------------------------------
// Hats built from simple shapes and pinned to the head bone, painted in one
// of the hair colours you pick (lookpicker.ts). Index 0 is none; the hard
// hat (QA_HAT, test accounts only) is always safety yellow.

const HARD_HAT_YELLOW = 0xf2c230;
function hatMesh(kind: number, colour: number): THREE.Object3D | null {
  if (!kind) return null;
  const hard = kind === QA_HAT;
  const m = new THREE.MeshStandardMaterial({ color: hard ? HARD_HAT_YELLOW : (HAIR[colour] ?? 0x333333), roughness: hard ? 0.45 : 0.8 });
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, y: number, z = 0, rx = 0): void => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(0, y, z);
    mesh.rotation.x = rx;
    mesh.castShadow = true;
    g.add(mesh);
  };
  // Sizes in metres for the figures' big blocky heads (about 1.15 m wide and
  // 0.85 m deep at the top); y = 0 is the top of the head.
  switch (kind) {
    case 1: // beanie: a dome over the crown with a folded band
      add(new THREE.SphereGeometry(0.56, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), -0.12);
      add(new THREE.CylinderGeometry(0.6, 0.6, 0.16, 20), -0.1);
      break;
    case 2: // cap: a dome down to the brow and a peak joined to its front rim (+z)
      add(new THREE.SphereGeometry(0.6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), -0.12);
      add(new THREE.BoxGeometry(0.72, 0.05, 0.5), -0.11, 0.68, 0.12);
      break;
    case 3: // bucket hat
      add(new THREE.CylinderGeometry(0.46, 0.56, 0.3, 20), 0.06);
      add(new THREE.CylinderGeometry(0.82, 0.82, 0.04, 24), -0.08);
      break;
    case 4: // graduation cap: a skullcap and the flat board
      add(new THREE.CylinderGeometry(0.55, 0.58, 0.2, 20), -0.02);
      add(new THREE.BoxGeometry(1.15, 0.05, 1.15), 0.12);
      break;
    case 5: // beret: a flat round cushion, tipped to one side
      add(new THREE.CylinderGeometry(0.68, 0.56, 0.16, 24), 0.0, 0, 0.12);
      break;
    case 6: // helmet: a deeper dome down over the sides
      add(new THREE.SphereGeometry(0.66, 22, 12, 0, Math.PI * 2, 0, Math.PI / 1.8), -0.2);
      break;
    case QA_HAT: // hard hat: a high dome, a ridge over the top, and a brim all round, longer in front
      add(new THREE.SphereGeometry(0.6, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), -0.1);
      add(new THREE.BoxGeometry(0.14, 0.1, 0.9), 0.45); // the ridge, sitting on the dome's crown
      add(new THREE.CylinderGeometry(0.76, 0.76, 0.04, 26), -0.1, 0.08);
      break;
  }
  return g;
}

export class Avatar {
  readonly group = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<Motion, THREE.AnimationAction>();
  private gestures = new Map<Gesture, THREE.AnimationAction>();
  private motion: Motion = "idle";
  private fallback: THREE.Group;
  private model: THREE.Object3D | null = null;
  private bones: Partial<Record<"armL" | "armR" | "torso" | "head", THREE.Object3D>> = {};
  private act: { kind: Act; until: number; t: number } | null = null;

  private look: Look;
  private hat: THREE.Object3D | null = null;
  private loading = 0;

  constructor(look: Look) {
    this.look = look;
    this.fallback = buildPlayer();
    this.group.add(this.fallback);
    this.build();
  }

  /** Changes how the figure looks: a new body reloads the model, colours and hat swap in place. */
  setLook(look: Look): void {
    const before = this.look;
    this.look = look;
    if (!this.model || look.body !== before.body) return this.build();
    dress(this.model, variantOf(look), look);
    this.putHat();
  }

  private build(): void {
    const variant = variantOf(this.look);
    const ticket = ++this.loading;
    void loadTemplate(variant).then((t) => {
      // A newer look asked for another body meanwhile: that one wins.
      if (!t || ticket !== this.loading) return;
      const model = cloneSkinned(t.scene);
      dress(model, variant, this.look);
      if (this.model) this.group.remove(this.model);
      else this.group.remove(this.fallback);
      this.group.add(model);
      this.model = model;
      this.bones = {
        armL: model.getObjectByName("arm-left"),
        armR: model.getObjectByName("arm-right"),
        torso: model.getObjectByName("torso"),
        head: model.getObjectByName("head"),
      };
      this.mixer = new THREE.AnimationMixer(model);
      this.actions.clear();
      this.gestures.clear();
      for (const motion of ["idle", "walk", "run", "sit"] as Motion[]) {
        const clip = t.clips.find((c) => CHARACTER.clips[motion].test(c.name));
        if (clip) this.actions.set(motion, this.mixer.clipAction(clip));
      }
      for (const g of ["yes", "no"] as Gesture[]) {
        const clip = t.clips.find((c) => CHARACTER.gestures[g].test(c.name));
        if (!clip) continue;
        const action = this.mixer.clipAction(clip);
        action.setLoop(THREE.LoopRepeat, 2);
        action.clampWhenFinished = false;
        this.gestures.set(g, action);
      }
      this.actions.get(this.motion)?.play();
      this.putHat();
    });
  }

  /** The hat goes on the head bone, so it nods and dances with the head. */
  private putHat(): void {
    if (this.hat) this.hat.removeFromParent();
    this.hat = hatMesh(this.look.hat, this.look.hatColour);
    const head = this.bones.head;
    if (!this.hat || !head) return;
    // The bone is scaled with the model: undo that so a hat is the same size on everyone.
    const s = new THREE.Vector3();
    head.getWorldScale(s);
    this.hat.scale.setScalar(HAT_SIZE[variantOf(this.look)] / (s.x || 1));
    this.hat.position.y = HAT_Y[variantOf(this.look)] / (s.y || 1);
    head.add(this.hat);
  }

  /** Blends to idle, walk or run over a fifth of a second. */
  setMotion(next: Motion): void {
    if (next === this.motion) return;
    const from = this.actions.get(this.motion);
    const to = this.actions.get(next);
    this.motion = next;
    if (!to) return;
    to.reset().fadeIn(0.2).play();
    from?.fadeOut(0.2);
  }

  /** Plays a nod or a head shake over whatever the legs are doing. */
  gesture(g: Gesture): void {
    const a = this.gestures.get(g);
    if (!a) return;
    a.reset().setEffectiveWeight(1).fadeIn(0.1).play();
    const base = this.actions.get(this.motion);
    base?.fadeOut(0.1);
    const back = (): void => {
      a.fadeOut(0.2);
      this.actions.get(this.motion)?.reset().fadeIn(0.2).play();
      this.mixer?.removeEventListener("finished", back);
    };
    this.mixer?.addEventListener("finished", back);
  }

  /** Waves for a couple of seconds, or dances for a few. */
  perform(kind: Act): void {
    this.act = { kind, until: performance.now() + (kind === "wave" ? 2200 : 4000), t: 0 };
  }

  update(dt: number): void {
    this.mixer?.update(dt);
    // Acts are laid over whatever the clips just posed.
    const act = this.act;
    if (!act || !this.model) return;
    if (performance.now() > act.until) {
      this.act = null;
      this.model.position.y = 0;
      return;
    }
    act.t += dt;
    // Ease in and out over a fifth of a second instead of snapping.
    const k = Math.min(1, act.t / 0.2, (act.until - performance.now()) / 200);
    const { armL, armR, torso, head } = this.bones;
    const pose = (bone: THREE.Object3D | undefined, x: number, y: number, z: number): void => {
      if (!bone) return;
      bone.quaternion.slerp(target.setFromEuler(euler.set(x, y, z)), k);
    };
    // The rig's arms rest pointing straight out (a T-pose along ±x), so a
    // quarter turn about z lifts an arm straight up.
    if (act.kind === "wave") {
      // Right arm up beside the head, hand swinging side to side.
      pose(armR, 0, 0, -1.25 + Math.sin(act.t * 12) * 0.3);
      pose(head, 0, 0, Math.sin(act.t * 6) * 0.08);
    } else {
      // Arms up and pumping in turn, hips swaying, a little bounce.
      const beat = act.t * 9;
      pose(armL, 0, 0, 1.2 + Math.sin(beat) * 0.45);
      pose(armR, 0, 0, -1.2 + Math.sin(beat + Math.PI) * 0.45);
      pose(torso, 0, Math.sin(beat / 2) * 0.35, Math.sin(beat) * 0.18);
      pose(head, 0, 0, Math.sin(beat + 1) * 0.15);
      this.model.position.y = Math.abs(Math.sin(beat)) * 0.08 * k;
    }
  }
}

/**
 * How far above the head bone the top of each body's head is, in metres
 * (head-mesh top minus the bone, in model units, times the scale to 1.7 m).
 * Both crowns are 0.328 model units up; Figure B's bun rises higher, but at
 * the back, so her hats sit on her crown in front of it, not on the bun.
 */
const HAT_Y: Record<Variant, number> = { "male-a": 0.82, "female-a": 0.72 };
/** Figure B is scaled down more to fit 1.7 m (its hair is taller), so its head, and hat, are narrower. */
const HAT_SIZE: Record<Variant, number> = { "male-a": 1, "female-a": 0.86 };

const target = new THREE.Quaternion();
const euler = new THREE.Euler();

/** Picks a motion from a horizontal speed in units per second. */
export const motionFor = (speed: number): Motion => (speed > 6 ? "run" : speed > 0.6 ? "walk" : "idle");

export { DEFAULT_LOOK };
