import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { MAX_CHAT } from "./accounts.ts";
import { findByToken, lastSpot, saveLastSpot } from "./db.ts";
import { clampTo, isSpace, type SpaceId } from "./spaces.ts";

// The real-time layer: one WebSocket per open tab, all to this one server.
// Everything is per space: you only see, hear and get updates about people in
// the space you're in. Live positions only ever live in memory here; SQLite
// sees a visitor's spot once, when they leave. The protocol only knows
// "move", "chat", "emote" and "action", never a particular room or verb, so
// the spaces and what people do in them can keep changing.

export type Player = { id: string; name: string; space: SpaceId; x: number; y: number; z: number; rot: number };

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

function send(ws: WebSocket, msg: unknown): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

/** Sends to everyone currently in one space. */
export function broadcastSpace(space: SpaceId, msg: unknown): void {
  const data = JSON.stringify(msg);
  for (const [ws, p] of players) if (p.space === space && ws.readyState === ws.OPEN) ws.send(data);
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
    player.space = msg.space;
    Object.assign(player, clampTo(msg.space, msg.x, msg.z), { y: 0 });
    if (from !== player.space) broadcastSpace(from, { t: "leave", id: player.id });
    send(ws, { t: "players", players: inSpace(player.space) });
    dirty.add(player.space);
  } else if (msg.t === "chat" && typeof msg.text === "string") {
    const text = msg.text.trim().slice(0, MAX_CHAT);
    const now = Date.now();
    if (!text || now - (lastChat.get(ws) ?? 0) < CHAT_GAP_MS) return;
    lastChat.set(ws, now);
    // Chat is never stored: it exists only for the people in the space now.
    broadcastSpace(player.space, { t: "chat", id: player.id, name: player.name, text });
  } else if (msg.t === "emote" && typeof msg.kind === "string" && EMOTES.has(msg.kind)) {
    broadcastSpace(player.space, { t: "emote", id: player.id, kind: msg.kind });
  }
}

function onConnect(ws: WebSocket, name: string): void {
  const spot = lastSpot(name);
  const player: Player = { id: randomUUID(), name, space: spot.space, x: spot.x, y: 0, z: spot.z, rot: 0 };
  players.set(ws, player);
  alive.add(ws);
  send(ws, { t: "welcome", id: player.id, space: player.space, players: inSpace(player.space) });
  dirty.add(player.space);

  ws.on("pong", () => alive.add(ws));
  ws.on("message", (data) => onMessage(ws, data.toString()));
  ws.on("close", () => {
    players.delete(ws);
    saveLastSpot(player.name, player.space, player.x, player.z);
    broadcastSpace(player.space, { t: "leave", id: player.id });
  });
}

/** Accepts WebSocket upgrades on /ws?token=…; only joined visitors get in. */
export function attachRealtime(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const visitor = url.pathname === "/ws" ? findByToken(url.searchParams.get("token") ?? "") : undefined;
    if (!visitor) {
      socket.end("HTTP/1.1 401 Unauthorized\r\n\r\n");
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => onConnect(ws, visitor.name));
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
