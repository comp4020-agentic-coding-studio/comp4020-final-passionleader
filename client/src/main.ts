import "./style.css";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { playTrack } from "./audio.ts";
import { mountBgmPlayer } from "./bgmplayer.ts";
import { say } from "./voice.ts";
import { HIGH, mountSettings, settingsOpen } from "./settings.ts";
import { Avatar, defaultLookFor, motionFor, preloadCharacters, variantOf, type Look, type Variant } from "./character.ts";
import { mountLookPicker } from "./lookpicker.ts";
import { sfx, step, warmUp } from "./sfx.ts";
import {
  ApiError,
  RESERVED_RE,
  createClassroom,
  createPost,
  createPostComment,
  deleteComment,
  deleteNote,
  getClassrooms,
  getComments,
  getNotes,
  getPostComments,
  getPosts,
  isValidName,
  join,
  myNoteCount,
  postComment,
  postNote,
  removeClassroom,
  setClassroomLink,
  getProjects,
  sendBugReport,
  saveLook,
  removePost,
  removePostComment,
  type Classroom,
  type Comment,
  type Note,
  type Session,
} from "./api.ts";
import { mountChat } from "./chatui.ts";
import { mountKeyGuide } from "./keyguide.ts";
import { connect, type Emote, type Net, type RemotePlayer, type RoomState } from "./net.ts";
import { mountNoteComposer } from "./notecompose.ts";
import { mountNotePanel, type CommentView } from "./notepanel.ts";
import { mountNoteChooser, type NoteChoice } from "./notechooser.ts";
import { mountClassPicker } from "./classpicker.ts";
import { mountWebView } from "./webview.ts";
import { mountDogPrompt } from "./dogprompt.ts";
import { mountBoard } from "./board.ts";
import { mountRoomPanel, type RoomInfo } from "./roompanel.ts";
import { mountProjectList } from "./projectlist.ts";
import { mountLinkEditor } from "./linkeditor.ts";
import { mountBugReport } from "./bugreport.ts";
import { openFile, upload } from "./uploads.ts";
import { mountRadial } from "./radial.ts";
import { getSpace, isSpaceId, meetingRoom, setClassrooms } from "./spaces/index.ts";
import { materialsOf, occludersOf } from "./spaces/occluders.ts";
import { SUN_DIR, addLights, buildNote, enableShadows, keepIn, pushOut, type Door, type Seat, type SpaceDef, type SpaceId } from "./world.ts";

const SPEED = 4.2; // walking, world units per second
const RUN_SPEED = 8; // with Shift held
const JUMP_SPEED = 7;
const GRAVITY = 20;
const PLAYER_RADIUS = 0.4;
const DOOR_RANGE = 1.6; // how close you must be for E to open a door
const NOTE_RANGE = 1.3; // ...or to read a note
const NOTE_LABEL_RANGE = 3; // a note shows its author's name within this
const DOOR_LABEL_RANGE = 6; // indoors, a door's label shows within this
const DOOR_LABEL_RANGE_OUT = 40; // outside the buildings are far apart: their names stay up

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

const touchScreen = window.matchMedia("(pointer: coarse), (max-width: 700px)");
// Bug reports go to the admin; the gear's dialog opens the form.
const bugReport = mountBugReport({
  async send(text, shot, progress) {
    if (!session) return { sent: false, error: "Join first." };
    let id: number;
    try {
      id = (await sendBugReport(session.token, text, space?.id ?? null)).id;
    } catch (err) {
      return { sent: false, error: err instanceof ApiError ? err.message : "Could not send it." };
    }
    return { sent: true, error: shot ? await upload(session.token, { kind: "bug", bug: id }, shot, progress) : null };
  },
});

// Low (the default) vs High graphics: see settings.ts.
const highQuality = HIGH;
mountSettings({ reportBug: () => bugReport.open(), customise: () => openLookPicker() });
mountBgmPlayer();

const scene = new THREE.Scene();
const sun = addLights(scene, highQuality);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 3000);
const renderer = new THREE.WebGLRenderer({ antialias: highQuality, powerPreference: "high-performance" });
renderer.setPixelRatio(highQuality ? Math.min(window.devicePixelRatio, 2) : 1);
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
// loads: the HDRI is the light reflected in the glass, and a sharper JPG of
// the same sky (colour deepened) is painted inside a big dome round the
// camera, so the clouds stay crisp. Low quality loads both too: it costs two
// downloads, and the procedural sky alone lights the scene far too brightly.
const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(1400, 48, 24),
  new THREE.MeshBasicMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false }),
);
skyDome.scale.x = -1; // seen from inside, so un-mirror it
skyDome.renderOrder = -1;
let domeReady = false;
let outdoorLight = outdoorEnv;
new RGBELoader().load(`${import.meta.env.BASE_URL}assets/sky/kloofendal_48d_partly_cloudy_puresky_1k.hdr`, (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  outdoorLight = pmrem.fromEquirectangular(hdr).texture;
  hdr.dispose();
  if (space?.outdoor) applySky();
});
new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}assets/sky/campus_sky.jpg`, (jpg) => {
  jpg.colorSpace = THREE.SRGBColorSpace;
  skyDome.material.map = jpg;
  skyDome.material.needsUpdate = true;
  domeReady = true;
  if (space?.outdoor) applySky();
});
function applySky(): void {
  scene.background = null;
  if (domeReady) {
    scene.remove(sky);
    scene.add(skyDome);
  } else {
    scene.add(sky);
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

preloadCharacters();
// How you look: what you picked (saved on the server once you've joined),
// else a default from your name. Picked before joining, it waits here.
let myLook: Look | null = null;
const lookOfMine = (): Look => myLook ?? defaultLookFor(session?.name ?? nameInput.value.trim());

let me = new Avatar(defaultLookFor(""));
let player = me.group;
scene.add(player);

/** Swaps in this visitor's own figure once we know their name. */
function becomeAvatar(_name: string): void {
  const next = new Avatar(lookOfMine());
  next.group.position.copy(player.position);
  next.group.rotation.copy(player.rotation);
  scene.remove(player);
  me = next;
  player = next.group;
  scene.add(player);
}

// --- picking a look --------------------------------------------------------------
// The window (lookpicker.ts) with a small turning 3D preview of the figure.
// From the join screen the choice waits until you've joined; in the game it's
// saved on the server and everyone in the space sees it.

const lookPicker = mountLookPicker({
  preview(look) {
    previewAvatar?.setLook(look);
  },
  async save(look) {
    myLook = look;
    me.setLook(look);
    if (!session) return null; // sent once you've joined
    try {
      await saveLook(session.token, look);
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : "Could not save your look.";
    }
  },
});

let previewAvatar: Avatar | null = null;
let previewStop: (() => void) | null = null;
function openLookPicker(): void {
  const look = lookOfMine();
  startPreview(look);
  lookPicker.open(look);
}
/** A little scene of its own in the window: the figure on a turntable. */
function startPreview(look: Look): void {
  previewStop?.();
  const slot = lookPicker.previewSlot;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  r.outputColorSpace = THREE.SRGBColorSpace;
  slot.replaceChildren(r.domElement);
  r.domElement.style.width = "100%";
  r.domElement.style.height = "100%";
  const s3 = new THREE.Scene();
  s3.add(new THREE.HemisphereLight(0xffffff, 0x8a7a62, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(2, 3, 4);
  s3.add(key);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  cam.position.set(0, 1.35, 4.4);
  cam.lookAt(0, 0.95, 0);
  previewAvatar = new Avatar(look);
  s3.add(previewAvatar.group);
  let last = performance.now();
  let alive = true;
  const frame = (): void => {
    if (!alive) return;
    if (!lookPicker.isOpen()) return previewStop?.();
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const w = slot.clientWidth || 200;
    const h = slot.clientHeight || 260;
    if (r.domElement.width !== Math.round(w * r.getPixelRatio()) || r.domElement.height !== Math.round(h * r.getPixelRatio())) {
      r.setSize(w, h, false);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
    previewAvatar!.group.rotation.y += dt * 0.6;
    previewAvatar!.update(dt);
    r.render(s3, cam);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  previewStop = () => {
    alive = false;
    previewStop = null;
    previewAvatar = null;
    r.dispose();
  };
}
document.getElementById("customise")?.addEventListener("click", openLookPicker);

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
  /** Which figure they have (and so which voice). */
  variant: Variant;
  group: THREE.Group;
  target: THREE.Vector3;
  rot: number;
  /** Smoothed ground speed, to pick idle / walk / run for the animation. */
  speed: number;
  /** Their look, to notice when it changes. */
  lookKey: string;
  /** The seat they're on, if any. */
  seat?: Seat;
}
const others = new Map<string, OtherView>();
let selfId = "";
let space: SpaceDef | null = null;

function upsertOther(p: RemotePlayer): void {
  if (p.id === selfId || p.space !== space?.id) return;
  let view = others.get(p.id);
  if (!view) {
    const look = p.look ?? defaultLookFor(p.name);
    const variant = variantOf(look);
    const avatar = new Avatar(look);
    const group = avatar.group;
    tag(group, p.name, 2.2, "player-label");
    group.position.set(p.x, p.y, p.z);
    scene.add(group);
    view = { avatar, variant, group, target: new THREE.Vector3(), rot: p.rot, speed: 0, lookKey: JSON.stringify(look) };
    others.set(p.id, view);
  }
  // A new look (they changed it while here): recolour in place.
  const look = p.look ?? defaultLookFor(p.name);
  const key = JSON.stringify(look);
  if (key !== view.lookKey) {
    view.lookKey = key;
    view.variant = variantOf(look);
    view.avatar.setLook(look);
  }
  // Sitting: on the seat, facing its way, whatever their last step said.
  view.seat = p.seat ? seatAt(p.seat) : undefined;
  if (view.seat) {
    view.target.copy(seatedAt(view.seat));
    view.rot = view.seat.rot;
  } else {
    view.target.set(p.x, p.y, p.z);
    view.rot = p.rot;
  }
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

// What the emote says out loud (and nearby people hear); dance is silent.
const EMOTE_VOICE: Partial<Record<Emote, string>> = {
  wave: "Hello!",
  yes: "Yes!",
  no: "No.",
  mate: "How ya doing, mate?",
};

const EMOTE_TEXT: Record<Emote, string> = {
  wave: "👋 Hello!",
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
  if (kind === "wave" || kind === "dance") avatar?.perform(kind);
  const line = EMOTE_VOICE[kind];
  const variant = id === selfId ? (session ? variantOf(lookOfMine()) : undefined) : others.get(id)?.variant;
  if (line && variant) {
    const d = id === selfId ? 0 : Math.hypot(figure.position.x - player.position.x, figure.position.z - player.position.z);
    // A voice to match the figure, and a stable pitch per person within it,
    // so two people saying "Hello" sound different.
    const spread = (Math.abs([...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)) % 20) / 100;
    say(line, d, variant === "female-a" ? "female" : "male", spread);
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
    sfx("note");
    toast(replaced !== null ? "Note stuck. Your oldest note here was removed." : "Note stuck.");
  } catch (err) {
    throw asError(err);
  }
});

// --- chat and the Q menu ---------------------------------------------------

let net: Net | null = null;
const chat = mountChat({ onSend: (text) => net?.chat(text), maxLength: 200 });

// In a meeting room, its group-chat window takes the place of the corner chat.
const roomPanel = mountRoomPanel({
  onSend: (text) => net?.chat(text),
  onInvite: (name) => net?.invite(name),
  onLeave: () => {
    const out = space?.doors[0];
    if (out) setSpace(out.to, out.arrive, true);
  },
  onShare: async (file, progress) => (session ? upload(session.token, { kind: "room" }, file, progress) : "Join first."),
  onOpenFile: async (id) => (session ? openFile(session.token, id) : "Join first."),
  maxLength: 200,
});
const roomInfo = (id: SpaceId, room: RoomState): RoomInfo => ({ title: meetingRoom(id)?.title ?? "Room", ...room });

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

const chooser = mountNoteChooser((id) => void openNote(id));
// Building 155's door asks which classroom; the admin can open and close
// them from the same dialog (the server checks it's the admin).
let classroomList: Classroom[] = [];
const picker = mountClassPicker({
  pick(item) {
    setSpace(item.space, { x: 8.4, z: 6 }, true);
  },
  async create(code) {
    if (!session) return "Join first.";
    try {
      await createClassroom(session.token, code);
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : "Could not open it.";
    }
  },
  async remove(code) {
    if (!session) return "Join first.";
    try {
      await removeClassroom(session.token, code);
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : "Could not close it.";
    }
  },
});
// COMP8020's right-hand board: the classmates' final-project apps that are up.
const projectList = mountProjectList();
async function openProjects(): Promise<void> {
  projectList.open();
  try {
    const { projects, checkedAt } = await getProjects();
    projectList.show(projects, checkedAt);
  } catch {
    projectList.fail("Could not load the list. Try again in a moment.");
  }
}

// Elsewhere the whiteboard and that board open the page the staff set: E
// goes straight there, except for the admin, who can change it.
let editing: { code: string; which: "board" | "side" } | null = null;
const linkEditor = mountLinkEditor({
  async save(url) {
    if (!session || !editing) return "Join first.";
    try {
      await setClassroomLink(session.token, editing.code, editing.which, url);
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : "Could not save it.";
    }
  },
  visit(url) {
    webview.open({ label: "Page from the staff", url, embeddable: true });
  },
});
function openStaffLink(which: "board" | "side"): void {
  if (!space) return;
  const room = classroomList.find((c) => c.space === space!.id);
  if (!room) return;
  const url = (which === "board" ? room.boardUrl : room.sideUrl) ?? null;
  const name = which === "board" ? `${room.code} whiteboard` : `${room.code} board (right of the whiteboard)`;
  if (session?.role === "admin") {
    editing = { code: room.code, which };
    linkEditor.open({ title: name, url });
  } else if (url) webview.open({ label: name, url, embeddable: true });
  else toast("Nothing here yet: the staff haven't put a page up.");
}

function useClassrooms(list: Classroom[]): void {
  classroomList = list;
  setClassrooms(list);
  picker.update(list);
}
async function loadClassrooms(): Promise<void> {
  try {
    useClassrooms(await getClassrooms());
  } catch {
    // Offline for a moment: the door says so when it's used.
  }
}

// Web pages from the classroom board (and later the library desks) open over
// the game when the site allows it, or in a new tab when it doesn't.
const webview = mountWebView();
// The dog in front of 154 asks for a feed: a link to my Buy Me a Coffee page.
const dogPrompt = mountDogPrompt();

// Each classroom's board (Q&A, Notices, Board). The server decides who may
// post a notice; the dialog only hides the button from everyone else.
const failed = (err: unknown, fallback: string): string => (err instanceof ApiError ? err.message : fallback);
const board = mountBoard({
  async list(tab) {
    if (!space) return [];
    return (await getPosts(space.id, tab)).map((p) => ({ ...p, canDelete: !p.pinned && mine(p.author) }));
  },
  async comments(postId) {
    return (await getPostComments(postId)).map((c) => ({ ...c, canDelete: mine(c.author) }));
  },
  async post(tab, title, text, files, progress) {
    if (!session || !space) return "Join first.";
    let id: number;
    try {
      id = (await createPost(session.token, space.id, tab, title, text)).id;
    } catch (err) {
      return failed(err, "Could not post that.");
    }
    // The post is up; its files follow one by one. One that fails says why,
    // and the post stays (with whatever made it).
    for (const file of files) {
      const error = await upload(session.token, { kind: "board", post: id }, file, (done) => progress(file.name, done));
      if (error) return `Posted, but ${file.name} didn't upload. ${error}`;
    }
    return null;
  },
  async openFile(id) {
    if (!session) return "Join first.";
    return openFile(session.token, id);
  },
  async comment(postId, text) {
    if (!session) return "Join first.";
    try {
      await createPostComment(session.token, postId, text);
      return null;
    } catch (err) {
      return failed(err, "Could not add that comment.");
    }
  },
  async removePost(postId) {
    if (!session) return "Join first.";
    try {
      await removePost(session.token, postId);
      return null;
    } catch (err) {
      return failed(err, "Could not remove it.");
    }
  },
  async removeComment(commentId) {
    if (!session) return "Join first.";
    try {
      await removePostComment(session.token, commentId);
      return null;
    } catch (err) {
      return failed(err, "Could not remove it.");
    }
  },
});

// When a dialog closes, hand focus back to the game view.
for (const id of ["class-picker", "webview", "dog-prompt", "board"]) {
  const el = document.getElementById(id);
  if (el) new MutationObserver(() => el.hidden && playing && stage.focus()).observe(el, { attributes: true, attributeFilter: ["hidden"] });
}

const busy = (): boolean =>
  chat.isTyping() || roomPanel.isTyping() || panel.isOpen() || composer.isOpen() || chooser.isOpen() || settingsOpen() || picker.isOpen() || webview.isOpen() || dogPrompt.isOpen() || board.isOpen() || projectList.isOpen() || linkEditor.isOpen() || bugReport.isOpen() || lookPicker.isOpen();
const keyGuide = mountKeyGuide();

// --- the current space -----------------------------------------------------

let playing = false;
let vy = 0;

const doorLabels: CSS2DObject[] = [];
const labelAt = new THREE.Vector3();

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
  if (roomPanel.isOpen() && !meetingRoom(id)) {
    roomPanel.close();
    document.body.classList.remove("in-room");
    if (playing) chat.show();
  }

  // Black for a moment, then fade in (models load in the meantime).
  const fade = document.getElementById("fade");
  if (playing) sfx("door");
  if (fade && playing) {
    fade.classList.add("on");
    window.setTimeout(() => fade.classList.remove("on"), 260);
  }
  mySeat = null;
  space = getSpace(id);
  doorLabels.length = 0;
  space.group.traverse((o) => {
    if (o instanceof CSS2DObject && o.element.classList.contains("door-label")) doorLabels.push(o);
  });
  if (!space.group.userData.shadowsOn) {
    enableShadows(space.group);
    space.group.userData.shadowsOn = true;
  }
  scene.add(space.group);
  if (space.outdoor) {
    applySky();
    scene.fog = new THREE.Fog(0xc9dcea, 60, 220);
  } else {
    scene.remove(sky, skyDome);
    scene.background = new THREE.Color(space.background);
    scene.environment = indoorEnv;
    scene.fog = null;
  }
  // Indoors there's no sun through a ceiling: daylight at full strength on
  // pale walls and floors glared, so rooms get a softer sun and fill.
  sun.intensity = space.outdoor ? 2.6 : 1.3 * (space.light ?? 1);
  scene.environmentIntensity = space.outdoor ? 1 : 0.55 * (space.light ?? 1);
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

/** Why a note can't go where the player stands, or null (server/spaces.ts noteSpotError). */
function noteSpotError(): string | null {
  if (space && meetingRoom(space.id)) return "No sticky notes in meeting rooms.";
  if (!space || space.noNotes) return "No sticky notes in the Student Hub.";
  const { x, z } = player.position;
  if ((space.noteBuildings ?? []).some((b) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ)) return "Not inside a building.";
  const spots = [...(space.noteKeepClear ?? []), ...space.doors, ...(space.links ?? []), ...(space.spots ?? [])];
  if (spots.some((p) => Math.hypot(p.x - x, p.z - z) < 2)) return "Too close to a door or something you can use. Step away a little.";
  return null;
}

async function writeNote(): Promise<void> {
  if (!session || !space) return;
  stopMoving();
  const where = noteSpotError();
  if (where) return toast(where);
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
// Phone keyboards add spaces and lookalike characters (a full-width "＿"); the server does the same.
const typedName = (): string => nameInput.value.normalize("NFKC").trim();
// Shown for qa_ names, and for any name the server says has a password.
let needsPassword = false;
const syncPasswordRow = (): void => {
  passwordRow.hidden = !needsPassword && !RESERVED_RE.test(typedName());
};
nameInput.addEventListener("input", () => {
  needsPassword = false;
  syncPasswordRow();
});
syncPasswordRow();

function showJoin(message = ""): void {
  playing = false;
  keyGuide.hide();
  chat.hide();
  roomPanel.close();
  document.body.classList.remove("in-room");
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
  const name = typedName();
  if (!isValidName(name)) {
    joinError.textContent = "Use letters, digits and underscore only, 1 to 8 characters.";
    return;
  }
  const reserved = RESERVED_RE.test(name) || needsPassword;
  // Phone keyboards add a space after a word; no account password has one.
  const password = passwordInput.value.trim();
  if (reserved && !password) {
    joinError.textContent = "This account needs its password.";
    return;
  }
  joinError.textContent = "";
  enterBtn.disabled = true;
  // Only reuse the stored token for the name it was issued to.
  const token = storage.get("campus.name").toLowerCase() === name.toLowerCase() ? storage.get("campus.token") : "";
  join(name, token || undefined, reserved ? password : undefined)
    .then((s) => {
      session = s;
      // A look picked before joining goes up now; else the one saved last time.
      if (myLook) void saveLook(s.token, myLook).catch(() => {});
      else myLook = s.look;
      passwordInput.value = "";
      storage.set("campus.name", s.name);
      storage.set("campus.token", s.token);
      // Classrooms first, so a visitor who left one comes back into it.
      return loadClassrooms().then(enterWorld);
    })
    .catch((err: unknown) => {
      // A taken name that's a password account: ask for its password instead.
      if (err instanceof ApiError && err.status === 409 && err.data.password) {
        needsPassword = true;
        syncPasswordRow();
        joinError.textContent = "This account signs in with its password. Enter it below.";
        passwordInput.focus();
        return;
      }
      joinError.textContent = err instanceof ApiError ? err.message : "Something went wrong.";
    })
    .finally(() => {
      enterBtn.disabled = false;
    });
});

function enterWorld(): void {
  if (!session) return;
  warmUp();
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
      // A ping for someone else's line in a meeting room: the window may be folded away on a phone.
      if (roomPanel.isOpen() && id !== selfId) sfx("message");
      if (roomPanel.isOpen()) roomPanel.add({ name, text, self: id === selfId });
      else chat.add({ name, text, self: id === selfId });
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
    classrooms(list) {
      useClassrooms(list);
    },
    board() {
      if (board.isOpen()) board.refresh();
    },
    moved(to, x, z, players) {
      toast("That classroom was closed. You're back outside.");
      setSpace(to, { x, z }, false);
      players.forEach(upsertOther);
    },
    roomOpen(id, x, z, room, lines, players) {
      if (space?.id !== id) setSpace(id, { x, z }, false);
      players.forEach(upsertOther);
      chat.hide();
      document.body.classList.add("in-room");
      roomPanel.open(
        roomInfo(id, room),
        lines.map((l) => ({ ...l, self: !l.system && l.name === session?.name })),
      );
    },
    room(room) {
      if (space && roomPanel.isOpen()) roomPanel.update(roomInfo(space.id, room));
    },
    roomLine(line) {
      if (roomPanel.isOpen()) roomPanel.add(line);
    },
    seatRefused() {
      mySeat = null;
      sfx("error");
      toast("Someone's already sitting there.");
    },
    roomRefused(id, reason) {
      sfx("error");
      toast(
        reason === "full"
          ? "That room is full (6 people)."
          : reason === "not invited"
            ? "That room is invite-only. Ask someone inside to invite you."
            : reason === "no such user"
              ? "There's nobody with that name."
              : "You can't do that here.",
      );
      // Back from a reconnect into a room that won't have us: step outside it.
      const out = meetingRoom(id);
      if (out && space?.id === id) setSpace(out.parent, { x: out.door.x + (out.door.x > 0 ? -1.8 : 1.8), z: out.door.z }, true);
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
      if (roomPanel.isOpen()) roomPanel.focusInput();
      else chat.openInput();
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
// A button acts on pointerdown, so it feels instant. If that opens a dialog,
// the finger lifts over the dialog's backdrop, and the click the browser
// sends after the tap would close it again ("click outside"). So the click
// that follows a tap is swallowed before anything sees it.
let swallowClickUntil = 0;
window.addEventListener(
  "click",
  (e) => {
    if (performance.now() < swallowClickUntil) {
      e.stopPropagation();
      e.preventDefault();
      swallowClickUntil = 0;
    }
  },
  true,
);
const tap = (id: string, fn: () => void): void =>
  $(id).addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (!playing || busy()) return;
    fn();
    if (busy()) swallowClickUntil = performance.now() + 700;
  });
tap("jump-btn", () => jump());
tap("use-btn", () => interact());
tap("menu-btn", () => (radial.isOpen() ? radial.close() : radial.open()));

// --- actions ---------------------------------------------------------------

function jump(): void {
  // Only from the floor: no double jumps. Seated, jumping gets you up first.
  if (mySeat) return standUp();
  if (player.position.y > 0) return;
  vy = JUMP_SPEED;
}

// --- sitting ---------------------------------------------------------------------
// E near a free seat sits you down (the server keeps one person per seat);
// any move gets you up. Seats are numbered per space: "<space>:<index>".

let mySeat: { id: string; seat: Seat } | null = null;
const SEAT_RANGE = 1.1;
// The "sit" clip bends the legs and drops the hips to about 7 cm above the
// feet: lift the figure so the hips are on the seat, and back a little so
// the knees, not the bottom, are over the front edge.
const HIP_DROP = 0.07;
const SEAT_BACK = 0.18;
/** Where a seated figure stands: on the seat, eased back from its front edge. */
function seatedAt(seat: Seat): THREE.Vector3 {
  return new THREE.Vector3(seat.x - Math.sin(seat.rot) * SEAT_BACK, Math.max(0, seat.y - HIP_DROP), seat.z - Math.cos(seat.rot) * SEAT_BACK);
}

/** The seat a "<space>:<n>" id names, if it's in this space. */
function seatAt(id: string): Seat | undefined {
  const [where, n] = id.split(":");
  return where === space?.id ? space.seats?.[Number(n)] : undefined;
}

function sitDown(index: number): void {
  if (!space?.seats?.[index]) return;
  stopMoving();
  const seat = space.seats[index]!;
  mySeat = { id: `${space.id}:${index}`, seat };
  net?.sit(mySeat.id, { x: seat.x, z: seat.z });
  sfx("click");
}

function standUp(): void {
  if (!mySeat) return;
  mySeat = null;
  net?.sit(null);
}

/** Free seats near you: none someone else is on. */
function seatNear(): { index: number; d: number } | null {
  let best: { index: number; d: number } | null = null;
  space?.seats?.forEach((seat, index) => {
    const d = Math.hypot(player.position.x - seat.x, player.position.z - seat.z);
    if (d > SEAT_RANGE || (best && best.d <= d)) return;
    const taken = [...others.values()].some((o) => o.seat === seat);
    if (!taken) best = { index, d };
  });
  return best;
}

type Target =
  | { kind: "seat"; index: number }
  | { kind: "door"; door: Door }
  | { kind: "link"; label: string; url: string; embeddable: boolean }
  | { kind: "spot"; id: string; label: string }
  | { kind: "note"; id: number; author: string; here: NoteChoice[] };

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
    if (d < DOOR_RANGE && d < bestD) [best, bestD] = [{ kind: "link", label: link.label, url: link.url, embeddable: link.embeddable }, d];
  }
  for (const spot of space.spots ?? []) {
    const d = Math.hypot(player.position.x - spot.x, player.position.z - spot.z);
    if (d < DOOR_RANGE && d < bestD) [best, bestD] = [{ kind: "spot", id: spot.id, label: spot.label }, d];
  }
  // Every note in reach comes along, so stacked ones can all be picked.
  const here: NoteChoice[] = [];
  let nearest: { id: number; author: string; d: number } | null = null;
  for (const [id, view] of notes) {
    const d = Math.hypot(player.position.x - view.note.x, player.position.z - view.note.z);
    if (d >= NOTE_RANGE) continue;
    here.push({ id, author: view.note.author, text: view.note.text });
    if (!nearest || d < nearest.d) nearest = { id, author: view.note.author, d };
  }
  if (nearest && nearest.d < bestD) {
    here.sort((a, b) => b.id - a.id); // newest first
    best = { kind: "note", id: nearest.id, author: nearest.author, here };
  }
  // A seat only when nothing else is in reach: a chair by a door shouldn't steal the door.
  if (!best && !mySeat) {
    const seat = seatNear();
    if (seat) best = { kind: "seat", index: seat.index };
  }
  return best;
}

function interact(): void {
  // Seated, E gets you up.
  if (mySeat) return standUp();
  const target = nearestTarget();
  if (!target) return;
  if (target.kind === "seat") return sitDown(target.index);
  // Anything but a door opens a window: a soft "open" sound.
  if (target.kind !== "door") sfx("open");
  if (target.kind === "door") {
    if (target.door.to === "classroom") {
      stopMoving();
      if (classroomList.length === 0) void loadClassrooms();
      picker.open(classroomList, session?.role === "admin");
    } else if (meetingRoom(target.door.to)) {
      // The server decides whether there's room and whether we're invited;
      // we walk in when it says yes (roomOpen below).
      stopMoving();
      net?.enter(target.door.to, target.door.arrive.x, target.door.arrive.z);
    } else setSpace(target.door.to, target.door.arrive, true);
  } else if (target.kind === "spot") {
    stopMoving();
    if (target.id === "dog") dogPrompt.open();
    else if (target.id === "board" && space) board.open(space.title.replace(/ classroom$/, ""), session?.role === "admin");
    else if (target.id === "projects") void openProjects();
    else if (target.id === "board-link") openStaffLink("board");
    else if (target.id === "side-link") openStaffLink("side");
  } else if (target.kind === "link") {
    stopMoving();
    // Over the game if the site allows framing, else a new tab; either way
    // straight from the key press or tap, which phones require for a tab.
    webview.open({ label: target.label, url: target.url, embeddable: target.embeddable });
  } else if (target.here.length > 1) {
    stopMoving();
    chooser.open(target.here);
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
  space.tick?.(dt);
  if (playing) {
    let moving = false;
    if (!busy()) {
      move.set(Number(dirs.right) - Number(dirs.left), 0, Number(dirs.down) - Number(dirs.up));
      // Walking gets you up.
      if (mySeat && move.lengthSq() > 0) standUp();
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
    me.setMotion(mySeat ? "sit" : moving ? (running ? "run" : "walk") : "idle");
    if (moving && player.position.y === 0) step(space.floor ?? "concrete", now, running ? 0.28 : 0.42);
    vy -= GRAVITY * dt;
    player.position.y = Math.max(0, player.position.y + vy * dt);
    if (player.position.y === 0) vy = 0;
    if (mySeat) {
      // On the seat (inside the chair's footprint, so no pushing out), facing its way.
      player.position.copy(seatedAt(mySeat.seat));
      player.rotation.y = mySeat.seat.rot;
      vy = 0;
    } else pushOut(player.position, PLAYER_RADIUS, space.colliders);
    keepIn(player.position, space.areas ?? [{ minX: -space.halfX, maxX: space.halfX, minZ: -space.halfZ, maxZ: space.halfZ }]);
    // Seated, send the seat's own spot (others ease the figure back on their
    // side, as we do): the drawn spot is a little behind it, and the server
    // reads any step away from the seat as getting up.
    if (mySeat) net?.sendMove({ x: mySeat.seat.x, y: 0, z: mySeat.seat.z, rot: mySeat.seat.rot });
    else net?.sendMove({ x: player.position.x, y: player.position.y, z: player.position.z, rot: player.rotation.y });

    const target = busy() ? null : nearestTarget();
    hintEl.hidden = !target && !mySeat;
    if (mySeat && !target) hintEl.textContent = `${touchScreen.matches ? "Use" : "E"} · Stand up (or just walk)`;
    if (target) {
      const key = touchScreen.matches ? "Use" : "E";
      hintEl.textContent =
        target.kind === "seat"
          ? `${key} · Sit down`
          : target.kind === "door"
          ? `${key} · ${target.door.label}`
          : target.kind === "link" || target.kind === "spot"
            ? `${key} · ${target.label}`
            : target.here.length > 1
              ? `${key} · Pick one of ${target.here.length} notes here`
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
    view.avatar.setMotion(view.seat ? "sit" : motionFor(view.speed));
    view.avatar.update(dt);
    // Turn the short way round, not through a full spin.
    const d = Math.atan2(Math.sin(view.rot - view.group.rotation.y), Math.cos(view.rot - view.group.rotation.y));
    view.group.rotation.y += d * ease;
  }

  for (const view of notes.values()) {
    view.label.visible = view.group.position.distanceTo(player.position) <= NOTE_LABEL_RANGE;
  }
  // Door labels only near their door: a wall of them read as clutter, and
  // from afar they sat on top of the signs (outside, the buildings' names
  // stay visible from across the lawn).
  for (const label of doorLabels) {
    label.getWorldPosition(labelAt);
    const d = Math.hypot(labelAt.x - player.position.x, labelAt.z - player.position.z);
    label.visible = d <= (space.outdoor ? DOOR_LABEL_RANGE_OUT : DOOR_LABEL_RANGE);
  }

  // The sun's shadow box follows the player.
  sun.target.position.copy(player.position).setY(0);
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 50);

  // Third-person camera, following across the floor but not up a jump.
  const desired = player.position.clone().setY(0).add(space.camera);
  camera.position.lerp(desired, 1 - Math.exp(-8 * dt));
  lookTarget.copy(player.position).setY(space.outdoor ? 1.8 : 1);
  camera.lookAt(lookTarget);
  skyDome.position.copy(camera.position);

  // Fade walls and buildings standing between the camera and the player.
  ray.origin.copy(camera.position);
  ray.direction.copy(lookTarget).sub(camera.position).normalize();
  const reach = camera.position.distanceTo(lookTarget);
  for (const o of occludersOf(space.group)) {
    const p = ray.intersectBox(o.box, hit);
    // With the camera inside a building, fading would wash the view white:
    // hide the building outright until the camera is out again.
    const inside = o.box.containsPoint(camera.position);
    const blocking = inside || (p !== null && p.distanceTo(camera.position) < reach);
    for (const mesh of o.meshes) {
      mesh.visible = !inside;
      for (const m of materialsOf(mesh)) {
        m.opacity += ((blocking ? 0.2 : 1) - m.opacity) * ease;
        m.depthWrite = m.opacity > 0.95;
      }
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
