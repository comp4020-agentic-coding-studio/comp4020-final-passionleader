import "./style.css";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { playTrack } from "./audio.ts";
import { Avatar, motionFor, variantFor } from "./character.ts";
import {
  ApiError,
  RESERVED_RE,
  deleteComment,
  deleteNote,
  getComments,
  getNotes,
  isValidName,
  join,
  myNoteCount,
  postComment,
  postNote,
  type Comment,
  type Note,
  type Session,
} from "./api.ts";
import { mountChat } from "./chatui.ts";
import { mountKeyGuide } from "./keyguide.ts";
import { connect, type Emote, type Net, type RemotePlayer } from "./net.ts";
import { mountNoteComposer } from "./notecompose.ts";
import { mountNotePanel, type CommentView } from "./notepanel.ts";
import { mountRadial } from "./radial.ts";
import { getSpace, isSpaceId } from "./spaces/index.ts";
import { occludersOf } from "./spaces/occluders.ts";
import { SUN_DIR, addLights, buildNote, enableShadows, pushOut, type Door, type SpaceDef, type SpaceId } from "./world.ts";

const SPEED = 4.2; // walking, world units per second
const RUN_SPEED = 8; // with Shift held
const JUMP_SPEED = 7;
const GRAVITY = 20;
const PLAYER_RADIUS = 0.4;
const DOOR_RANGE = 1.6; // how close you must be for E to open a door
const NOTE_RANGE = 1.3; // ...or to read a note
const NOTE_LABEL_RANGE = 3; // a note shows its author's name within this

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const stage = $("stage");
const joinDialog = $("join");
const joinForm = $<HTMLFormElement>("join-form");
const nameInput = $<HTMLInputElement>("name");
const passwordRow = $("password-row");
const passwordInput = $<HTMLInputElement>("password");
const joinError = $("join-error");
const enterBtn = $<HTMLButtonElement>("enter");
const hud = $("hud");
const hudName = $("hud-name");
const toastEl = $("toast");
const hintEl = $("hint");
const touch = $("touch");

// --- three.js setup --------------------------------------------------------

// Phones get the same scene without shadows, and at a lower pixel ratio.
const touchScreen = window.matchMedia("(pointer: coarse), (max-width: 700px)");
const highQuality = !touchScreen.matches;

const scene = new THREE.Scene();
const sun = addLights(scene, highQuality);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 3000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, highQuality ? 2 : 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
renderer.shadowMap.enabled = highQuality;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

// Lighting for reflections: outdoors it's the sky itself, indoors a neutral
// room. Both are prefiltered once.
const pmrem = new THREE.PMREMGenerator(renderer);
const sky = new Sky();
sky.scale.setScalar(2000);
const skyU = sky.material.uniforms;
skyU.turbidity!.value = 3.5;
skyU.rayleigh!.value = 1.4;
skyU.mieCoefficient!.value = 0.004;
skyU.mieDirectionalG!.value = 0.8;
skyU.sunPosition!.value.copy(SUN_DIR);
const skyScene = new THREE.Scene();
skyScene.add(sky.clone());
const outdoorEnv = pmrem.fromScene(skyScene).texture;
const indoorEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// A photographed sky (Poly Haven, CC0) replaces the procedural one once it
// loads: it's both the backdrop and the light reflected in the glass.
let outdoorSky: THREE.Texture | null = null;
let outdoorLight = outdoorEnv;
new RGBELoader().load(`${import.meta.env.BASE_URL}assets/sky/autumn_field_puresky_1k.hdr`, (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  outdoorSky = hdr;
  outdoorLight = pmrem.fromEquirectangular(hdr).texture;
  if (space?.outdoor) applySky();
});
function applySky(): void {
  if (outdoorSky) {
    scene.remove(sky);
    scene.background = outdoorSky;
    scene.backgroundIntensity = 0.9;
  } else {
    scene.add(sky);
    scene.background = null;
  }
  scene.environment = outdoorLight;
}

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.style.cssText = "position:absolute;inset:0;pointer-events:none";
stage.appendChild(labelRenderer.domElement);

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
  camera.aspect = w / h;
  // Portrait screens would otherwise see a thin slice of the space: widen the vertical FOV.
  camera.fov = THREE.MathUtils.clamp(60 / camera.aspect ** 0.6, 60, 85);
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

let me = new Avatar("male-a");
let player = me.group;
scene.add(player);

/** Swaps in this visitor's own figure once we know their name. */
function becomeAvatar(name: string): void {
  const next = new Avatar(variantFor(name));
  next.group.position.copy(player.position);
  next.group.rotation.copy(player.rotation);
  scene.remove(player);
  me = next;
  player = next.group;
  scene.add(player);
}

/** A label floating over a figure; `kind` picks the CSS look. */
function tag(group: THREE.Object3D, text: string, y: number, kind: string): CSS2DObject {
  const el = document.createElement("div");
  el.className = kind;
  el.textContent = text;
  const obj = new CSS2DObject(el);
  obj.position.set(0, y, 0);
  group.add(obj);
  return obj;
}

const removeTags = (group: THREE.Object3D): void =>
  group.traverse((o) => {
    if (o instanceof CSS2DObject) o.element.remove();
  });

// Speech bubbles (chat and emotes) sit above a figure for a few seconds.
const bubbles = new WeakMap<THREE.Object3D, { obj: CSS2DObject; timer: number }>();
function speak(group: THREE.Object3D, text: string, ms: number): void {
  const old = bubbles.get(group);
  if (old) {
    window.clearTimeout(old.timer);
    old.obj.element.remove();
    group.remove(old.obj);
  }
  const obj = tag(group, text, 2.75, "bubble");
  const timer = window.setTimeout(() => {
    obj.element.remove();
    group.remove(obj);
    bubbles.delete(group);
  }, ms);
  bubbles.set(group, { obj, timer });
}

// --- other people ----------------------------------------------------------

// Everyone else in this space, drawn from what the server broadcasts.
// Positions arrive ten times a second; each frame eases the figure toward the
// latest one, so movement looks continuous rather than stepping.
interface OtherView {
  avatar: Avatar;
  group: THREE.Group;
  target: THREE.Vector3;
  rot: number;
  danceUntil: number;
  /** Smoothed ground speed, to pick idle / walk / run for the animation. */
  speed: number;
}
const others = new Map<string, OtherView>();
let selfId = "";
let selfDanceUntil = 0;
let space: SpaceDef | null = null;

function upsertOther(p: RemotePlayer): void {
  if (p.id === selfId || p.space !== space?.id) return;
  let view = others.get(p.id);
  if (!view) {
    const avatar = new Avatar(variantFor(p.name));
    const group = avatar.group;
    tag(group, p.name, 2.2, "player-label");
    group.position.set(p.x, p.y, p.z);
    scene.add(group);
    view = { avatar, group, target: new THREE.Vector3(), rot: p.rot, danceUntil: 0, speed: 0 };
    others.set(p.id, view);
  }
  view.target.set(p.x, p.y, p.z);
  view.rot = p.rot;
}

function removeOther(id: string): void {
  const view = others.get(id);
  if (!view) return;
  // CSS2D labels are DOM nodes: remove them too, or they linger on screen.
  removeTags(view.group);
  scene.remove(view.group);
  others.delete(id);
}

const figureOf = (id: string): THREE.Object3D | undefined => (id === selfId ? player : others.get(id)?.group);

const EMOTE_TEXT: Record<Emote, string> = {
  wave: "👋",
  yes: "👍 Yes",
  no: "👎 No",
  mate: "How ya doing, mate?",
  dance: "💃",
};

function showEmote(id: string, kind: Emote): void {
  const figure = figureOf(id);
  if (!figure) return;
  speak(figure, EMOTE_TEXT[kind], 3000);
  const avatar = id === selfId ? me : others.get(id)?.avatar;
  if (kind === "yes" || kind === "no") avatar?.gesture(kind);
  if (kind === "dance") {
    const until = performance.now() + 3000;
    if (id === selfId) selfDanceUntil = until;
    else others.get(id)!.danceUntil = until;
  }
}

// --- sticky notes ----------------------------------------------------------

interface NoteViewState {
  note: Note;
  group: THREE.Group;
  label: CSS2DObject;
}
const notes = new Map<number, NoteViewState>();
// Bumped on every space change, so a slow note list for the old space is dropped.
let noteRequest = 0;

const noteLabel = (n: Note): string => `${n.author}'s note${n.comments ? ` · ${n.comments} 💬` : ""}`;

function upsertNote(n: Note): void {
  if (n.space !== space?.id) return;
  let view = notes.get(n.id);
  if (!view) {
    const group = buildNote(n.id);
    group.position.set(n.x, 0, n.z);
    const label = tag(group, "", 0.6, "note-label");
    label.visible = false;
    scene.add(group);
    view = { note: n, group, label };
    notes.set(n.id, view);
  }
  view.note = n;
  view.label.element.textContent = noteLabel(n);
}

function removeNote(id: number): void {
  const view = notes.get(id);
  if (!view) return;
  removeTags(view.group);
  scene.remove(view.group);
  notes.delete(id);
  if (panel.openNoteId() === id) panel.close();
}

async function loadNotes(id: SpaceId): Promise<void> {
  const ticket = noteRequest;
  try {
    const list = await getNotes(id);
    if (ticket === noteRequest) list.forEach(upsertNote);
  } catch (err) {
    toast(err instanceof ApiError ? err.message : "Could not load notes.");
  }
}

let session: Session | null = null;

const mine = (author: string): boolean =>
  !!session && (session.role === "admin" || session.name.toLowerCase() === author.toLowerCase());

const commentViews = (list: Comment[]): CommentView[] => list.map((c) => ({ ...c, canDelete: mine(c.author) }));

async function refreshComments(noteId: number): Promise<void> {
  const list = await getComments(noteId);
  panel.setComments(noteId, commentViews(list));
  const view = notes.get(noteId);
  if (view) upsertNote({ ...view.note, comments: list.length });
}

// Errors reach the dialogs as rejected promises; they show the message.
const asError = (err: unknown): Error => new Error(err instanceof ApiError ? err.message : "Something went wrong.");

const panel = mountNotePanel({
  async onComment(noteId, text) {
    if (!session) return;
    try {
      await postComment(session.token, noteId, text);
      await refreshComments(noteId);
    } catch (err) {
      throw asError(err);
    }
  },
  async onDeleteNote(noteId) {
    if (!session) return;
    try {
      await deleteNote(session.token, noteId);
      removeNote(noteId);
      toast("Note removed.");
    } catch (err) {
      throw asError(err);
    }
  },
  async onDeleteComment(noteId, commentId) {
    if (!session) return;
    try {
      await deleteComment(session.token, commentId);
      await refreshComments(noteId);
    } catch (err) {
      throw asError(err);
    }
  },
});

const composer = mountNoteComposer(async (text) => {
  if (!session || !space) return;
  try {
    const { note, replaced } = await postNote(session.token, space.id, player.position.x, player.position.z, text);
    if (replaced !== null) removeNote(replaced);
    upsertNote(note);
    toast(replaced !== null ? "Note stuck. Your oldest note here was removed." : "Note stuck.");
  } catch (err) {
    throw asError(err);
  }
});

// --- chat and the Q menu ---------------------------------------------------

let net: Net | null = null;
const chat = mountChat({ onSend: (text) => net?.chat(text), maxLength: 200 });

const radial = mountRadial(
  [
    // Numbered, because keys 1–6 pick them while Q is held.
    { id: "note", label: "1 · 📝 Sticky note" },
    { id: "wave", label: "2 · 👋 Wave" },
    { id: "yes", label: "3 · 👍 Yes" },
    { id: "no", label: "4 · 👎 No" },
    { id: "mate", label: "5 · How ya doing, mate?" },
    { id: "dance", label: "6 · 💃 Dance" },
  ],
  (id) => {
    if (id === "note") void writeNote();
    else net?.emote(id as Emote);
    stage.focus();
  },
);

const busy = (): boolean => chat.isTyping() || panel.isOpen() || composer.isOpen();
const keyGuide = mountKeyGuide();

// --- the current space -----------------------------------------------------

let playing = false;
let vy = 0;

function setSpace(id: SpaceId, at: { x: number; z: number }, tell: boolean): void {
  if (space) {
    scene.remove(space.group);
    // The label renderer only updates what's in the scene, so the old space's
    // door labels would linger; it re-attaches them when we come back.
    removeTags(space.group);
  }
  for (const nid of [...notes.keys()]) removeNote(nid);
  for (const oid of [...others.keys()]) removeOther(oid);
  noteRequest++;

  space = getSpace(id);
  if (!space.group.userData.shadowsOn) {
    enableShadows(space.group);
    space.group.userData.shadowsOn = true;
  }
  scene.add(space.group);
  if (space.outdoor) {
    applySky();
    scene.fog = new THREE.Fog(0xc9dcea, 60, 220);
  } else {
    scene.remove(sky);
    scene.background = new THREE.Color(space.background);
    scene.environment = indoorEnv;
    scene.fog = null;
  }
  player.position.set(at.x, 0, at.z);
  vy = 0;
  camera.position.copy(player.position).add(space.camera);
  if (session) hudName.textContent = `You are ${session.name} · ${space.title}`;
  // Sound only after joining: the Enter click is the gesture browsers require.
  if (playing) playTrack(space.bgm);
  if (tell) net?.enter(id, at.x, at.z);
  void loadNotes(id);
}

async function openNote(id: number): Promise<void> {
  const view = notes.get(id);
  if (!view) return;
  stopMoving();
  try {
    const list = await getComments(id);
    panel.open({ ...view.note, canDelete: mine(view.note.author) }, commentViews(list));
  } catch (err) {
    toast(err instanceof ApiError ? err.message : "Could not open that note.");
  }
}

async function writeNote(): Promise<void> {
  if (!session || !space) return;
  stopMoving();
  try {
    const { count, limit } = await myNoteCount(session.token, space.id);
    composer.open(count >= limit ? `You already have ${limit} notes here. Sticking this one removes your oldest.` : undefined);
  } catch (err) {
    toast(err instanceof ApiError ? err.message : "Could not start a note.");
  }
}

// --- session / join --------------------------------------------------------

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
};

nameInput.value = storage.get("campus.name");
const syncPasswordRow = (): void => {
  passwordRow.hidden = !RESERVED_RE.test(nameInput.value.trim());
};
nameInput.addEventListener("input", syncPasswordRow);
syncPasswordRow();

function showJoin(message = ""): void {
  playing = false;
  keyGuide.hide();
  chat.hide();
  net?.close();
  net = null;
  for (const id of [...others.keys()]) removeOther(id);
  joinError.textContent = message;
  joinDialog.hidden = false;
  hud.hidden = true;
  touch.hidden = true;
  hintEl.hidden = true;
  nameInput.focus();
}

joinForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  if (!isValidName(name)) {
    joinError.textContent = "Use letters, digits and underscore only, 1 to 8 characters.";
    return;
  }
  const reserved = RESERVED_RE.test(name);
  if (reserved && !passwordInput.value) {
    joinError.textContent = "This account needs its password.";
    return;
  }
  joinError.textContent = "";
  enterBtn.disabled = true;
  // Only reuse the stored token for the name it was issued to.
  const token = storage.get("campus.name").toLowerCase() === name.toLowerCase() ? storage.get("campus.token") : "";
  join(name, token || undefined, reserved ? passwordInput.value : undefined)
    .then((s) => {
      session = s;
      passwordInput.value = "";
      storage.set("campus.name", s.name);
      storage.set("campus.token", s.token);
      enterWorld();
    })
    .catch((err: unknown) => {
      joinError.textContent = err instanceof ApiError ? err.message : "Something went wrong.";
    })
    .finally(() => {
      enterBtn.disabled = false;
    });
});

function enterWorld(): void {
  if (!session) return;
  becomeAvatar(session.name);
  joinDialog.hidden = true;
  hud.hidden = false;
  touch.hidden = false;
  playing = true;
  keyGuide.show();
  chat.show();
  const spawn = session.spawn;
  setSpace(isSpaceId(spawn.space) ? spawn.space : "outdoor", spawn, false);
  goOnline(session.token);
  // Move focus out of the form so keystrokes go to the game, not a hidden input.
  (document.activeElement as HTMLElement | null)?.blur();
  stage.focus();
}

function goOnline(token: string): void {
  net?.close();
  net = connect(token, {
    welcome(id, _space, players) {
      selfId = id;
      // The server may have us elsewhere after a reconnect: tell it where we are.
      if (space) net?.enter(space.id, player.position.x, player.position.z);
      players.forEach(upsertOther);
    },
    players(players) {
      const present = new Set(players.map((p) => p.id));
      for (const id of [...others.keys()]) if (!present.has(id)) removeOther(id);
      players.forEach(upsertOther);
    },
    leave: removeOther,
    chat(id, name, text) {
      chat.add({ name, text, self: id === selfId });
      const figure = figureOf(id);
      if (figure) speak(figure, text, 5000);
    },
    emote: showEmote,
    note: upsertNote,
    noteRemoved: removeNote,
    comment(c) {
      if (panel.openNoteId() === c.noteId) void refreshComments(c.noteId);
      else {
        const view = notes.get(c.noteId);
        if (view) upsertNote({ ...view.note, comments: view.note.comments + 1 });
      }
    },
    commentRemoved(_id, noteId) {
      if (panel.openNoteId() === noteId) void refreshComments(noteId);
      else {
        const view = notes.get(noteId);
        if (view) upsertNote({ ...view.note, comments: Math.max(0, view.note.comments - 1) });
      }
    },
    status(online) {
      if (session && space) {
        hudName.textContent = `You are ${session.name} · ${space.title}${online ? "" : " · reconnecting…"}`;
      }
    },
  });
}

let toastTimer = 0;
function toast(msg: string): void {
  toastEl.textContent = msg;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toastEl.textContent = ""), 3000);
}

// --- input -----------------------------------------------------------------

const dirs = { up: false, down: false, left: false, right: false };
let running = false;
function stopMoving(): void {
  dirs.up = dirs.down = dirs.left = dirs.right = false;
  running = false;
}
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
  if (!playing || busy()) return;
  keyGuide.press(e.code, true);
  if (e.key === "Shift") running = true;
  if (radial.isOpen() && /^Digit[1-6]$/.test(e.code)) {
    radial.highlight(Number(e.code.slice(5)) - 1);
    return;
  }
  switch (e.code) {
    case "Space":
      e.preventDefault();
      jump();
      return;
    case "KeyE":
      e.preventDefault();
      if (!e.repeat) interact();
      return;
    case "KeyQ":
      e.preventDefault();
      if (!e.repeat && !radial.isOpen()) radial.open();
      return;
    case "Enter":
      e.preventDefault();
      stopMoving();
      chat.openInput();
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
  if (e.key === "Shift") running = false;
  if (e.code === "KeyQ" && radial.isOpen()) radial.close();
  const dir = KEY_MAP[e.code];
  if (dir) dirs[dir] = false;
});
window.addEventListener("blur", stopMoving);

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
const tap = (id: string, fn: () => void): void =>
  $(id).addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (playing && !busy()) fn();
  });
tap("jump-btn", () => jump());
tap("use-btn", () => interact());
tap("menu-btn", () => (radial.isOpen() ? radial.close() : radial.open()));

// --- actions ---------------------------------------------------------------

function jump(): void {
  // Only from the floor: no double jumps.
  if (player.position.y > 0) return;
  vy = JUMP_SPEED;
}

type Target =
  | { kind: "door"; door: Door }
  | { kind: "link"; label: string; url: string }
  | { kind: "note"; id: number; author: string };

/** The door or note within reach, nearest first. */
function nearestTarget(): Target | null {
  if (!space) return null;
  let best: Target | null = null;
  let bestD = Infinity;
  for (const door of space.doors) {
    const d = Math.hypot(player.position.x - door.x, player.position.z - door.z);
    if (d < DOOR_RANGE && d < bestD) [best, bestD] = [{ kind: "door", door }, d];
  }
  for (const link of space.links ?? []) {
    const d = Math.hypot(player.position.x - link.x, player.position.z - link.z);
    if (d < DOOR_RANGE && d < bestD) [best, bestD] = [{ kind: "link", label: link.label, url: link.url }, d];
  }
  for (const [id, view] of notes) {
    const d = Math.hypot(player.position.x - view.note.x, player.position.z - view.note.z);
    if (d < NOTE_RANGE && d < bestD) [best, bestD] = [{ kind: "note", id, author: view.note.author }, d];
  }
  return best;
}

function interact(): void {
  const target = nearestTarget();
  if (!target) return;
  if (target.kind === "door") setSpace(target.door.to, target.door.arrive, true);
  else if (target.kind === "link") {
    stopMoving();
    // A new tab, so the campus stays open behind it.
    window.open(target.url, "_blank", "noopener");
  } else void openNote(target.id);
}

// --- game loop -------------------------------------------------------------

let lastTime = performance.now();
const move = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const ray = new THREE.Ray();
const hit = new THREE.Vector3();

function update(dt: number, now: number): void {
  if (!space) return;
  if (playing) {
    let moving = false;
    if (!busy()) {
      move.set(Number(dirs.right) - Number(dirs.left), 0, Number(dirs.down) - Number(dirs.up));
      if (move.lengthSq() > 0) {
        moving = true;
        move.normalize();
        player.position.addScaledVector(move, (running ? RUN_SPEED : SPEED) * dt);
        // Turn smoothly toward the way we're going (the model faces +z).
        const want = Math.atan2(move.x, move.z);
        const turn = Math.atan2(Math.sin(want - player.rotation.y), Math.cos(want - player.rotation.y));
        player.rotation.y += turn * Math.min(1, dt * 14);
      }
    }
    me.setMotion(moving ? (running ? "run" : "walk") : "idle");
    vy -= GRAVITY * dt;
    player.position.y = Math.max(0, player.position.y + vy * dt);
    if (player.position.y === 0) vy = 0;
    pushOut(player.position, PLAYER_RADIUS, space.colliders);
    player.position.x = THREE.MathUtils.clamp(player.position.x, -space.halfX, space.halfX);
    player.position.z = THREE.MathUtils.clamp(player.position.z, -space.halfZ, space.halfZ);
    if (now < selfDanceUntil) player.rotation.y += dt * 8;
    net?.sendMove({ x: player.position.x, y: player.position.y, z: player.position.z, rot: player.rotation.y });

    const target = busy() ? null : nearestTarget();
    hintEl.hidden = !target;
    if (target) {
      const key = touchScreen.matches ? "Use" : "E";
      hintEl.textContent =
        target.kind === "door"
          ? `${key} · ${target.door.label}`
          : target.kind === "link"
            ? `${key} · ${target.label}`
            : `${key} · Read ${target.author}'s note`;
    }
  }

  const ease = 1 - Math.exp(-12 * dt);
  me.update(dt);
  for (const view of others.values()) {
    const before = view.group.position.clone();
    view.group.position.lerp(view.target, ease);
    const step = Math.hypot(view.group.position.x - before.x, view.group.position.z - before.z) / Math.max(dt, 1e-3);
    view.speed += (step - view.speed) * Math.min(1, dt * 8);
    view.avatar.setMotion(motionFor(view.speed));
    view.avatar.update(dt);
    if (now < view.danceUntil) {
      view.group.rotation.y += dt * 8;
      continue;
    }
    // Turn the short way round, not through a full spin.
    const d = Math.atan2(Math.sin(view.rot - view.group.rotation.y), Math.cos(view.rot - view.group.rotation.y));
    view.group.rotation.y += d * ease;
  }

  for (const view of notes.values()) {
    view.label.visible = view.group.position.distanceTo(player.position) <= NOTE_LABEL_RANGE;
  }

  // The sun's shadow box follows the player.
  sun.target.position.copy(player.position).setY(0);
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 50);

  // Third-person camera, following across the floor but not up a jump.
  const desired = player.position.clone().setY(0).add(space.camera);
  camera.position.lerp(desired, 1 - Math.exp(-8 * dt));
  lookTarget.copy(player.position).setY(space.outdoor ? 1.8 : 1);
  camera.lookAt(lookTarget);

  // Fade walls and buildings standing between the camera and the player.
  ray.origin.copy(camera.position);
  ray.direction.copy(lookTarget).sub(camera.position).normalize();
  const reach = camera.position.distanceTo(lookTarget);
  for (const o of occludersOf(space.group)) {
    const p = ray.intersectBox(o.box, hit);
    const blocking = (p !== null && p.distanceTo(camera.position) < reach) || o.box.containsPoint(camera.position);
    for (const mesh of o.meshes) {
      const m = mesh.material as THREE.MeshStandardMaterial;
      m.opacity += ((blocking ? 0.2 : 1) - m.opacity) * ease;
      m.depthWrite = m.opacity > 0.95;
    }
  }
}

renderer.setAnimationLoop(() => {
  const now = performance.now();
  update(Math.min((now - lastTime) / 1000, 0.1), now);
  lastTime = now;
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
});

// Show the campus behind the join form.
setSpace("outdoor", { x: -6, z: 10 }, false);
showJoin();
