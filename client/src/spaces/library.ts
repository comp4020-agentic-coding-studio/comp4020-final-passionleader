import * as THREE from "three";
import { block, doorway, place, solid, texMat, textPlane, type Box, type SpaceDef } from "../world.ts";
import { roomShell } from "./room.ts";

// Inside Chifley Library, through its front door at the end of the bridge:
// a reception desk by the door, a catalogue desk with three screens, rows
// of bookcases down the middle and reading tables along the walls (Kenney
// furniture, CC0). Simplified, not surveyed. The catalogue desk's screens
// open the library's own sites: room booking in a window over the game, and
// the catalogue and the research ethics system in a new tab, because those
// two refuse to be shown inside another page.

const HALF = { halfX: 16, halfZ: 11 };

export function buildLibrary(): SpaceDef {
  const g = new THREE.Group();
  const colliders: Box[] = [];
  roomShell(g, colliders, HALF.halfX, HALF.halfZ, texMat("ai/wood_floor.jpg", 13, 9), 0xf1ece2);

  const sign = textPlane(["Chifley Library", "an unofficial, fan-made space"], 8, 1.4, { bg: "#5b3a24", fg: "#ffffff", font: 0.45 });
  sign.position.set(0, 3.1, -HALF.halfZ + 0.01);
  g.add(sign);

  // Reception, just inside the door (front left).
  block(g, colliders, [4, 1.1, 1.1], [-11, 6], 0x7a4e2e);
  const reception = textPlane(["Reception"], 2.4, 0.5, { bg: "#7a4e2e", fg: "#ffffff", font: 0.32 });
  reception.position.set(-11, 1.6, 6.56);
  g.add(reception);

  // The catalogue desk: three screens, each one a site.
  block(g, colliders, [6, 0.9, 1], [8, -8.6], 0x8a6a50);
  for (const [i, label] of ["Book a room", "Catalogue", "Research ethics"].entries()) {
    const x = 6 + i * 2;
    place(g, "computerScreen.glb", 0.45, x, -8.7, 0, true, 0.9);
    const tag = textPlane([label], 1.7, 0.36, { bg: "#1f2d3d", fg: "#ffffff", font: 0.2 });
    tag.position.set(x, 1.75, -9.05);
    g.add(tag);
  }

  // Rows of bookcases down the middle, aisles between them.
  for (const z of [-4, 0, 4]) {
    for (const x of [-6, -3.5, 2.5, 5]) {
      place(g, "bookcaseClosedWide.glb", 1.9, x, z);
      place(g, "bookcaseClosedWide.glb", 1.9, x, z + 0.55, Math.PI);
    }
    solid(colliders, 4.6, 1.2, -4.75, z + 0.27);
    solid(colliders, 4.6, 1.2, 3.75, z + 0.27);
  }

  // Reading tables along the west wall.
  for (const z of [-8, -3, 2]) {
    place(g, "desk.glb", 0.75, -13.5, z, Math.PI / 2);
    place(g, "chairDesk.glb", 1, -12.6, z, -Math.PI / 2);
    solid(colliders, 1, 2, -13.5, z);
  }
  for (const [x, z] of [
    [-15, -10],
    [15, -10],
    [15, 9.8],
  ] as const) {
    place(g, "pottedPlant.glb", 1.3, x, z);
    solid(colliders, 0.7, 0.7, x, z);
  }

  doorway(g, -HALF.halfX + 0.05, 8, Math.PI / 2, "Exit to campus");

  return {
    id: "library",
    title: "Chifley Library",
    group: g,
    colliders,
    doors: [{ x: -HALF.halfX + 1.1, z: 8, label: "Go outside", to: "outdoor", arrive: { x: -2, z: 22.4 } }],
    ...HALF,
    background: 0xe2dccf,
    camera: new THREE.Vector3(0, 7, 8.5),
    bgm: ["Sunlight_on_Glass.mp3"],
    links: [
      { x: 6, z: -7.6, label: "Book a library room", url: "https://anu.libcal.com/", embeddable: true },
      { x: 8, z: -7.6, label: "Search the library catalogue (new tab)", url: "https://anulib.anu.edu.au/", embeddable: false },
      {
        x: 10,
        z: -7.6,
        label: "Research ethics system (new tab)",
        url: "https://services.anu.edu.au/information-technology/software-systems/research-ethics-management-system",
        embeddable: false,
      },
    ],
  };
}
