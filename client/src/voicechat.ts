// Voice (plan 86), through the author's LiveKit server: the app's server only
// hands out a ticket for one voice room after checking you may be there
// (server/voice.ts). Nothing is recorded.
//
// Everyone hears without doing anything (the user's call, 10/30): coming into
// a meeting room, or outside, you join its voice listening only. To be
// heard: the room menu's Mic switch in a room (computer or phone), or hold V
// outside (computer). Outside, voices fall off with distance like the emotes'
// voices do (loud beside you, faint across the road, silent past 14 m); in a
// room everyone sounds the same. The volume goes through Web Audio (LiveKit's
// webAudioMix), because an iPhone ignores an audio element's volume: the
// user heard far voices as loud as near ones (11/4). Someone
// you've muted is silent here too; the settings' Voices volume at 0 turns
// voice off altogether. livekit-client loads only when voice is first used.

import type { RemoteAudioTrack, RemoteParticipant, RemoteTrack, Room } from "livekit-client";

const VOL_KEY = "campus.voiceVolume";
/** Silent past this (metres), as the emotes' voices (voice.ts HEAR_RANGE). */
const HEAR = 14;
/** How loud someone is at `d` metres, 0..1: full beside you, a square fall-off, a whisper at the edge. */
export const voiceFalloff = (d: number): number => (d >= HEAR ? 0 : Math.max(0.06, (1 - d / HEAR) ** 2));

export interface VoiceDeps {
  /** Asks the server for a ticket for the voice where you are now. */
  ticket(): Promise<{ url: string; token: string; room: string } | string>;
  /** Where someone is (by name), in the same space, or null. */
  whereIs(name: string): { x: number; z: number } | null;
  /** Where you are. */
  me(): { x: number; z: number };
  isMuted(name: string): boolean;
  /** A short line to the player ("Voice on", an error). */
  say(msg: string): void;
  /** Called when who is talking changes (names), for the name tags. */
  talking(names: Set<string>): void;
  /** Someone else's shared screen came (their video element) or went (null), for the room window's panel. */
  screen(who: string, el: HTMLVideoElement | null): void;
  /** Whether our own screen share is on now (it can also end from the browser's own "Stop sharing" bar). */
  sharing(on: boolean): void;
}

export function readVoiceVolume(): number {
  try {
    const v = Number(localStorage.getItem(VOL_KEY));
    return localStorage.getItem(VOL_KEY) !== null && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 80;
  } catch {
    return 80;
  }
}
export function saveVoiceVolume(v: number): void {
  try {
    localStorage.setItem(VOL_KEY, String(Math.round(v)));
  } catch {
    // private mode
  }
}

export function mountVoice(deps: VoiceDeps): {
  /** Joins the voice of where you are now, listening (`spatial`: outside, by distance). */
  join(spatial: boolean): Promise<boolean>;
  /** Your microphone on or off (in a room, the menu's switch). Resolves to whether it's on. */
  mic(on: boolean): Promise<boolean>;
  /** Shares your screen with the room, or stops. Resolves to whether it's on; says why if not. */
  share(on: boolean): Promise<boolean>;
  sharingOn(): boolean;
  micOn(): boolean;
  leave(): void;
  isOn(): boolean;
  /** Push to talk (outside): true while V is held. */
  talk(on: boolean): void;
  /** Each frame: volumes by distance, mutes. */
  tick(): void;
} {
  let room: Room | null = null;
  let spatial = false;
  let joining: Promise<boolean> | null = null;
  const audio = new Map<string, { track: RemoteAudioTrack; els: HTMLMediaElement[]; vol: number }[]>();

  const attach = (track: RemoteTrack, who: RemoteParticipant, screen: boolean): void => {
    // Someone's shared screen is a video: it goes to the room window's panel, not to the voices.
    if (track.kind === "video") {
      if (screen) deps.screen(who.identity, track.attach() as HTMLVideoElement);
      return;
    }
    if (track.kind !== "audio") return;
    const el = track.attach();
    el.style.display = "none";
    document.body.append(el);
    audio.set(who.identity, [...(audio.get(who.identity) ?? []), { track: track as RemoteAudioTrack, els: [el], vol: -1 }]);
  };
  const detachAll = (who: string): void => {
    for (const a of audio.get(who) ?? []) for (const el of a.els) el.remove();
    audio.delete(who);
  };

  async function join(asSpatial: boolean): Promise<boolean> {
    if (room) return true;
    if (readVoiceVolume() === 0) return false;
    if (joining) return joining;
    joining = (async () => {
      const t = await deps.ticket();
      if (typeof t === "string") {
        deps.say(t);
        return false;
      }
      const lk = await import("livekit-client");
      // webAudioMix: each voice through a gain node, so its volume works on an iPhone too.
      const r = new lk.Room({ adaptiveStream: true, dynacast: true, webAudioMix: true });
      r.on(lk.RoomEvent.TrackSubscribed, (track, pub, who) => attach(track, who, pub.source === lk.Track.Source.ScreenShare));
      r.on(lk.RoomEvent.TrackUnsubscribed, (track, pub, who) => {
        if (track.kind === "video") {
          track.detach();
          if (pub.source === lk.Track.Source.ScreenShare) deps.screen(who.identity, null);
          return;
        }
        track.detach().forEach((el) => el.remove());
        const left = (audio.get(who.identity) ?? []).filter((a) => a.track !== track);
        if (left.length) audio.set(who.identity, left);
        else audio.delete(who.identity);
      });
      r.on(lk.RoomEvent.ParticipantDisconnected, (who) => {
        detachAll(who.identity);
        deps.screen(who.identity, null);
      });
      // Our own share can end from the browser's "Stop sharing" bar: the button must follow.
      r.on(lk.RoomEvent.LocalTrackUnpublished, (pub) => {
        if (pub.source !== lk.Track.Source.ScreenShare) return;
        shareState = false;
        deps.sharing(false);
      });
      r.on(lk.RoomEvent.ActiveSpeakersChanged, (speakers) => {
        active = new Set(speakers.map((s) => s.identity));
        report();
      });
      r.on(lk.RoomEvent.Disconnected, () => {
        if (room === r) cleanup();
      });
      try {
        await r.connect(t.url, t.token);
      } catch {
        deps.say("Couldn't reach the voice server. Try again in a moment. Error code: VOICE-NET");
        return false;
      }
      room = r;
      spatial = asSpatial;
      // Audio may need a tap first (browsers block sound until then): the next one starts it.
      if (!r.canPlaybackAudio) {
        const go = (): void => void r.startAudio().catch(() => {});
        window.addEventListener("pointerdown", go, { once: true, capture: true });
        window.addEventListener("keydown", go, { once: true, capture: true });
      }
      return true;
    })().finally(() => (joining = null));
    return joining;
  }

  // Who shows a mic: LiveKit's active speakers, plus anyone whose level is above a lower bar, held
  // for a moment after (the server's bar missed someone speaking softly: the user, 11/9).
  let active = new Set<string>();
  const heard = new Map<string, number>();
  let shown = "";
  let lastLevelCheck = 0;
  const QUIET_LEVEL = 0.008;
  const HOLD_MS = 700;
  function report(): void {
    const now = performance.now();
    const names = new Set(active);
    for (const [who, at] of heard) {
      if (now - at < HOLD_MS) names.add(who);
      else heard.delete(who);
    }
    const key = [...names].sort().join("|");
    if (key === shown) return;
    shown = key;
    deps.talking(names);
  }
  function cleanup(): void {
    for (const who of [...audio.keys()]) detachAll(who);
    for (const p of room?.remoteParticipants.values() ?? []) deps.screen(p.identity, null);
    room = null;
    micState = false;
    if (shareState) deps.sharing(false);
    shareState = false;
    active = new Set();
    heard.clear();
    shown = "";
    deps.talking(new Set());
  }

  let pushing = false;
  let micState = false;
  let shareState = false;
  async function share(on: boolean): Promise<boolean> {
    if (!on) {
      try {
        await room?.localParticipant.setScreenShareEnabled(false);
      } catch {
        // Already off.
      }
      shareState = false;
      deps.sharing(false);
      return false;
    }
    // Phones and some browsers can't capture a screen at all: say so rather than do nothing.
    if (!navigator.mediaDevices?.getDisplayMedia) {
      deps.say("This browser can't share its screen. Try Chrome, Edge or Firefox on a computer.");
      return false;
    }
    if (readVoiceVolume() === 0) {
      deps.say("Voices are turned off in Settings, which also turns off screen sharing. Turn the Voices volume up first.");
      return false;
    }
    // The same connection as the room's voice (its ticket allows the share); if there's none, join it now.
    if (!room && !(await join(false))) {
      deps.say("Screen sharing needs the room's voice connection, which isn't available right now. You can still show a video.");
      return false;
    }
    if (!room) return false;
    try {
      await room.localParticipant.setScreenShareEnabled(true, { audio: true });
      shareState = true;
      deps.sharing(true);
    } catch (e) {
      // Cancelling the browser's picker is not an error worth shouting about.
      const denied = (e as Error)?.name === "NotAllowedError" || /permission|denied|cancel/i.test((e as Error)?.message ?? "");
      deps.say(denied ? "Screen sharing wasn't started (the picker was closed or the browser said no)." : "Couldn't share your screen. Error code: VOICE-SHARE");
      shareState = false;
    }
    return shareState;
  }
  async function mic(on: boolean): Promise<boolean> {
    if (on && !room && !(await join(spatial))) return false;
    if (!room) return false;
    try {
      await room.localParticipant.setMicrophoneEnabled(on);
      micState = on;
    } catch {
      deps.say("Allow the microphone to talk (your browser asked). You can still listen.");
      micState = false;
    }
    return micState;
  }
  return {
    join,
    mic,
    share,
    sharingOn: () => shareState,
    micOn: () => micState,
    leave() {
      const r = room;
      cleanup();
      void r?.disconnect();
    },
    isOn: () => room !== null,
    talk(on) {
      if (!room || !spatial || on === pushing) return;
      pushing = on;
      void mic(on);
    },
    tick() {
      if (!room) return;
      const now = performance.now();
      if (now - lastLevelCheck > 150) {
        lastLevelCheck = now;
        for (const p of room.remoteParticipants.values()) if (p.audioLevel > QUIET_LEVEL) heard.set(p.identity, now);
        if (room.localParticipant.audioLevel > QUIET_LEVEL) heard.set(room.localParticipant.identity, now);
        report();
      }
      const base = readVoiceVolume() / 100;
      const me = deps.me();
      for (const [who, tracks] of audio) {
        let v = deps.isMuted(who) ? 0 : base;
        if (spatial && v > 0) {
          const at = deps.whereIs(who);
          v *= voiceFalloff(at ? Math.hypot(at.x - me.x, at.z - me.z) : Infinity);
        }
        for (const a of tracks) {
          if (Math.abs(a.vol - v) < 0.01) continue;
          a.vol = v;
          a.track.setVolume(v);
        }
      }
    },
  };
}
