import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { buildPlayer } from "./world.ts";

// People: Kenney's "Mini Characters" (CC0, credited in assets/CREDITS.md),
// rigged, with idle, walk, sprint and yes/no clips. Each figure has hair,
// eyes and clothes painted on one shared texture atlas, so for now a "look"
// is one of the pack's ready-made variants; true per-part colours need the
// atlas repainted per region, which is where customisation will plug in.
// Until the model loads, or if it can't, a figure falls back to the old clay
// one so nobody is invisible.

export type Motion = "idle" | "walk" | "run";
export type Gesture = "yes" | "no";
export type Variant = "male-a" | "female-a";

/** Colours per body part. Customisation will replace this per person later. */
export interface Look {
  skin: number;
  hair: number;
  eyes: number;
  top: number;
  bottom: number;
  shoes: number;
}

export const DEFAULT_LOOK: Look = {
  skin: 0xe0b694,
  hair: 0x3b2a1e,
  eyes: 0x2b2b2b,
  top: 0x2f5d8a,
  bottom: 0x3a3f4a,
  shoes: 0xf2f2f2,
};

// Filled in once the model is chosen: the file, the height to scale it to,
// and which clip and material names mean what.
export const CHARACTER = {
  file: (v: Variant): string => `char/character-${v}.glb`,
  height: 1.7,
  /** Extra turn so the model faces +z like the rest of the game. */
  yaw: 0,
  clips: { idle: /^idle$/i, walk: /^walk$/i, run: /^sprint$/i } as Record<Motion, RegExp>,
  gestures: { yes: /^emote-yes$/i, no: /^emote-no$/i } as Record<Gesture, RegExp>,
  // The atlas has no per-part materials; recolouring waits for customisation.
  recolour: false,
  parts: {
    skin: /skin|body|head|face/i,
    hair: /hair/i,
    eyes: /eye/i,
    top: /shirt|top|torso|jacket|cloth/i,
    bottom: /pant|trouser|leg|short|skirt/i,
    shoes: /shoe|boot|feet|foot/i,
  } as Record<keyof Look, RegExp>,
};

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

/** A stable variant per name, so everyone sees the same person for the same name. */
export function variantFor(name: string): Variant {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h) % 2 === 0 ? "male-a" : "female-a";
}

function recolour(root: THREE.Object3D, look: Look): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (!CHARACTER.recolour) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const recoloured = list.map((m) => {
      const name = `${m.name} ${mesh.name}`;
      const part = (Object.keys(CHARACTER.parts) as (keyof Look)[]).find((k) => CHARACTER.parts[k].test(name));
      if (!part) return m;
      const copy = (m as THREE.MeshStandardMaterial).clone();
      copy.color?.setHex(look[part]);
      return copy;
    });
    mesh.material = Array.isArray(mesh.material) ? recoloured : recoloured[0]!;
  });
}

export class Avatar {
  readonly group = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<Motion, THREE.AnimationAction>();
  private gestures = new Map<Gesture, THREE.AnimationAction>();
  private motion: Motion = "idle";
  private fallback: THREE.Group;

  constructor(variant: Variant, look: Look = DEFAULT_LOOK) {
    this.fallback = buildPlayer();
    this.group.add(this.fallback);
    void loadTemplate(variant).then((t) => {
      if (!t) return;
      const model = cloneSkinned(t.scene);
      recolour(model, look);
      this.group.remove(this.fallback);
      this.group.add(model);
      this.mixer = new THREE.AnimationMixer(model);
      for (const motion of ["idle", "walk", "run"] as Motion[]) {
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
    });
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

  update(dt: number): void {
    this.mixer?.update(dt);
  }
}

/** Picks a motion from a horizontal speed in units per second. */
export const motionFor = (speed: number): Motion => (speed > 6 ? "run" : speed > 0.6 ? "walk" : "idle");
