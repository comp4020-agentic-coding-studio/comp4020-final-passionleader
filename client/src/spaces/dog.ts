import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { solid, type Box } from "../world.ts";

// The dog in front of building 154 (Quaternius, CC0, credited in
// assets/CREDITS.md). It stands by the colonnade, mostly idling, now and then
// putting its head down as if sniffing for food. Press E beside it and it
// asks for a feed (main.ts handles that).

/** Where it stands: on the path, just clear of 154's hedges. */
export const DOG_SPOT = { x: 3.4, z: -9 };
/** About knee-high on a Kenney figure. */
const HEIGHT = 0.85;
const CLIP_PREFIX = /^.*\|/;

/** Adds the dog to `g`; returns the per-frame update for its animation. */
// Someone pressed "Buy me a feed": the dog jumps for joy a few times. Set by
// dogHappy(), read by the dog's tick (there's only ever one dog).
let happyFor = 0;
/** The dog jumps for joy for a couple of seconds (its barks are played by the caller). */
export function dogHappy(): void {
  happyFor = 2.4;
}

export function addDog(g: THREE.Group, colliders: Box[]): (dt: number) => void {
  let mixer: THREE.AnimationMixer | null = null;
  let actions = new Map<string, THREE.AnimationAction>();
  let current: THREE.AnimationAction | undefined;
  let nextSwitch = 6;

  new GLTFLoader()
    .loadAsync(`${import.meta.env.BASE_URL}assets/animals/dog.glb`)
    .then((gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      model.scale.setScalar(HEIGHT / (box.max.y - box.min.y));
      model.traverse((o) => {
        o.castShadow = true;
      });
      model.position.set(DOG_SPOT.x, 0, DOG_SPOT.z);
      // Facing the path (west), so it looks at whoever walks past.
      model.rotation.y = -Math.PI / 2;
      g.add(model);
      mixer = new THREE.AnimationMixer(model);
      actions = new Map(gltf.animations.map((clip) => [clip.name.replace(CLIP_PREFIX, ""), mixer!.clipAction(clip)]));
      current = actions.get("Idle");
      current?.play();
    })
    .catch(() => {
      // No dog if the model can't load; the spot still works for E.
    });
  solid(colliders, 0.5, 0.9, DOG_SPOT.x, DOG_SPOT.z);

  return (dt) => {
    if (!mixer) return;
    mixer.update(dt);
    if (happyFor > 0) {
      const jump = actions.get("Jump_Loop");
      if (jump && current !== jump) {
        jump.reset().fadeIn(0.15).play();
        current?.fadeOut(0.15);
        current = jump;
      }
      happyFor -= dt;
      // Back to standing once the joy runs out.
      if (happyFor <= 0) nextSwitch = 0;
      return;
    }
    nextSwitch -= dt;
    if (nextSwitch > 0) return;
    // Mostly idle; every so often a few seconds of sniffing.
    const sniff = current === actions.get("Idle");
    // After jumping, stand first rather than going straight to sniffing.
    if (current !== actions.get("Idle") && current !== actions.get("Idle_Eating")) {
      const idle = actions.get("Idle");
      idle?.reset().fadeIn(0.3).play();
      current?.fadeOut(0.3);
      current = idle;
      nextSwitch = 6;
      return;
    }
    const to = actions.get(sniff ? "Idle_Eating" : "Idle");
    if (to && to !== current) {
      to.reset().fadeIn(0.4).play();
      current?.fadeOut(0.4);
      current = to;
    }
    nextSwitch = sniff ? 3.3 : 6 + Math.random() * 6;
  };
}
