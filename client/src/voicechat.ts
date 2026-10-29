// Voice (plan 86), through the author's LiveKit server: the app's server only
// hands out a ticket for one voice room after checking you may be there
// (server/voice.ts). Nothing is recorded.
//
// Everyone hears without doing anything (the user's call, 10/30): coming into
// a meeting room, or outside, you join its voice listening only. To be
// heard: the room menu's Mic switch in a room (computer or phone), or hold V
// outside (computer). Outside, voices are quieter the further away they
// are, and silent past 18 m; in a room everyone sounds the same. Someone
// you've muted is silent here too; the settings' Voices volume at 0 turns
// voice off altogether. livekit-client loads only when voice is first used.

import type { RemoteParticipant, RemoteTrack, Room } from "livekit-client";

const VOL_KEY = "campus.voiceVolume";
const HEAR = 18;

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
  const audio = new Map<string, HTMLMediaElement[]>();

  const attach = (track: RemoteTrack, who: RemoteParticipant): void => {
    if (track.kind !== "audio") return;
    const el = track.attach();
    el.style.display = "none";
    document.body.append(el);
    audio.set(who.identity, [...(audio.get(who.identity) ?? []), el]);
  };
  const detachAll = (who: string): void => {
    for (const el of audio.get(who) ?? []) el.remove();
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
      const r = new lk.Room({ adaptiveStream: true, dynacast: true });
      r.on(lk.RoomEvent.TrackSubscribed, (track, _pub, who) => attach(track, who));
      r.on(lk.RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((el) => el.remove()));
      r.on(lk.RoomEvent.ParticipantDisconnected, (who) => detachAll(who.identity));
      r.on(lk.RoomEvent.ActiveSpeakersChanged, (speakers) => deps.talking(new Set(speakers.map((s) => s.identity))));
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

  function cleanup(): void {
    for (const who of [...audio.keys()]) detachAll(who);
    room = null;
    micState = false;
    deps.talking(new Set());
  }

  let pushing = false;
  let micState = false;
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
      const base = readVoiceVolume() / 100;
      const me = deps.me();
      for (const [who, els] of audio) {
        let v = deps.isMuted(who) ? 0 : base;
        if (spatial && v > 0) {
          const at = deps.whereIs(who);
          const d = at ? Math.hypot(at.x - me.x, at.z - me.z) : Infinity;
          v = d >= HEAR ? 0 : v * Math.max(0.12, 1 - d / HEAR);
        }
        for (const el of els) if (Math.abs(el.volume - v) > 0.01) el.volume = v;
      }
    },
  };
}
