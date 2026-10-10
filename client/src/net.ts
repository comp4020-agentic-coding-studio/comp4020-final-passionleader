import type { Poop } from "./api.ts";

// The client side of the real-time layer (server/realtime.ts): one socket,
// reconnecting on its own, that sends this player's position and hands every
// other player's position and actions to the game.

export interface RemotePlayer {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  rot: number;
}

export interface NetHandlers {
  welcome(selfId: string, players: RemotePlayer[]): void;
  players(players: RemotePlayer[]): void;
  leave(id: string): void;
  poop(poop: Poop): void;
  status(online: boolean): void;
}

// Matches the server's tick: no point sending faster than it broadcasts.
const SEND_MS = 100;

export function connect(token: string, on: NetHandlers): { sendMove(p: Omit<RemotePlayer, "id" | "name">): void; close(): void } {
  let ws: WebSocket | null = null;
  let closed = false;
  let retry = 500;
  let pending: string | null = null;
  let lastPayload = "";

  const url = new URL("/ws", location.href);
  url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("token", token);

  function open(): void {
    ws = new WebSocket(url.href);
    ws.onopen = () => {
      retry = 500;
      lastPayload = "";
      on.status(true);
    };
    ws.onmessage = (e) => {
      let m: { t?: string; [k: string]: unknown };
      try {
        m = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (m.t === "welcome") on.welcome(m.id as string, m.players as RemotePlayer[]);
      else if (m.t === "players") on.players(m.players as RemotePlayer[]);
      else if (m.t === "leave") on.leave(m.id as string);
      else if (m.t === "action" && m.kind === "poop") on.poop(m.poop as Poop);
    };
    ws.onclose = () => {
      on.status(false);
      if (closed) return;
      // Back off up to 8s, so a sleeping server isn't hammered while it wakes.
      setTimeout(open, retry);
      retry = Math.min(retry * 2, 8000);
    };
  }
  open();

  // Throttled, and only when something changed: standing still costs nothing.
  setInterval(() => {
    if (!pending || ws?.readyState !== WebSocket.OPEN) return;
    ws.send(pending);
    lastPayload = pending;
    pending = null;
  }, SEND_MS);

  return {
    sendMove(p) {
      const payload = JSON.stringify({
        t: "move",
        x: +p.x.toFixed(2),
        y: +p.y.toFixed(2),
        z: +p.z.toFixed(2),
        rot: +p.rot.toFixed(2),
      });
      if (payload !== lastPayload) pending = payload;
    },
    close() {
      closed = true;
      ws?.close();
    },
  };
}
