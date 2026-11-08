import * as THREE from "three";

// Light rain (Medium and High, outdoors, when the weather is rain): a few hundred thin streaks in a
// box that follows the player, falling and leaning a little with the wind. Drawn as plain lines in
// one draw call, no textures; it costs next to nothing and is off on Low and with Reduce motion.

const DROPS = 650;
const BOX_X = 36;
const BOX_Z = 36;
const BOX_Y = 20;
/** The box sits a little toward the camera (south), since the camera looks north over the player's shoulder. */
const BOX_SHIFT_Z = 6;
const FALL = 17;
const LENGTH = 0.9;

export interface Rain {
  group: THREE.Group;
  /** Moves the rain with `at` and advances it; `wind` in km/h leans it. Does nothing while hidden. */
  update(dt: number, at: THREE.Vector3, wind: number): void;
  setVisible(on: boolean): void;
}

export function makeRain(): Rain {
  const group = new THREE.Group();
  group.visible = false;
  const pos = new Float32Array(DROPS * 6);
  const home = new Float32Array(DROPS * 3);
  for (let i = 0; i < DROPS; i++) {
    home[i * 3] = (Math.random() - 0.5) * BOX_X;
    home[i * 3 + 1] = Math.random() * BOX_Y;
    home[i * 3 + 2] = (Math.random() - 0.5) * BOX_Z + BOX_SHIFT_Z;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const material = new THREE.LineBasicMaterial({ color: 0xcdd8e6, transparent: true, opacity: 0.38, fog: false, depthWrite: false });
  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;
  lines.renderOrder = 5;
  group.add(lines);

  return {
    group,
    setVisible(on) {
      group.visible = on;
    },
    update(dt, at, wind) {
      if (!group.visible) return;
      group.position.set(at.x, 0, at.z);
      const lean = Math.min(wind, 60) / 60; // 0..1: how hard the wind slants and carries the rain
      for (let i = 0; i < DROPS; i++) {
        let y = home[i * 3 + 1]! - FALL * dt;
        if (y < 0) y += BOX_Y;
        home[i * 3 + 1] = y;
        // Blown along +x with the wind, wrapping round the box.
        let x = home[i * 3]! + lean * 7 * dt;
        if (x > BOX_X / 2) x -= BOX_X;
        home[i * 3] = x;
        const z = home[i * 3 + 2]!;
        const o = i * 6;
        pos[o] = x;
        pos[o + 1] = y;
        pos[o + 2] = z;
        pos[o + 3] = x - lean * LENGTH * 0.6; // the tail trails back, up and upwind
        pos[o + 4] = y + LENGTH;
        pos[o + 5] = z;
      }
      (geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    },
  };
}
