// Sketch & Guess: one game room, held in this process's memory. Nothing here
// is written to the database: a game is over when the machine sleeps, which
// is fine for a party game. One machine, one room. Brought over unchanged
// from my standalone draw-and-guess prototype; server/sketch/routes.ts ties
// it to campus names.

import { createHash, randomBytes } from "node:crypto";
import { WORDS } from "./words.ts";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 12;
export const ROUND_MS = 75_000;
export const BETWEEN_ROUNDS_MS = 4_000;
// Correct guesses that land within this window of the first correct guess
// all score: see docs/adr-001-simultaneous-guesses.md.
export const TIE_WINDOW_MS = 500;
export const PLAYER_TTL_MS = 15_000;
export const MAX_NAME = 20;
export const MAX_GUESS = 40;
export const MAX_POINTS_PER_STROKE = 200;
export const MAX_STROKES_PER_ROUND = 400;

export type Phase = "lobby" | "drawing" | "reveal" | "over";

export interface Point {
  x: number;
  y: number;
}
export interface Stroke {
  points: Point[];
  width: number;
  color: string;
}
export interface FeedItem {
  kind: "guess" | "correct" | "system";
  name: string;
  text: string;
}

interface Player {
  token: string;
  id: string;
  name: string;
  score: number;
  joinedAt: number;
  seen: number;
  connections: number;
  tokens: number;
  lastRefill: number;
}

const COLORS = ["#1f1d1a", "#d6452b", "#2b6fd6", "#1f9d55", "#e0a10b", "#8a4fd6"];

const players = new Map<string, Player>();
let phase: Phase = "lobby";
let order: string[] = [];
let turn = 0;
let drawerToken: string | null = null;
let word = "";
let roundEndsAt = 0;
let strokes: Stroke[] = [];
let feed: FeedItem[] = [];
let firstCorrectAt = 0;
let correctThisRound = new Set<string>();
let roundTimer: NodeJS.Timeout | null = null;
let usedWords = new Set<string>();

export const publicId = (token: string): string => createHash("sha256").update(token).digest("hex").slice(0, 12);
export const newToken = (): string => randomBytes(18).toString("base64url");

// --- listeners -------------------------------------------------------------

type Send = (chunk: string) => void;
interface Listener {
  token: string | null;
  send: Send;
}
const listeners = new Set<Listener>();

const sse = (name: string, data: unknown): string => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;

function deliver(l: Listener, chunk: string): void {
  try {
    l.send(chunk);
  } catch {
    listeners.delete(l);
  }
}

// Each listener gets its own state view: the word only ever goes to the
// drawer's own connections.
function pushState(): void {
  for (const l of listeners) deliver(l, sse("state", viewFor(l.token)));
}

function pushAll(name: string, data: unknown): void {
  const chunk = sse(name, data);
  for (const l of listeners) deliver(l, chunk);
}

export function subscribe(token: string | null, send: Send): () => void {
  const l: Listener = { token, send };
  listeners.add(l);
  const p = token ? players.get(token) : undefined;
  if (p) {
    p.connections++;
    p.seen = Date.now();
  }
  send("retry: 2000\n\n");
  send(sse("state", viewFor(token)));
  if (p) pushState();
  return () => {
    listeners.delete(l);
    if (p) {
      p.connections = Math.max(0, p.connections - 1);
      p.seen = Date.now();
    }
  };
}

// --- views -----------------------------------------------------------------

export interface View {
  phase: Phase;
  me: { id: string; name: string } | null;
  players: { id: string; name: string; score: number; drawing: boolean; guessed: boolean }[];
  minPlayers: number;
  drawer: string | null;
  isDrawer: boolean;
  word: string | null;
  hint: string;
  roundEndsAt: number;
  round: number;
  rounds: number;
  strokes: Stroke[];
  feed: FeedItem[];
  iGuessed: boolean;
  colors: string[];
}

export function viewFor(token: string | null): View {
  const me = token ? players.get(token) : undefined;
  const isDrawer = !!me && me.token === drawerToken;
  const revealed = phase === "reveal" || phase === "over";
  const iGuessed = !!me && correctThisRound.has(me.token);
  return {
    phase,
    me: me ? { id: me.id, name: me.name } : null,
    players: [...players.values()]
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        drawing: p.token === drawerToken && phase === "drawing",
        guessed: correctThisRound.has(p.token),
      })),
    minPlayers: MIN_PLAYERS,
    drawer: drawerToken ? (players.get(drawerToken)?.id ?? null) : null,
    isDrawer,
    word: (isDrawer || revealed || iGuessed) && word ? word : null,
    hint: word ? word.replace(/[^ ]/g, "_").split("").join(" ") : "",
    roundEndsAt,
    round: phase === "lobby" ? 0 : Math.min(turn + 1, order.length),
    rounds: order.length,
    strokes,
    feed: feed.slice(-30),
    iGuessed,
    colors: COLORS,
  };
}

// --- rate limiting ---------------------------------------------------------

const RATE_PER_SECOND = 20;
const BURST = 30;

function allow(p: Player, now = Date.now()): boolean {
  p.tokens = Math.min(BURST, p.tokens + ((now - p.lastRefill) / 1000) * RATE_PER_SECOND);
  p.lastRefill = now;
  if (p.tokens < 1) return false;
  p.tokens -= 1;
  return true;
}

// --- actions ---------------------------------------------------------------

export type Result = { ok: true; token?: string; id?: string } | { ok: false; status: number; error: string };
const fail = (status: number, error: string): Result => ({ ok: false, status, error });

export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim();
  if (name.length < 1 || name.length > MAX_NAME) return null;
  return name;
}

export function join(token: string | null, rawName: unknown, now = Date.now()): Result {
  const name = cleanName(rawName);
  if (!name) return fail(400, `name must be 1-${MAX_NAME} characters`);
  const existing = token ? players.get(token) : undefined;
  if (existing) {
    existing.name = name;
    existing.seen = now;
    pushState();
    return { ok: true, token: existing.token, id: existing.id };
  }
  if (players.size >= MAX_PLAYERS) return fail(503, "the room is full");
  const t = newToken();
  const p: Player = {
    token: t,
    id: publicId(t),
    name,
    score: 0,
    joinedAt: now,
    seen: now,
    connections: 0,
    tokens: BURST,
    lastRefill: now,
  };
  players.set(t, p);
  if (phase !== "lobby") order.push(t);
  system(`${name} joined`);
  pushState();
  return { ok: true, token: t, id: p.id };
}

export function leave(token: string): Result {
  const p = players.get(token);
  if (!p) return fail(403, "not in the game");
  removePlayer(token, "left");
  return { ok: true };
}

export function start(token: string): Result {
  if (!players.has(token)) return fail(403, "join first");
  if (phase === "drawing" || phase === "reveal") return fail(409, "a game is already running");
  if (players.size < MIN_PLAYERS) return fail(409, `need at least ${MIN_PLAYERS} players`);
  for (const p of players.values()) p.score = 0;
  order = [...players.values()].sort((a, b) => a.joinedAt - b.joinedAt).map((p) => p.token);
  turn = 0;
  usedWords = new Set();
  feed = [];
  system("Game started!");
  startRound();
  return { ok: true };
}

export function draw(token: string, raw: unknown): Result {
  const p = players.get(token);
  if (!p) return fail(403, "join first");
  if (phase !== "drawing" || token !== drawerToken) return fail(403, "only the drawer can draw");
  if (!allow(p)) return fail(429, "too fast");
  const s = parseStroke(raw);
  if (!s) return fail(400, "bad stroke");
  if (strokes.length >= MAX_STROKES_PER_ROUND) return fail(409, "canvas is full");
  strokes.push(s);
  pushAll("stroke", s);
  return { ok: true };
}

export function clear(token: string): Result {
  if (phase !== "drawing" || token !== drawerToken) return fail(403, "only the drawer can clear");
  strokes = [];
  pushAll("clear", {});
  return { ok: true };
}

export function guess(token: string, raw: unknown, now = Date.now()): Result {
  const p = players.get(token);
  if (!p) return fail(403, "join first");
  if (phase !== "drawing") return fail(409, "no round is running");
  if (token === drawerToken) return fail(403, "the drawer can't guess");
  if (correctThisRound.has(token)) return fail(409, "you already got it");
  if (!allow(p)) return fail(429, "too fast");
  if (typeof raw !== "string") return fail(400, "guess must be text");
  const text = raw.replace(/\s+/g, " ").trim().slice(0, MAX_GUESS);
  if (!text) return fail(400, "empty guess");

  if (normalise(text) === normalise(word)) {
    if (correctThisRound.size === 0) firstCorrectAt = now;
    if (now - firstCorrectAt <= TIE_WINDOW_MS) {
      correctThisRound.add(token);
      p.score += 1;
      feed.push({ kind: "correct", name: p.name, text: `${p.name} got it!` });
      if (correctThisRound.size === 1) {
        const d = drawerToken ? players.get(drawerToken) : undefined;
        if (d) d.score += 1;
        // Wait out the tie window so near-simultaneous answers also count.
        if (roundTimer) clearTimeout(roundTimer);
        roundTimer = setTimeout(() => endRound("guessed"), TIE_WINDOW_MS);
      }
      pushState();
      return { ok: true };
    }
    // Correct but outside the window: the round is already decided.
    return fail(409, "too late — someone already got it");
  }

  feed.push({ kind: "guess", name: p.name, text });
  pushState();
  return { ok: true };
}

export function heartbeat(token: string, now = Date.now()): void {
  const p = players.get(token);
  if (p) p.seen = now;
}

// --- internals -------------------------------------------------------------

const normalise = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function system(text: string): void {
  feed.push({ kind: "system", name: "", text });
}

function pickWord(): string {
  const pool = WORDS.filter((w) => !usedWords.has(w));
  const list = pool.length ? pool : WORDS;
  const w = list[Math.floor(Math.random() * list.length)];
  usedWords.add(w);
  return w;
}

function startRound(): void {
  while (turn < order.length && !players.has(order[turn])) turn++;
  if (turn >= order.length) return finish();
  if (players.size < MIN_PLAYERS) return toLobby("Not enough players — back to the lobby.");
  drawerToken = order[turn];
  word = pickWord();
  strokes = [];
  correctThisRound = new Set();
  firstCorrectAt = 0;
  phase = "drawing";
  roundEndsAt = Date.now() + ROUND_MS;
  system(`${players.get(drawerToken)?.name} is drawing`);
  if (roundTimer) clearTimeout(roundTimer);
  roundTimer = setTimeout(() => endRound("time"), ROUND_MS);
  pushState();
}

function endRound(why: "guessed" | "time" | "drawer-left"): void {
  if (phase !== "drawing") return;
  if (roundTimer) clearTimeout(roundTimer);
  phase = "reveal";
  const msg =
    why === "time"
      ? `Time's up! The word was "${word}".`
      : why === "drawer-left"
        ? `The drawer left. The word was "${word}".`
        : `The word was "${word}".`;
  system(msg);
  pushState();
  roundTimer = setTimeout(() => {
    turn++;
    startRound();
  }, BETWEEN_ROUNDS_MS);
}

function finish(): void {
  if (roundTimer) clearTimeout(roundTimer);
  phase = "over";
  drawerToken = null;
  system("Game over!");
  pushState();
}

function toLobby(msg: string): void {
  if (roundTimer) clearTimeout(roundTimer);
  phase = "lobby";
  drawerToken = null;
  word = "";
  strokes = [];
  correctThisRound = new Set();
  order = [];
  system(msg);
  pushState();
}

function removePlayer(token: string, why: string): void {
  const p = players.get(token);
  if (!p) return;
  players.delete(token);
  system(`${p.name} ${why}`);
  if (phase === "drawing" || phase === "reveal") {
    if (players.size < MIN_PLAYERS) return toLobby("Not enough players — back to the lobby.");
    if (token === drawerToken && phase === "drawing") return endRound("drawer-left");
  }
  pushState();
}

const COLOR = /^#[0-9a-f]{6}$/i;

export function parseStroke(raw: unknown): Stroke | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.points) || r.points.length < 1 || r.points.length > MAX_POINTS_PER_STROKE) return null;
  const width = r.width;
  if (typeof width !== "number" || !Number.isFinite(width) || width < 1 || width > 40) return null;
  if (typeof r.color !== "string" || !COLOR.test(r.color)) return null;
  const points: Point[] = [];
  for (const pt of r.points) {
    if (typeof pt !== "object" || pt === null) return null;
    const { x, y } = pt as Record<string, unknown>;
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    points.push({ x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 });
  }
  return { points, width, color: r.color.toLowerCase() };
}

// Players whose every stream has dropped and who haven't come back leave.
setInterval(() => {
  const cutoff = Date.now() - PLAYER_TTL_MS;
  for (const p of [...players.values()]) {
    if (p.connections === 0 && p.seen < cutoff) removePlayer(p.token, "left");
  }
}, 2_000).unref();

setInterval(() => {
  for (const l of listeners) deliver(l, ": still here\n\n");
}, 15_000).unref();

// Tests only: wipe the room. Guarded by an env flag in the route.
export function resetForTests(): void {
  if (roundTimer) clearTimeout(roundTimer);
  players.clear();
  phase = "lobby";
  order = [];
  turn = 0;
  drawerToken = null;
  word = "";
  strokes = [];
  feed = [];
  correctThisRound = new Set();
  pushState();
}

// Tests only: the current word, so a test can play a correct guess.
export const currentWordForTests = (): string => word;
