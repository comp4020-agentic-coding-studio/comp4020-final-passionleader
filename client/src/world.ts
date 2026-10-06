import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export const BOUND = 10; // playable floor is x,z in [-BOUND, BOUND]
const WALL = BOUND + 0.5;
const WALL_HEIGHT = 4;

// Yellowish ("nurikkuri") bathroom palette.
const FLOOR_COLOR = 0xd9c86a;
const WALL_COLOR = 0xc9b556;

export const TOILET_POS = new THREE.Vector3(0, 0, -(BOUND - 0.4));
export const TOILET_RADIUS = 1.2;

/** Flat, uniform, bright light: no shadows, no direction. */
export function addLights(scene: THREE.Scene): void {
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  scene.add(new THREE.HemisphereLight(0xffffff, 0xfff2b0, 1.0));
}

export function buildRoom(): THREE.Group {
  const room = new THREE.Group();

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(WALL * 2, WALL * 2),
    new THREE.MeshLambertMaterial({ color: FLOOR_COLOR }),
  );
  floor.rotation.x = -Math.PI / 2;
  room.add(floor);

  // Checker tiles drawn as thin darker squares keep the floor readable while moving.
  const tileMat = new THREE.MeshLambertMaterial({ color: 0xcdbb55 });
  const tileGeo = new THREE.PlaneGeometry(2, 2);
  for (let i = -5; i < 5; i++) {
    for (let j = -5; j < 5; j++) {
      if ((i + j) % 2 === 0) continue;
      const tile = new THREE.Mesh(tileGeo, tileMat);
      tile.rotation.x = -Math.PI / 2;
      tile.position.set(i * 2 + 1, 0.01, j * 2 + 1);
      room.add(tile);
    }
  }

  const wallMat = new THREE.MeshLambertMaterial({ color: WALL_COLOR, side: THREE.DoubleSide });
  const wallGeo = new THREE.PlaneGeometry(WALL * 2, WALL_HEIGHT);
  const walls: Array<[number, number, number]> = [
    [0, -WALL, 0], // back
    [0, WALL, Math.PI], // front
    [-WALL, 0, Math.PI / 2], // left
    [WALL, 0, -Math.PI / 2], // right
  ];
  for (const [x, z, rotY] of walls) {
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(x, WALL_HEIGHT / 2, z);
    wall.rotation.y = rotY;
    room.add(wall);
  }
  return room;
}

function primitiveToilet(): THREE.Group {
  const white = new THREE.MeshLambertMaterial({ color: 0xf6f6f0 });
  const g = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.45, 0.6, 24), white);
  bowl.position.y = 0.3;
  const tank = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.4), white);
  tank.position.set(0, 0.8, -0.55);
  g.add(bowl, tank);
  return g;
}

/** Loads the CC0 Kenney toilet; falls back to a primitive one if the load fails. */
export async function buildToilet(): Promise<THREE.Object3D> {
  let model: THREE.Object3D;
  try {
    const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/toilet.glb`);
    model = gltf.scene;
    model.scale.setScalar(3);
  } catch {
    model = primitiveToilet();
  }
  model.position.copy(TOILET_POS);
  return model;
}

const CLAY = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 1, metalness: 0 });

/** Plain white clay humanoid: capsule body, sphere head, stub arms and legs. */
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
  const right = left.clone();
  right.position.x = 0.46;
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

const POOP_MAT = new THREE.MeshLambertMaterial({ color: 0x6b3f1d });

/** Soft-serve swirl: three stacked tori and a cone on top. */
export function buildPoop(): THREE.Group {
  const g = new THREE.Group();
  const radii = [0.34, 0.26, 0.18];
  radii.forEach((r, i) => {
    const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.12, 12, 24), POOP_MAT);
    t.rotation.x = Math.PI / 2;
    t.position.y = 0.12 + i * 0.17;
    g.add(t);
  });
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 16), POOP_MAT);
  tip.position.y = 0.12 + 3 * 0.17 + 0.05;
  g.add(tip);
  return g;
}
