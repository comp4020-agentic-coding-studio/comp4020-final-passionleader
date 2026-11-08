import "./roomscreen.css";

// A meeting room's shared screen: a YouTube or Vimeo video everyone inside
// watches together, and any screen someone is sharing through the room's voice
// (voicechat.ts; LiveKit). The server (server/video.ts) holds the video's state,
// the last play, pause or seek wins, and tells the room where it now is; this
// builds the site's own player from the IFrame APIs (YouTube's and Vimeo's) and
// keeps it in step. Only the video's id reaches a player, never the pasted text.
// The player exists only while this view is open: leaving the view ends its
// sound, coming back puts it where the room is now.

export interface VideoView {
  provider: "youtube" | "vimeo";
  id: string;
  hash?: string;
  playing: boolean;
  /** Seconds into the video when this was sent. */
  pos: number;
  by: string;
}

/** The two sites' players behind one small set of calls. */
interface Adapter {
  play(): void;
  pause(): void;
  seek(s: number): void;
  time(): Promise<number>;
  /** False while it's buffering or not started, so a stall isn't taken for a seek. */
  steady(): boolean;
  destroy(): void;
}

// Just the parts of the two APIs used here.
interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(s: number, ahead: boolean): void;
  getCurrentTime(): number;
  getPlayerState(): number;
  destroy(): void;
}
interface VimeoPlayer {
  play(): Promise<void>;
  pause(): Promise<void>;
  setCurrentTime(s: number): Promise<number>;
  getCurrentTime(): Promise<number>;
  getPaused(): Promise<boolean>;
  on(ev: string, f: (d: { seconds?: number }) => void): void;
  destroy(): Promise<void>;
}
interface Apis {
  YT?: { Player: new (el: HTMLElement, o: Record<string, unknown>) => YTPlayer };
  onYouTubeIframeAPIReady?: () => void;
  Vimeo?: { Player: new (el: HTMLElement, o: Record<string, unknown>) => VimeoPlayer };
}
const w = window as unknown as Apis;

const loaded = new Map<string, Promise<void>>();
function loadScript(src: string, ready: () => boolean, hook?: (done: () => void) => void): Promise<void> {
  if (ready()) return Promise.resolve();
  let p = loaded.get(src);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      hook?.(resolve);
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      if (!hook) s.onload = () => resolve();
      s.onerror = () => {
        loaded.delete(src);
        reject(new Error("blocked"));
      };
      document.head.append(s);
    });
    loaded.set(src, p);
  }
  return p;
}
const loadYouTube = (): Promise<void> =>
  loadScript("https://www.youtube.com/iframe_api", () => !!w.YT?.Player, (done) => {
    const before = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      before?.();
      done();
    };
  });
const loadVimeo = (): Promise<void> => loadScript("https://player.vimeo.com/api/player.js", () => !!w.Vimeo?.Player);

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^[0-9]{1,12}$/;
const VIMEO_KEY = /^[0-9a-f]{6,16}$/i;

export function mountRoomScreen(opts: {
  /** Sends a video action ("set" with a url, "play", "pause", "seek" with pos, "clear"); false if not connected. */
  send(op: string, extra?: Record<string, unknown>): boolean;
  /** Starts or stops sharing your screen. */
  onShare(on: boolean): void;
  onNotSent(): void;
}): {
  el: HTMLElement;
  /** The room's video as the server says it is now (null: none). */
  video(v: VideoView | null): void;
  /** The view opened or closed: the player is built (or ended) with it. */
  shown(open: boolean): void;
  /** Someone else's screen: their video element, or null when it stops. */
  remoteShare(who: string, el: HTMLVideoElement | null): void;
  sharing(on: boolean): void;
  /** The room was left: everything goes. */
  reset(): void;
  /** Says something in the panel (a refusal). */
  note(msg: string): void;
} {
  const root = document.createElement("div");
  root.id = "room-screen";

  // --- shared screens ------------------------------------------------------
  const shares = document.createElement("section");
  shares.className = "rs-shares";
  shares.setAttribute("aria-label", "Shared screens");
  shares.hidden = true;
  const mine = document.createElement("div");
  mine.className = "rs-mine";
  mine.hidden = true;
  const mineText = document.createElement("span");
  mineText.textContent = "🖥️ You're sharing your screen with the room.";
  const stop = document.createElement("button");
  stop.type = "button";
  stop.textContent = "Stop sharing";
  stop.addEventListener("click", () => opts.onShare(false));
  mine.append(mineText, stop);
  const remote = document.createElement("div");
  remote.className = "rs-remote";
  shares.append(mine, remote);

  // --- the video -----------------------------------------------------------
  const vid = document.createElement("section");
  vid.className = "rs-video";
  vid.setAttribute("aria-label", "Shared video");
  const form = document.createElement("form");
  form.className = "rs-form";
  const input = document.createElement("input");
  input.type = "url";
  input.placeholder = "Paste a YouTube or Vimeo link (https)";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.maxLength = 300;
  input.setAttribute("aria-label", "YouTube or Vimeo link");
  const show = document.createElement("button");
  show.type = "submit";
  show.className = "room-primary";
  show.textContent = "Show to the room";
  form.append(input, show);
  const stage = document.createElement("div");
  stage.className = "rs-stage";
  const status = document.createElement("p");
  status.className = "rs-status";
  status.setAttribute("role", "status");
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "room-secondary rs-clear";
  clear.textContent = "Stop the video for everyone";
  // Beside it: the same video on its own site in a new window, from where the room is now (the
  // user, 11/9). That window is yours alone and isn't kept in step with the room.
  const popOut = document.createElement("button");
  popOut.type = "button";
  popOut.className = "room-secondary rs-clear";
  popOut.textContent = "Open in a new window";
  popOut.title = "Opens the video on YouTube or Vimeo; that window plays on its own, not in step with the room";
  const videoButtons = document.createElement("div");
  videoButtons.className = "rs-buttons";
  videoButtons.append(clear, popOut);
  vid.append(form, stage, status, videoButtons);
  root.append(shares, vid);

  let open = false;
  let state: VideoView | null = null;
  let stateAt = 0;
  let adapter: Adapter | null = null;
  let builtFor = "";
  let building = 0;
  // While we have just changed the player ourselves (or built it), what it reports isn't the person's doing.
  let quietUntil = 0;
  const quiet = (ms: number): void => void (quietUntil = performance.now() + ms);
  const isQuiet = (): boolean => performance.now() < quietUntil;
  let poll = 0;
  let lastT = 0;
  let lastAt = 0;

  const expected = (): number => (state ? state.pos + (state.playing ? (performance.now() - stateAt) / 1000 : 0) : 0);
  const send = (op: string, extra?: Record<string, unknown>): void => {
    // Our own echo (the server tells everyone, us too) settles it; until then the player isn't judged.
    quiet(1500);
    if (!opts.send(op, extra)) opts.onNotSent();
  };

  function say(msg: string): void {
    status.textContent = msg;
  }

  function destroy(): void {
    window.clearInterval(poll);
    poll = 0;
    building++;
    try {
      adapter?.destroy();
    } catch {
      // The player was already gone.
    }
    adapter = null;
    builtFor = "";
    stage.replaceChildren();
  }

  async function youtube(v: VideoView, mount: HTMLElement, onUser: (what: "play" | "pause") => void): Promise<Adapter> {
    await loadYouTube();
    return new Promise((resolve, reject) => {
      const p = new w.YT!.Player(mount, {
        videoId: v.id,
        width: "100%",
        height: "100%",
        playerVars: { playsinline: 1, rel: 0, origin: location.origin },
        events: {
          onReady: () =>
            resolve({
              play: () => p.playVideo(),
              pause: () => p.pauseVideo(),
              seek: (s) => p.seekTo(s, true),
              time: async () => p.getCurrentTime(),
              steady: () => [1, 2].includes(p.getPlayerState()),
              destroy: () => p.destroy(),
            }),
          // 1 playing, 2 paused: a person pressing the player's own buttons.
          onStateChange: (e: { data: number }) => {
            if (e.data === 1) onUser("play");
            else if (e.data === 2) onUser("pause");
          },
          onError: () => reject(new Error("youtube")),
        },
      });
    });
  }

  async function vimeo(v: VideoView, mount: HTMLElement, onUser: (what: "play" | "pause") => void): Promise<Adapter> {
    await loadVimeo();
    const p = new w.Vimeo!.Player(mount, v.hash ? { url: `https://vimeo.com/${v.id}/${v.hash}`, responsive: true } : { id: Number(v.id), responsive: true });
    p.on("play", () => onUser("play"));
    p.on("pause", () => onUser("pause"));
    return {
      play: () => void p.play().catch(() => {}),
      pause: () => void p.pause().catch(() => {}),
      seek: (s) => void p.setCurrentTime(s).catch(() => {}),
      time: () => p.getCurrentTime(),
      steady: () => true,
      destroy: () => void p.destroy().catch(() => {}),
    };
  }

  /** Builds the player for the video as it stands, and starts it where the room is. */
  async function build(): Promise<void> {
    const v = state;
    if (!open || !v) return;
    const key = `${v.provider}:${v.id}:${v.hash ?? ""}`;
    if (adapter && builtFor === key) return;
    destroy();
    const mine = building;
    // Ids are built by the server from a checked link; checked again here before they reach a player.
    const ok = v.provider === "youtube" ? YT_ID.test(v.id) : VIMEO_ID.test(v.id) && (!v.hash || VIMEO_KEY.test(v.hash));
    if (!ok) return say("That video can't be shown.");
    const mount = document.createElement("div");
    mount.className = "rs-player";
    stage.append(mount);
    say("Loading the player…");
    quiet(3500);
    const onUser = async (what: "play" | "pause"): Promise<void> => {
      if (isQuiet() || !state || !adapter) return;
      // Only a change from what the room has is a person's doing (the player also reports what we asked of it).
      if ((what === "play") === state.playing) return;
      send(what, { pos: await adapter.time() });
    };
    try {
      const made = await (v.provider === "youtube" ? youtube(v, mount, (w2) => void onUser(w2)) : vimeo(v, mount, (w2) => void onUser(w2)));
      if (mine !== building) return made.destroy();
      adapter = made;
      builtFor = key;
      say("");
      sync();
      lastT = expected();
      lastAt = performance.now();
      poll = window.setInterval(() => void watch(), 700);
    } catch {
      if (mine === building) {
        destroy();
        say("The player couldn't load (a blocker, or no connection to the video site). Open the link in a new tab instead.");
      }
    }
  }

  /** Puts the player where the room is: its place, and playing or paused. */
  function sync(): void {
    if (!adapter || !state) return;
    quiet(1800);
    const want = expected();
    void adapter.time().then((t) => {
      if (!adapter || !state) return;
      if (Math.abs(t - want) > 1.5) adapter.seek(want);
      if (state.playing) adapter.play();
      else adapter.pause();
      lastT = want;
      lastAt = performance.now();
    });
  }

  /** Every so often: a jump in the player's time that the clock doesn't explain is the person seeking; a slow drift is put right. */
  async function watch(): Promise<void> {
    if (!adapter || !state) return;
    const t = await adapter.time();
    const now = performance.now();
    const dt = (now - lastAt) / 1000;
    const wasAt = lastT;
    lastT = t;
    lastAt = now;
    if (isQuiet() || !adapter.steady()) return;
    const jumped = Math.abs(t - (wasAt + (state.playing ? dt : 0))) > 1.8;
    if (jumped) return send("seek", { pos: t });
    if (state.playing && Math.abs(t - expected()) > 4) sync();
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const url = input.value.trim();
    if (!url) return;
    if (!/^https:\/\//i.test(url)) return say("The link has to start with https://");
    say("");
    send("set", { url });
    input.value = "";
  });
  clear.addEventListener("click", () => send("clear"));
  popOut.addEventListener("click", () => {
    const v = state;
    if (!v) return;
    const at = Math.max(0, Math.floor(expected()));
    // Only checked ids reach the address, as with the player.
    let url = "";
    if (v.provider === "youtube" && YT_ID.test(v.id)) url = `https://www.youtube.com/watch?v=${v.id}&t=${at}s`;
    else if (v.provider === "vimeo" && VIMEO_ID.test(v.id) && (!v.hash || VIMEO_KEY.test(v.hash))) url = `https://vimeo.com/${v.id}${v.hash ? `/${v.hash}` : ""}#t=${at}s`;
    if (!url) return say("That video can't be opened.");
    // The local player pauses so the two don't play over each other.
    adapter?.pause();
    window.open(url, "_blank", "noopener,popup,width=960,height=600");
  });

  function render(): void {
    clear.hidden = !state;
    popOut.hidden = !state;
    if (!state) {
      destroy();
      say("Nothing is on yet. Paste a YouTube or Vimeo link, and everyone in the room sees it, playing in step.");
      return;
    }
    if (open) void build();
  }

  return {
    el: root,
    video(v) {
      const before = state;
      state = v;
      stateAt = performance.now();
      if (!v) return render();
      const same = before && before.provider === v.provider && before.id === v.id && before.hash === v.hash;
      clear.hidden = false;
      popOut.hidden = false;
      if (open && same && adapter) sync();
      else render();
    },
    shown(next) {
      open = next;
      if (!next) return destroy();
      render();
    },
    remoteShare(who, el) {
      remote.querySelector(`[data-who="${CSS.escape(who)}"]`)?.remove();
      if (el) {
        const fig = document.createElement("figure");
        fig.className = "rs-share";
        fig.dataset.who = who;
        el.className = "rs-share-video";
        el.muted = true; // its sound (if any) comes through the room's voice
        el.autoplay = true;
        el.playsInline = true;
        const cap = document.createElement("figcaption");
        cap.textContent = `${who}'s screen`;
        fig.append(el, cap);
        remote.append(fig);
      }
      shares.hidden = remote.childElementCount === 0 && mine.hidden;
    },
    sharing(on) {
      mine.hidden = !on;
      shares.hidden = remote.childElementCount === 0 && !on;
    },
    reset() {
      state = null;
      destroy();
      remote.replaceChildren();
      mine.hidden = true;
      shares.hidden = true;
      clear.hidden = true;
      popOut.hidden = true;
      input.value = "";
      say("");
      open = false;
    },
    note: say,
  };
}
