// "Describe what's around me" (Settings, off by default): for people who use a screen reader, the
// campus in words. This file is the thinking, with nothing drawn and no three.js, so a spec can run
// it: what is near, as "Library door, 4 metres ahead-left", who is in your space, and the
// route G walks you along. describeui.ts holds the live region, the timers and the walking.

export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Something you can use: a door, an assistant, a board or screen, a seat. */
export interface Thing {
  kind: "door" | "assistant" | "board" | "link" | "seat";
  /** How it's spoken: "Chifley Library door", "Robin, assistant, Library help desk". */
  name: string;
  x: number;
  z: number;
  /** How close you must stand to use it with E (a little under the game's own reach). */
  stop: number;
}

export interface Me {
  x: number;
  z: number;
  /** Which way you face (radians; 0 is +z, as the figure's rotation.y). */
  rot: number;
}

/** What a space offers (the parts of the game's SpaceDef this reads). */
export interface Offer {
  doors: { x: number; z: number; label: string; secret?: boolean }[];
  links?: { x: number; z: number; label: string }[];
  spots?: { x: number; z: number; id: string; label: string }[];
  seats?: { x: number; z: number }[];
}

const DOOR_STOP = 1.2;
const NPC_STOP = 1.8;
const SEAT_STOP = 1.0;

/** The usable things in a space, in words. `seatFree` says whether nobody else is on that seat. */
export function thingsOf(offer: Offer, seatFree: (index: number) => boolean = () => true): Thing[] {
  const out: Thing[] = [];
  for (const d of offer.doors) {
    // The Poop Room's door is a secret: no description gives it away either.
    if (d.secret) continue;
    const enter = /^Enter (.+)$/.exec(d.label);
    out.push({ kind: "door", name: enter ? `${enter[1]} door` : `Door: ${d.label}`, x: d.x, z: d.z, stop: DOOR_STOP });
  }
  for (const l of offer.links ?? []) out.push({ kind: "link", name: l.label, x: l.x, z: l.z, stop: DOOR_STOP });
  for (const s of offer.spots ?? []) {
    const npc = /^Talk to (.+?) \((.+)\)$/.exec(s.label);
    if (s.id.startsWith("npc:")) out.push({ kind: "assistant", name: npc ? `${npc[1]}, assistant, ${npc[2]}` : s.label, x: s.x, z: s.z, stop: NPC_STOP });
    else out.push({ kind: /board/i.test(s.label) ? "board" : "link", name: s.label, x: s.x, z: s.z, stop: DOOR_STOP });
  }
  (offer.seats ?? []).forEach((s, i) => {
    if (seatFree(i)) out.push({ kind: "seat", name: "Seat", x: s.x, z: s.z, stop: SEAT_STOP });
  });
  return out;
}

const WORDS = ["ahead", "ahead-left", "left", "behind-left", "behind", "behind-right", "right", "ahead-right"] as const;

/** Which way (relative to where you face) and how far, from `me` to a point. Left is positive: the figure faces +z, so +x is on its left. */
export function whereIs(me: Me, x: number, z: number): { word: (typeof WORDS)[number]; metres: number } {
  const dx = x - me.x;
  const dz = z - me.z;
  const forward = dx * Math.sin(me.rot) + dz * Math.cos(me.rot);
  const left = dx * Math.cos(me.rot) - dz * Math.sin(me.rot);
  const angle = Math.atan2(left, forward); // 0 ahead, positive to the left, +-pi behind
  const sector = Math.round(angle / (Math.PI / 4));
  const word = WORDS[((sector % 8) + 8) % 8]!;
  return { word, metres: Math.hypot(dx, dz) };
}

/** "4 metres ahead-left", "1 metre behind", "within a metre". */
export function say(me: Me, x: number, z: number): string {
  const { word, metres } = whereIs(me, x, z);
  if (metres < 1) return word === "ahead" ? "within a metre" : `within a metre, ${word}`;
  const n = Math.round(metres);
  return `${n} ${n === 1 ? "metre" : "metres"} ${word}`;
}

const by = (me: Me) => (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z);

/**
 * The few nearest things, nearest first, one sentence each: up to `max` that aren't seats within
 * `range` metres, then the nearest seat if one is close. A seat in a lounge would otherwise be
 * every other thing in the list.
 */
export function nearby(things: Thing[], me: Me, opts: { max?: number; range?: number; seatRange?: number } = {}): string[] {
  const { max = 4, range = 40, seatRange = 12 } = opts;
  const near = (t: Thing): number => Math.hypot(t.x - me.x, t.z - me.z);
  const others = things.filter((t) => t.kind !== "seat" && near(t) <= range).sort(by(me)).slice(0, max);
  const seat = things.filter((t) => t.kind === "seat" && near(t) <= seatRange).sort(by(me))[0];
  const picked = seat ? [...others, seat].sort(by(me)) : others;
  return picked.map((t) => `${t.name}, ${say(me, t.x, t.z)}`);
}

/** What the live region says: what E would do now, then the nearest things; or that nothing is close. */
export function summary(things: Thing[], me: Me, inReach: string | null): string {
  const list = nearby(things, me);
  const bits = [];
  if (inReach) bits.push(`In reach: ${inReach}`);
  if (list.length) bits.push(`Near you: ${list.join(". ")}`);
  else if (!inReach) bits.push("Nothing to use near you");
  return `${bits.join(". ")}.`;
}

/** L: who is in your space, by name and rough direction, nearest first. Only your own space, whose name tags you could read anyway. */
export function people(list: { name: string; x: number; z: number }[], me: Me, max = 8): string {
  if (!list.length) return "No one else is here.";
  const sorted = [...list].sort(by(me));
  const shown = sorted.slice(0, max).map((p) => `${p.name}, ${say(me, p.x, p.z)}`);
  const more = sorted.length - shown.length;
  const n = sorted.length;
  return `${n} ${n === 1 ? "person" : "people"} here: ${shown.join(". ")}${more > 0 ? `. And ${more} more, further away` : ""}.`;
}

/**
 * G's choice: the nearest thing you aren't already standing at (so pressing G again goes on to the
 * next), seats only when nothing else is left to walk to.
 */
export function walkTarget(things: Thing[], me: Me): Thing | null {
  const away = things.filter((t) => Math.hypot(t.x - me.x, t.z - me.z) > t.stop + 0.15);
  const firstNotSeat = away.filter((t) => t.kind !== "seat").sort(by(me))[0];
  return firstNotSeat ?? away.sort(by(me))[0] ?? null;
}

// --- the route G walks --------------------------------------------------------------

const CELL = 0.25;
/** The figure's radius (main.ts PLAYER_RADIUS): the route keeps this far from every wall. */
const RADIUS = 0.4;

interface Grid {
  ox: number;
  oz: number;
  w: number;
  h: number;
  blocked: Uint8Array;
}

/**
 * The floor as a grid of quarter-metre cells over the part of the space between `from` and `to`
 * (and a margin round them), a cell blocked if the figure standing in its middle would be
 * pushed out of a collider or sits outside every walkable area.
 */
function gridFor(colliders: Box[], areas: Box[], from: { x: number; z: number }, to: { x: number; z: number }, margin = 14): Grid {
  const minX = Math.min(from.x, to.x) - margin;
  const minZ = Math.min(from.z, to.z) - margin;
  const w = Math.ceil((Math.abs(from.x - to.x) + margin * 2) / CELL);
  const h = Math.ceil((Math.abs(from.z - to.z) + margin * 2) / CELL);
  const blocked = new Uint8Array(w * h);
  // Outside every walkable area: blocked. (Painted per area, then inverted.)
  const inside = new Uint8Array(w * h);
  for (const a of areas) {
    const x0 = Math.max(0, Math.ceil((a.minX - minX) / CELL - 0.5));
    const x1 = Math.min(w - 1, Math.floor((a.maxX - minX) / CELL - 0.5));
    const z0 = Math.max(0, Math.ceil((a.minZ - minZ) / CELL - 0.5));
    const z1 = Math.min(h - 1, Math.floor((a.maxZ - minZ) / CELL - 0.5));
    for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) inside[j * w + i] = 1;
  }
  for (let k = 0; k < blocked.length; k++) blocked[k] = inside[k] ? 0 : 1;
  for (const b of colliders) {
    const x0 = Math.max(0, Math.floor((b.minX - RADIUS - minX) / CELL - 0.5));
    const x1 = Math.min(w - 1, Math.ceil((b.maxX + RADIUS - minX) / CELL - 0.5));
    const z0 = Math.max(0, Math.floor((b.minZ - RADIUS - minZ) / CELL - 0.5));
    const z1 = Math.min(h - 1, Math.ceil((b.maxZ + RADIUS - minZ) / CELL - 0.5));
    for (let j = z0; j <= z1; j++) {
      const cz = minZ + (j + 0.5) * CELL;
      for (let i = x0; i <= x1; i++) {
        const cx = minX + (i + 0.5) * CELL;
        // The same test as pushOut: nearer than the radius to the box's nearest point.
        const dx = cx - Math.min(Math.max(cx, b.minX), b.maxX);
        const dz = cz - Math.min(Math.max(cz, b.minZ), b.maxZ);
        if (dx * dx + dz * dz < RADIUS * RADIUS) blocked[j * w + i] = 1;
      }
    }
  }
  return { ox: minX, oz: minZ, w, h, blocked };
}

const cellOf = (g: Grid, x: number, z: number): [number, number] => [Math.floor((x - g.ox) / CELL), Math.floor((z - g.oz) / CELL)];
const centre = (g: Grid, i: number, j: number): { x: number; z: number } => ({ x: g.ox + (i + 0.5) * CELL, z: g.oz + (j + 0.5) * CELL });
const openAt = (g: Grid, x: number, z: number): boolean => {
  const [i, j] = cellOf(g, x, z);
  return i >= 0 && j >= 0 && i < g.w && j < g.h && g.blocked[j * g.w + i] === 0;
};

/** Whether the straight line between two points is clear of walls (checked every eighth of a metre). */
function clear(g: Grid, a: { x: number; z: number }, b: { x: number; z: number }): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.125));
  for (let k = 0; k <= n; k++) if (!openAt(g, a.x + ((b.x - a.x) * k) / n, a.z + ((b.z - a.z) * k) / n)) return false;
  return true;
}

/**
 * A walkable route from `from` to anywhere within `stop` metres of `to`, as points to aim at in
 * turn (the last is where you'll stop), or null if none exists. A* over the grid, then shortened
 * wherever a straight line is clear, so the figure walks like a person and not along a staircase.
 */
export function planRoute(colliders: Box[], areas: Box[], from: { x: number; z: number }, to: { x: number; z: number; stop: number }, margin = 14): { x: number; z: number }[] | null {
  const g = gridFor(colliders, areas, from, to, margin);
  const [si0, sj0] = cellOf(g, from.x, from.z);
  if (si0 < 0 || sj0 < 0 || si0 >= g.w || sj0 >= g.h) return null;
  // Standing in a cell the grid calls blocked (pressed against a wall, a pixel off): start from the nearest open cell.
  let si = si0;
  let sj = sj0;
  if (g.blocked[sj * g.w + si]) {
    let best = Infinity;
    for (let dj = -4; dj <= 4; dj++)
      for (let di = -4; di <= 4; di++) {
        const i = si0 + di;
        const j = sj0 + dj;
        if (i < 0 || j < 0 || i >= g.w || j >= g.h || g.blocked[j * g.w + i]) continue;
        if (di * di + dj * dj < best) [best, si, sj] = [di * di + dj * dj, i, j];
      }
    if (best === Infinity) return null;
  }
  const isGoal = (i: number, j: number): boolean => {
    const c = centre(g, i, j);
    return Math.hypot(c.x - to.x, c.z - to.z) <= to.stop;
  };
  const h = (i: number, j: number): number => {
    const c = centre(g, i, j);
    return Math.max(0, Math.hypot(c.x - to.x, c.z - to.z) - to.stop);
  };
  const N = g.w * g.h;
  const cost = new Float32Array(N).fill(Infinity);
  const from_ = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  // A binary min-heap of [f, index] pairs, kept in two arrays.
  const heapF: number[] = [];
  const heapI: number[] = [];
  const push = (f: number, idx: number): void => {
    let k = heapF.length;
    heapF.push(f);
    heapI.push(idx);
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heapF[p]! <= f) break;
      heapF[k] = heapF[p]!;
      heapI[k] = heapI[p]!;
      k = p;
    }
    heapF[k] = f;
    heapI[k] = idx;
  };
  const pop = (): number => {
    const top = heapI[0]!;
    const lf = heapF.pop()!;
    const li = heapI.pop()!;
    const n = heapF.length;
    if (n > 0) {
      let k = 0;
      for (;;) {
        let c = 2 * k + 1;
        if (c >= n) break;
        if (c + 1 < n && heapF[c + 1]! < heapF[c]!) c++;
        if (heapF[c]! >= lf) break;
        heapF[k] = heapF[c]!;
        heapI[k] = heapI[c]!;
        k = c;
      }
      heapF[k] = lf;
      heapI[k] = li;
    }
    return top;
  };
  const start = sj * g.w + si;
  cost[start] = 0;
  push(h(si, sj), start);
  let goal = -1;
  while (heapF.length) {
    const cur = pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    const ci = cur % g.w;
    const cj = (cur - ci) / g.w;
    if (isGoal(ci, cj)) {
      goal = cur;
      break;
    }
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di;
        const nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= g.w || nj >= g.h) continue;
        const n = nj * g.w + ni;
        if (g.blocked[n] || closed[n]) continue;
        // No squeezing diagonally between two blocked cells.
        if (di && dj && (g.blocked[cj * g.w + ni] || g.blocked[nj * g.w + ci])) continue;
        const c = cost[cur]! + (di && dj ? 1.4142 : 1) * CELL;
        if (c < cost[n]!) {
          cost[n] = c;
          from_[n] = cur;
          push(c + h(ni, nj), n);
        }
      }
  }
  // No way inside the first box: a building in the way may need a wider detour than its margin.
  if (goal < 0) return margin < 40 ? planRoute(colliders, areas, from, to, 40) : null;
  const cells: { x: number; z: number }[] = [];
  for (let k = goal; k >= 0; k = from_[k]!) {
    const i = k % g.w;
    cells.push(centre(g, i, (k - i) / g.w));
  }
  cells.reverse();
  cells[0] = { x: from.x, z: from.z };
  // Shorten: from each point, jump to the farthest later point that is in clear sight.
  const route: { x: number; z: number }[] = [];
  let at = 0;
  while (at < cells.length - 1) {
    let next = at + 1;
    for (let k = cells.length - 1; k > at + 1; k--) {
      if (clear(g, cells[at]!, cells[k]!)) {
        next = k;
        break;
      }
    }
    route.push(cells[next]!);
    at = next;
  }
  return route.length ? route : [{ x: from.x, z: from.z }];
}
