import type { Classroom, Comment, Note } from "./api.ts";
import type { TableView } from "./gametable.ts";
import type { VideoView } from "./roomscreen.ts";
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
  /** ANU staff (or the admin): a mark on their name tag. */
  staff?: boolean;
  /** Their office hours are open (staff only). */
  office?: boolean;
  /** How open they are to a chat, if they've said (RICE v2 #3). */
  status?: PlayerStatus;
  /** Up to three interest tags from the server's fixed list. */
  tags?: string[];
}
export type PlayerStatus = "chat" | "study" | "away";

export type Emote = "wave" | "yes" | "no" | "mate" | "dance";

/** A meeting room as the server sees it (server/realtime.ts roomView). */
export interface RoomState {
  kind: "counselling" | "team";
  cap: number;
  members: string[];
  host?: string;
  invited?: string[];
}
/** A room's shared pomodoro as the server sends it: the time left now, not a clock. */
export interface RoomTimer {
  phase: "work" | "break";
  running: boolean;
  /** Milliseconds left when it was sent. */
  left: number;
  by: string;
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
  /** A chat line; `all` when it was sent with /all to every space (from `space`). */
  chat(id: string, name: string, text: string, all?: { space: SpaceId }): void;
  /** /all was refused: wait `seconds` (0: not from inside a meeting room). */
  allWait(seconds: number): void;
  /** A whisper to or from us (/w name). */
  whisper(from: string, to: string, text: string): void;
  /** Our whisper didn't go: guest, nobody by that name, ourselves, or not online. */
  whisperRefused(reason: string, name: string): void;
  emote(id: string, kind: Emote): void;
  note(note: Note): void;
  noteRemoved(id: number): void;
  /** A note was hidden after reports: gone from your screen unless it's yours (or you're the admin). */
  noteHidden(id: number, author: string): void;
  comment(comment: Comment): void;
  commentRemoved(id: number, noteId: number): void;
  /** Someone hearted (or un-hearted) a comment on this note. */
  hearts(noteId: number): void;
  /** New mail arrived for us; this many unread. */
  mail(unread: number): void;
  /** The Poop Room's poops, one per person (only sent in there). */
  poops(list: { name: string; x: number; z: number }[]): void;
  /** The server gave us a visit stamp (members only): `count` of `total` so far. */
  stamp(label: string, count: number, total: number): void;
  /** The admin opened or closed a classroom. */
  classrooms(list: Classroom[]): void;
  /** Something on this classroom's board changed. */
  board(): void;
  /** Head counts per space (meeting rooms summed as "rooms"), whenever they change. */
  online(counts: Record<string, number>): void;
  /** The server moved us (the classroom we were in was closed). */
  moved(space: SpaceId, x: number, z: number, players: RemotePlayer[]): void;
  /** The server let us into a meeting room: what's in it and what's been said. */
  roomOpen(space: SpaceId, x: number, z: number, room: RoomState, lines: RoomLine[], players: RemotePlayer[], pad: { text: string; by: string | null }, timer: RoomTimer | null, video: VideoView | null): void;
  /** The room's shared video changed: another, play, pause, seek, or none (null). */
  video(video: VideoView | null): void;
  /** Our video action wasn't taken (not a YouTube or Vimeo link, too quick…); the video as it stands. */
  videoRefused(reason: string, video: VideoView | null): void;
  /** The room's timer was started, paused, moved on or reset (null: none). */
  timer(timer: RoomTimer | null): void;
  /** Someone else changed the room's shared notes. */
  pad(text: string, by: string): void;
  /** Who's in the room, or who's invited, changed. */
  room(room: RoomState): void;
  /** A line for the room's window from the room itself ("… joined"). */
  roomLine(line: RoomLine): void;
  /** The server said no: the room is full, invite-only, or the invite failed. */
  roomRefused(space: SpaceId, reason: string): void;
  /** Saving this meeting room's chat went (or didn't: a guest, or not in a room). */
  chatSaved(ok: boolean, what: "chat" | "notes", reason?: string): void;
  /** Someone in a counselling room invited you: accept to be taken in. */
  invited(space: SpaceId, from: string): void;
  /** The room's whiteboard link, asked for by whiteboard(). */
  whiteboard(url: string): void;
  /** Someone's already on that seat. */
  seatRefused(): void;
  /** The admin stopped us doing `what` (chat, notes, posts, join) until `until`. */
  restricted(what: string, until: string): void;
  /** The admin put us out: stopped from coming in ("restricted"), or a one-off kick ("kicked"). */
  removed(why: "restricted" | "kicked"): void;
  status(online: boolean): void;
  /** Who in the Student Hub has office hours open (name and maybe a counselling room number). */
  officeNow(list: { name: string; room: number | null }[]): void;
  /** A student knocked on our office hours: invite them in. */
  knocked(from: string, room: number | null): void;
  /** Our knock went to `name`, or the server refused office hours or a knock (reason). */
  knockResult(ok: boolean, text: string): void;
  /** Someone you follow came onto the campus: their name and the space's name (never a position). */
  followedOn(name: string, where: string): void;
  /** What a games table is doing now (sent to people within 3 m of it; server/tables.ts). */
  table(table: string, view: TableView): void;
  /** The table said no (too far, a game already on, full…). */
  tableRefused(table: string, reason: string): void;
}

// Matches the server's tick: no point sending faster than it broadcasts.
const SEND_MS = 100;

export interface Net {
  sendMove(p: { x: number; y: number; z: number; rot: number }): void;
  enter(space: SpaceId, x: number, z: number): void;
  chat(text: string): boolean;
  emote(kind: Emote): void;
  /** Says how open we are to a chat (or clears it); shown beside our name to our space. */
  status(s: PlayerStatus | null): void;
  /** Poops where we stand (the Poop Room only; the server checks). */
  poop(): void;
  /** Keeps this meeting room's chat so far for us, 30 days (members only; the server checks). */
  /** Asks for the room's shared whiteboard (plan 85). */
  whiteboard(): void;
  /** Keeps the room's chat (or only its shared notes) for me, 30 days. */
  saveChat(what?: "chat" | "notes"): boolean;
  /** The room's shared notes, as we now have them. */
  pad(text: string): void;
  /** Starts (or resumes), pauses or resets the room's shared timer. */
  timer(op: "start" | "pause" | "reset" | "more" | "less"): boolean;
  /** Staff: opens or closes office hours (optionally naming a counselling room, 1 to 6); the server checks. */
  office(on: boolean, room?: number | null): void;
  /** A student knocks on a staff member's open office hours. */
  knock(name: string): void;
  /** The room's shared video: "set" (with `url`), "play", "pause", "seek" (with `pos`) or "clear". */
  video(op: string, extra?: Record<string, unknown>): boolean;
  /** Asks a games table for something: "look", "pick" (a game), "join", "start", "answer" (a pick) or "leave". */
  table(table: string, op: string, extra?: Record<string, unknown>): boolean;
  /** Invites someone into the counselling room we're in. */
  invite(name: string): boolean;
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

  /** Sends if connected; false if not (a reconnect, a deploy), so a chat line can say it didn't go. */
  const sendNow = (msg: unknown): boolean => {
    if (ws?.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(msg));
    return true;
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
        case "whisper":
          return on.whisper(m.from as string, m.to as string, m.text as string);
        case "chat":
          return on.chat(m.id as string, m.name as string, m.text as string, m.all ? { space: m.space as SpaceId } : undefined);
        case "emote":
          return on.emote(m.id as string, m.kind as Emote);
        case "moved":
          return on.moved(m.space as SpaceId, m.x as number, m.z as number, m.players as RemotePlayer[]);
        case "action":
          if (m.kind === "classrooms") return on.classrooms(m.classrooms as Classroom[]);
          if (m.kind === "stamp" && typeof m.label === "string") return on.stamp(m.label, Number(m.count), Number(m.total));
          if (m.kind === "board") return on.board();
          if (m.kind === "online") return on.online(m.counts as Record<string, number>);
          if (m.kind === "note") return on.note(m.note as Note);
          if (m.kind === "note-removed") return on.noteRemoved(m.id as number);
          if (m.kind === "note-hidden") return on.noteHidden(m.id as number, m.author as string);
          if (m.kind === "comment") return on.comment(m.comment as Comment);
          if (m.kind === "comment-removed") return on.commentRemoved(m.id as number, m.noteId as number);
          if (m.kind === "hearts") return on.hearts(m.noteId as number);
          if (m.kind === "mail") return on.mail(m.unread as number);
          if (m.kind === "chat-saved") return on.chatSaved(m.ok === true, m.what === "notes" ? "notes" : "chat", typeof m.reason === "string" ? m.reason : undefined);
          if (m.kind === "whisper-refused") return on.whisperRefused(m.reason as string, m.name as string);
          if (m.kind === "poops") return on.poops(m.poops as { name: string; x: number; z: number }[]);
          if (m.kind === "room-open")
            return on.roomOpen(m.space as SpaceId, m.x as number, m.z as number, m.room as RoomState, m.lines as RoomLine[], m.players as RemotePlayer[], (m.pad as { text: string; by: string | null }) ?? { text: "", by: null }, (m.timer as RoomTimer | null) ?? null, (m.video as VideoView | null) ?? null);
          if (m.kind === "video") return on.video((m.video as VideoView | null) ?? null);
          if (m.kind === "video-refused") return on.videoRefused(String(m.reason), (m.video as VideoView | null) ?? null);
          if (m.kind === "timer") return on.timer((m.timer as RoomTimer | null) ?? null);
          if (m.kind === "pad") return on.pad(m.text as string, m.by as string);
          if (m.kind === "room-invited" && typeof m.space === "string" && typeof m.from === "string") return on.invited(m.space, m.from);
          if (m.kind === "whiteboard" && typeof m.url === "string") return on.whiteboard(m.url);
          if (m.kind === "room") return on.room(m.room as RoomState);
          if (m.kind === "room-line") return on.roomLine(m.line as RoomLine);
          if (m.kind === "room-refused") return on.roomRefused(m.space as SpaceId, m.reason as string);
          if (m.kind === "seat-refused") return on.seatRefused();
          if (m.kind === "table" && typeof m.table === "string") return on.table(m.table, m.view as TableView);
          if (m.kind === "table-refused" && typeof m.table === "string") return on.tableRefused(m.table, String(m.reason));
          if (m.kind === "restricted") return on.restricted(m.what as string, m.until as string);
          if (m.kind === "followed-on" && typeof m.name === "string" && typeof m.where === "string") return on.followedOn(m.name, m.where);
          if (m.kind === "office-now" && Array.isArray(m.list)) return on.officeNow(m.list as { name: string; room: number | null }[]);
          if (m.kind === "knocked" && typeof m.from === "string") return on.knocked(m.from, typeof m.room === "number" ? m.room : null);
          if (m.kind === "knock-sent") return on.knockResult(true, String(m.name));
          if (m.kind === "knock-refused" || m.kind === "office-refused") return on.knockResult(false, String(m.reason));
          if (m.kind === "all-wait") return on.allWait(m.seconds as number);
      }
    };
    ws.onclose = (e) => {
      on.status(false);
      if (closed) return;
      // 4003: the admin has stopped us coming in; 4004: the admin put us out
      // once. Either way, back to the join screen rather than reconnecting.
      if (e.code === 4003 || e.code === 4004) return on.removed(e.code === 4003 ? "restricted" : "kicked");
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
      return sendNow({ t: "chat", text });
    },
    emote(kind) {
      sendNow({ t: "emote", kind });
    },
    status(s) {
      sendNow({ t: "status", status: s });
    },
    poop() {
      sendNow({ t: "poop" });
    },
    whiteboard() {
      sendNow({ t: "whiteboard" });
    },
    saveChat(what = "chat") {
      return sendNow({ t: "save-chat", what });
    },
    pad(text) {
      sendNow({ t: "pad", text });
    },
    timer(op) {
      return sendNow({ t: "action", kind: "timer", op });
    },
    office(on, room) {
      sendNow({ t: "office", on, room: room ?? null });
    },
    knock(name) {
      sendNow({ t: "knock", name });
    },
    video(op, extra) {
      return sendNow({ t: "action", kind: "video", op, ...extra });
    },
    table(table, op, extra) {
      return sendNow({ t: "action", kind: "table", table, op, ...extra });
    },
    invite(name) {
      return sendNow({ t: "invite", name });
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
