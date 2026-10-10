import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { findByToken, lastSpot, saveLastSpot, type Poop } from "./db.ts";

// The real-time layer: one WebSocket per open tab, all to this one server.
// Live positions only ever live in memory here; SQLite sees a visitor's spot
// once, when they leave. Whatever the room ends up being (a toilet or
// somewhere nicer), this file only knows "players move" and "players act".

export type Player = { id: string; name: string; x: number; y: number; z: number; rot: number };

// What the server sends. `action` is the room's one verb, whatever it becomes
// ("poop" today); clients render the kinds they know and ignore the rest.
type ServerMessage =
  | { t: "welcome"; id: string; players: Player[] }
  | { t: "players"; players: Player[] }
  | { t: "leave"; id: string }
  | { t: "action"; kind: "poop"; poop: Poop };

const ROOM = 10;
// First-timers start in the open middle of the room, clear of the stalls.
export const SPAWN = { x: 0, z: 5 };
const MAX_JUMP = 3;
// Positions go out ten times a second, and only when someone actually moved.
const TICK_MS = 100;
// Fly's proxy drops idle sockets, and a closed laptop never says goodbye.
const PING_MS = 25_000;

const players = new Map<WebSocket, Player>();
const alive = new WeakSet<WebSocket>();
let dirty = false;

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

export function broadcast(msg: ServerMessage): void {
  const data = JSON.stringify(msg);
  for (const ws of players.keys()) if (ws.readyState === ws.OPEN) ws.send(data);
}

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function onMessage(ws: WebSocket, raw: string): void {
  const player = players.get(ws);
  if (!player) return;
  let msg: { t?: unknown; x?: unknown; y?: unknown; z?: unknown; rot?: unknown };
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (msg.t === "move" && num(msg.x) && num(msg.y) && num(msg.z) && num(msg.rot)) {
    // Same rule as poops: the client's numbers are a request, not the truth.
    player.x = clamp(msg.x, -ROOM, ROOM);
    player.y = clamp(msg.y, 0, MAX_JUMP);
    player.z = clamp(msg.z, -ROOM, ROOM);
    player.rot = msg.rot;
    dirty = true;
  }
}

function onConnect(ws: WebSocket, name: string): void {
  const spot = lastSpot(name) ?? SPAWN;
  const player: Player = { id: randomUUID(), name, x: spot.x, y: 0, z: spot.z, rot: 0 };
  players.set(ws, player);
  alive.add(ws);
  send(ws, { t: "welcome", id: player.id, players: [...players.values()] });
  dirty = true;

  ws.on("pong", () => alive.add(ws));
  ws.on("message", (data) => onMessage(ws, data.toString()));
  ws.on("close", () => {
    players.delete(ws);
    saveLastSpot(player.name, player.x, player.z);
    broadcast({ t: "leave", id: player.id });
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
    if (!dirty) return;
    dirty = false;
    broadcast({ t: "players", players: [...players.values()] });
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
