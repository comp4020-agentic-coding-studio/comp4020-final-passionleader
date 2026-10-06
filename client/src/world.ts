import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export const BOUND = 10; // playable floor is x,z in [-BOUND, BOUND]
const WALL = BOUND + 0.5;
const WALL_HEIGHT = 4;

// Yellowish ("nurikkuri") bathroom palette.
const FLOOR_COLOR = 0xd9c86a;
const WALL_COLOR = 0xc9b556;

/** Axis-aligned footprint on the floor plane, used for simple player collision. */
export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
export const colliders: Box[] = [];

/** Pushes a circle (the player) out of every collider. Two passes settle corners. */
export function pushOut(pos: THREE.Vector3, radius: number): void {
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

const boxFrom = (o: THREE.Object3D, pad = 0): Box => {
  o.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(o);
  return { minX: b.min.x - pad, maxX: b.max.x + pad, minZ: b.min.z - pad, maxZ: b.max.z + pad };
};

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
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.28, 0.45, 20), white);
  bowl.position.set(0, 0.22, 0.1);
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.22), white);
  tank.position.set(0, 0.6, -0.3);
  g.add(bowl, tank);
  return g;
}

function primitiveSink(): THREE.Group {
  const white = new THREE.MeshLambertMaterial({ color: 0xf6f6f0 });
  const g = new THREE.Group();
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.25, 0.2, 20), white);
  basin.position.y = 0.9;
  g.add(basin);
  return g;
}

/**
 * Loads a GLB and normalises it: scaled to a target height or width, centred on
 * x/z with its base at y=0, wrapped in a group so callers can rotate/place it.
 * Returns null when the file cannot be loaded (callers fall back to primitives).
 */
async function loadNormalized(file: string, target: { height?: number; width?: number }): Promise<THREE.Group | null> {
  try {
    const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/${file}`);
    const model = gltf.scene;
    model.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    model.scale.setScalar(target.height ? target.height / size.y : (target.width ?? 1) / size.x);
    model.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(model);
    const c = box.getCenter(new THREE.Vector3());
    model.position.set(-c.x, -box.min.y, -c.z);
    const g = new THREE.Group();
    g.add(model);
    return g;
  } catch {
    return null;
  }
}

// --- public bathroom layout -------------------------------------------------
// Two rows of five open stalls (no doors) run along the left and right walls,
// each opening toward the middle of the room. Sinks stand against the back wall.

const STALLS_PER_ROW = 5;
const STALL_WIDTH = 3.2; // along z
const STALL_DEPTH = 3; // from the side wall toward the room centre
const PARTITION_HEIGHT = 1.8;
const PARTITION_THICKNESS = 0.12;
const ROW_HALF = (STALLS_PER_ROW * STALL_WIDTH) / 2; // 8: stalls span z in [-8, 8]
const SINK_COUNT = 3;
const SINK_SPACING = 3;

const PARTITION_MAT = new THREE.MeshLambertMaterial({ color: 0xe9e2bf });

function buildPartitions(): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(STALL_DEPTH, PARTITION_HEIGHT, PARTITION_THICKNESS);
  for (const side of [-1, 1]) {
    for (let i = 0; i <= STALLS_PER_ROW; i++) {
      const m = new THREE.Mesh(geo, PARTITION_MAT);
      m.position.set(side * (BOUND - STALL_DEPTH / 2), PARTITION_HEIGHT / 2, -ROW_HALF + i * STALL_WIDTH);
      g.add(m);
      colliders.push(boxFrom(m));
    }
  }
  return g;
}

/** Partitions, ten toilets and the sinks. Adds colliders as a side effect. */
export async function buildBathroom(): Promise<THREE.Group> {
  const root = new THREE.Group();
  root.add(buildPartitions());

  const [toiletModel, sinkModel] = await Promise.all([
    loadNormalized("toilet.glb", { height: 1.1 }),
    loadNormalized("bathroomSink.glb", { width: 0.9 }),
  ]);

  for (const side of [-1, 1]) {
    for (let i = 0; i < STALLS_PER_ROW; i++) {
      const toilet = new THREE.Group();
      toilet.add((toiletModel ?? primitiveToilet()).clone(true));
      // The model faces +z; turn it to face the room centre, then back it onto the wall.
      toilet.rotation.y = side === -1 ? Math.PI / 2 : -Math.PI / 2;
      toilet.position.set(side * (BOUND - 0.6), 0, -ROW_HALF + (i + 0.5) * STALL_WIDTH);
      root.add(toilet);
      colliders.push(boxFrom(toilet, 0.05));
    }
  }

  for (let i = 0; i < SINK_COUNT; i++) {
    const sink = new THREE.Group();
    const basin = (sinkModel ?? primitiveSink()).clone(true);
    basin.position.y = 0.85;
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.2, 0.85, 16),
      new THREE.MeshLambertMaterial({ color: 0xf6f6f0 }),
    );
    pedestal.position.y = 0.425;
    sink.add(basin, pedestal);
    sink.position.set((i - (SINK_COUNT - 1) / 2) * SINK_SPACING, 0, -(BOUND - 0.45));
    root.add(sink);
    colliders.push(boxFrom(sink, 0.1));
  }
  return root;
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
