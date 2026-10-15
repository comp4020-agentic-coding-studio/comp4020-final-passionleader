import * as THREE from "three";
import { block, doorway, place, solid, texMat, textPlane, type Box, type SpaceDef } from "../world.ts";
import { LIBRARY_TEAM_DOORS, roomDoors } from "./meeting.ts";
import { roomShell } from "./room.ts";

// Inside Chifley Library. You come in through the north wall (the front
// door at the end of the bridge). In the middle, the reception desk with
// the search computers beside it; bookcases to the north on either side of
// the door; study desks across the south half (Kenney furniture, CC0); team
// rooms off the side walls (meeting.ts), open to anyone, six at most.
// Simplified, not surveyed. The computers open the library's own sites:
// room booking and the catalogue in a window over the game (the window's
// "open in new tab" button is there if a site won't show inside it), the
// research ethics system straight in a new tab.

const HALF = { halfX: 16, halfZ: 11 };
/** The door, on the north wall (the back wall, facing the camera). */
const DOOR = { x: 0, z: -HALF.halfZ + 1.1 };

export function buildLibrary(): SpaceDef {
  const g = new THREE.Group();
  const colliders: Box[] = [];
  roomShell(g, colliders, HALF.halfX, HALF.halfZ, texMat("ai/wood_floor.jpg", 13, 9), 0xf1ece2);

  const sign = textPlane(["Chifley Library", "an unofficial, fan-made space"], 7, 1.2, { bg: "#5b3a24", fg: "#ffffff", font: 0.4 });
  sign.position.set(0, 3.4, -HALF.halfZ + 0.01);
  g.add(sign);
  doorway(g, 0, -HALF.halfZ + 0.05, 0, "Exit to campus");

  // The middle: reception, and the search computers on a desk beside it.
  block(g, colliders, [4, 1.1, 1.2], [-3, 0], 0x7a4e2e);
  const reception = textPlane(["Reception"], 2.4, 0.5, { bg: "#7a4e2e", fg: "#ffffff", font: 0.32 });
  reception.position.set(-3, 1.75, 0.61);
  g.add(reception);
  block(g, colliders, [6, 0.9, 1], [4, 0], 0x8a6a50);
  for (const [i, label] of ["Book a room", "Catalogue", "Research ethics"].entries()) {
    const x = 2 + i * 2;
    place(g, "computerScreen.glb", 0.45, x, -0.1, Math.PI, true, 0.9);
    const tag = textPlane([label], 1.7, 0.36, { bg: "#1f2d3d", fg: "#ffffff", font: 0.2 });
    tag.position.set(x, 1.75, 0.51);
    g.add(tag);
  }

  // North, either side of the door: rows of bookcases, all facing the room.
  for (const z of [-8, -5]) {
    for (const x of [-14, -11.5, -9, -6.5, 6.5, 9, 11.5, 14]) place(g, "bookcaseClosedWide.glb", 1.9, x, z);
    solid(colliders, 9.6, 0.7, -10.25, z);
    solid(colliders, 9.6, 0.7, 10.25, z);
  }

  // South: study desks in rows, a chair at each.
  for (const z of [4, 6.8, 9.4]) {
    for (const x of [-12, -8, -4, 4, 8, 12]) {
      place(g, "desk.glb", 0.75, x, z, Math.PI);
      place(g, "chairDesk.glb", 1, x, z + 0.8, Math.PI);
      solid(colliders, 2, 0.8, x, z);
    }
  }
  LIBRARY_TEAM_DOORS.forEach((d, i) => doorway(g, d.x + Math.sign(d.x) * 1.05, d.z, -Math.sign(d.x) * (Math.PI / 2), `Team room ${i + 1}`));

  for (const [x, z] of [
    [-15, -10],
    [15, -10],
  ] as const) {
    place(g, "pottedPlant.glb", 1.3, x, z);
    solid(colliders, 0.7, 0.7, x, z);
  }

  return {
    id: "library",
    title: "Chifley Library",
    group: g,
    colliders,
    doors: [
      { ...DOOR, label: "Go outside", to: "outdoor", arrive: { x: -2, z: 22.4 } },
      ...roomDoors("team-library", LIBRARY_TEAM_DOORS, (n) => `Enter team room ${n}`),
    ],
    ...HALF,
    background: 0xe2dccf,
    camera: new THREE.Vector3(0, 7, 8.5),
    bgm: ["Sunlight_on_Glass.mp3"],
    // Each computer works from either side of its desk.
    links: [-1.2, 1.2].flatMap((z) => [
      { x: 2, z, label: "Book a library room", url: "https://anu.libcal.com/", embeddable: true },
      { x: 4, z, label: "Search the library catalogue", url: "https://anulib.anu.edu.au/", embeddable: true },
      {
        x: 6,
        z,
        label: "Research ethics system (new tab)",
        url: "https://services.anu.edu.au/information-technology/software-systems/research-ethics-management-system",
        embeddable: false,
      },
    ]),
  };
}
