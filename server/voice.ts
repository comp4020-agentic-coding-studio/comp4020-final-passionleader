import { createHmac } from "node:crypto";

// Voice (plan 86): people talk through a LiveKit server on the author's EC2
// (its media relays there; nothing is recorded, and it never passes through
// this app). This server only hands out short tickets to join one voice
// room, after checking the same rules as everywhere else: a meeting room's
// voice only to people inside it now (so its six-person cap and invites hold),
// a space's open voice (push V to talk, outside) only to people in that
// space. The ticket is LiveKit's access token, a JWT signed with the API
// secret in the Fly secrets; no key is ever in the repo.

const URL = process.env.LIVEKIT_URL ?? "";
const KEY = process.env.LIVEKIT_API_KEY ?? "";
const SECRET = process.env.LIVEKIT_API_SECRET ?? "";
export const voiceReady = (): boolean => !!(URL && KEY && SECRET);
export const voiceUrl = (): string => URL;

const b64 = (v: string | Buffer): string => Buffer.from(v).toString("base64url");

/** A LiveKit access token: `identity` may join `room` for `ttl` seconds, to speak and listen. */
export function voiceToken(identity: string, room: string, ttl = 2 * 3600, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const header = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64(
    JSON.stringify({
      iss: KEY,
      sub: identity,
      name: identity,
      nbf: iat - 10,
      iat,
      exp: iat + ttl,
      video: { room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false },
    }),
  );
  const sig = createHmac("sha256", SECRET).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}
