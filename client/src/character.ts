import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { buildPlayer } from "./world.ts";

// People: a rigged, animated character model (CC0, credited in
// assets/CREDITS.md) with idle, walk and run clips, and a default look
// (skin, hair, eyes, clothes) set by recolouring its materials, which is
// where customisation will plug in later. Until the model loads, or if it
// can't, a figure falls back to the old clay one so nobody is invisible.

export type Motion = "idle" | "walk" | "run";

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
  file: "char/character.glb",
  height: 1.75,
  /** Extra turn so the model faces +z like the rest of the game. */
  yaw: 0,
  clips: { idle: /idle/i, walk: /walk/i, run: /run/i } as Record<Motion, RegExp>,
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
let template: Promise<Template | null> | null = null;

function loadTemplate(): Promise<Template | null> {
  template ??= new GLTFLoader()
    .loadAsync(`${import.meta.env.BASE_URL}assets/${CHARACTER.file}`)
    .then((gltf) => {
      const scene = gltf.scene;
      const box = new THREE.Box3().setFromObject(scene);
      scene.scale.multiplyScalar(CHARACTER.height / (box.max.y - box.min.y));
      scene.rotation.y = CHARACTER.yaw;
      return { scene, clips: gltf.animations };
    })
    .catch(() => null);
  return template;
}

function recolour(root: THREE.Object3D, look: Look): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
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
  private motion: Motion = "idle";
  private fallback: THREE.Group;

  constructor(look: Look = DEFAULT_LOOK) {
    this.fallback = buildPlayer();
    this.group.add(this.fallback);
    void loadTemplate().then((t) => {
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

  update(dt: number): void {
    this.mixer?.update(dt);
  }
}

/** Picks a motion from a horizontal speed in units per second. */
export const motionFor = (speed: number): Motion => (speed > 6 ? "run" : speed > 0.6 ? "walk" : "idle");
