import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { MAX_CHAT } from "./accounts.ts";
import { findByName, findByToken, lastSpot, saveLastSpot } from "./db.ts";
import { log } from "./log.ts";
import { ROOM_CAP, clampTo, isSpace, roomOf, type SpaceId } from "./spaces.ts";

// The real-time layer: one WebSocket per open tab, all to this one server.
// Everything is per space: you only see, hear and get updates about people in
// the space you're in. Live positions only ever live in memory here; SQLite
// sees a visitor's spot once, when they leave. The protocol only knows
// "move", "chat", "emote" and "action", never a particular room or verb, so
// the spaces and what people do in them can keep changing.

export type Player = { id: string; name: string; space: SpaceId; x: number; y: number; z: number; rot: number };
/** Who's behind a socket, for the activity log only: never sent to anyone. */
const owners = new WeakMap<WebSocket, { name: string; token: string; role: string }>();

const EMOTES = new Set(["wave", "yes", "no", "mate", "dance"]);
const MAX_JUMP = 3;
// Positions go out ten times a second, only for spaces where someone moved.
const TICK_MS = 100;
// Fly's proxy drops idle sockets, and a closed laptop never says goodbye.
const PING_MS = 25_000;
// A little breathing room between chat lines from one person.
const CHAT_GAP_MS = 700;

const players = new Map<WebSocket, Player>();
const alive = new WeakSet<WebSocket>();
const lastChat = new WeakMap<WebSocket, number>();
const dirty = new Set<SpaceId>();

const inSpace = (space: SpaceId): Player[] => [...players.values()].filter((p) => p.space === space);

// --- meeting rooms ------------------------------------------------------------
// A room's chat isn't stored either: it's kept here, in memory, only while at
// least one person is in the room, so someone who walks in mid-conversation
// sees what was said; when the last person leaves, the chat, the host and the
// invite list all go. Counselling rooms are invite-only: the first one in is
// the host, and only the people someone inside has invited may follow.

const ROOM_LINES = 100;
type RoomLine = { name: string; text: string; system?: boolean };
interface RoomState {
  host: string;
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
  if (!rooms.has(space)) rooms.set(space, { host: name, invited: new Set([name.toLowerCase()]), lines: [] });
  roomSay(space, { name, text: `${name} joined`, system: true });
  roomChanged(space);
}

/** Someone left a meeting room: the last one out clears it. */
function roomLeft(space: SpaceId, name: string, who: { name: string; token: string; role: string } | null): void {
  if (!rooms.has(space)) return;
  if (inSpace(space).length === 0) {
    rooms.delete(space);
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
  rooms.delete(space);
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
    Object.assign(player, clampTo(player.space, msg.x, msg.z));
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
    Object.assign(player, clampTo(to, msg.x, msg.z), { y: 0 });
    if (from !== to) {
      broadcastSpace(from, { t: "leave", id: player.id });
      log("enter", owners.get(ws) ?? null, { from, space: to });
      roomLeft(from, player.name, owners.get(ws) ?? null);
      roomJoined(to, player.name);
    }
    // Into a meeting room, the client waits for this before it walks in.
    const view = roomView(to);
    if (view) send(ws, { t: "action", kind: "room-open", space: to, x: player.x, z: player.z, room: view, lines: rooms.get(to)?.lines ?? [], players: inSpace(to) });
    send(ws, { t: "players", players: inSpace(to) });
    dirty.add(to);
  } else if (msg.t === "chat" && typeof msg.text === "string") {
    const text = msg.text.trim().slice(0, MAX_CHAT);
    const now = Date.now();
    if (!text || now - (lastChat.get(ws) ?? 0) < CHAT_GAP_MS) return;
    lastChat.set(ws, now);
    // Chat is never stored: it exists only for the people in the space now.
    // The log notes that someone spoke, and how much, not what they said.
    log("chat", owners.get(ws) ?? null, { space: player.space, chars: text.length });
    broadcastSpace(player.space, { t: "chat", id: player.id, name: player.name, text });
    // In a meeting room the line also goes in the room's window, until the room empties.
    if (rooms.has(player.space)) rooms.get(player.space)!.lines.push({ name: player.name, text });
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
  } else if (msg.t === "emote" && typeof msg.kind === "string" && EMOTES.has(msg.kind)) {
    broadcastSpace(player.space, { t: "emote", id: player.id, kind: msg.kind });
    log("emote", owners.get(ws) ?? null, { space: player.space, kind: msg.kind });
  }
}

function onConnect(ws: WebSocket, visitor: { name: string; token: string; role: string }, ip: string | null): void {
  const name = visitor.name;
  owners.set(ws, visitor);
  const spot = lastSpot(name);
  // Nobody wakes up inside a meeting room: it may be full, closed to them,
  // or gone. They come back outside its door instead.
  const room = roomOf(spot.space);
  const start = room ? { space: room.parent, x: room.door.x, z: room.door.z } : spot;
  const player: Player = { id: randomUUID(), name, space: start.space, x: start.x, y: 0, z: start.z, rot: 0 };
  players.set(ws, player);
  alive.add(ws);
  send(ws, { t: "welcome", id: player.id, space: player.space, players: inSpace(player.space) });
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
