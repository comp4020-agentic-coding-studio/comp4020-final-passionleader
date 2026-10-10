import "./style.css";
import * as THREE from "three";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { playFart, startBgm } from "./audio.ts";
import { ApiError, getPoops, isValidName, join, postPoop, type Poop, type Session } from "./api.ts";
import { mountKeyGuide } from "./keyguide.ts";
import { connect, type RemotePlayer } from "./net.ts";
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
const JUMP_SPEED = 7; // initial upward speed, units per second
const GRAVITY = 20;
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
const noticeEl = $("notice");
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

// --- other players ---------------------------------------------------------

// Everyone else in the room, drawn from what the server broadcasts. Positions
// arrive ten times a second; each frame eases the figure toward the latest
// one, so movement looks continuous rather than stepping.
interface OtherView {
  group: THREE.Group;
  target: THREE.Vector3;
  rot: number;
}
const others = new Map<string, OtherView>();
let selfId = "";

function upsertOther(p: RemotePlayer): void {
  if (p.id === selfId) return;
  let view = others.get(p.id);
  if (!view) {
    const group = buildPlayer();
    const el = document.createElement("div");
    el.className = "player-label";
    el.textContent = p.name;
    const label = new CSS2DObject(el);
    label.position.set(0, 2.25, 0);
    group.add(label);
    group.position.set(p.x, p.y, p.z);
    scene.add(group);
    view = { group, target: new THREE.Vector3(), rot: p.rot };
    others.set(p.id, view);
  }
  view.target.set(p.x, p.y, p.z);
  view.rot = p.rot;
}

function removeOther(id: string): void {
  const view = others.get(id);
  if (!view) return;
  // CSS2D labels are DOM nodes: remove them too, or they linger on screen.
  view.group.traverse((o) => {
    if (o instanceof CSS2DObject) o.element.remove();
  });
  scene.remove(view.group);
  others.delete(id);
}

let net: ReturnType<typeof connect> | null = null;

function goOnline(token: string): void {
  net?.close();
  net = connect(token, {
    welcome(id, players) {
      selfId = id;
      for (const oid of [...others.keys()]) removeOther(oid);
      players.forEach(upsertOther);
    },
    players(players) {
      const present = new Set(players.map((p) => p.id));
      for (const id of [...others.keys()]) if (!present.has(id)) removeOther(id);
      players.forEach(upsertOther);
    },
    leave: removeOther,
    poop: upsertPoop,
    status(online) {
      if (session) hudName.textContent = online ? `You are ${session.name}` : `You are ${session.name} · reconnecting…`;
    },
  });
}

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
  keyGuide.hide();
  net?.close();
  net = null;
  for (const id of [...others.keys()]) removeOther(id);
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
  const spawn = session.spawn ?? { x: 0, z: 5 };
  player.position.set(spawn.x, 0, spawn.z);
  camera.position.copy(player.position).add(CAMERA_OFFSET);
  playing = true;
  keyGuide.show();
  goOnline(session.token);
  startBgm();
  // Move focus out of the form so keystrokes go to the game, not a hidden input.
  (document.activeElement as HTMLElement | null)?.blur();
  stage.focus();
}

// Big, centred and bold: for messages the player must not miss mid-movement.
let noticeTimer = 0;
function notice(msg: string): void {
  noticeEl.textContent = msg;
  noticeEl.hidden = false;
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => (noticeEl.hidden = true), 1500);
}

let toastTimer = 0;
function toast(msg: string): void {
  toastEl.textContent = msg;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toastEl.textContent = ""), 2500);
}

// --- input -----------------------------------------------------------------

const keyGuide = mountKeyGuide();
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
  keyGuide.press(e.code, true);
  if (e.code === "Space") {
    e.preventDefault();
    jump();
    return;
  }
  if (e.code === "KeyE") {
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
  keyGuide.press(e.code, false);
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
$("jump-btn").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (playing) jump();
});

// --- actions ---------------------------------------------------------------

let vy = 0;
function jump(): void {
  // Only from the floor: no double jumps.
  if (player.position.y > 0) return;
  vy = JUMP_SPEED;
}

// Mirrors the server's 5-second cooldown, so a mashed key gets a message
// instead of a fart and a rejected request.
const POOP_COOLDOWN_MS = 5000;
let lastPoopAt = 0;
let pooping = false;
async function poop(): Promise<void> {
  if (!session || pooping) return;
  const wait = lastPoopAt + POOP_COOLDOWN_MS - Date.now();
  if (wait > 0) {
    notice(`One poop every 5 seconds. Hold it in… ${Math.ceil(wait / 1000)}s`);
    return;
  }
  lastPoopAt = Date.now();
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
    vy -= GRAVITY * dt;
    player.position.y = Math.max(0, player.position.y + vy * dt);
    if (player.position.y === 0) vy = 0;
    pushOut(player.position, PLAYER_RADIUS);
    player.position.x = THREE.MathUtils.clamp(player.position.x, -BOUND, BOUND);
    player.position.z = THREE.MathUtils.clamp(player.position.z, -BOUND, BOUND);
    net?.sendMove({ x: player.position.x, y: player.position.y, z: player.position.z, rot: player.rotation.y });
  }

  const ease = 1 - Math.exp(-12 * dt);
  for (const view of others.values()) {
    view.group.position.lerp(view.target, ease);
    // Turn the short way round, not through a full spin.
    const d = Math.atan2(Math.sin(view.rot - view.group.rotation.y), Math.cos(view.rot - view.group.rotation.y));
    view.group.rotation.y += d * ease;
  }

  // Third-person camera, smoothly following behind the player.
  // Follows the player across the floor but not up a jump, so the view stays steady.
  const desired = player.position.clone().setY(0).add(CAMERA_OFFSET);
  desired.x = THREE.MathUtils.clamp(desired.x, -CAMERA_LIMIT, CAMERA_LIMIT);
  desired.z = THREE.MathUtils.clamp(desired.z, -CAMERA_LIMIT, CAMERA_LIMIT);
  camera.position.lerp(desired, 1 - Math.exp(-8 * dt));
  lookTarget.copy(player.position).setY(1);
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
