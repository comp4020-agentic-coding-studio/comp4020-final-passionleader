// The shared viewing screen in a meeting room: one YouTube or Vimeo video the
// room watches together. A member pastes a link; the server checks it (https,
// and only those two sites' own addresses) and keeps just which video it is
// (provider, id), never the pasted text, so what reaches the room's players is
// an address this file built itself. Play, pause and seek go through the
// server, the last one wins, and the room is told where the video is now
// (never a clock, so a wrong clock on someone's computer can't skew it). It
// lives in the room's memory (realtime.ts RoomState) and goes when it empties.

export type Provider = "youtube" | "vimeo";

export interface VideoRef {
  provider: Provider;
  id: string;
  /** Vimeo's key for an unlisted video (vimeo.com/ID/KEY), if the link had one. */
  hash?: string;
}

export interface VideoState extends VideoRef {
  by: string;
  playing: boolean;
  /** Seconds into the video when `at` was taken. */
  pos: number;
  /** Server clock (ms) of the last action. */
  at: number;
}

/** One action a second per person, so a scrubbing hand can't flood the room. */
export const VIDEO_GAP_MS = 1000;
const MAX_LINK = 300;
/** Longest position taken from a client (a day), so nonsense can't be stored. */
const MAX_POS = 24 * 3600;

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"]);
const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);
const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/** The video a pasted link names, or null if it isn't an https YouTube or Vimeo video link. */
export function parseVideoLink(raw: unknown): VideoRef | null {
  if (typeof raw !== "string" || raw.length > MAX_LINK) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  // https only, no name or password in the address, no odd port: what's left is the site itself.
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean);
  if (YOUTUBE_HOSTS.has(host)) {
    let id: string | undefined;
    if (host === "youtu.be") id = parts[0];
    else if (parts[0] === "watch") id = u.searchParams.get("v") ?? undefined;
    else if (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live" || parts[0] === "v") id = parts[1];
    return id && YT_ID.test(id) ? { provider: "youtube", id } : null;
  }
  if (VIMEO_HOSTS.has(host)) {
    // vimeo.com/123456789, vimeo.com/123456789/abcdef0123, player.vimeo.com/video/123456789?h=abcdef0123
    const at = host === "player.vimeo.com" ? (parts[0] === "video" ? 1 : -1) : 0;
    const id = at < 0 ? undefined : parts[at];
    if (!id || !/^[0-9]{1,12}$/.test(id)) return null;
    const key = parts[at + 1] ?? u.searchParams.get("h") ?? undefined;
    return key && /^[0-9a-f]{6,16}$/i.test(key) ? { provider: "vimeo", id, hash: key } : { provider: "vimeo", id };
  }
  return null;
}

/** Where the video is now: its position at `at`, plus the time since if it's playing. */
export const positionNow = (v: VideoState, now = Date.now()): number => (v.playing ? v.pos + Math.max(0, now - v.at) / 1000 : v.pos);

/** What the room is told (and nothing but this): the video, whether it plays, where it is now, and who last acted. */
export function videoView(v: VideoState | undefined, now = Date.now()): Record<string, unknown> | null {
  if (!v) return null;
  return { provider: v.provider, id: v.id, ...(v.hash ? { hash: v.hash } : {}), playing: v.playing, pos: Math.round(positionNow(v, now) * 10) / 10, by: v.by };
}

export type VideoOutcome = { ok: true; state: VideoState | undefined; what: string } | { ok: false; reason: string };

/**
 * Applies one action to a room's video: "set" (a link), "play", "pause" and "seek" (each with the
 * sender's position), or "clear". Nothing to play or seek without a video; last action wins.
 */
export function applyVideo(state: VideoState | undefined, who: string, msg: Record<string, unknown>, now = Date.now()): VideoOutcome {
  const pos = typeof msg.pos === "number" && Number.isFinite(msg.pos) ? Math.max(0, Math.min(MAX_POS, msg.pos)) : null;
  switch (msg.op) {
    case "set": {
      const ref = parseVideoLink(msg.url);
      if (!ref) return { ok: false, reason: "link" };
      return { ok: true, what: `${who} showed a ${ref.provider === "youtube" ? "YouTube" : "Vimeo"} video`, state: { ...ref, by: who, playing: true, pos: 0, at: now } };
    }
    case "clear":
      return state ? { ok: true, what: `${who} stopped the video`, state: undefined } : { ok: false, reason: "no video" };
    case "play":
    case "pause":
    case "seek": {
      if (!state) return { ok: false, reason: "no video" };
      if (pos === null) return { ok: false, reason: "position" };
      const playing = msg.op === "play" ? true : msg.op === "pause" ? false : state.playing;
      return { ok: true, what: "", state: { ...state, by: who, playing, pos, at: now } };
    }
    default:
      return { ok: false, reason: "op" };
  }
}
