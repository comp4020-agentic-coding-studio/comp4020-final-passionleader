import { randomBytes, randomUUID } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { MAX_CHAT } from "./accounts.ts";
import { addStamp, isStaff, dropRoomFiles, keepRoomFiles, findByName, findByToken, followersOf, isFollowing, isMember, presenceMutualOnly, keepChatLine, lastSpot, lookOf, tagsOf, poopsNow, putPoop, restrictionOn, saveChat, saveLastSpot, seen, stampCount, type Look } from "./db.ts";
import { removeObjects } from "./files.ts";
import { log } from "./log.ts";
import { ROOM_CAP, STAMPS, clampTo, isSpace, roomOf, spaceInfo, stampOf, type SpaceId } from "./spaces.ts";
import { KNOCK_GAP_MS, PRESENCE_GAP_MS, mayTell, validOfficeRoom } from "./social.ts";
import { createTables } from "./tables.ts";
import { VIDEO_GAP_MS, applyVideo, videoView, type VideoState } from "./video.ts";

// The real-time layer: one WebSocket per open tab, all to this one server.
// Everything is per space: you only see, hear and get updates about people in
// the space you're in. Live positions only ever live in memory here; SQLite
// sees a visitor's spot once, when they leave. The protocol only knows
// "move", "chat", "emote" and "action", never a particular room or verb, so
// the spaces and what people do in them can keep changing.

/** `seat` is the seat they're sitting on ("<space>:<n>"), if any; `look` how their figure looks. */
export type Player = { id: string; name: string; space: SpaceId; x: number; y: number; z: number; rot: number; seat?: string; look?: Look | null; staff?: true; status?: Status; tags?: string[]; office?: true };
/** How open someone is to a chat (RICE v2 #3): one of three, never free text, shown beside their name to their space. */
export type Status = "chat" | "study" | "away";
const STATUSES: ReadonlySet<string> = new Set(["chat", "study", "away"]);
const STATUS_GAP_MS = 2000;
const lastStatus = new WeakMap<WebSocket, number>();
/** Who's behind a socket, for the activity log only: never sent to anyone. */
const owners = new WeakMap<WebSocket, { name: string; token: string; role: string }>();

const EMOTES = new Set(["wave", "yes", "no", "mate", "dance"]);
// The Poop Room easter egg (plan 62): one poop per person, five seconds
// apart; a new one replaces your last. Kept in SQLite for 30 days (plan 104:
// they used to vanish on every deploy), sent only to whoever is in the room.
const lastPoop = new Map<string, number>();
/** When someone in a room last invited a person ("space:name"): one invitation every ten seconds. */
const lastAsked = new Map<string, number>();
// Members' poops are kept in SQLite (30 days); a guest's only in memory while the server runs
// (11/4: guests store as little as possible), dropped with their row's purge or a restart.
const guestPoops = new Map<string, { name: string; x: number; z: number }>();
const poopList = (): { name: string; x: number; z: number }[] => [...poopsNow(), ...guestPoops.values()];
const MAX_JUMP = 3;
// Positions go out ten times a second, only for spaces where someone moved.
const TICK_MS = 100;
// Fly's proxy drops idle sockets, and a closed laptop never says goodbye.
const PING_MS = 25_000;
// A little breathing room between chat lines from one person.
const CHAT_GAP_MS = 700;
// Wave, yes, no and "mate" at most once every two seconds; dance isn't limited.
const EMOTE_GAP_MS = 2000;
// "/all message" reaches every space's chat log (not meeting rooms', which are
// private): once every 30 seconds each, so it can't be used to flood the campus.
const ALL_PREFIX = /^\/all\s+/i;
// "/w name message": a whisper to one member, wherever they are (plan 17).
const WHISPER = /^\/w\s+(\S+)\s+([\s\S]+)$/i;
const ALL_GAP_MS = 30_000;

const players = new Map<WebSocket, Player>();
const alive = new WeakSet<WebSocket>();
// By name, not by socket: more tabs don't multiply the rate (service check, 11/8).
const lastChat = new Map<string, number>();
const lastEmote = new Map<string, number>();
const lastAll = new Map<string, number>(); // by name, so a second tab doesn't double it
const dirty = new Set<SpaceId>();
// How many are where goes to everyone, at most every few seconds and only
// when it changed, so nobody walks into an empty Hub without knowing.
const ONLINE_MS = 5_000;
let lastOnline = "";

const inSpace = (space: SpaceId): Player[] => [...players.values()].filter((p) => p.space === space);

/** New interest tags for everyone called `name` (all their tabs), shown to their space at once. */
export function setTags(name: string, tags: string[]): void {
  for (const p of players.values()) {
    if (p.name.toLowerCase() !== name.toLowerCase()) continue;
    if (tags.length) p.tags = tags;
    else delete p.tags;
    dirty.add(p.space);
  }
}

/** A new look for everyone called `name` (all their tabs), shown to their space at once. */
export function setLook(name: string, look: Look): void {
  for (const p of players.values()) {
    if (p.name.toLowerCase() !== name.toLowerCase()) continue;
    p.look = look;
    dirty.add(p.space);
  }
}

// --- seats ----------------------------------------------------------------------
// Chairs, sofas and benches are numbered per space by the client
// ("<space>:<n>"); the server only makes sure one person sits on each and
// that it's in the space they're in. Getting up is moving, or leaving.
const SEAT = /^([a-z0-9-]+):([0-9]{1,3})$/;
const seatTaken = (seat: string, by: Player): boolean => [...players.values()].some((p) => p !== by && p.seat === seat);

// --- meeting rooms ------------------------------------------------------------
// A room's chat isn't stored either: it's kept here, in memory, only while at
// least one person is in the room, so someone who walks in mid-conversation
// sees what was said; when the last person leaves, the chat, the host and the
// invite list all go. Counselling rooms are invite-only: the first one in is
// the host, and only the people someone inside has invited may follow.
// Files shared in a room (files.ts) belong to that sitting of it (`session`),
// so they go with it too: nobody can fetch them after the room empties.

const ROOM_LINES = 100;
type RoomLine = { name: string; text: string; system?: boolean; file?: { id: string; name: string; size: number } };
interface RoomState {
  host: string;
  /** This sitting of the room: a new one each time it fills from empty. */
  session: string;
  invited: Set<string>; // lower-cased names
  lines: RoomLine[];
  /** The shared notes (plan 39): one Markdown text, last write wins; goes with the room. */
  pad: string;
  padBy: string | null;
  /** The room's whiteboard (plan 85): an Excalidraw collaboration link, made when first asked for, gone with the room. */
  board?: string;
  /** The room's shared pomodoro (RICE v3 #19), if anyone has started one; goes with the room. */
  timer?: RoomTimer;
  /** The room's shared viewing screen (server/video.ts), if anyone has put a video on; goes with the room. */
  video?: VideoState;
}
/** `endsAt` (server clock, ms) while running; `left` (ms) while paused. Clients are sent the time left, never a clock, so theirs can be wrong. */
interface RoomTimer {
  phase: "work" | "break";
  running: boolean;
  endsAt: number;
  left: number;
  by: string;
  /** Fires when the running phase ends; cleared with the timer. */
  ends?: NodeJS.Timeout;
}
// A pomodoro: 25 minutes of work, then 5 of break, then it is spent (the next round starts by hand).
const WORK_MS = 25 * 60_000;
const BREAK_MS = 5 * 60_000;
// Anyone inside may change it, but one change a second each, so it can't be hammered.
const TIMER_GAP_MS = 1000;
// The +5 and -5 buttons: a phase never runs past an hour or under a minute.
const STEP_MS = 5 * 60_000;
const MAX_MS = 60 * 60_000;
const MIN_MS = 60_000;
const lastTimer = new Map<string, number>(); // by name, so a second tab doesn't double it
const PAD_MAX = 5000;
const rooms = new Map<SpaceId, RoomState>();

function roomView(space: SpaceId): Record<string, unknown> | null {
  const room = roomOf(space);
  const state = rooms.get(space);
  if (!room || !state) return null;
  const members = inSpace(space).map((p) => p.name);
  const invited = room.kind === "counselling" ? [...state.invited].filter((n) => !members.some((m) => m.toLowerCase() === n)) : undefined;
  return { kind: room.kind, cap: ROOM_CAP, members, host: room.kind === "counselling" ? state.host : undefined, invited };
}

/** What the room's clients are told about its timer: the time left now (not a clock), or null if none is set. */
function timerView(state: RoomState | undefined): Record<string, unknown> | null {
  const t = state?.timer;
  if (!t) return null;
  return { phase: t.phase, running: t.running, left: t.running ? Math.max(0, t.endsAt - Date.now()) : t.left, by: t.by };
}

const timerChanged = (space: SpaceId): void => broadcastSpace(space, { t: "action", kind: "timer", timer: timerView(rooms.get(space)) });

function stopTimer(state: RoomState): void {
  clearTimeout(state.timer?.ends);
  delete state.timer;
}

/** (Re)starts the running phase of a room's timer so it ends when `endsAt` comes. */
function armTimer(space: SpaceId, state: RoomState): void {
  const t = state.timer!;
  clearTimeout(t.ends);
  t.ends = setTimeout(() => timerEnded(space), Math.max(0, t.endsAt - Date.now()));
  t.ends.unref();
}

/** Work ends into the break, which starts by itself; the break ends the timer. */
function timerEnded(space: SpaceId): void {
  const state = rooms.get(space);
  const t = state?.timer;
  if (!state || !t || !t.running) return;
  if (t.phase === "work") {
    Object.assign(t, { phase: "break", endsAt: Date.now() + BREAK_MS, left: BREAK_MS });
    armTimer(space, state);
    roomSay(space, { name: "Timer", text: "Time for a 5-minute break.", system: true });
  } else {
    stopTimer(state);
    roomSay(space, { name: "Timer", text: "Break over. Start the timer for another round.", system: true });
  }
  timerChanged(space);
}

/**
 * The shared timer (RICE v3 #19): "start" starts a 25-minute round, or resumes
 * a paused one; "pause" and "reset" stop it; "more" and "less" move it by five minutes. Anyone inside may, never someone
 * outside (they have no room state), at most once a second each.
 */
function roomTimerAction(space: SpaceId, player: Player, msg: Record<string, unknown>): void {
  const state = rooms.get(space);
  if (!state) return;
  const op = msg.op;
  if (op !== "start" && op !== "pause" && op !== "reset" && op !== "more" && op !== "less") return;
  const now = Date.now();
  const key = player.name.toLowerCase();
  if (now - (lastTimer.get(key) ?? 0) < TIMER_GAP_MS) return;
  lastTimer.set(key, now);
  const t = state.timer;
  if (op === "start") {
    if (t?.running) return;
    if (t) Object.assign(t, { running: true, endsAt: now + t.left, by: player.name });
    else state.timer = { phase: "work", running: true, endsAt: now + WORK_MS, left: WORK_MS, by: player.name };
    armTimer(space, state);
    roomSay(space, { name: player.name, text: `${player.name} ${t ? "resumed" : "started"} the timer`, system: true });
  } else if (op === "more" || op === "less") {
    // Plus or minus five minutes on the phase now going (the user, 11/9): set or not, running or paused.
    // Never past an hour, never under a minute; with no timer yet, "+5" sets a paused 30-minute one.
    const step = op === "more" ? STEP_MS : -STEP_MS;
    if (!t && op === "less") return;
    const cur = t ?? (state.timer = { phase: "work", running: false, endsAt: 0, left: WORK_MS, by: player.name });
    const left = cur.running ? cur.endsAt - now : cur.left;
    const next = Math.min(MAX_MS, Math.max(MIN_MS, left + step));
    if (t && Math.abs(next - left) < 1000) return; // already at the hour or the minute
    cur.by = player.name;
    if (cur.running) {
      cur.endsAt = now + next;
      armTimer(space, state);
    } else cur.left = next;
    roomSay(space, { name: player.name, text: `${player.name} ${op === "more" ? "added" : "took off"} 5 minutes`, system: true });
  } else if (op === "pause") {
    if (!t?.running) return;
    clearTimeout(t.ends);
    Object.assign(t, { running: false, left: Math.max(0, t.endsAt - now), by: player.name });
    roomSay(space, { name: player.name, text: `${player.name} paused the timer`, system: true });
  } else {
    if (!t) return;
    stopTimer(state);
    roomSay(space, { name: player.name, text: `${player.name} reset the timer`, system: true });
  }
  timerChanged(space);
}

// Game tables (server/tables.ts): the people online, and a way to tell one of them something.
const tables = createTables({
  people: () => [...players.values()].map((p) => ({ name: p.name, space: p.space, x: p.x, z: p.z })),
  tell: (name, msg) => tellPerson(name, msg),
});

const lastVideo = new Map<string, number>(); // by name, so a second tab doesn't double it

/**
 * The room's shared video (server/video.ts): anyone inside may put a YouTube or Vimeo link on, play,
 * pause or seek; the last action wins and everyone inside is told where it now is. One action a
 * second per person. Never from outside (no room state), never told to anyone outside.
 */
function roomVideoAction(space: SpaceId, player: Player, msg: Record<string, unknown>): void {
  const state = rooms.get(space);
  if (!state) return;
  const now = Date.now();
  const key = player.name.toLowerCase();
  if (now - (lastVideo.get(key) ?? 0) < VIDEO_GAP_MS) {
    // Too soon: they're told how it stands, so their player falls back in step.
    tellPerson(player.name, { t: "action", kind: "video-refused", space, reason: "slow down", video: videoView(state.video, now) });
    return;
  }
  const done = applyVideo(state.video, player.name, msg, now);
  if (!done.ok) {
    if (done.reason === "link") log("refused", { name: player.name }, { action: "video", space, reason: "link" });
    tellPerson(player.name, { t: "action", kind: "video-refused", space, reason: done.reason, video: videoView(state.video, now) });
    return;
  }
  lastVideo.set(key, now);
  state.video = done.state;
  if (done.what) {
    log("video-set", { name: player.name }, { space, op: msg.op, ...(done.state ? { provider: done.state.provider } : {}) });
    roomSay(space, { name: player.name, text: done.what, system: true });
  }
  broadcastSpace(space, { t: "action", kind: "video", video: videoView(state.video, now) });
}

/** What a client may ask of the room it's in, by "kind" (the "action" message is generic; a new room verb is a new entry here). */
const ROOM_ACTIONS: Record<string, (space: SpaceId, player: Player, msg: Record<string, unknown>) => void> = {
  timer: roomTimerAction,
  video: roomVideoAction,
};

function roomSay(space: SpaceId, line: RoomLine): void {
  const state = rooms.get(space);
  if (!state) return;
  state.lines.push(line);
  if (state.lines.length > ROOM_LINES) state.lines.shift();
  broadcastSpace(space, { t: "action", kind: "room-line", line });
}

const roomChanged = (space: SpaceId): void => {
  const view = roomView(space);
  if (view) broadcastSpace(space, { t: "action", kind: "room", room: view });
};

/** Clears a room that has emptied: its chat, host, invites and files. */
function closeRoom(space: SpaceId): void {
  const state = rooms.get(space);
  if (!state) return;
  stopTimer(state);
  rooms.delete(space);
  removeObjects(dropRoomFiles(state.session));
}

/** Where `name` is right now, if they're online (their newest tab). */
/** Puts `name` out once (the admin's kick): closes their sockets; they may come straight back. Returns how many. */
export function kick(name: string): number {
  let n = 0;
  for (const [ws, p] of players) {
    if (p.name.toLowerCase() !== name.toLowerCase()) continue;
    ws.close(4004, "kicked");
    n++;
  }
  return n;
}

/** Tells `name`, in every tab they have open, about something just for them (new mail). */
export function tellPerson(name: string, msg: unknown): void {
  for (const [ws, p] of players) if (p.name.toLowerCase() === name.toLowerCase()) send(ws, msg);
}

/** Tells everyone called `name` they've been stopped from `what`; for "join", closes their sockets too. */
export function noticeRestriction(name: string, what: string, until: string): void {
  for (const [ws, p] of players) {
    if (p.name.toLowerCase() !== name.toLowerCase()) continue;
    send(ws, { t: "action", kind: "restricted", what, until });
    if (what === "join") ws.close(4003, "restricted");
  }
}

export function livePlayer(name: string): Player | undefined {
  let found: Player | undefined;
  for (const p of players.values()) if (p.name === name) found = p;
  return found;
}

/** The sitting of the meeting room `name` is in now, or null if they aren't in one. */
export function roomSessionOf(name: string, space: SpaceId): string | null {
  const state = rooms.get(space);
  if (!state || !inSpace(space).some((p) => p.name === name)) return null;
  return state.session;
}

/** Puts a file someone shared into the room's chat, for everyone inside. */
export function roomShare(space: SpaceId, name: string, file: { id: string; name: string; size: number }): void {
  roomSay(space, { name, text: `shared ${file.name}`, file });
}

/**
 * Why `name` can't come into `space`, or null if they can (any space that isn't a meeting room is
 * open). A counselling or interview room (off the Student Hub or the Career Hub) is opened only by
 * staff, the admin included: a student comes in only when someone inside invites them (the user,
 * 11/9). Team rooms stay open to anyone.
 */
function roomRefusal(space: SpaceId, name: string, staff: boolean): string | null {
  const room = roomOf(space);
  if (!room) return null;
  if (inSpace(space).length >= ROOM_CAP) return "full";
  const state = rooms.get(space);
  if (room.kind === "counselling" && !state && !staff) return "staff first";
  if (room.kind === "counselling" && state && !state.invited.has(name.toLowerCase())) return "not invited";
  return null;
}

/** Someone came into a meeting room: the first one sets it up, everyone else is announced. */
function roomJoined(space: SpaceId, name: string): void {
  if (!roomOf(space)) return;
  if (!rooms.has(space)) rooms.set(space, { host: name, session: randomUUID(), invited: new Set([name.toLowerCase()]), lines: [], pad: "", padBy: null });
  roomSay(space, { name, text: `${name} joined`, system: true });
  roomChanged(space);
}

/** Someone left a meeting room: the last one out clears it. */
function roomLeft(space: SpaceId, name: string, who: { name: string; token: string; role: string } | null): void {
  if (!rooms.has(space)) return;
  if (inSpace(space).length === 0) {
    closeRoom(space);
    log("room-closed", who, { space });
    return;
  }
  // The host walking out hands the room to someone still inside.
  const state = rooms.get(space)!;
  // Another tab of theirs still inside keeps their host role and invitation.
  const stillHere = inSpace(space).some((p) => p.name.toLowerCase() === name.toLowerCase());
  if (!stillHere && state.host === name) state.host = inSpace(space)[0]!.name;
  // An invitation is good for one visit (the user's call, 10/30): out again, it takes a new one.
  if (!stillHere && roomOf(space)?.kind === "counselling") state.invited.delete(name.toLowerCase());
  roomSay(space, { name, text: `${name} left`, system: true });
  roomChanged(space);
}

// --- office hours -------------------------------------------------------------------
// Staff (and the admin) may open "Office hours", with a counselling room if they like, while they
// are on the campus. It's an announcement they chose to make, so it is the one thing besides head
// counts that leaves a person's space: the Student Hub's people are told who has office hours open
// (a name and maybe a room number, never where the person is), and a "Office hours" badge shows on
// their name tag to whoever sees it. A student's "Knock" goes to that staff member alone, who is
// asked to invite them in (the counselling-room invitation). It's kept in memory with the sockets
// and ends when the staff member's last tab closes.
const office = new Map<string, { name: string; room: number | null }>(); // by lower-cased name
const lastKnock = new Map<string, number>(); // "student|staff", lower-cased

const officeList = (): { name: string; room: number | null }[] => [...office.values()];

/** Tells everyone in the Student Hub (or just `ws`) who has office hours open. */
function sendOffice(only?: WebSocket): void {
  const msg = { t: "action", kind: "office-now", list: officeList() };
  if (only) return send(only, msg);
  broadcastSpace("hub", msg);
}

/** Opens or closes `name`'s office hours in all their tabs; the Hub and their name tag are told. */
function setOffice(name: string, on: boolean, room: number | null): void {
  const key = name.toLowerCase();
  if (on) office.set(key, { name, room });
  else office.delete(key);
  for (const p of players.values()) {
    if (p.name.toLowerCase() !== key) continue;
    if (on) p.office = true;
    else delete p.office;
    dirty.add(p.space);
  }
  sendOffice();
}

// --- presence alerts ----------------------------------------------------------------
// "Tell me when they're on": someone a member follows comes onto the campus and they get one
// notice with the space's name, never a position. This is the one thing that leaves a person's
// space besides head counts, so it is narrow: members at both ends, only to followers the followed
// person allows (mutual follows by default), a meeting room is only ever "a room", and a follower
// hears at most once every ten minutes about the same person.
const lastTold = new Map<string, number>();

/** What a follower is told about where someone is: the space's name, never more; a meeting room (and the easter egg's) is "a room". */
const whereLabel = (space: SpaceId): string => (roomOf(space) || space === "poop" ? "a room" : (spaceInfo(space)?.label ?? "the campus"));

/** `name` just came on (no other tab of theirs was open): tell the followers they allow. */
function announceOn(visitor: { name: string; role: string }, space: SpaceId): void {
  if (!isMember(visitor)) return;
  const mutualOnly = presenceMutualOnly(visitor.name);
  const now = Date.now();
  for (const follower of followersOf(visitor.name)) {
    const person = findByName(follower);
    if (!person || !isMember(person)) continue;
    if (!mayTell(isFollowing(visitor.name, follower), mutualOnly)) continue;
    const key = `${follower.toLowerCase()}|${visitor.name.toLowerCase()}`;
    if (now - (lastTold.get(key) ?? 0) < PRESENCE_GAP_MS) continue;
    if (![...players.values()].some((p) => p.name.toLowerCase() === follower.toLowerCase())) continue;
    lastTold.set(key, now);
    tellPerson(follower, { t: "action", kind: "followed-on", name: visitor.name, where: whereLabel(space) });
  }
}

function send(ws: WebSocket, msg: unknown): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

/** Sends to everyone currently in one space. */
export function broadcastSpace(space: SpaceId, msg: unknown): void {
  const data = JSON.stringify(msg);
  for (const [ws, p] of players) if (p.space === space && ws.readyState === ws.OPEN) ws.send(data);
}

/** Sends to everyone online, wherever they are (e.g. the list of classrooms changed). */
export function broadcastAll(msg: unknown): void {
  const data = JSON.stringify(msg);
  for (const ws of players.keys()) if (ws.readyState === ws.OPEN) ws.send(data);
}

/**
 * Moves everyone in `space` to `to` (a classroom being closed), telling each
 * of them where they now are. Returns how many were moved.
 */
export function evictSpace(space: SpaceId, to: SpaceId, at: { x: number; z: number }): number {
  let moved = 0;
  for (const [ws, p] of players) {
    if (p.space !== space) continue;
    Object.assign(p, { space: to, ...clampTo(to, at.x, at.z), y: 0 });
    send(ws, { t: "moved", space: to, x: p.x, z: p.z, players: inSpace(to) });
    moved++;
  }
  closeRoom(space);
  if (moved) dirty.add(to);
  return moved;
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function onMessage(ws: WebSocket, raw: string): void {
  const player = players.get(ws);
  if (!player) return;
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }

  if (msg.t === "move" && num(msg.x) && num(msg.y) && num(msg.z) && num(msg.rot)) {
    // Same rule as everywhere: the client's numbers are a request, not the truth.
    const at = clampTo(player.space, msg.x, msg.z);
    // Moving away gets you up; a seated figure turning on the spot stays put.
    if (player.seat && Math.hypot(at.x - player.x, at.z - player.z) > 0.05) player.seat = undefined;
    Object.assign(player, at);
    player.y = Math.max(0, Math.min(MAX_JUMP, msg.y));
    player.rot = msg.rot;
    dirty.add(player.space);
  } else if (msg.t === "enter" && isSpace(msg.space) && num(msg.x) && num(msg.z)) {
    const from = player.space;
    const to = msg.space;
    if (from !== to) {
      // A meeting room is full at six, a counselling room is opened by staff and then lets in
      // only the people someone inside has invited: checked here, not by the client.
      const role = owners.get(ws)?.role;
      const refusal = roomRefusal(to, player.name, role === "staff" || role === "admin");
      if (refusal) {
        log("refused", owners.get(ws) ?? null, { action: "enter", space: to, reason: refusal });
        send(ws, { t: "action", kind: "room-refused", space: to, reason: refusal });
        return;
      }
    }
    player.space = to;
    player.seat = undefined;
    Object.assign(player, clampTo(to, msg.x, msg.z), { y: 0 });
    // Also when the client re-sends the space it is already in (it does on every welcome), so the
    // space someone arrives in counts.
    stampVisit(ws, to);
    if (from !== to) {
      broadcastSpace(from, { t: "leave", id: player.id });
      log("enter", owners.get(ws) ?? null, { from, space: to });
      roomLeft(from, player.name, owners.get(ws) ?? null);
      roomJoined(to, player.name);
      tables.left(player.name);
      if (to === "poop") send(ws, { t: "action", kind: "poops", poops: poopList() });
      if (to === "hub") sendOffice(ws);
    }
    // Into a meeting room, the client waits for this before it walks in.
    const view = roomView(to);
    if (view) send(ws, { t: "action", kind: "room-open", space: to, x: player.x, z: player.z, room: view, lines: rooms.get(to)?.lines ?? [], pad: { text: rooms.get(to)?.pad ?? "", by: rooms.get(to)?.padBy ?? null }, timer: timerView(rooms.get(to)), video: videoView(rooms.get(to)?.video), players: inSpace(to) });
    send(ws, { t: "players", players: inSpace(to) });
    dirty.add(to);
  } else if (msg.t === "sit" && (msg.seat === null || typeof msg.seat === "string")) {
    // Sitting down: the seat must be in this space and free. null = stand up.
    // The client sends the seat's spot with it, and you're put there, so the
    // moves that follow (from the same spot) don't count as walking off.
    const m = typeof msg.seat === "string" ? SEAT.exec(msg.seat) : null;
    if (msg.seat === null) player.seat = undefined;
    else if (!m || m[1] !== player.space || seatTaken(msg.seat, player)) {
      send(ws, { t: "action", kind: "seat-refused", seat: msg.seat });
      return;
    } else {
      player.seat = msg.seat;
      if (num(msg.x) && num(msg.z)) Object.assign(player, clampTo(player.space, msg.x, msg.z), { y: 0 });
    }
    dirty.add(player.space);
  } else if (msg.t === "chat" && typeof msg.text === "string") {
    const raw = msg.text.trim();
    const toAll = ALL_PREFIX.test(raw);
    const text = (toAll ? raw.replace(ALL_PREFIX, "") : raw).trim().slice(0, MAX_CHAT);
    const now = Date.now();
    const chatKey = player.name.toLowerCase();
    if (!text || now - (lastChat.get(chatKey) ?? 0) < CHAT_GAP_MS) return;
    lastChat.set(chatKey, now);
    const stopped = restrictionOn(player.name, "chat");
    if (stopped) {
      log("refused", owners.get(ws) ?? null, { action: "chat", space: player.space, reason: "restricted" });
      send(ws, { t: "action", kind: "restricted", what: "chat", until: stopped.until });
      return;
    }
    // "/w name" with nothing to say is refused, never sent as open chat.
    if (/^\/w(\s|$)/i.test(raw) && !WHISPER.test(raw)) {
      send(ws, { t: "action", kind: "whisper-refused", reason: "empty", name: (raw.split(/\s+/)[1] ?? "").slice(0, 20) });
      return;
    }
    const whisper = WHISPER.exec(raw);
    if (whisper) {
      // Members only, both ends; it goes to every tab the reader has open
      // and back to the sender, and is never kept (not even for reports).
      const to = findByName(whisper[1]);
      const reason = !isMember(owners.get(ws) ?? { role: "guest" }) ? "guest" : !to || !isMember(to) ? "nobody" : to.name.toLowerCase() === player.name.toLowerCase() ? "self" : ![...players.values()].some((p) => p.name.toLowerCase() === to.name.toLowerCase()) ? "offline" : null;
      if (reason || !to) {
        send(ws, { t: "action", kind: "whisper-refused", reason, name: whisper[1].slice(0, 20) });
        return;
      }
      const said = whisper[2].trim().slice(0, MAX_CHAT);
      log("whisper", owners.get(ws) ?? null, { to: to.name, chars: said.length });
      const line = { t: "whisper", from: player.name, to: to.name, text: said };
      tellPerson(to.name, line);
      tellPerson(player.name, line);
      return;
    }
    if (toAll) {
      // A meeting room's chat stays in the room, both ways.
      if (rooms.has(player.space)) {
        send(ws, { t: "action", kind: "all-wait", seconds: 0 });
        return;
      }
      const key = player.name.toLowerCase();
      const wait = ALL_GAP_MS - (now - (lastAll.get(key) ?? 0));
      if (wait > 0) {
        send(ws, { t: "action", kind: "all-wait", seconds: Math.ceil(wait / 1000) });
        return;
      }
      lastAll.set(key, now);
      log("chat", owners.get(ws) ?? null, { space: player.space, chars: text.length, all: true });
      // Everyone outside meeting rooms; the bubble only shows in the sender's space.
      for (const [other, p] of players) if (!rooms.has(p.space)) send(other, { t: "chat", id: player.id, name: player.name, text, all: true, space: player.space });
      keepChatLine(player.space, player.name, `[all] ${text}`);
      return;
    }
    // The log notes that someone spoke, and how much, not what they said.
    log("chat", owners.get(ws) ?? null, { space: player.space, chars: text.length });
    broadcastSpace(player.space, { t: "chat", id: player.id, name: player.name, text });
    // In a meeting room the line goes in the room's window, until the room
    // empties, and nowhere else. Map chat is kept a day, only so a report
    // about abuse can carry the last few minutes (db.ts, recentChat).
    if (rooms.has(player.space)) {
      const st = rooms.get(player.space)!;
      st.lines.push({ name: player.name, text });
      if (st.lines.length > ROOM_LINES) st.lines.shift();
    }
    else keepChatLine(player.space, player.name, text);
  } else if (msg.t === "action" && typeof msg.kind === "string" && Object.hasOwn(ROOM_ACTIONS, msg.kind)) {
    ROOM_ACTIONS[msg.kind]!(player.space, player, msg);
  } else if (msg.t === "action" && msg.kind === "table") {
    tables.action(player, msg, owners.get(ws) ?? null);
  } else if (msg.t === "pad" && typeof msg.text === "string") {
    // The room's shared notes: whoever is inside writes, everyone inside
    // sees it; the last write wins. Not logged (like the room's chat).
    const state = rooms.get(player.space);
    if (!state) return;
    state.pad = msg.text.slice(0, PAD_MAX);
    state.padBy = player.name;
    for (const [other, p] of players) if (p.space === player.space && other !== ws) send(other, { t: "action", kind: "pad", text: state.pad, by: player.name });
  } else if (msg.t === "whiteboard") {
    // One shared Excalidraw board per room while it lasts: a random room id
    // and key, so only people given the link (those inside) find it. The
    // drawing travels end-to-end encrypted through Excalidraw's own relay;
    // nothing of it reaches this server.
    const state = rooms.get(player.space);
    if (!state) return;
    state.board ??= `https://excalidraw.com/#room=${randomBytes(10).toString("hex")},${randomBytes(16).toString("base64url").slice(0, 22)}`;
    send(ws, { t: "action", kind: "whiteboard", url: state.board });
  } else if (msg.t === "save-chat") {
    // Keep this room's chat so far (or, with what: "notes", just its shared
    // notes), for this member, 30 days (db.ts saveChat); everyone inside is
    // told, since it's their words too.
    const notes = msg.what === "notes";
    const state = rooms.get(player.space);
    if (!state || !isMember(owners.get(ws) ?? { role: "guest" }) || (notes && !state.pad.trim())) {
      send(ws, { t: "action", kind: "chat-saved", ok: false, what: notes ? "notes" : "chat", reason: !state ? "not in a room" : notes && isMember(owners.get(ws) ?? { role: "guest" }) ? "empty" : "guest" });
      return;
    }
    const lines = notes
      ? [{ name: "Notes", text: state.pad }]
      : state.lines.map((l) => ({ name: l.name, text: l.text, ...(l.system ? { system: true } : {}) }));
    // A saved chat takes the shared notes with it, as a last line.
    if (!notes && state.pad.trim()) lines.push({ name: "Notes", text: state.pad });
    const id = saveChat(player.name, player.space, lines, notes ? "notes" : "chat");
    // The pictures the notes show are kept with this copy (the user, 11/9).
    const pictures = [...state.pad.matchAll(/\(room-file:([A-Za-z0-9-]+)\)/g)].map((m) => m[1]!);
    if (pictures.length) keepRoomFiles(state.session, pictures, id, player.name);
    log("chat-saved", owners.get(ws) ?? null, { space: player.space, lines: lines.length, what: notes ? "notes" : "chat" });
    send(ws, { t: "action", kind: "chat-saved", ok: true, id, what: notes ? "notes" : "chat" });
    roomSay(player.space, { name: player.name, text: `${player.name} saved ${notes ? "the shared notes" : "this chat"} (kept 30 days, for them only)`, system: true });
    roomChanged(player.space);
  } else if (msg.t === "invite" && typeof msg.name === "string") {
    // Anyone in a counselling room may invite someone in, by user name.
    const room = roomOf(player.space);
    const state = rooms.get(player.space);
    const invitee = findByName(msg.name.trim());
    const reason = !room || room.kind !== "counselling" || !state ? "not in a counselling room" : !invitee ? "no such user" : null;
    if (reason || !invitee || !state) {
      log("refused", owners.get(ws) ?? null, { action: "invite", space: player.space, reason });
      send(ws, { t: "action", kind: "room-refused", space: player.space, reason });
      return;
    }
    // Asking again (they declined by mistake, or missed it) is fine, once every ten seconds per person.
    const askKey = `${player.space}:${invitee.name.toLowerCase()}`;
    const now = Date.now();
    if (now - (lastAsked.get(askKey) ?? 0) < 10_000) {
      send(ws, { t: "action", kind: "room-refused", space: player.space, reason: "invited a moment ago" });
      return;
    }
    lastAsked.set(askKey, now);
    if (state.invited.has(invitee.name.toLowerCase())) {
      tellPerson(invitee.name, { t: "action", kind: "room-invited", space: player.space, from: player.name });
      return;
    }
    state.invited.add(invitee.name.toLowerCase());
    log("room-invite", owners.get(ws) ?? null, { space: player.space, invited: invitee.name });
    roomSay(player.space, { name: player.name, text: `${player.name} invited ${invitee.name}`, system: true });
    roomChanged(player.space);
    // If they're on campus, they're asked at once: accept to be taken straight in.
    tellPerson(invitee.name, { t: "action", kind: "room-invited", space: player.space, from: player.name });
  } else if (msg.t === "office" && typeof msg.on === "boolean") {
    // Only staff and the admin open office hours; a student's try is refused and logged.
    const who = owners.get(ws) ?? null;
    const room = validOfficeRoom(msg.room);
    if (!isStaff(who) || room === undefined) {
      log("refused", who, { action: "office-hours", reason: !isStaff(who) ? "not staff" : "no such room" });
      send(ws, { t: "action", kind: "office-refused", reason: !isStaff(who) ? "staff only" : "no such room" });
      return;
    }
    setOffice(player.name, msg.on, msg.on ? room : null);
    log("office-hours", who, { on: msg.on, room: msg.on ? room : null });
  } else if (msg.t === "knock" && typeof msg.name === "string") {
    // A student knocks on a staff member's open office hours, from the Student Hub where they're listed.
    // It reaches that staff member alone, who is asked to invite them in.
    const who = owners.get(ws) ?? null;
    const target = office.get(msg.name.normalize("NFKC").trim().toLowerCase());
    const reason = !who || !isMember(who) ? "guest" : isStaff(who) ? "staff" : player.space !== "hub" ? "not in the hub" : !target ? "not open" : null;
    if (reason || !target) {
      log("refused", who, { action: "knock", reason });
      send(ws, { t: "action", kind: "knock-refused", reason });
      return;
    }
    const key = `${player.name.toLowerCase()}|${target.name.toLowerCase()}`;
    const now = Date.now();
    if (now - (lastKnock.get(key) ?? 0) < KNOCK_GAP_MS) {
      send(ws, { t: "action", kind: "knock-refused", reason: "wait" });
      return;
    }
    lastKnock.set(key, now);
    log("knock", who, { to: target.name });
    tellPerson(target.name, { t: "action", kind: "knocked", from: player.name, room: target.room });
    send(ws, { t: "action", kind: "knock-sent", name: target.name });
  } else if (msg.t === "poop" && player.space === "poop") {
    const key = player.name.toLowerCase();
    const now = Date.now();
    if (now - (lastPoop.get(key) ?? 0) < 5000) return;
    lastPoop.set(key, now);
    if (owners.get(ws)?.role === "guest") {
      guestPoops.delete(player.name.toLowerCase());
      guestPoops.set(player.name.toLowerCase(), { name: player.name, x: player.x, z: player.z });
      // The oldest go first past two thousand, so a crowd can't grow it for ever.
      if (guestPoops.size > 2000) guestPoops.delete(guestPoops.keys().next().value!);
    }
    else putPoop(player.name, player.x, player.z);
    broadcastSpace("poop", { t: "action", kind: "poops", poops: poopList() });
  } else if (msg.t === "status" && (msg.status === null || (typeof msg.status === "string" && STATUSES.has(msg.status)))) {
    // Three fixed values (or none), at most one change every two seconds; it goes with them through doors, not to the database.
    const now = Date.now();
    if (now - (lastStatus.get(ws) ?? 0) < STATUS_GAP_MS) return;
    lastStatus.set(ws, now);
    if (msg.status === null) delete player.status;
    else player.status = msg.status as Status;
    dirty.add(player.space);
  } else if (msg.t === "emote" && typeof msg.kind === "string" && EMOTES.has(msg.kind)) {
    if (msg.kind !== "dance") {
      const now = Date.now();
      const emoteKey = player.name.toLowerCase();
      if (now - (lastEmote.get(emoteKey) ?? 0) < EMOTE_GAP_MS) return;
      lastEmote.set(emoteKey, now);
    }
    broadcastSpace(player.space, { t: "emote", id: player.id, kind: msg.kind });
    log("emote", owners.get(ws) ?? null, { space: player.space, kind: msg.kind });
  }
}

/**
 * Visit stamps: the first time a member is let into a kind of main space (spaces.ts STAMPS) they
 * earn its stamp and are told. Called only where the server has accepted the move, so nothing the
 * client says can grant one; guests keep nothing, so they get none.
 */
function stampVisit(ws: WebSocket, space: SpaceId): void {
  const who = owners.get(ws);
  const id = stampOf(space);
  if (!who || !isMember(who) || !id) return;
  if (!addStamp(who.name, id)) return;
  send(ws, { t: "action", kind: "stamp", stamp: id, label: STAMPS.find((x) => x.id === id)?.label ?? id, count: stampCount(who.name), total: STAMPS.length });
}

function onConnect(ws: WebSocket, visitor: { name: string; token: string; role: string }, ip: string | null): void {
  const name = visitor.name;
  owners.set(ws, visitor);
  seen(name);
  const spot = lastSpot(name);
  // Nobody wakes up inside a meeting room: it may be full, closed to them,
  // or gone. They come back outside its door instead.
  const room = roomOf(spot.space);
  const start = room ? { space: room.parent, x: room.door.x, z: room.door.z } : spot;
  const player: Player = { id: randomUUID(), name, space: start.space, x: start.x, y: 0, z: start.z, rot: 0, look: lookOf(name) };
  // Staff (and the admin) carry a "staff" mark on their name tag (1c), so people know whom they're talking to.
  if (visitor.role === "staff" || visitor.role === "admin") player.staff = true;
  if (office.has(name.toLowerCase())) player.office = true;
  // Interest tags are a member's, kept with the account (a guest has none).
  if (isMember(visitor)) {
    const tags = tagsOf(name);
    if (tags.length) player.tags = tags;
  }
  const wasOnline = [...players.values()].some((p) => p.name.toLowerCase() === name.toLowerCase());
  players.set(ws, player);
  alive.add(ws);
  if (!wasOnline) announceOn(visitor, player.space);
  send(ws, { t: "welcome", id: player.id, space: player.space, players: inSpace(player.space) });
  stampVisit(ws, player.space);
  if (player.space === "poop") send(ws, { t: "action", kind: "poops", poops: poopList() });
  if (player.space === "hub") sendOffice(ws);
  send(ws, { t: "action", kind: "online", counts: onlineCounts() });
  dirty.add(player.space);
  log("connect", visitor, { space: player.space, online: players.size }, { ip });

  ws.on("pong", () => alive.add(ws));
  // One bad message or a database error never reaches the process (one machine serves everyone);
  // only its name and message are logged, never what was sent.
  ws.on("message", (data) => {
    try {
      onMessage(ws, data.toString());
    } catch (e) {
      console.error(JSON.stringify({ at: new Date().toISOString(), event: "ws-message-error", name: (e as Error)?.name, msg: (e as Error)?.message }));
    }
  });
  ws.on("close", () => {
    players.delete(ws);
    // A member comes back where they left; a guest's spot isn't kept (11/4: guests store as little as possible).
    const left = roomOf(player.space);
    try {
      if (visitor.role === "guest") {
        // nothing saved
      } else if (left) saveLastSpot(player.name, left.parent, left.door.x, left.door.z);
      else saveLastSpot(player.name, player.space, player.x, player.z);
      log("disconnect", visitor, { space: player.space, online: players.size }, { ip });
    } catch (e) {
      // Even if saving fails, the others are told they left (no ghost left standing).
      console.error(JSON.stringify({ at: new Date().toISOString(), event: "ws-close-error", name: (e as Error)?.name, msg: (e as Error)?.message }));
    }
    broadcastSpace(player.space, { t: "leave", id: player.id });
    roomLeft(player.space, player.name, visitor);
    // Office hours end with the last tab: nobody is left to answer a knock.
    if (office.has(player.name.toLowerCase()) && ![...players.values()].some((p) => p.name.toLowerCase() === player.name.toLowerCase())) setOffice(player.name, false, null);
    tables.left(player.name);
  });
}

/** Accepts WebSocket upgrades on /ws?token=…; only joined visitors get in. */
/**
 * Head counts per space, never who or where: meeting rooms are summed into
 * "rooms" (a counselling room's guests stay private).
 */
export function onlineCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const p of players.values()) {
    const key = roomOf(p.space) ? "rooms" : p.space;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export function attachRealtime(server: Server): void {
  // The biggest real message is a room's notes (5000 characters); ws would take 100 MB by default.
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const visitor = url.pathname === "/ws" ? findByToken(url.searchParams.get("token") ?? "") : undefined;
    if (!visitor) {
      if (url.pathname === "/ws") log("refused", null, { action: "connect", reason: "unknown token" });
      socket.end("HTTP/1.1 401 Unauthorized\r\n\r\n");
      return;
    }
    if (restrictionOn(visitor.name, "join")) {
      log("refused", visitor, { action: "connect", reason: "restricted" });
      socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    // Fly puts the visitor's address in Fly-Client-IP; locally, the socket's (admin's log only).
    const fly = req.headers["fly-client-ip"];
    const ip = (typeof fly === "string" ? fly : null) ?? req.socket.remoteAddress ?? null;
    wss.handleUpgrade(req, socket, head, (ws) => onConnect(ws, visitor, ip));
  });

  setInterval(() => {
    for (const space of dirty) broadcastSpace(space, { t: "players", players: inSpace(space) });
    dirty.clear();
  }, TICK_MS).unref();

  setInterval(() => {
    const counts = onlineCounts();
    const key = JSON.stringify(counts);
    if (key === lastOnline) return;
    lastOnline = key;
    broadcastAll({ t: "action", kind: "online", counts });
  }, ONLINE_MS).unref();

  setInterval(() => {
    for (const ws of players.keys()) {
      if (!alive.has(ws)) {
        ws.terminate();
        continue;
      }
      alive.delete(ws);
      ws.ping();
    }
  }, PING_MS).unref();
}
