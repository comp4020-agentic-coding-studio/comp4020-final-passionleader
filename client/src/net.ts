import type { Classroom, Comment, Note } from "./api.ts";
import type { Look } from "./lookpicker.ts";
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
  /** The seat they're sitting on ("<space>:<n>"), if any. */
  seat?: string;
  /** How they look, once they've picked (else a default from their name). */
  look?: Look | null;
}

export type Emote = "wave" | "yes" | "no" | "mate" | "dance";

/** A meeting room as the server sees it (server/realtime.ts roomView). */
export interface RoomState {
  kind: "counselling" | "team";
  cap: number;
  members: string[];
  host?: string;
  invited?: string[];
}
export interface RoomLine {
  name: string;
  text: string;
  system?: boolean;
  /** A file someone shared: click to fetch it (only while you're in the room). */
  file?: { id: string; name: string; size: number };
}

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
  /** The admin opened or closed a classroom. */
  classrooms(list: Classroom[]): void;
  /** Something on this classroom's board changed. */
  board(): void;
  /** Head counts per space (meeting rooms summed as "rooms"), whenever they change. */
  online(counts: Record<string, number>): void;
  /** The server moved us (the classroom we were in was closed). */
  moved(space: SpaceId, x: number, z: number, players: RemotePlayer[]): void;
  /** The server let us into a meeting room: what's in it and what's been said. */
  roomOpen(space: SpaceId, x: number, z: number, room: RoomState, lines: RoomLine[], players: RemotePlayer[]): void;
  /** Who's in the room, or who's invited, changed. */
  room(room: RoomState): void;
  /** A line for the room's window from the room itself ("… joined"). */
  roomLine(line: RoomLine): void;
  /** The server said no: the room is full, invite-only, or the invite failed. */
  roomRefused(space: SpaceId, reason: string): void;
  /** Someone's already on that seat. */
  seatRefused(): void;
  /** The admin stopped us doing `what` (chat, notes, posts, join) until `until`. */
  restricted(what: string, until: string): void;
  status(online: boolean): void;
}

// Matches the server's tick: no point sending faster than it broadcasts.
const SEND_MS = 100;

export interface Net {
  sendMove(p: { x: number; y: number; z: number; rot: number }): void;
  enter(space: SpaceId, x: number, z: number): void;
  chat(text: string): void;
  emote(kind: Emote): void;
  /** Invites someone into the counselling room we're in. */
  invite(name: string): void;
  /** Sits on a seat ("<space>:<n>") at its spot, or stands up with null. */
  sit(seat: string | null, at?: { x: number; z: number }): void;
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
        case "moved":
          return on.moved(m.space as SpaceId, m.x as number, m.z as number, m.players as RemotePlayer[]);
        case "action":
          if (m.kind === "classrooms") return on.classrooms(m.classrooms as Classroom[]);
          if (m.kind === "board") return on.board();
          if (m.kind === "online") return on.online(m.counts as Record<string, number>);
          if (m.kind === "note") return on.note(m.note as Note);
          if (m.kind === "note-removed") return on.noteRemoved(m.id as number);
          if (m.kind === "comment") return on.comment(m.comment as Comment);
          if (m.kind === "comment-removed") return on.commentRemoved(m.id as number, m.noteId as number);
          if (m.kind === "room-open")
            return on.roomOpen(m.space as SpaceId, m.x as number, m.z as number, m.room as RoomState, m.lines as RoomLine[], m.players as RemotePlayer[]);
          if (m.kind === "room") return on.room(m.room as RoomState);
          if (m.kind === "room-line") return on.roomLine(m.line as RoomLine);
          if (m.kind === "room-refused") return on.roomRefused(m.space as SpaceId, m.reason as string);
          if (m.kind === "seat-refused") return on.seatRefused();
          if (m.kind === "restricted") return on.restricted(m.what as string, m.until as string);
      }
    };
    ws.onclose = (e) => {
      on.status(false);
      // 4003: the admin has stopped us coming in; trying again won't help.
      if (closed || e.code === 4003) return;
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
    invite(name) {
      sendNow({ t: "invite", name });
    },
    sit(seat, at) {
      // The seat's spot goes with it, and the next move from there isn't news.
      if (at) lastPayload = "";
      pending = null;
      sendNow({ t: "sit", seat, ...at });
    },
    close() {
      closed = true;
      clearInterval(timer);
      ws?.close();
    },
  };
}
