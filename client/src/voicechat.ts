// Voice (plan 86), through the author's LiveKit server: the app's server only
// hands out a ticket for one voice room after checking you may be there
// (server/voice.ts). Nothing is recorded.
//
// - In a meeting room, the room menu's "Voice" switch: on, you're heard by
//   everyone inside with voice on (computer or phone); off, you leave it.
// - Outside, on a computer: hold V to talk to the people around you; the
//   further away they are, the quieter they sound, and past 18 m not at all.
// Someone you've muted (mute.ts) is silent here too. The voice volume is in
// the settings. livekit-client loads only when voice is first used.

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
  /** Joins the voice of where you are now (`spatial`: outside, push to talk, by distance). */
  join(spatial: boolean): Promise<boolean>;
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
      // In a room the mic is on at once; outside it waits for V.
      if (!spatial) {
        try {
          await r.localParticipant.setMicrophoneEnabled(true);
        } catch {
          deps.say("Allow the microphone to talk (your browser asked). You can still listen.");
        }
      }
      return true;
    })().finally(() => (joining = null));
    return joining;
  }

  function cleanup(): void {
    for (const who of [...audio.keys()]) detachAll(who);
    room = null;
    deps.talking(new Set());
  }

  let pushing = false;
  return {
    join,
    leave() {
      const r = room;
      cleanup();
      void r?.disconnect();
    },
    isOn: () => room !== null,
    talk(on) {
      if (!room || !spatial || on === pushing) return;
      pushing = on;
      void room.localParticipant.setMicrophoneEnabled(on).catch(() => deps.say("Allow the microphone to talk (your browser asked)."));
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
