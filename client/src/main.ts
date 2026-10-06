import "./style.css";
import * as THREE from "three";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { playFart, startBgm } from "./audio.ts";
import { ApiError, getPoops, isValidName, join, postPoop, type Poop, type Session } from "./api.ts";
import {
  BOUND,
  addLights,
  buildPlayer,
  buildPoop,
  buildRoom,
  buildBathroom,
  pushOut,
} from "./world.ts";

const SPEED = 5; // world units per second
const LABEL_RANGE = 2; // show the owner's name within this distance of a poop
const PLAYER_RADIUS = 0.4;
// High enough to see over the 1.8-unit stall partitions.
const CAMERA_OFFSET = new THREE.Vector3(0, 6, 7);
const CAMERA_LIMIT = BOUND + 0.3;

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const stage = $("stage");
const joinDialog = $("join");
const joinForm = $<HTMLFormElement>("join-form");
const nameInput = $<HTMLInputElement>("name");
const joinError = $("join-error");
const enterBtn = $<HTMLButtonElement>("enter");
const hud = $("hud");
const hudName = $("hud-name");
const toastEl = $("toast");
const touch = $("touch");

// --- three.js setup --------------------------------------------------------

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd8c870);
addLights(scene);
scene.add(buildRoom());
void buildBathroom().then((bathroom) => scene.add(bathroom));

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
stage.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.style.cssText = "position:absolute;inset:0;pointer-events:none";
stage.appendChild(labelRenderer.domElement);

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
  camera.aspect = w / h;
  // Portrait screens would otherwise see a thin slice of the room: widen the vertical FOV.
  camera.fov = THREE.MathUtils.clamp(60 / camera.aspect ** 0.6, 60, 85);
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

const player = buildPlayer();
player.position.set(0, 0, 5);
scene.add(player);
camera.position.copy(player.position).add(CAMERA_OFFSET);

// --- poops -----------------------------------------------------------------

interface PoopView {
  group: THREE.Group;
  label: CSS2DObject;
}
const poops = new Map<string, PoopView>(); // keyed by lowercase owner name

function upsertPoop(p: Poop): void {
  const key = p.name.toLowerCase();
  let view = poops.get(key);
  if (!view) {
    const group = buildPoop();
    const el = document.createElement("div");
    el.className = "poop-label";
    const label = new CSS2DObject(el);
    label.position.set(0, 1.1, 0);
    label.visible = false;
    group.add(label);
    scene.add(group);
    view = { group, label };
    poops.set(key, view);
  }
  view.label.element.textContent = p.name;
  view.group.position.set(p.x, 0, p.z);
}

async function loadPoops(): Promise<void> {
  try {
    (await getPoops()).forEach(upsertPoop);
  } catch (err) {
    toast(err instanceof ApiError ? err.message : "Could not load poops.");
  }
}

// --- session / join --------------------------------------------------------

let session: Session | null = null;
let playing = false;

const storage = {
  get: (k: string): string => {
    try {
      return localStorage.getItem(k) ?? "";
    } catch {
      return "";
    }
  },
  set: (k: string, v: string): void => {
    try {
      localStorage.setItem(k, v);
    } catch {
      // Private mode: the user simply re-enters their name next time.
    }
  },
  remove: (k: string): void => {
    try {
      localStorage.removeItem(k);
    } catch {
      // ignore
    }
  },
};

nameInput.value = storage.get("poop.name");

function showJoin(message = ""): void {
  playing = false;
  joinError.textContent = message;
  joinDialog.hidden = false;
  hud.hidden = true;
  touch.hidden = true;
  nameInput.focus();
}

joinForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  if (!isValidName(name)) {
    joinError.textContent = "Use letters and underscore only, 1 to 8 characters.";
    return;
  }
  joinError.textContent = "";
  enterBtn.disabled = true;
  // Only reuse the stored token for the name it was issued to.
  const token = storage.get("poop.name").toLowerCase() === name.toLowerCase() ? storage.get("poop.token") : "";
  join(name, token || undefined)
    .then(async (s) => {
      session = s;
      storage.set("poop.name", s.name);
      storage.set("poop.token", s.token);
      await loadPoops();
      enterRoom();
    })
    .catch((err: unknown) => {
      joinError.textContent = err instanceof ApiError ? err.message : "Something went wrong.";
    })
    .finally(() => {
      enterBtn.disabled = false;
    });
});

function enterRoom(): void {
  if (!session) return;
  joinDialog.hidden = true;
  hud.hidden = false;
  touch.hidden = false;
  hudName.textContent = `You are ${session.name}`;
  playing = true;
  startBgm();
  // Move focus out of the form so keystrokes go to the game, not a hidden input.
  (document.activeElement as HTMLElement | null)?.blur();
  stage.focus();
}

let toastTimer = 0;
function toast(msg: string): void {
  toastEl.textContent = msg;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toastEl.textContent = ""), 2500);
}

// --- input -----------------------------------------------------------------

const dirs = { up: false, down: false, left: false, right: false };
const KEY_MAP: Record<string, keyof typeof dirs> = {
  KeyW: "up",
  ArrowUp: "up",
  KeyS: "down",
  ArrowDown: "down",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
};

window.addEventListener("keydown", (e) => {
  if (!playing) return;
  if (e.code === "Space") {
    e.preventDefault();
    if (!e.repeat) void poop();
    return;
  }
  const dir = KEY_MAP[e.code];
  if (dir) {
    e.preventDefault();
    dirs[dir] = true;
  }
});
window.addEventListener("keyup", (e) => {
  const dir = KEY_MAP[e.code];
  if (dir) dirs[dir] = false;
});
window.addEventListener("blur", () => {
  dirs.up = dirs.down = dirs.left = dirs.right = false;
});

// On-screen controls call the same functions as the keyboard.
for (const btn of touch.querySelectorAll<HTMLButtonElement>("[data-dir]")) {
  const dir = btn.dataset.dir as keyof typeof dirs;
  const release = (): void => {
    dirs[dir] = false;
  };
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    dirs[dir] = true;
  });
  btn.addEventListener("pointerup", release);
  btn.addEventListener("pointercancel", release);
  btn.addEventListener("pointerleave", release);
}
$("poop-btn").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (playing) void poop();
});

// --- actions ---------------------------------------------------------------

let pooping = false;
async function poop(): Promise<void> {
  if (!session || pooping) return;
  pooping = true;
  playFart();
  try {
    const saved = await postPoop(session.token, player.position.x, player.position.z);
    upsertPoop(saved);
    toast("You left your mark.");
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      storage.remove("poop.token");
      session = null;
      showJoin("Your session expired. Please enter your name again.");
    } else {
      toast(err instanceof ApiError ? err.message : "Could not save your poop.");
    }
  } finally {
    pooping = false;
  }
}

// --- game loop -------------------------------------------------------------

let lastTime = performance.now();
const move = new THREE.Vector3();
const lookTarget = new THREE.Vector3();

function update(dt: number): void {
  if (playing) {
    move.set(Number(dirs.right) - Number(dirs.left), 0, Number(dirs.down) - Number(dirs.up));
    if (move.lengthSq() > 0) {
      move.normalize();
      player.position.addScaledVector(move, SPEED * dt);
      player.rotation.y = Math.atan2(move.x, move.z); // model faces +z
    }
    pushOut(player.position, PLAYER_RADIUS);
    player.position.x = THREE.MathUtils.clamp(player.position.x, -BOUND, BOUND);
    player.position.z = THREE.MathUtils.clamp(player.position.z, -BOUND, BOUND);
  }

  // Third-person camera, smoothly following behind the player.
  const desired = player.position.clone().add(CAMERA_OFFSET);
  desired.x = THREE.MathUtils.clamp(desired.x, -CAMERA_LIMIT, CAMERA_LIMIT);
  desired.z = THREE.MathUtils.clamp(desired.z, -CAMERA_LIMIT, CAMERA_LIMIT);
  camera.position.lerp(desired, 1 - Math.exp(-8 * dt));
  lookTarget.copy(player.position);
  lookTarget.y += 1;
  camera.lookAt(lookTarget);

  for (const view of poops.values()) {
    const near = view.group.position.distanceTo(player.position) <= LABEL_RANGE;
    view.label.visible = near;
  }
}

renderer.setAnimationLoop(() => {
  const now = performance.now();
  update(Math.min((now - lastTime) / 1000, 0.1));
  lastTime = now;
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
});

showJoin();
