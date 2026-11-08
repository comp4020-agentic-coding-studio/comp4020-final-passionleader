import { describeOn, onDescribeChange } from "./settings.ts";
import { type Box, type Offer, type Thing, type Me, people, planRoute, say, summary, thingsOf, walkTarget } from "./describe.ts";

// The live side of "Describe what's around me" (describe.ts has the thinking): an aria-live
// region no eye sees, a timer that speaks what is near every few seconds while you move, L for
// the people in your space, and G, which walks you to the nearest usable thing a step at a time
// through the game's own movement (main.ts feeds `walkDirection()` in as the walking input, with
// the same speed, walls and server clamping as a key held down). It never moves you any other
// way, and any movement key, the jump, E, or a window opening ends it.

const EVERY_MS = 3000;
/** Speak again only once you've moved this far (metres) or the place changed, so standing still is quiet. */
const MOVED = 1.5;

export interface DescribeHost {
  /** The space you're in, with what it offers; null before you've joined. */
  space(): { id: string; title: string; offer: Offer; colliders: Box[]; areas: Box[] } | null;
  me(): Me;
  /** Whether nobody else sits on this seat of the space. */
  seatFree(index: number): boolean;
  /** What E would do right now ("Enter 154 (Student Hub)", "Sit down"), or null. */
  inReach(): string | null;
  /** Who is in your space now (never anyone elsewhere), with where they stand. */
  others(): { name: string; x: number; z: number }[];
  /** True while a window is open or you're typing: nothing is spoken, no key is taken. */
  busy(): boolean;
  playing(): boolean;
}

export interface Describe {
  /** The direction to walk this frame (world space, unit length), or null when G isn't walking you. */
  walkDirection(): { x: number; z: number } | null;
  /** Ends G's walk (a movement key, the jump, E, a window, a change of space); says nothing unless `say` is given. */
  stopWalking(say?: string): void;
  /** Speaks at once, whether or not anything changed (the space changed). */
  enteredSpace(): void;
  /** Called every frame so arrival and stalls are noticed. */
  frame(dt: number): void;
}

export function mountDescribe(host: DescribeHost): Describe {
  const live = document.createElement("div");
  live.id = "describe-live";
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  live.setAttribute("aria-atomic", "true");
  // Visually hidden, still read: not display:none, which screen readers skip.
  live.style.cssText = "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0";
  document.body.append(live);

  let last = "";
  const speak = (text: string): void => {
    // Cleared first so the same sentence twice is read twice.
    live.textContent = "";
    last = text;
    window.setTimeout(() => {
      if (last === text) live.textContent = text;
    }, 60);
  };

  let spokeAt = { x: NaN, z: NaN, space: "" };
  const things = (): Thing[] => {
    const s = host.space();
    return s ? thingsOf(s.offer, host.seatFree) : [];
  };

  function around(prefix = ""): void {
    const s = host.space();
    if (!s) return;
    const me = host.me();
    spokeAt = { x: me.x, z: me.z, space: s.id };
    speak(`${prefix}${summary(things(), me, host.inReach())}`);
  }

  // --- G: walk to the nearest thing ---------------------------------------------------
  let walk: { target: Thing; route: { x: number; z: number }[]; step: number; since: number; stalled: number; replans: number; lastAt: { x: number; z: number }; told: number } | null = null;

  function stopWalking(say?: string): void {
    if (!walk) return;
    walk = null;
    if (say) speak(say);
  }

  function startWalking(): void {
    const s = host.space();
    if (!s) return;
    const me = host.me();
    const all = things();
    const target = walkTarget(all, me);
    if (!target) {
      speak(host.inReach() ? `You are already there. Press E to use it: ${host.inReach()}.` : "Nothing else to walk to here.");
      return;
    }
    const route = planRoute(s.colliders, s.areas, me, target);
    if (!route) {
      speak(`I can't find a way to ${target.name}. Try walking with the arrow keys.`);
      return;
    }
    walk = { target, route, step: 0, since: performance.now(), stalled: 0, replans: 0, lastAt: { x: me.x, z: me.z }, told: performance.now() };
    speak(`Walking to ${target.name}, ${say(me, target.x, target.z)}. Press any movement key to stop.`);
  }

  // A movement key, the jump or E ends the walk (and hands you back the controls at once).
  window.addEventListener(
    "keydown",
    (e) => {
      if (!walk) return;
      if (/^(Key[WASD]|Arrow(Up|Down|Left|Right)|Space|KeyE|Escape|Enter)$/.test(e.code)) stopWalking("Stopped.");
    },
    true,
  );

  // L and G (only with the setting on, and not while typing or in a window).
  window.addEventListener("keydown", (e) => {
    if (!describeOn() || !host.playing() || host.busy() || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === "KeyL") {
      e.preventDefault();
      speak(people(host.others(), host.me()));
    } else if (e.code === "KeyG") {
      e.preventDefault();
      if (walk) stopWalking("Stopped.");
      else startWalking();
    }
  });

  // What's near, every few seconds, once you've moved (or on coming into a place).
  window.setInterval(() => {
    if (!describeOn() || !host.playing() || host.busy() || walk) return;
    const s = host.space();
    if (!s) return;
    const me = host.me();
    if (s.id === spokeAt.space && Math.hypot(me.x - spokeAt.x, me.z - spokeAt.z) < MOVED) return;
    around();
  }, EVERY_MS);

  onDescribeChange(() => {
    if (describeOn()) {
      // The first description comes with the next check (spokeAt is empty), once the dialog is closed.
      spokeAt = { x: NaN, z: NaN, space: "" };
      speak("Describing what is around you is on. L lists the people here. G walks you to the nearest thing you can use. E uses what is in reach.");
    } else {
      stopWalking();
      speak("Describing what is around you is off.");
    }
  });

  return {
    walkDirection() {
      if (!walk || !describeOn()) return null;
      const me = host.me();
      const goal = walk.route[walk.step]!;
      let dx = goal.x - me.x;
      let dz = goal.z - me.z;
      let d = Math.hypot(dx, dz);
      // Reached this waypoint: on to the next (the last one ends the walk, in frame()).
      while (d < 0.25 && walk.step < walk.route.length - 1) {
        walk.step++;
        const g = walk.route[walk.step]!;
        dx = g.x - me.x;
        dz = g.z - me.z;
        d = Math.hypot(dx, dz);
      }
      return d < 0.05 ? null : { x: dx / d, z: dz / d };
    },
    stopWalking,
    enteredSpace() {
      stopWalking();
      const s = host.space();
      if (!s || !describeOn() || !host.playing()) return;
      // A moment later, after the new space has its figures and notes in place.
      window.setTimeout(() => around(`${s.title}. `), 700);
    },
    frame(dt) {
      if (!walk) return;
      if (!describeOn() || host.busy() || !host.playing()) return stopWalking();
      const s = host.space();
      if (!s) return stopWalking();
      const me = host.me();
      const t = walk.target;
      const left = Math.hypot(t.x - me.x, t.z - me.z);
      // There: within the thing's reach (a little under the game's own, so E works).
      if (left <= t.stop) {
        const where = t.name;
        walk = null;
        speak(`You are at ${where}. ${host.inReach() ? `Press E: ${host.inReach()}.` : "Press E to use it."}`);
        return;
      }
      // Stuck (a person in the way, a wall the plan missed): look again once or twice, then say so.
      const moved = Math.hypot(me.x - walk.lastAt.x, me.z - walk.lastAt.z);
      walk.stalled = moved < 0.4 * dt ? walk.stalled + dt : 0;
      walk.lastAt = { x: me.x, z: me.z };
      if (walk.stalled > 1.5) {
        if (walk.replans >= 2) return stopWalking(`I'm stuck, ${say(me, t.x, t.z)} from ${t.name}. Walk round whatever is in the way with the arrow keys, then press G again.`);
        const route = planRoute(s.colliders, s.areas, me, t);
        if (!route) return stopWalking(`I can't find a way on to ${t.name}.`);
        walk.route = route;
        walk.step = 0;
        walk.stalled = 0;
        walk.replans++;
      }
      // A word every few seconds on the way, so a long walk isn't silent.
      if (performance.now() - walk.told > 5000) {
        walk.told = performance.now();
        speak(`${Math.round(left)} ${Math.round(left) === 1 ? "metre" : "metres"} to ${t.name}.`);
      }
    },
  };
}
