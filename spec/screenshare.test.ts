import { describe, expect, it } from "vitest";

// Screen sharing in meeting rooms goes through the room's LiveKit voice (client/src/voicechat.ts),
// so what a ticket lets its holder publish is the one thing the server decides.

describe("voice tickets and screen sharing", () => {
  it("let a meeting room's ticket publish the microphone and a screen share, never the camera, and the open voice's only the microphone", async () => {
    process.env.LIVEKIT_API_KEY = "key1";
    process.env.LIVEKIT_API_SECRET = "s3cret";
    process.env.LIVEKIT_URL = "wss://voice.example";
    const { voiceToken } = await import("../server/voice.ts");
    const grants = (t: string) => JSON.parse(Buffer.from(t.split(".")[1]!, "base64url").toString()).video;
    const room = grants(voiceToken("ann", "room-team-library-1-abc", 120, 1_700_000_000_000, true));
    expect(room).toMatchObject({ room: "room-team-library-1-abc", roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false });
    expect(room.canPublishSources).toEqual(["microphone", "screen_share", "screen_share_audio"]);
    expect(room.canPublishSources).not.toContain("camera");
    const open = grants(voiceToken("ann", "space-outdoor", 120, 1_700_000_000_000));
    expect(open.canPublishSources).toEqual(["microphone"]);
    expect(open.room).toBe("space-outdoor");
  });
});
