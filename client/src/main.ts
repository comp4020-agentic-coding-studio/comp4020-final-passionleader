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
import { fart, sfx, step, warmUp } from "./sfx.ts";
import {
  ApiError,
  RESERVED_RE,
  createClassroom,
  createPost,
  createPostComment,
  deleteComment,
  heartComment,
  joinAsGuest,
  getMailbox,
  readMail,
  deleteMail as deleteMailItem,
  sendMailTo,
  isMember,
  isStaff,
  getNpcs,
  askNpc,
  type NpcDef,
  signupStart,
  signupCheck,
  getSavedChats,
  getSavedChat,
  deleteSavedChat,
  signupFinish,
  resetStart,
  resetFinish,
  whenSignupNeeded,
  deleteNote,
  getClassrooms,
  getComments,
  getNotes,
  getPostComments,
  editPost,
  editPostComment,
  getBoardConfig,
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
  heartPostComment,
  joinGroup,
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
import { mountSignupPrompt } from "./signupprompt.ts";
import { mountSignIn } from "./signin.ts";
import { mountNpcChat } from "./npcchat.ts";
import { mountMailbox } from "./mailbox.ts";
import { mountMinimap } from "./minimap.ts";
import { mountQuests } from "./quests.ts";
// The tutorial's six things to try (plan 72), ticked off as they happen.
const quests = mountQuests();
let walked = 0;
import { dogHappy } from "./spaces/dog.ts";
import { poopMesh } from "./spaces/poop.ts";
import { mountMute } from "./mute.ts";
import { mountBoard } from "./board.ts";
import { mountCafeGuide } from "./cafeguide.ts";
import { mountRoomPanel, type RoomInfo } from "./roompanel.ts";
import { mountProjectList } from "./projectlist.ts";
import { mountLinkEditor } from "./linkeditor.ts";
import { mountBugReport } from "./bugreport.ts";
import { imageLink, openFile, upload } from "./uploads.ts";
import { mountRadial } from "./radial.ts";
import { getSpace, isSpaceId, meetingRoom, setClassrooms } from "./spaces/index.ts";
import { materialsOf, occludersOf } from "./spaces/occluders.ts";
import { SUN_DIR, addLights, buildNote, enableShadows, groundAt, keepIn, pushOut, type Door, type Seat, type SpaceDef, type SpaceId } from "./world.ts";
import { canberraTime } from "./when.ts";

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
const hud = $("hud");
const hudName = $("hud-name");
const hudOnline = $("hud-online");
const toastEl = $("toast");
const hintEl = $("hint");
const touch = $("touch");

// --- three.js setup --------------------------------------------------------

const touchScreen = window.matchMedia("(pointer: coarse), (max-width: 700px)");
// Bug reports go to the admin; the gear's dialog opens the form.
const bugReport = mountBugReport({
  async send(text, shot, progress, about) {
    if (!session) return { sent: false, error: "Join first." };
    let id: number;
    try {
      id = (await sendBugReport(session.token, text, space?.id ?? null, about)).id;
    } catch (err) {
      return { sent: false, error: err instanceof ApiError ? err.message : "Could not send it." };
    }
    return { sent: true, error: shot ? await upload(session.token, { kind: "bug", bug: id }, shot, progress) : null };
  },
});

// Low (the default) vs High graphics: see settings.ts.
const highQuality = HIGH;
// Mute (plan 33): someone's chat, bubbles and notes vanish from this screen only.
const muteDialog = mountMute({ changed: () => syncMutedNotes() });
mountSettings({
  reportBug: () => bugReport.open(),
  reportPerson: () => bugReport.open(true),
  mute: () => muteDialog.open(),
  signOut,
  isGuest: () => !!session && !isMember(session),
  signUp: () => signUpFromGuest(),
});
function signOut(): void {
  // This browser forgets who it was; the join screen offers signing up or in.
  storage.set("campus.token", "");
  storage.set("campus.role", "");
  session = null;
  showJoin();
}
/** A guest goes for a real account: out of the campus, onto the sign-up form. */
function signUpFromGuest(): void {
  board.close();
  signOut();
  signIn.showSignup();
}
// A guest who tries something that needs signing up gets this, before the
// action where we know (Write a post, a note) and on the server's refusal.
const signupPrompt = mountSignupPrompt({ signUp: () => signUpFromGuest() });

// Customise look has its own button, a coat hanger just left of the gear (it
// used to be a row in the settings dialog). The join screen keeps its button.
const hangerBtn = document.createElement("button");
hangerBtn.type = "button";
hangerBtn.id = "look-btn";
// A coat hanger (there's no emoji for one): hook, shoulders and bar.
hangerBtn.innerHTML =
  '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M10 7a2 2 0 1 1 3 1.7c-.6.4-1 .9-1 1.6V11"/><path d="M12 11 3 17.5c-.6.5-.3 1.5.5 1.5h17c.8 0 1.1-1 .5-1.5L12 11"/></svg>';
hangerBtn.title = "Customise look";
hangerBtn.setAttribute("aria-label", "Customise look");
hangerBtn.setAttribute("aria-haspopup", "dialog");
hangerBtn.addEventListener("click", () => openLookPicker());
document.body.append(hangerBtn);

// The mailbox (plan 16): left of the hanger, with a count of unread mail.
const mailBtn = document.createElement("button");
mailBtn.type = "button";
mailBtn.id = "mail-btn";
mailBtn.title = "Mail";
mailBtn.setAttribute("aria-haspopup", "dialog");
const mailIcon = document.createElement("span");
mailIcon.textContent = "✉️";
mailIcon.setAttribute("aria-hidden", "true");
const mailBadge = document.createElement("span");
mailBadge.className = "mail-badge";
mailBadge.hidden = true;
mailBtn.append(mailIcon, mailBadge);
document.body.append(mailBtn);
function showUnread(n: number): void {
  mailBadge.textContent = String(n);
  mailBadge.hidden = n === 0;
  mailBtn.setAttribute("aria-label", n ? `Mail, ${n} unread` : "Mail");
}
showUnread(0);
const mailbox = mountMailbox({
  async chats() {
    if (!session) return "Join first.";
    try {
      return (await getSavedChats(session.token)).map((c) => ({ id: c.id, savedAt: c.savedAt, title: meetingRoom(c.space)?.title ?? "A meeting room" }));
    } catch (err) {
      return err instanceof ApiError ? err.message : "Could not load your saved chats.";
    }
  },
  async chat(id) {
    if (!session) return "Join first.";
    try {
      const c = await getSavedChat(session.token, id);
      return { title: meetingRoom(c.space)?.title ?? "A meeting room", savedAt: c.savedAt, lines: c.lines };
    } catch (err) {
      return err instanceof ApiError ? err.message : "Could not open that chat.";
    }
  },
  removeChat: async (id) => (session ? errorOf(deleteSavedChat(session.token, id)) : "Join first."),
  async load() {
    if (!session) return "Join first.";
    try {
      const box = await getMailbox(session.token);
      showUnread(box.unread);
      return box;
    } catch (err) {
      return err instanceof ApiError ? err.message : "Could not open your mail.";
    }
  },
  async read(id) {
    if (!session) return;
    try {
      showUnread((await readMail(session.token, id)).unread);
    } catch {
      // It's read on screen anyway.
    }
  },
  async remove(id) {
    if (!session) return "Join first.";
    try {
      showUnread((await deleteMailItem(session.token, id)).unread);
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : "Could not delete it.";
    }
  },
  async send(to, subject, text) {
    if (!session) return "Join first.";
    try {
      await sendMailTo(session.token, to, subject, text);
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : "Could not send it.";
    }
  },
  member: () => isMember(session),
});
mailBtn.addEventListener("click", () => mailbox.open());
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
const lookOfMine = (): Look => myLook ?? defaultLookFor(session?.name ?? storage.get("campus.name"));

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
  // Before joining, go by the name typed; after, by the name signed in with.
  qaHats: () => RESERVED_RE.test(session?.name ?? storage.get("campus.name")),
  preview(look) {
    previewAvatar?.setLook(look);
  },
  async save(look) {
    myLook = look;
    quests.done("look");
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
  name: string;
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
    view = { name: p.name, avatar, variant, group, target: new THREE.Vector3(), rot: p.rot, speed: 0, lookKey: JSON.stringify(look) };
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
  const other = others.get(id);
  if (other && muteDialog.isMuted(other.name)) return;
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
  view.group.visible = !muteDialog.isMuted(n.author);
}

/** Muted people's notes vanish (and come back on unmute). */
function syncMutedNotes(): void {
  for (const view of notes.values()) view.group.visible = !muteDialog.isMuted(view.note.author);
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

/** Hearts on a comment, from me: how many, whether mine is one, and whether I may (not on my own). */
const heartsOf = (c: { author: string; heartedBy?: string[] }): { hearts: number; hearted: boolean; canHeart: boolean } => {
  const by = c.heartedBy ?? [];
  const me = session?.name.toLowerCase();
  return { hearts: by.length, hearted: !!me && by.some((n) => n.toLowerCase() === me), canHeart: !!session && !mine(c.author) };
};
const commentViews = (list: Comment[]): CommentView[] => list.map((c) => ({ ...c, canDelete: mine(c.author), ...heartsOf(c) }));

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
  async onHeart(noteId, commentId) {
    if (!session) return;
    try {
      await heartComment(session.token, commentId);
      await refreshComments(noteId);
    } catch (err) {
      throw asError(err);
    }
  },
  onReport(about) {
    panel.close();
    bugReport.open(true, about);
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
const chat = mountChat({
  onSend: (text) => {
    net?.chat(text);
    quests.done("chat");
  },
  maxLength: 200,
});

// In a meeting room, its group-chat window takes the place of the corner chat.
const roomPanel = mountRoomPanel({
  onSend: (text) => net?.chat(text),
  onInvite: (name) => net?.invite(name),
  onSaveChat: () => (isMember(session) ? net?.saveChat() : signupPrompt.open("save a chat")),
  onLeave: () => {
    const out = space?.doors[0];
    if (out) setSpace(out.to, out.arrive, true);
  },
  onShare: async (file, progress) => (session ? upload(session.token, { kind: "room" }, file, progress) : "Join first."),
  onOpenFile: async (id) => (session ? openFile(session.token, id) : "Join first."),
  onImageLink: async (id) => (session ? imageLink(session.token, id) : null),
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
    if (id === "note" && space?.id === "poop") doPoop();
    else if (id === "note" && !isMember(session)) signupPrompt.open("stick a note");
    else if (id === "note") void writeNote();
    else sendEmote(id as Emote);
    stage.focus();
  },
);

// The server lets wave, yes, no and "mate" through once every two seconds
// (dance as often as you like); a press inside that gap would just vanish, so
// say so instead.
const EMOTE_GAP_MS = 2000;
let lastEmoteAt = 0;
function sendEmote(kind: Emote): void {
  if (kind === "wave") quests.done("wave");
  const now = Date.now();
  if (kind !== "dance") {
    if (now - lastEmoteAt < EMOTE_GAP_MS) return toast("One moment before the next one.");
    lastEmoteAt = now;
  }
  net?.emote(kind);
}

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
  async save(url, newTab) {
    if (!session || !editing) return "Join first.";
    try {
      await setClassroomLink(session.token, editing.code, editing.which, url, newTab);
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : "Could not save it.";
    }
  },
  visit(url, newTab) {
    webview.open({ label: "Page from the staff", url, embeddable: !newTab });
  },
});
function openStaffLink(which: "board" | "side"): void {
  if (!space) return;
  const room = classroomList.find((c) => c.space === space!.id);
  if (!room) return;
  const url = (which === "board" ? room.boardUrl : room.sideUrl) ?? null;
  const newTab = (which === "board" ? room.boardNewTab : room.sideNewTab) ?? false;
  const name = which === "board" ? `${room.code} whiteboard` : `${room.code} board (right of the whiteboard)`;
  if (isStaff(session)) {
    editing = { code: room.code, which };
    linkEditor.open({ title: name, url, newTab });
  } else if (url) webview.open({ label: name, url, embeddable: !newTab });
  else toast("Nothing here yet: the staff haven't put a page up.");
}

function useClassrooms(list: Classroom[]): void {
  classroomList = list;
  setClassrooms(list);
  picker.update(withOnline(list));
}

// Who's where, as head counts only (plan 32): a line under the HUD's name and
// a count beside each classroom in the picker, so nobody walks into an empty
// room without knowing. Meeting rooms come summed as "rooms".
let onlineCounts: Record<string, number> = {};
const withOnline = (list: Classroom[]) => list.map((c) => ({ ...c, online: onlineCounts[c.space] ?? 0 }));
function showOnline(): void {
  // Short labels on a phone, so the line fits beside the gear.
  const short = window.matchMedia("(max-width: 700px)").matches;
  const n = (id: string): number => onlineCounts[id] ?? 0;
  const inClassrooms = classroomList.reduce((sum, c) => sum + n(c.space), 0);
  const parts = [
    `Campus ${n("outdoor")}`,
    `Hub ${n("hub")}`,
    `${short ? "Lib" : "Library"} ${n("library")}`,
    `ANUSA ${n("anusa")}`,
    `${short ? "Class" : "Classrooms"} ${inClassrooms}`,
    `Rooms ${n("rooms")}`,
  ];
  hudOnline.textContent = `${short ? "" : "Online: "}${parts.join(" · ")}`;
  hudOnline.hidden = false;
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
// Woof woof, woof woof, woof: five barks in a happy rhythm, and a jump.
const HAPPY_BARKS_MS = [0, 260, 700, 960, 1450];
const dogPrompt = mountDogPrompt({
  onFeed() {
    dogHappy();
    for (const at of HAPPY_BARKS_MS) window.setTimeout(() => sfx("bark"), at);
  },
});
// Lab Coffee's menu board, north of 154: the cafés on campus.
const cafeGuide = mountCafeGuide();

// Boards in classrooms (Q&A, Notices, Board), the Student Hub and on the
// lawn. The server decides who may post in a staff-only tab; the dialog only
// hides the button from everyone else.
const failed = (err: unknown, fallback: string): string => (err instanceof ApiError ? err.message : fallback);
// Which board is open: its space's, or another in the same space (the Hub's
// enquiry PC opens "hub-desk").
let boardKey = "";
const board = mountBoard({
  async list(tab) {
    if (!space) return [];
    return (await getPosts(boardKey || space.id, tab, session?.token)).map((p) => ({ ...p, canDelete: !p.pinned && mine(p.author), canEdit: !p.pinned && mine(p.author) }));
  },
  async comments(postId) {
    return (await getPostComments(postId, session?.token)).map((c) => ({ ...c, canDelete: mine(c.author), canEdit: mine(c.author), ...heartsOf(c) }));
  },
  async heartComment(commentId) {
    if (!session) return "Join first.";
    try {
      await heartPostComment(session.token, commentId);
      return null;
    } catch (err) {
      return failed(err, "Could not heart that.");
    }
  },
  report(about) {
    board.close();
    bugReport.open(true, about);
  },
  mayWrite: () => isMember(session),
  askSignup(what) {
    signupPrompt.open(what);
  },
  async joinGroup(postId) {
    if (!session) return "Join first.";
    try {
      await joinGroup(session.token, postId);
      return null;
    } catch (err) {
      return failed(err, "Could not join that group.");
    }
  },
  myName: () => session?.name ?? null,
  async post(tab, title, text, files, progress, isPrivate = false, capacity) {
    if (!session || !space) return "Join first.";
    let id: number;
    try {
      id = (await createPost(session.token, boardKey || space.id, tab, title, text, isPrivate, capacity)).id;
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
  imageLink: async (id) => (session ? imageLink(session.token, id) : null),
  async comment(postId, text) {
    if (!session) return "Join first.";
    try {
      await createPostComment(session.token, postId, text);
      return null;
    } catch (err) {
      return failed(err, "Could not add that comment.");
    }
  },
  async editPost(postId, title, text, capacity) {
    if (!session) return "Join first.";
    try {
      await editPost(session.token, postId, title, text, capacity);
      return null;
    } catch (err) {
      return failed(err, "Could not save that.");
    }
  },
  async editComment(commentId, text) {
    if (!session) return "Join first.";
    try {
      await editPostComment(session.token, commentId, text);
      return null;
    } catch (err) {
      return failed(err, "Could not save that.");
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

// The board's config (its tabs, who posts where) comes from the server.
// `key` is the space's own board, or "hub-desk" for the Hub's enquiry PC.
async function openBoard(id: SpaceId, key: string = id): Promise<void> {
  try {
    const config = await getBoardConfig(key);
    boardKey = key;
    if (space?.id === id) board.open(config, isStaff(session));
  } catch (err) {
    toast(failed(err, "Could not open the board. Try again."));
  }
}

// When a dialog closes, hand focus back to the game view.
for (const id of ["class-picker", "webview", "dog-prompt", "cafe-guide", "board"]) {
  const el = document.getElementById(id);
  if (el) new MutationObserver(() => el.hidden && playing && stage.focus()).observe(el, { attributes: true, attributeFilter: ["hidden"] });
}

const busy = (): boolean =>
  chat.isTyping() || roomPanel.isTyping() || muteDialog.isOpen() || npcChat.isOpen() || mailbox.isOpen() || panel.isOpen() || composer.isOpen() || chooser.isOpen() || settingsOpen() || picker.isOpen() || webview.isOpen() || dogPrompt.isOpen() || cafeGuide.isOpen() || board.isOpen() || projectList.isOpen() || linkEditor.isOpen() || bugReport.isOpen() || lookPicker.isOpen() || signupPrompt.isOpen();
const keyGuide = mountKeyGuide();

// --- the current space -----------------------------------------------------

let playing = false;
/** When the admin's "coming in" restriction ends (Canberra time), for the join screen. */
let stoppedUntil = "";
let vy = 0;

const doorLabels: CSS2DObject[] = [];
const labelAt = new THREE.Vector3();

// A key badge floats over every door, screen and board you can use (not
// seats or notes), so it's clear from a few steps away what E does something
// at; the one E would use now turns the accent colour. Phones show "Use".
const BADGE_RANGE = 7; // indoors, badges show within this
const BADGE_RANGE_OUT = 12;
let badges: { obj: CSS2DObject; x: number; z: number }[] = [];

function placeBadges(): void {
  for (const b of badges) {
    scene.remove(b.obj);
    b.obj.element.remove();
  }
  badges = [];
  if (!space) return;
  const at = [...space.doors.filter((d) => !d.secret), ...(space.links ?? []), ...(space.spots ?? [])];
  for (const { x, z } of at) {
    const el = document.createElement("div");
    el.className = "use-badge";
    el.textContent = touchScreen.matches ? "Use" : "E";
    el.setAttribute("aria-hidden", "true");
    const obj = new CSS2DObject(el);
    obj.position.set(x, 2.3, z); // over where you stand, low enough to sit over what you use (3.2 floated behind it)
    obj.visible = false;
    scene.add(obj);
    badges.push({ obj, x, z });
  }
}

function showBadges(target: Target | null): void {
  // The target is the nearest door, link or spot, so its badge is the nearest one.
  const lit = target && target.kind !== "seat" && target.kind !== "note";
  const range = space?.outdoor ? BADGE_RANGE_OUT : BADGE_RANGE;
  let nearest: (typeof badges)[number] | null = null;
  let nearestD = Infinity;
  for (const b of badges) {
    const d = Math.hypot(b.x - player.position.x, b.z - player.position.z);
    b.obj.visible = playing && d <= range;
    if (d < nearestD) [nearest, nearestD] = [b, d];
    b.obj.element.classList.remove("on");
  }
  if (lit && nearest) nearest.obj.element.classList.add("on");
}

// The AI campus assistants (plan 56): fetched once, stood in their spaces as
// figures with a name tag, an E spot in front of each ("Talk to …").
let npcList: NpcDef[] = [];
const npcFigures: Avatar[] = [];
/** Each assistant's name tag, shown only within NPC_TAG_RANGE (from across a space they cluttered the view). */
const npcTags: { obj: CSS2DObject; at: THREE.Object3D }[] = [];
const NPC_TAG_RANGE = 5.5;
const npcChat = mountNpcChat({
  async ask(id, text) {
    if (!session) return "Join first.";
    try {
      return await askNpc(session.token, id, text);
    } catch (err) {
      return err instanceof ApiError ? err.message : "Something went wrong.";
    }
  },
  openLink(label, url) {
    // Most of these sites refuse to be framed, so a new tab.
    webview.open({ label, url, embeddable: false });
  },
});
void getNpcs()
  .then((list) => {
    npcList = list;
    if (space) placeNpcs(space);
  })
  .catch(() => {});
/** Puts a space's assistants in it, once: a figure in the space's group, and an E spot. */
function placeNpcs(s: SpaceDef): void {
  if (s.group.userData.npcsPlaced) return;
  const here = npcList.filter((n) => n.space === s.id);
  if (!here.length) return;
  s.group.userData.npcsPlaced = true;
  for (const n of here) {
    const a = new Avatar(n.look);
    a.group.position.set(n.x, 0, n.z);
    a.group.rotation.y = n.rot;
    // Just the name over them (side by side, a role made the tags overlap); the E hint says the role.
    npcTags.push({ obj: tag(a.group, n.name, 2.2, "player-label npc-label"), at: a.group });
    s.group.add(a.group);
    npcFigures.push(a);
    // You talk to them from in front (they face +z by default: so from +z).
    const reach = n.reach ?? 1.6;
    s.spots = [...(s.spots ?? []), { x: n.x + Math.sin(n.rot) * reach, z: n.z + Math.cos(n.rot) * reach, id: `npc:${n.id}`, label: `Talk to ${n.name} (${n.role})` }];
  }
  if (s === space) placeBadges();
}

// The campus minimap (plan 53): the walkable ground and buildings outside,
// and the places you can go in. Same bounds as spaces/outdoor.ts.
const minimap = mountMinimap({
  bounds: { minX: -75, maxX: 27, minZ: -41, maxZ: 25 },
  areas: [
    { minX: -51.8, maxX: 5, minZ: -39.4, maxZ: -2 },
    { minX: 5, maxX: 26, minZ: -39.4, maxZ: -20 },
    { minX: -9.6, maxX: 5.4, minZ: -2, maxZ: 22 },
    { minX: -61.4, maxX: -50.8, minZ: -36.8, maxZ: -32.2 },
    { minX: -73, maxX: -60.4, minZ: -38, maxZ: -31 },
  ],
  buildings: [
    { name: "Badger", minX: -47, maxX: -33, minZ: -20, maxZ: -6 },
    { name: "155", minX: -28, maxX: -10, minZ: -2, maxZ: 16 },
    { name: "154", minX: 6, maxX: 26, minZ: -20, maxZ: 14 },
    { name: "Library", minX: -9, maxX: 5, minZ: 23, maxZ: 25 },
  ],
  places: [
    { x: -9.7, z: 7, name: "Classrooms" },
    { x: 5.7, z: 3, name: "Hub" },
    { x: 5.7, z: -5, name: "ANUSA" },
    { x: -2, z: 22, name: "Library" },
    { x: 12, z: -21, name: "Lab Coffee" },
    { x: -26, z: -30, name: "ANU Sport" },
    { x: 1.75, z: -31.6, name: "Ad board" },
    { x: -56, z: -26, name: "Creek" },
    { x: -8.6, z: 2.3, name: "Study groups" },
  ],
});

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
  radial.relabel("note", id === "poop" ? "1 · 💩 Poop" : "1 · 📝 Sticky note");
  // Clear the last room's poops; in the Poop Room the server's list follows.
  showPoops([]);
  poopsShown = null;
  minimap.show(!!space.outdoor);
  if (id === "library") quests.done("library");
  if (meetingRoom(id)?.kind === "team") quests.done("room");
  placeNpcs(space);
  placeBadges();
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
  camera.position.copy(player.position).add(cameraOffset(space, at.z));
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

// The Poop Room (plan 62): the server keeps one poop per person and sends
// the whole list whenever it changes; this just redraws it.
const poopGroup = new THREE.Group();
let lastPoop = 0;
function doPoop(): void {
  const now = Date.now();
  if (now - lastPoop < 5000) return toast(`One poop every five seconds. Wait ${Math.ceil((5000 - (now - lastPoop)) / 1000)} s.`);
  lastPoop = now;
  net?.poop();
}
// Where each poop was in the last list; null until the first list after
// coming in, which only sets it (those poops were there already).
let poopsShown: Map<string, string> | null = null;
function showPoops(list: { name: string; x: number; z: number }[]): void {
  removeTags(poopGroup);
  poopGroup.clear();
  if (space?.id !== "poop") {
    poopsShown = null;
    return;
  }
  // Someone's poop is new or moved since the last list: pbbt.
  const now = new Map(list.map((p) => [p.name, `${p.x},${p.z}`]));
  if (poopsShown && [...now].some(([name, at]) => poopsShown!.get(name) !== at)) fart();
  poopsShown = now;
  for (const p of list) {
    const mesh = poopMesh();
    mesh.position.set(p.x, 0, p.z);
    tag(mesh, p.name, 0.55, "note-label");
    poopGroup.add(mesh);
  }
  if (!poopGroup.parent) scene.add(poopGroup);
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

// The join screen (signin.ts): sign in with name and password, sign up with
// an ANU email, reset a forgotten password, or come in as a guest. Whatever
// the way in, the session is kept the same way and the world opens.
const asSession = async (p: Promise<Session>): Promise<Session | string> => {
  try {
    return await p;
  } catch (err) {
    return err instanceof ApiError ? err.message : "Something went wrong.";
  }
};
const errorOf = async (p: Promise<unknown>): Promise<string | null> => {
  try {
    await p;
    return null;
  } catch (err) {
    return err instanceof ApiError ? err.message : "Something went wrong.";
  }
};
const signIn = mountSignIn({
  signIn: (name, password) => asSession(join(name.normalize("NFKC").trim(), undefined, password.trim())),
  guest: () => asSession(joinAsGuest(storage.get("campus.role") === "guest" ? storage.get("campus.token") || undefined : undefined)),
  signupStart: (who) => errorOf(signupStart(who)),
  signupCheck: (who, code) => errorOf(signupCheck(who, code)),
  signupFinish: (who, code, name, password) => asSession(signupFinish(who, code, name.normalize("NFKC").trim(), password)),
  resetStart: (who) => errorOf(resetStart(who)),
  resetFinish: (who, code, password) => asSession(resetFinish(who, code, password)),
  entered: (s) => void enterAs(s),
});

/** In with a session: keep it in this browser, send up a look picked before, and open the world. */
async function enterAs(s: Session): Promise<void> {
  session = s;
  // A look picked before joining goes up now; else the one saved last time.
  if (myLook) void saveLook(s.token, myLook).catch(() => {});
  else myLook = s.look;
  storage.set("campus.name", s.name);
  storage.set("campus.token", s.token);
  storage.set("campus.role", s.role);
  // Mail waiting since last time.
  if (isMember(s)) void getMailbox(s.token).then((box) => showUnread(box.unread)).catch(() => {});
  else showUnread(0);
  // Classrooms first, so a visitor who left one comes back into it.
  await loadClassrooms();
  enterWorld();
}

// Back again: this browser's guest, or a member still signed in here, goes
// straight in; otherwise the join screen.
async function returnIfKnown(): Promise<void> {
  const token = storage.get("campus.token");
  const name = storage.get("campus.name");
  if (!token) return;
  const back = storage.get("campus.role") === "guest" ? await asSession(joinAsGuest(token)) : name ? await asSession(join(name, token)) : null;
  if (back && typeof back !== "string") await enterAs(back);
}

function showJoin(message = ""): void {
  playing = false;
  keyGuide.hide();
  chat.hide();
  roomPanel.close();
  document.body.classList.remove("in-room");
  net?.close();
  net = null;
  for (const id of [...others.keys()]) removeOther(id);
  signIn.show(message);
  minimap.show(false);
  quests.show(false);
  hud.hidden = true;
  touch.hidden = true;
  hintEl.hidden = true;
}

function enterWorld(): void {
  if (!session) return;
  warmUp();
  becomeAvatar(session.name);
  joinDialog.hidden = true;
  hud.hidden = false;
  touch.hidden = false;
  playing = true;
  keyGuide.show();
  quests.show(true);
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
    chat(id, name, text, all) {
      if (id !== selfId && muteDialog.isMuted(name)) return;
      if (all) {
        // To every space: in the chat log, marked; a bubble only if they're here.
        chat.add({ name: `[all] ${name}`, text, self: id === selfId });
        const figure = all.space === space?.id ? figureOf(id) : null;
        if (figure) speak(figure, text, 5000);
        return;
      }
      // A ping for someone else's line in a meeting room: the window may be folded away on a phone.
      if (roomPanel.isOpen() && id !== selfId) sfx("message");
      if (roomPanel.isOpen()) roomPanel.add({ name, text, self: id === selfId });
      else chat.add({ name, text, self: id === selfId });
      const figure = figureOf(id);
      if (figure) speak(figure, text, 5000);
    },
    whisper(from, to, text) {
      const mineToo = !!session && from.toLowerCase() === session.name.toLowerCase();
      if (!mineToo && muteDialog.isMuted(from)) return;
      if (!mineToo) sfx("message");
      const line = { name: mineToo ? `→ ${to}` : `${from} → you`, text, self: mineToo };
      // In a meeting room the map chat is hidden: show it in the room's window.
      if (roomPanel.isOpen()) roomPanel.add(line);
      else chat.add({ ...line, whisper: true });
    },
    chatSaved(ok) {
      if (ok) {
        sfx("note");
        toast("Chat saved: ✉️ → Saved chats (30 days, only you).");
      } else {
        sfx("error");
        if (!isMember(session)) signupPrompt.open("save a chat");
        else toast("Only a meeting room's chat can be saved.");
      }
    },
    whisperRefused(reason, name) {
      sfx("error");
      const why: Record<string, string> = {
        guest: "Sign up to whisper to someone.",
        nobody: `Nobody signed up is called ${name}.`,
        self: "That's you.",
        offline: `${name} isn't here right now. Try ✉️ mail.`,
      };
      toast(why[reason] ?? "That whisper didn't go.");
    },
    allWait(seconds) {
      sfx("error");
      toast(seconds ? `/all again in ${seconds} s (once every 30 seconds).` : "/all doesn't leave a meeting room.");
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
    poops(list) {
      showPoops(list);
    },
    mail(unread) {
      showUnread(unread);
      sfx("message");
      toast(`✉️ New mail (${unread} unread).`);
    },
    hearts(noteId) {
      if (panel.openNoteId() === noteId) void refreshComments(noteId);
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
    online(counts) {
      onlineCounts = counts;
      showOnline();
      if (picker.isOpen()) picker.update(withOnline(classroomList));
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
      // A shared file comes back from the server like anyone's line: mark our own.
      if (roomPanel.isOpen()) roomPanel.add({ ...line, self: !line.system && line.name === session?.name });
    },
    restricted(what, until) {
      sfx("error");
      const when = canberraTime(until);
      if (what === "join") stoppedUntil = when;
      const doing: Record<string, string> = { chat: "chatting", notes: "sticking notes", posts: "posting on boards", join: "coming in" };
      toast(`The admin has stopped you ${doing[what] ?? what} until ${when}.`);
    },
    removed(why) {
      sfx("error");
      showJoin(
        why === "kicked"
          ? "The admin has put you out of the campus. You can come back in."
          : `The admin has stopped you coming in${stoppedUntil ? ` until ${stoppedUntil}` : " for now"}.`,
      );
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
// iPhones ignore the viewport's user-scalable=no, so pinching, or tapping
// twice fast (two fingers on the pad and Jump), zooms the page. Over the game
// and its buttons, both are stopped here; windows scroll and zoom as normal.
const overGame = (t: EventTarget | null): boolean => t instanceof Element && !!t.closest("#stage, #touch");
for (const type of ["gesturestart", "gesturechange"]) {
  document.addEventListener(type, (e) => {
    if (overGame(e.target)) e.preventDefault();
  });
}
document.addEventListener(
  "touchmove",
  (e) => {
    if (e.touches.length > 1 && overGame(e.target)) e.preventDefault();
  },
  { passive: false },
);
let lastTouchEnd = 0;
document.addEventListener(
  "touchend",
  (e) => {
    const now = performance.now();
    if (now - lastTouchEnd < 350 && overGame(e.target)) e.preventDefault();
    lastTouchEnd = now;
  },
  { passive: false },
);
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
// Use acts on pointerdown like the rest, except at a link that opens a new
// tab: phones only let a page open a tab from the end of a tap, not its
// start, so that one waits for the finger to lift.
$("use-btn").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (!playing || busy()) return;
  const target = nearestTarget();
  if (target?.kind === "link" && !target.embeddable && e.pointerType !== "mouse") useOnLift = true;
  else {
    interact();
    if (busy()) swallowClickUntil = performance.now() + 700;
  }
});
let useOnLift = false;
$("use-btn").addEventListener("pointerup", () => {
  if (!useOnLift) return;
  useOnLift = false;
  if (playing && !busy()) interact();
});
$("use-btn").addEventListener("pointercancel", () => (useOnLift = false));
tap("menu-btn", () => (radial.isOpen() ? radial.close() : radial.open()));

// --- actions ---------------------------------------------------------------

function jump(): void {
  // Only from the ground (the floor, or a kerb you're standing on): no double jumps.
  // Seated, jumping gets you up first.
  if (mySeat) return standUp();
  if (!space || player.position.y > groundAt(player.position.x, player.position.z, space.colliders) + 0.01) return;
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

/** How far in front of a seat you stand up: past a sofa's front edge and your own width. */
const STAND_STEP = 0.75;
function standUp(): void {
  if (!mySeat) return;
  // Step out the way the seat faces. Left on the seat, you were inside the
  // sofa's footprint, and pushing out of it could put you behind the sofa.
  const { seat } = mySeat;
  player.position.set(seat.x + Math.sin(seat.rot) * STAND_STEP, 0, seat.z + Math.cos(seat.rot) * STAND_STEP);
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
    if (!view.group.visible) continue; // muted
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
  // Anything but a door opens a window: a soft "open" sound (the dog barks instead).
  if (target.kind !== "door" && !(target.kind === "spot" && target.id === "dog")) sfx("open");
  if (target.kind === "door") {
    if (target.door.to === "classroom") {
      stopMoving();
      if (classroomList.length === 0) void loadClassrooms();
      picker.open(withOnline(classroomList), isStaff(session));
    } else if (meetingRoom(target.door.to)) {
      // The server decides whether there's room and whether we're invited;
      // we walk in when it says yes (roomOpen below).
      stopMoving();
      net?.enter(target.door.to, target.door.arrive.x, target.door.arrive.z);
    } else if (space && meetingRoom(space.id) && roomPanel.isOpen()) {
      // Out of a meeting room by its door: the same as Leave room, which
      // warns the last one out that the chat and files go.
      stopMoving();
      roomPanel.askLeave();
    } else setSpace(target.door.to, target.door.arrive, true);
  } else if (target.kind === "spot") {
    stopMoving();
    if (target.id === "dog") {
      sfx("bark");
      dogPrompt.open();
    }
    else if (target.id === "cafes") cafeGuide.open();
    else if (target.id === "board" && space) void openBoard(space.id);
    else if (target.id === "enquiries" && space) void openBoard(space.id, "hub-desk");
    else if (target.id === "study-groups" && space) void openBoard(space.id, "study-groups");
    else if (target.id.startsWith("npc:")) {
      const npc = npcList.find((n) => `npc:${n.id}` === target.id);
      if (npc) npcChat.open(npc);
    }
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

/**
 * The camera's offset at `z`: the space's own, except near a south wall,
 * where it rises and leans in until it looks down from over your head.
 */
const camOffset = new THREE.Vector3();
function cameraOffset(s: SpaceDef, z: number): THREE.Vector3 {
  camOffset.copy(s.camera);
  if (!s.southWall) return camOffset;
  const { from, z: wall } = s.southWall;
  const t = THREE.MathUtils.smoothstep(z, from, wall);
  // Higher and closer, looking down on you at the edge, so the building stays in front of the camera.
  camOffset.set(s.camera.x, THREE.MathUtils.lerp(s.camera.y, 12, t), THREE.MathUtils.lerp(s.camera.z, 1.2, t));
  return camOffset;
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
        walked += (running ? RUN_SPEED : SPEED) * dt;
        if (walked > 8) quests.done("walk");
        // Turn smoothly toward the way we're going (the model faces +z).
        const want = Math.atan2(move.x, move.z);
        const turn = Math.atan2(Math.sin(want - player.rotation.y), Math.cos(want - player.rotation.y));
        player.rotation.y += turn * Math.min(1, dt * 14);
      }
    }
    me.setMotion(mySeat ? "sit" : moving ? (running ? "run" : "walk") : "idle");
    // The ground is the floor, or the top of a kerb you're over: land on it,
    // and step off its edge to drop back down.
    const ground = groundAt(player.position.x, player.position.z, space.colliders);
    if (moving && player.position.y <= ground) step(space.floor ?? "concrete", now, running ? 0.28 : 0.42);
    vy -= GRAVITY * dt;
    player.position.y = Math.max(ground, player.position.y + vy * dt);
    if (player.position.y <= ground) vy = 0;
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

    const found = busy() ? null : nearestTarget();
    // A secret door works but says nothing (the Poop Room's).
    const target = found?.kind === "door" && found.door.secret ? null : found;
    showBadges(target);
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
  for (const a of npcFigures) a.update(dt);
  for (const t of npcTags) {
    const near = t.at.position.distanceTo(player.position) < NPC_TAG_RANGE;
    if (t.obj.visible !== near) t.obj.visible = near;
  }
  minimap.draw(player.position.x, player.position.z, player.rotation.y);
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
    view.label.visible = view.group.visible && view.group.position.distanceTo(player.position) <= NOTE_LABEL_RANGE;
  }
  // Door labels only near their door: a wall of them read as clutter, and
  // from afar they sat on top of the signs (outside, the buildings' names
  // stay visible from across the lawn).
  // In a meeting room the dock and chat take the right-hand column, and the
  // exit door's label sat half under it ("Leave the roo"): nudge any label
  // that would run under it back to the left.
  const columnLeft = roomPanel.isOpen() ? (document.getElementById("room-ui")?.getBoundingClientRect().left ?? Infinity) : Infinity;
  for (const label of doorLabels) {
    label.getWorldPosition(labelAt);
    const d = Math.hypot(labelAt.x - player.position.x, labelAt.z - player.position.z);
    label.visible = d <= (space.outdoor ? DOOR_LABEL_RANGE_OUT : DOOR_LABEL_RANGE);
    // Measured without the nudge (the renderer sets only its transform), then nudged.
    const el = label.element;
    const nudge = parseFloat(el.style.marginLeft) || 0;
    const over = label.visible && columnLeft !== Infinity ? el.getBoundingClientRect().right - nudge + 8 - columnLeft : 0;
    el.style.marginLeft = over > 0 ? `${-over}px` : "";
  }

  // The sun's shadow box follows the player.
  sun.target.position.copy(player.position).setY(0);
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 50);

  // Third-person camera, following across the floor but not up a jump.
  const desired = player.position.clone().setY(0).add(cameraOffset(space, player.position.z));
  camera.position.lerp(desired, 1 - Math.exp(-8 * dt));
  lookTarget.copy(player.position).setY(space.outdoor ? 1.8 : 1);
  camera.lookAt(lookTarget);
  skyDome.position.copy(camera.position);
  // High quality (plan 35a): the clouds drift, the dome turning slowly about
  // its axis (once in about 20 minutes), so the sky wraps round seamlessly.
  // The light stays where it is, so shading doesn't move with it.
  if (highQuality) skyDome.rotation.y += dt * ((Math.PI * 2) / 1200);

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
void returnIfKnown();
// A guest who tries something that needs signing up: say so, once, with a way to it.
let signupPromptAt = 0;
whenSignupNeeded(() => {
  if (Date.now() - signupPromptAt < 4000 || signupPrompt.isOpen()) return;
  signupPromptAt = Date.now();
  signupPrompt.open();
});
