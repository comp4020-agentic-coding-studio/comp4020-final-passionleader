import { log } from "./log.ts";
import { onSketchOver } from "./sketch/game.ts";
import { QUESTIONS, type Question } from "./quiz.ts";
import { GAME_TABLES } from "./spaces.ts";

// Mini-game tables (the Student Hub's table, GAME_TABLES): a few people at one
// table play a quick quiz, or start Sketch & Guess, together. Everyone within
// JOIN_RANGE of the table may join; the server keeps the score and tells the
// table who won. Nothing is stored: a game lives in this process's memory
// and is gone when it ends (or when the table is left alone). It rides on the
// generic "action" message (kind "table"), so a new game or a second table is
// new data here, not a new protocol.

/** Metres from the table's middle: how near you must be to start or join. */
export const JOIN_RANGE = 3;
export const QUIZ_QUESTIONS = 5;
export const QUESTION_MS = 15_000;
export const REVEAL_MS = 3_000;
/** A quiz table sits at most this many people. */
export const SEATS = 8;
/** The final scores stay on the table this long, for anyone who walks up late. */
const OVER_KEEP_MS = 30_000;
/** Sketch & Guess started here counts as this table's for this long (its winner is announced here). */
const SKETCH_OPEN_MS = 10 * 60_000;
/** Between questions, a player who has walked further than this from the table is out (the quiz can't wait for someone who left). */
const STAY_RANGE = 6;
/** One request at a time per person, so a held key can't flood the table. */
const GAP_MS = 250;

export interface Person {
  name: string;
  space: string;
  x: number;
  z: number;
}
export interface Host {
  /** Everyone online (a person with two tabs is there twice). */
  people(): Person[];
  /** Sends `msg` to every tab of `name`. */
  tell(name: string, msg: unknown): void;
}

interface Asked {
  q: string;
  options: string[];
  correct: number;
}
interface Quiz {
  kind: "quiz";
  phase: "lobby" | "asking" | "reveal" | "over";
  host: string;
  /** By lower-cased name, so a second tab doesn't make a second player. */
  players: Map<string, { name: string; score: number }>;
  deck: Asked[];
  n: number;
  endsAt: number;
  answers: Map<string, number>;
  timer?: NodeJS.Timeout;
  winners?: string[];
}
interface Sketch {
  kind: "sketch";
  by: string;
  until: number;
  over?: { winners: string[]; players: { name: string; score: number }[] };
}

const lower = (s: string): string => s.toLowerCase();

/** The question as asked: the four answers in a new order, and where the right one went. */
export function ask(q: Question, rand: () => number = Math.random): Asked {
  const options = [q.a, ...q.wrong];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [options[i], options[j]] = [options[j]!, options[i]!];
  }
  return { q: q.q, options, correct: options.indexOf(q.a) };
}

/** `n` different questions, in random order. */
export function deal(n = QUIZ_QUESTIONS, rand: () => number = Math.random): Asked[] {
  const pool = [...QUESTIONS];
  const out: Asked[] = [];
  while (out.length < n && pool.length) out.push(ask(pool.splice(Math.floor(rand() * pool.length), 1)[0]!, rand));
  return out;
}

export function winnersOf(players: { name: string; score: number }[]): string[] {
  const top = Math.max(0, ...players.map((p) => p.score));
  return top === 0 ? [] : players.filter((p) => p.score === top).map((p) => p.name);
}

export function createTables(host: Host): {
  action(player: Person, msg: Record<string, unknown>, who?: { name: string; token: string; role: string } | null): void;
  /** Someone's socket closed or they changed space: they leave any game they were in. */
  left(name: string): void;
} {
  const games = new Map<string, Quiz | Sketch>();
  const lastAt = new Map<string, number>();

  const spot = (id: string) => GAME_TABLES[id];
  const near = (p: Person, id: string): boolean => {
    const t = spot(id);
    return !!t && p.space === t.space && Math.hypot(p.x - t.x, p.z - t.z) <= JOIN_RANGE;
  };
  const nearby = (id: string): string[] => host.people().filter((p) => near(p, id)).map((p) => p.name);
  const playersOf = (g: Quiz) => [...g.players.values()].map((p) => ({ name: p.name, score: p.score, answered: g.phase === "asking" ? g.answers.has(lower(p.name)) : undefined }));

  /** What a client is told about a table: no game, the quiz as it stands (never the right answer before the reveal), or Sketch & Guess being open. */
  function view(id: string): Record<string, unknown> {
    const g = games.get(id);
    if (!g) return { game: null };
    if (g.kind === "sketch") {
      return { game: "sketch", phase: g.over ? "over" : "open", by: g.by, ...(g.over ?? {}) };
    }
    const asked = g.deck[g.n];
    return {
      game: "quiz",
      phase: g.phase,
      host: g.host,
      players: playersOf(g),
      n: g.n + 1,
      of: g.deck.length || QUIZ_QUESTIONS,
      ...(g.phase === "asking" || g.phase === "reveal" ? { question: { text: asked!.q, options: asked!.options }, left: Math.max(0, g.endsAt - Date.now()) } : {}),
      ...(g.phase === "reveal" ? { correct: asked!.correct, picks: Object.fromEntries([...g.answers].map(([k, v]) => [g.players.get(k)?.name ?? k, v])) } : {}),
      ...(g.phase === "over" ? { winners: g.winners ?? [] } : {}),
    };
  }

  /** Tells the table: the people in the game, and anyone standing within range (who may want to join). */
  function push(id: string): void {
    const g = games.get(id);
    const names = new Map<string, string>();
    for (const n of nearby(id)) names.set(lower(n), n);
    if (g?.kind === "quiz") for (const p of g.players.values()) names.set(lower(p.name), p.name);
    const msg = { t: "action", kind: "table", table: id, view: view(id) };
    for (const n of names.values()) host.tell(n, msg);
  }

  const refuse = (p: Person, id: string, reason: string): void => host.tell(p.name, { t: "action", kind: "table-refused", table: id, reason });

  function drop(id: string): void {
    const g = games.get(id);
    if (g?.kind === "quiz") clearTimeout(g.timer);
    games.delete(id);
  }

  function finish(id: string, g: Quiz): void {
    g.phase = "over";
    g.winners = winnersOf([...g.players.values()]);
    clearTimeout(g.timer);
    g.timer = setTimeout(() => games.get(id) === g && (drop(id), push(id)), OVER_KEEP_MS);
    g.timer.unref();
    push(id);
  }

  function reveal(id: string, g: Quiz): void {
    if (g.phase !== "asking") return;
    clearTimeout(g.timer);
    g.phase = "reveal";
    g.endsAt = Date.now() + REVEAL_MS;
    g.timer = setTimeout(() => next(id, g), REVEAL_MS);
    g.timer.unref();
    push(id);
  }

  function next(id: string, g: Quiz): void {
    if (games.get(id) !== g) return;
    const t = spot(id)!;
    const online = host.people();
    for (const p of [...g.players.values()]) {
      if (!online.some((o) => lower(o.name) === lower(p.name) && o.space === t.space && Math.hypot(o.x - t.x, o.z - t.z) <= STAY_RANGE)) g.players.delete(lower(p.name));
    }
    if (g.players.size === 0) return (drop(id), push(id));
    if (!g.players.has(lower(g.host))) g.host = [...g.players.values()][0]!.name;
    g.n++;
    if (g.n >= g.deck.length) return finish(id, g);
    g.phase = "asking";
    g.answers = new Map();
    g.endsAt = Date.now() + QUESTION_MS;
    clearTimeout(g.timer);
    g.timer = setTimeout(() => reveal(id, g), QUESTION_MS);
    g.timer.unref();
    push(id);
  }

  function answer(id: string, g: Quiz, p: Person, pick: unknown): void {
    const key = lower(p.name);
    if (g.phase !== "asking" || !g.players.has(key) || g.answers.has(key)) return;
    if (typeof pick !== "number" || !Number.isInteger(pick) || pick < 0 || pick >= g.deck[g.n]!.options.length) return;
    g.answers.set(key, pick);
    // Right answers score, and the quicker the more (10, up to 10 more).
    if (pick === g.deck[g.n]!.correct) g.players.get(key)!.score += 10 + Math.floor((10 * Math.max(0, g.endsAt - Date.now())) / QUESTION_MS);
    if ([...g.players.keys()].every((k) => g.answers.has(k))) reveal(id, g);
    else push(id);
  }

  function leaveGame(id: string, g: Quiz, name: string): void {
    g.players.delete(lower(name));
    g.answers.delete(lower(name));
    if (g.players.size === 0) {
      drop(id);
      return push(id);
    }
    if (lower(g.host) === lower(name)) g.host = [...g.players.values()][0]!.name;
    // The last one still to answer left: nothing left to wait for.
    if (g.phase === "asking" && [...g.players.keys()].every((k) => g.answers.has(k))) return reveal(id, g);
    push(id);
  }

  onSketchOver((ranked) => {
    for (const [id, g] of games) {
      if (g.kind !== "sketch" || g.over || g.until < Date.now()) continue;
      g.over = { winners: winnersOf(ranked), players: ranked };
      g.until = Date.now() + OVER_KEEP_MS;
      push(id);
    }
  });

  return {
    action(player, msg, who) {
      const id = typeof msg.table === "string" ? msg.table : "";
      if (!spot(id)) return;
      const now = Date.now();
      const key = lower(player.name);
      if (now - (lastAt.get(key) ?? 0) < GAP_MS) return;
      lastAt.set(key, now);
      // A table's game only reaches people within range, and only they may act on it.
      const here = near(player, id);
      const op = msg.op;
      let g = games.get(id);
      if (g?.kind === "sketch" && g.until < now) (drop(id), (g = undefined));
      if (op === "look") {
        if (!here) return refuse(player, id, "too far");
        return host.tell(player.name, { t: "action", kind: "table", table: id, view: view(id) });
      }
      if (op === "leave") {
        if (g?.kind === "quiz" && g.players.has(key)) leaveGame(id, g, player.name);
        return;
      }
      if (!here) return refuse(player, id, "too far");
      if (op === "pick" && (msg.game === "quiz" || msg.game === "sketch")) {
        // A quiz under way holds the table; a finished game, or Sketch & Guess merely opened (it has
        // its own lobby, which the table can't see into), doesn't, so a forgotten one never blocks it.
        // A quiz still in its lobby holds the table only while someone other than the picker waits in it:
        // picking the quiz and then Sketch & Guess blocked your own table (the user, 11/9).
        if (g?.kind === "quiz" && g.phase !== "over" && g.phase !== "lobby") return refuse(player, id, "a game is already on");
        if (g?.kind === "quiz" && g.phase === "lobby" && [...g.players.keys()].some((k) => k !== key)) return refuse(player, id, "people are waiting for the quiz");
        if (g) drop(id);
        log("table-game", who ?? null, { table: id, game: msg.game });
        if (msg.game === "sketch") games.set(id, { kind: "sketch", by: player.name, until: now + SKETCH_OPEN_MS });
        else games.set(id, { kind: "quiz", phase: "lobby", host: player.name, players: new Map([[key, { name: player.name, score: 0 }]]), deck: [], n: 0, endsAt: 0, answers: new Map() });
        return push(id);
      }
      if (op === "join" && g?.kind === "quiz") {
        if (g.phase !== "lobby") return refuse(player, id, "already started");
        if (g.players.size >= SEATS && !g.players.has(key)) return refuse(player, id, "table full");
        g.players.set(key, g.players.get(key) ?? { name: player.name, score: 0 });
        return push(id);
      }
      if (op === "start" && g?.kind === "quiz") {
        if (g.phase !== "lobby" || !g.players.has(key)) return;
        if (g.players.size < 2) return refuse(player, id, "need two people");
        g.deck = deal();
        g.n = -1;
        return next(id, g);
      }
      if (op === "answer" && g?.kind === "quiz") return answer(id, g, player, msg.pick);
    },
    left(name) {
      const online = host.people();
      for (const [id, g] of games) {
        if (g.kind !== "quiz" || !g.players.has(lower(name))) continue;
        // Another tab of theirs may still be at the table.
        const t = spot(id)!;
        if (online.some((p) => lower(p.name) === lower(name) && p.space === t.space)) continue;
        leaveGame(id, g, name);
      }
    },
  };
}
