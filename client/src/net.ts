import type { Comment, Note } from "./api.ts";
import type { SpaceId } from "./world.ts";

// The client side of the real-time layer (server/realtime.ts): one socket,
// reconnecting on its own. It sends this player's position, space changes,
// chat and emotes, and hands everything the server says about the current
// space to the game.

export interface RemotePlayer {
  id: string;
  name: string;
  space: SpaceId;
  x: number;
  y: number;
  z: number;
  rot: number;
}

export type Emote = "wave" | "yes" | "no" | "mate" | "dance";

export interface NetHandlers {
  welcome(selfId: string, space: SpaceId, players: RemotePlayer[]): void;
  players(players: RemotePlayer[]): void;
  leave(id: string): void;
  chat(id: string, name: string, text: string): void;
  emote(id: string, kind: Emote): void;
  note(note: Note): void;
  noteRemoved(id: number): void;
  comment(comment: Comment): void;
  commentRemoved(id: number, noteId: number): void;
  status(online: boolean): void;
}

// Matches the server's tick: no point sending faster than it broadcasts.
const SEND_MS = 100;

export interface Net {
  sendMove(p: { x: number; y: number; z: number; rot: number }): void;
  enter(space: SpaceId, x: number, z: number): void;
  chat(text: string): void;
  emote(kind: Emote): void;
  close(): void;
}

export function connect(token: string, on: NetHandlers): Net {
  let ws: WebSocket | null = null;
  let closed = false;
  let retry = 500;
  let pending: string | null = null;
  let lastPayload = "";

  const url = new URL("/ws", location.href);
  url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("token", token);

  const sendNow = (msg: unknown): void => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

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
      switch (m.t) {
        case "welcome":
          return on.welcome(m.id as string, m.space as SpaceId, m.players as RemotePlayer[]);
        case "players":
          return on.players(m.players as RemotePlayer[]);
        case "leave":
          return on.leave(m.id as string);
        case "chat":
          return on.chat(m.id as string, m.name as string, m.text as string);
        case "emote":
          return on.emote(m.id as string, m.kind as Emote);
        case "action":
          if (m.kind === "note") return on.note(m.note as Note);
          if (m.kind === "note-removed") return on.noteRemoved(m.id as number);
          if (m.kind === "comment") return on.comment(m.comment as Comment);
          if (m.kind === "comment-removed") return on.commentRemoved(m.id as number, m.noteId as number);
      }
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
  const timer = setInterval(() => {
    if (!pending || ws?.readyState !== WebSocket.OPEN) return;
    ws.send(pending);
    lastPayload = pending;
    pending = null;
  }, SEND_MS);

  return {
    sendMove(p) {
      const payload = JSON.stringify({ t: "move", x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), rot: +p.rot.toFixed(2) });
      if (payload !== lastPayload) pending = payload;
    },
    enter(space, x, z) {
      pending = null;
      sendNow({ t: "enter", space, x, z });
    },
    chat(text) {
      sendNow({ t: "chat", text });
    },
    emote(kind) {
      sendNow({ t: "emote", kind });
    },
    close() {
      closed = true;
      clearInterval(timer);
      ws?.close();
    },
  };
}
