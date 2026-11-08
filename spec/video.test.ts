import { afterEach, describe, expect, it } from "vitest";
import { closeAll, connect, guest, type Msg, type Socket } from "./helpers.ts";
import { applyVideo, parseVideoLink, positionNow, videoView } from "../server/video.ts";

// The room's shared viewing screen (server/video.ts): only YouTube and Vimeo https links,
// play/pause/seek through the server (last wins, one a second each), only for people inside,
// gone when the room empties.

afterEach(closeAll);

const opened = (space: string) => (m: Msg) => m.t === "action" && m.kind === "room-open" && m.space === space;
const video = (pred: (v: Record<string, any> | null) => boolean) => (m: Msg) => m.t === "action" && m.kind === "video" && pred(m.video as Record<string, any> | null);
const refusedVideo = (reason: string) => (m: Msg) => m.t === "action" && m.kind === "video-refused" && m.reason === reason;
const act = (s: Socket, op: string, extra: Record<string, unknown> = {}) => s.send({ t: "action", kind: "video", op, ...extra });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function inRoom(space: string): Promise<{ name: string; s: Socket }> {
  const v = await guest();
  const s = await connect(v.token);
  await s.next((m) => m.t === "welcome");
  s.send({ t: "enter", space, x: 0, z: 0 });
  await s.next(opened(space));
  return { name: v.name, s };
}

describe("video links", () => {
  it("take YouTube and Vimeo https links and nothing else", () => {
    expect(parseVideoLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({ provider: "youtube", id: "dQw4w9WgXcQ" });
    expect(parseVideoLink("https://youtu.be/dQw4w9WgXcQ?t=5")).toEqual({ provider: "youtube", id: "dQw4w9WgXcQ" });
    expect(parseVideoLink("https://m.youtube.com/shorts/dQw4w9WgXcQ")).toEqual({ provider: "youtube", id: "dQw4w9WgXcQ" });
    expect(parseVideoLink("https://vimeo.com/76979871")).toEqual({ provider: "vimeo", id: "76979871" });
    expect(parseVideoLink("https://vimeo.com/76979871/abcdef1234")).toEqual({ provider: "vimeo", id: "76979871", hash: "abcdef1234" });
    expect(parseVideoLink("https://player.vimeo.com/video/76979871?h=abcdef1234")).toEqual({ provider: "vimeo", id: "76979871", hash: "abcdef1234" });
    for (const bad of [
      "http://www.youtube.com/watch?v=dQw4w9WgXcQ", // not https
      "https://evil.example/watch?v=dQw4w9WgXcQ",
      "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
      "https://user:pw@www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com:8443/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/watch?v=short",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ\"onload=1",
      "https://vimeo.com/notanumber",
      "https://vimeo.com/channels/staffpicks",
      "javascript:alert(1)",
      "https://example.com/video.mp4",
      "",
      42,
    ]) expect(parseVideoLink(bad)).toBeNull();
  });
  it("keep where the video is: a playing one moves on, a paused one stays", () => {
    const set = applyVideo(undefined, "ann", { op: "set", url: "https://youtu.be/dQw4w9WgXcQ" }, 1000);
    expect(set.ok && set.state).toMatchObject({ provider: "youtube", playing: true, pos: 0, by: "ann" });
    if (!set.ok || !set.state) throw new Error();
    expect(positionNow(set.state, 11_000)).toBe(10);
    const paused = applyVideo(set.state, "bob", { op: "pause", pos: 12 }, 20_000);
    if (!paused.ok || !paused.state) throw new Error();
    expect(videoView(paused.state, 90_000)).toMatchObject({ playing: false, pos: 12, by: "bob" });
    const sought = applyVideo(paused.state, "cy", { op: "seek", pos: 30 }, 21_000);
    expect(sought.ok && sought.state).toMatchObject({ playing: false, pos: 30, by: "cy" });
    expect(applyVideo(undefined, "ann", { op: "play", pos: 1 })).toEqual({ ok: false, reason: "no video" });
    expect(applyVideo(set.state, "ann", { op: "seek", pos: "soon" })).toEqual({ ok: false, reason: "position" });
    // A position is a number the server clamps, never trusted as is.
    const far = applyVideo(set.state, "ann", { op: "seek", pos: 1e12 });
    expect(far.ok && far.state && far.state.pos).toBe(24 * 3600);
  });
});

describe("the room's shared video", () => {
  it("is shown to everyone inside, refuses other links, and the last action wins", async () => {
    const room = "team-library-2";
    const a = await inRoom(room);
    const b = await inRoom(room);
    act(a.s, "set", { url: "https://evil.example/x" });
    await a.s.next(refusedVideo("link"));
    expect(await b.s.sees(video((v) => v !== null), 300)).toBe(false);
    await wait(1100);
    act(a.s, "set", { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    for (const p of [a, b]) await p.s.next(video((v) => v?.id === "dQw4w9WgXcQ" && v.playing === true && v.by === a.name));
    // B pauses, A seeks right after (a second apart): the last one stands, and the room hears both.
    await wait(1100);
    act(b.s, "pause", { pos: 7 });
    await a.s.next(video((v) => v?.playing === false && v.by === b.name));
    await wait(1100);
    act(a.s, "seek", { pos: 99 });
    const last = await b.s.next(video((v) => v?.pos === 99 && v.by === a.name));
    expect((last.video as any).playing).toBe(false);
    // Someone coming in later gets the state as it is now, in the room-open message.
    const c = await guest();
    const sc = await connect(c.token);
    await sc.next((m) => m.t === "welcome");
    sc.send({ t: "enter", space: room, x: 0, z: 0 });
    const open = await sc.next(opened(room));
    expect(open.video).toMatchObject({ id: "dQw4w9WgXcQ", playing: false, pos: 99 });
  }, 20_000);

  it("takes at most one action a second from one person", async () => {
    const a = await inRoom("team-library-3");
    act(a.s, "set", { url: "https://vimeo.com/76979871" });
    await a.s.next(video((v) => v?.provider === "vimeo"));
    act(a.s, "pause", { pos: 3 });
    await a.s.next(refusedVideo("slow down"));
    await wait(1100);
    act(a.s, "pause", { pos: 3 });
    await a.s.next(video((v) => v?.playing === false));
  }, 10_000);

  it("never reaches people outside the room, and goes when the room empties", async () => {
    const room = "team-library-4";
    const a = await inRoom(room);
    const outsider = await guest();
    const so = await connect(outsider.token);
    await so.next((m) => m.t === "welcome");
    so.send({ t: "enter", space: "hub", x: 0, z: 0 });
    await wait(150);
    // Not in a room: no state to act on, so nothing happens and nothing is said.
    act(so, "set", { url: "https://vimeo.com/76979871" });
    expect(await so.sees(video(() => true), 300)).toBe(false);
    act(a.s, "set", { url: "https://vimeo.com/76979871" });
    await a.s.next(video((v) => v?.id === "76979871"));
    expect(await so.sees(video(() => true), 300)).toBe(false);
    // The only one leaves; the next to come in finds nothing.
    a.s.send({ t: "enter", space: "hub", x: 0, z: 0 });
    await wait(200);
    const b = await inRoom(room);
    const again = await b.s.next(opened(room));
    expect(again.video ?? null).toBeNull();
  }, 10_000);
});
