import * as THREE from "three";
import { mat, place, solid, textPlane, type Box } from "../world.ts";
import { markOccluderGroup } from "./occluders.ts";
import { cafeTable } from "./streetscape.ts";

// Lab Coffee, on 154's ground floor: nearly all of its north side and the
// very north end of its west side, a mirrored L. A timber-and-glass shopfront
// with its name over it, a counter with a coffee machine behind the glass,
// and a terrace of café tables on the paving north of the building. The menu
// board by the door opens the list of cafés on campus (cafeguide.ts).

/** 154's ground-floor glass (buildings.ts: the colonnade's 2.2 m inset). */
const NORTH_Z = -17.8;
const WEST_X = 8.2;
/** Where the shopfront runs: x 8.2..23 along the north, z -17.8..-13 down the west. */
const NORTH_TO_X = 23;
const WEST_TO_Z = -13;

/** The menu board, on the terrace by the north door (E here; keep notes off it). */
export const CAFE_MENU = { x: 12, z: -21.4 };

export function buildLabCoffee(space: THREE.Group, colliders: Box[]): void {
  // The shop itself sits inside 154's footprint and, like 154, fades when it
  // comes between the camera and you; the terrace outside never does.
  const g = new THREE.Group();
  space.add(g);
  const timber = mat(0x9a6a3c);
  const dark = mat(0x2a2420);
  const warm = new THREE.MeshStandardMaterial({ color: 0xffe2b0, emissive: 0xffc070, emissiveIntensity: 0.35, transparent: true, opacity: 0.55 });

  // The shopfront: warm-lit glass a hand's width proud of 154's, timber
  // mullions every 1.6 m, and a fascia carrying the name.
  const front = (len: number, cx: number, cz: number, rotY: number): void => {
    const f = new THREE.Group();
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(len, 3), warm);
    glass.position.y = 1.5;
    f.add(glass);
    for (let t = -len / 2; t <= len / 2 + 0.01; t += 1.6) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3, 0.1), timber);
      m.position.set(t, 1.5, 0.05);
      f.add(m);
    }
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(len + 0.2, 0.6, 0.14), dark);
    fascia.position.set(0, 3.3, 0.07);
    f.add(fascia);
    f.position.set(cx, 0, cz);
    f.rotation.y = rotY;
    g.add(f);
  };
  const northLen = NORTH_TO_X - WEST_X;
  front(northLen, (WEST_X + NORTH_TO_X) / 2, NORTH_Z - 0.05, Math.PI);
  const westLen = WEST_TO_Z - NORTH_Z;
  front(westLen, WEST_X - 0.05, (NORTH_Z + WEST_TO_Z) / 2, -Math.PI / 2);

  // The name, on the fascia and again round the corner, readable from the
  // terrace and from the path west of 154.
  const name = (w: number, x: number, z: number, rotY: number): void => {
    const s = textPlane(["LAB COFFEE"], w, 0.5, { bg: "#2a2420", fg: "#f3d9a4", font: 0.36 });
    s.position.set(x, 3.3, z);
    s.rotation.y = rotY;
    g.add(s);
  };
  name(5, (WEST_X + NORTH_TO_X) / 2, NORTH_Z - 0.2, Math.PI);
  name(4.2, WEST_X - 0.2, (NORTH_Z + WEST_TO_Z) / 2, -Math.PI / 2);
  // The camera looks north, so the north front is only ever seen from behind:
  // a blade sign hangs off the corner column, square to the path, readable
  // walking up from the south, with the terrace past it.
  const blade = textPlane(["LAB", "COFFEE", "☕ terrace →"], 1.2, 1.6, { bg: "#2a2420", fg: "#f3d9a4", font: 0.24 });
  blade.position.set(WEST_X - 1.4, 3.1, NORTH_Z + 0.6);
  g.add(blade);
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.06), dark);
  bracket.position.set(WEST_X - 1.4, 3.95, NORTH_Z + 0.6);
  g.add(bracket);

  // Behind the glass: the counter along the north window, a coffee machine
  // and stools along the west window (Kenney models, CC0).
  for (const x of [11, 12, 13]) place(g, "kitchenBar.glb", 0.95, x, NORTH_Z + 0.9, Math.PI);
  place(g, "kitchenCoffeeMachine.glb", 0.4, 12, NORTH_Z + 0.9, Math.PI, true, 0.95);
  for (const z of [-16.4, -15.2, -14]) place(g, "stoolBar.glb", 0.8, WEST_X + 0.7, z, Math.PI / 2);

  markOccluderGroup(space, g, new THREE.Box3(new THREE.Vector3(WEST_X - 2.2, 0, NORTH_Z - 2.2), new THREE.Vector3(26, 4.5, WEST_TO_Z + 2)));

  // The terrace: café tables in two rows on the paving north of 154, with
  // two umbrellas, and the menu board by the door.
  for (const x of [15, 18.5, 22]) {
    cafeTable(space, colliders, x, -22);
    cafeTable(space, colliders, x, -25);
  }
  for (const [x, z] of [
    [16.75, -23.5],
    [20.25, -23.5],
  ] as const) umbrella(space, x, z);
  menuBoard(space, colliders);
}

/** A market umbrella: a pole and a shallow cone of canvas. */
function umbrella(g: THREE.Group, x: number, z: number): void {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 8), mat(0x6b4a2b));
  pole.position.set(x, 1.2, z);
  const canvas = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.5, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xe9dcc0, side: THREE.DoubleSide }));
  canvas.position.set(x, 2.45, z);
  g.add(pole, canvas);
}

/** An A-frame chalk menu on the terrace, facing south (+z), the way the camera looks at it. */
function menuBoard(g: THREE.Group, colliders: Box[]): void {
  const { x, z } = CAFE_MENU;
  const b = new THREE.Group();
  const face = textPlane(["Lab Coffee", "☕ cafés on campus"], 1.1, 1.4, { bg: "#2f4a3a", fg: "#f2f0e6", font: 0.15 });
  face.position.set(0, 0.85, 0.12);
  face.rotation.x = -0.15;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.24, 1.54, 0.05), mat(0x8a5a32));
  frame.position.set(0, 0.85, 0.09);
  frame.rotation.x = -0.15;
  const back = frame.clone();
  back.position.z = -0.09;
  back.rotation.x = 0.15;
  b.add(frame, face, back);
  b.position.set(x, 0, z);
  g.add(b);
  solid(colliders, 1.3, 0.5, x, z);
}
