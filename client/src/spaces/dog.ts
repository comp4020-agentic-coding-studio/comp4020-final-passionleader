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
    nextSwitch -= dt;
    if (nextSwitch > 0) return;
    // Mostly idle; every so often a few seconds of sniffing.
    const sniff = current === actions.get("Idle");
    const to = actions.get(sniff ? "Idle_Eating" : "Idle");
    if (to && to !== current) {
      to.reset().fadeIn(0.4).play();
      current?.fadeOut(0.4);
      current = to;
    }
    nextSwitch = sniff ? 3.3 : 6 + Math.random() * 6;
  };
}
