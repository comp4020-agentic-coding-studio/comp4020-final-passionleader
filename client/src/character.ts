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

import { CLOTH, DEFAULT_LOOK, HAIR, SKIN, type Look } from "./lookpicker.ts";

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
      // Shade relative to the part's lightest cell, so the gradient survives.
      const lum = (x: number, y: number): number => {
        const i = (y * base.width + x) * 4;
        return 0.299 * base.data[i]! + 0.587 * base.data[i + 1]! + 0.114 * base.data[i + 2]!;
      };
      const top = Math.max(...cells.map(([cx, cy]) => lum(cx * CELL + 16, cy * CELL + 16)), 1);
      const c = new THREE.Color(colours[part]);
      for (const [cx, cy] of cells) {
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
      const box = new THREE.Box3().setFromObject(scene);
      scene.scale.multiplyScalar(CHARACTER.height / (box.max.y - box.min.y));
      scene.rotation.y = CHARACTER.yaw;
      return { scene, clips: gltf.animations };
    })
    .catch(() => null);
  templates.set(v, template);
  return template;
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
// Six hats built from simple shapes and pinned to the head bone, in the hair
// colour's neighbourhood so they read as worn, not floating. Index 0 is none.

const HAT_COLOURS = [0, 0x8a2f2f, 0x2f5d8a, 0xc8b27a, 0x1f1f24, 0x6b3fa0, 0xe8e2d4];
function hatMesh(kind: number): THREE.Object3D | null {
  if (!kind) return null;
  const m = new THREE.MeshStandardMaterial({ color: HAT_COLOURS[kind] ?? 0x333333, roughness: 0.8 });
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
    case 2: // cap: a low dome and a peak at the front (+z)
      add(new THREE.SphereGeometry(0.58, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.4), -0.06);
      add(new THREE.BoxGeometry(0.62, 0.04, 0.42), -0.04, 0.6);
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
    this.hat = hatMesh(this.look.hat);
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
 * Figure B's hair is piled higher, so its hats sit higher.
 */
const HAT_Y: Record<Variant, number> = { "male-a": 0.82, "female-a": 0.94 };
/** Figure B is scaled down more to fit 1.7 m (its hair is taller), so its head, and hat, are narrower. */
const HAT_SIZE: Record<Variant, number> = { "male-a": 1, "female-a": 0.86 };

const target = new THREE.Quaternion();
const euler = new THREE.Euler();

/** Picks a motion from a horizontal speed in units per second. */
export const motionFor = (speed: number): Motion => (speed > 6 ? "run" : speed > 0.6 ? "walk" : "idle");

export { DEFAULT_LOOK };
