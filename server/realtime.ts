import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { MAX_CHAT } from "./accounts.ts";
import { dropRoomFiles, findByName, findByToken, isMember, keepChatLine, lastSpot, lookOf, restrictionOn, saveChat, saveLastSpot, seen, type Look } from "./db.ts";
import { removeObjects } from "./files.ts";
import { log } from "./log.ts";
import { ROOM_CAP, clampTo, isSpace, roomOf, type SpaceId } from "./spaces.ts";

// The real-time layer: one WebSocket per open tab, all to this one server.
// Everything is per space: you only see, hear and get updates about people in
// the space you're in. Live positions only ever live in memory here; SQLite
// sees a visitor's spot once, when they leave. The protocol only knows
// "move", "chat", "emote" and "action", never a particular room or verb, so
// the spaces and what people do in them can keep changing.

/** `seat` is the seat they're sitting on ("<space>:<n>"), if any; `look` how their figure looks. */
export type Player = { id: string; name: string; space: SpaceId; x: number; y: number; z: number; rot: number; seat?: string; look?: Look | null };
/** Who's behind a socket, for the activity log only: never sent to anyone. */
const owners = new WeakMap<WebSocket, { name: string; token: string; role: string }>();

const EMOTES = new Set(["wave", "yes", "no", "mate", "dance"]);
// The Poop Room (plan 62): one poop each, in memory only, five seconds apart;
// a new one replaces your last. Only in the poop space.
// The Poop Room easter egg: one poop per person (keyed by lower-case name),
// in memory only, five seconds apart; a new one replaces your last.
const poops = new Map<string, { name: string; x: number; z: number; at: number }>();
const poopList = (): { name: string; x: number; z: number }[] => [...poops.values()].map((p) => ({ name: p.name, x: p.x, z: p.z }));
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
const lastChat = new WeakMap<WebSocket, number>();
const lastEmote = new WeakMap<WebSocket, number>();
const lastAll = new Map<string, number>(); // by name, so a second tab doesn't double it
const dirty = new Set<SpaceId>();
// How many are where goes to everyone, at most every few seconds and only
// when it changed, so nobody walks into an empty Hub without knowing.
const ONLINE_MS = 5_000;
let lastOnline = "";

const inSpace = (space: SpaceId): Player[] => [...players.values()].filter((p) => p.space === space);

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
}
const rooms = new Map<SpaceId, RoomState>();

function roomView(space: SpaceId): Record<string, unknown> | null {
  const room = roomOf(space);
  const state = rooms.get(space);
  if (!room || !state) return null;
  const members = inSpace(space).map((p) => p.name);
  const invited = room.kind === "counselling" ? [...state.invited].filter((n) => !members.some((m) => m.toLowerCase() === n)) : undefined;
  return { kind: room.kind, cap: ROOM_CAP, members, host: room.kind === "counselling" ? state.host : undefined, invited };
}

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

/** Why `name` can't come into `space`, or null if they can (any space that isn't a meeting room is open). */
function roomRefusal(space: SpaceId, name: string): string | null {
  const room = roomOf(space);
  if (!room) return null;
  if (inSpace(space).length >= ROOM_CAP) return "full";
  const state = rooms.get(space);
  if (room.kind === "counselling" && state && !state.invited.has(name.toLowerCase())) return "not invited";
  return null;
}

/** Someone came into a meeting room: the first one sets it up, everyone else is announced. */
function roomJoined(space: SpaceId, name: string): void {
  if (!roomOf(space)) return;
  if (!rooms.has(space)) rooms.set(space, { host: name, session: randomUUID(), invited: new Set([name.toLowerCase()]), lines: [] });
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
  if (state.host === name) state.host = inSpace(space)[0]!.name;
  roomSay(space, { name, text: `${name} left`, system: true });
  roomChanged(space);
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
      // A meeting room is full at six, and a counselling room lets in only
      // the people someone inside has invited: checked here, not by the client.
      const refusal = roomRefusal(to, player.name);
      if (refusal) {
        log("refused", owners.get(ws) ?? null, { action: "enter", space: to, reason: refusal });
        send(ws, { t: "action", kind: "room-refused", space: to, reason: refusal });
        return;
      }
    }
    player.space = to;
    player.seat = undefined;
    Object.assign(player, clampTo(to, msg.x, msg.z), { y: 0 });
    if (from !== to) {
      broadcastSpace(from, { t: "leave", id: player.id });
      log("enter", owners.get(ws) ?? null, { from, space: to });
      roomLeft(from, player.name, owners.get(ws) ?? null);
      roomJoined(to, player.name);
      if (to === "poop") send(ws, { t: "action", kind: "poops", poops: poopList() });
    }
    // Into a meeting room, the client waits for this before it walks in.
    const view = roomView(to);
    if (view) send(ws, { t: "action", kind: "room-open", space: to, x: player.x, z: player.z, room: view, lines: rooms.get(to)?.lines ?? [], players: inSpace(to) });
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
    if (!text || now - (lastChat.get(ws) ?? 0) < CHAT_GAP_MS) return;
    lastChat.set(ws, now);
    const stopped = restrictionOn(player.name, "chat");
    if (stopped) {
      log("refused", owners.get(ws) ?? null, { action: "chat", space: player.space, reason: "restricted" });
      send(ws, { t: "action", kind: "restricted", what: "chat", until: stopped.until });
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
    if (rooms.has(player.space)) rooms.get(player.space)!.lines.push({ name: player.name, text });
    else keepChatLine(player.space, player.name, text);
  } else if (msg.t === "save-chat") {
    // Keep this room's chat so far, for this member, 30 days (db.ts saveChat);
    // everyone inside is told, since it's their words too.
    const state = rooms.get(player.space);
    if (!state || !isMember(owners.get(ws) ?? { role: "guest" })) {
      send(ws, { t: "action", kind: "chat-saved", ok: false, reason: state ? "guest" : "not in a room" });
      return;
    }
    const lines = state.lines.map((l) => ({ name: l.name, text: l.text, ...(l.system ? { system: true } : {}) }));
    const id = saveChat(player.name, player.space, lines);
    log("chat-saved", owners.get(ws) ?? null, { space: player.space, lines: lines.length });
    send(ws, { t: "action", kind: "chat-saved", ok: true, id });
    roomSay(player.space, { name: player.name, text: `${player.name} saved this chat (kept 30 days, for them only)`, system: true });
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
    if (state.invited.has(invitee.name.toLowerCase())) return;
    state.invited.add(invitee.name.toLowerCase());
    log("room-invite", owners.get(ws) ?? null, { space: player.space, invited: invitee.name });
    roomSay(player.space, { name: player.name, text: `${player.name} invited ${invitee.name}`, system: true });
    roomChanged(player.space);
  } else if (msg.t === "poop" && player.space === "poop") {
    const key = player.name.toLowerCase();
    const now = Date.now();
    if (now - (poops.get(key)?.at ?? 0) < 5000) return;
    poops.set(key, { name: player.name, x: player.x, z: player.z, at: now });
    broadcastSpace("poop", { t: "action", kind: "poops", poops: poopList() });
  } else if (msg.t === "emote" && typeof msg.kind === "string" && EMOTES.has(msg.kind)) {
    if (msg.kind !== "dance") {
      const now = Date.now();
      if (now - (lastEmote.get(ws) ?? 0) < EMOTE_GAP_MS) return;
      lastEmote.set(ws, now);
    }
    broadcastSpace(player.space, { t: "emote", id: player.id, kind: msg.kind });
    log("emote", owners.get(ws) ?? null, { space: player.space, kind: msg.kind });
  }
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
  players.set(ws, player);
  alive.add(ws);
  send(ws, { t: "welcome", id: player.id, space: player.space, players: inSpace(player.space) });
  if (player.space === "poop") send(ws, { t: "action", kind: "poops", poops: poopList() });
  send(ws, { t: "action", kind: "online", counts: onlineCounts() });
  dirty.add(player.space);
  log("connect", visitor, { space: player.space, online: players.size }, { ip });

  ws.on("pong", () => alive.add(ws));
  ws.on("message", (data) => onMessage(ws, data.toString()));
  ws.on("close", () => {
    players.delete(ws);
    const left = roomOf(player.space);
    if (left) saveLastSpot(player.name, left.parent, left.door.x, left.door.z);
    else saveLastSpot(player.name, player.space, player.x, player.z);
    log("disconnect", visitor, { space: player.space, online: players.size }, { ip });
    broadcastSpace(player.space, { t: "leave", id: player.id });
    roomLeft(player.space, player.name, visitor);
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
  const wss = new WebSocketServer({ noServer: true });

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
