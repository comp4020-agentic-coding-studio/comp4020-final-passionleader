import { describe, expect, it } from "vitest";
import { nearby, people, planRoute, say, summary, thingsOf, walkTarget, whereIs } from "../client/src/describe.ts";

// "Describe what's around me" (client/src/describe.ts): the words for what is near, the people
// list, and the route G walks. Pure functions, so they're checked here without a browser; that it
// is off by default, keyboard-only, and walks through the normal movement is judged in the browser.

const facingNorth = { x: 0, z: 0, rot: Math.PI }; // the figure faces +z at rot 0; north is -z

describe("describe what's around me: words", () => {
  it("says which way and how far, relative to where you face", () => {
    expect(whereIs(facingNorth, 0, -4).word).toBe("ahead");
    expect(whereIs(facingNorth, 0, 4).word).toBe("behind");
    // Facing north, west (-x) is on the left and east (+x) on the right.
    expect(whereIs(facingNorth, -4, 0).word).toBe("left");
    expect(whereIs(facingNorth, 4, 0).word).toBe("right");
    expect(whereIs(facingNorth, -3, -3).word).toBe("ahead-left");
    expect(whereIs(facingNorth, 3, 3).word).toBe("behind-right");
    // Turning round turns the words round.
    expect(whereIs({ x: 0, z: 0, rot: 0 }, 0, 4).word).toBe("ahead");
    expect(say(facingNorth, -3, -3)).toBe("4 metres ahead-left");
    expect(say(facingNorth, 0, -1)).toBe("1 metre ahead");
    expect(say(facingNorth, 0, -0.3)).toBe("within a metre");
  });

  it("names doors, assistants, boards and seats, nearest first, and never the secret door", () => {
    const things = thingsOf(
      {
        doors: [
          { x: -4, z: -4, label: "Enter Chifley Library" },
          { x: 30, z: 0, label: "Staff only", secret: true },
        ],
        spots: [
          { x: 0, z: -9, id: "npc:library", label: "Talk to Robin (Library help desk)" },
          { x: 8, z: 0, id: "board", label: "Open the advertising board" },
        ],
        seats: [{ x: 1, z: 1 }, { x: 2, z: 2 }],
      },
      (i) => i === 0,
    );
    expect(things.map((t) => t.kind)).toEqual(["door", "assistant", "board", "seat"]);
    const said = nearby(things, { x: 0, z: 0, rot: Math.PI });
    expect(said[0]).toMatch(/^Seat, 1 metre behind/);
    expect(said).toContain("Chifley Library door, 6 metres ahead-left");
    expect(said).toContain("Robin, assistant, Library help desk, 9 metres ahead");
    expect(said.join("|")).not.toMatch(/Staff only/);
    expect(summary(things, facingNorth, "Enter Chifley Library")).toMatch(/^In reach: Enter Chifley Library\. Near you: /);
    expect(summary([], facingNorth, null)).toBe("Nothing to use near you.");
  });

  it("lists the people in your space by name and rough direction, nearest first", () => {
    expect(people([], facingNorth)).toBe("No one else is here.");
    const said = people([{ name: "Bea", x: 0, z: 9 }, { name: "Al", x: -5, z: -5 }], facingNorth);
    expect(said).toBe("2 people here: Al, 7 metres ahead-left. Bea, 9 metres behind.");
  });
});

describe("describe what's around me: G's route", () => {
  const field = [{ minX: -30, maxX: 30, minZ: -30, maxZ: 30 }];
  const length = (from: { x: number; z: number }, route: { x: number; z: number }[]): number => route.reduce((sum, p, i) => sum + Math.hypot(p.x - (i ? route[i - 1]!.x : from.x), p.z - (i ? route[i - 1]!.z : from.z)), 0);

  it("picks the nearest thing you aren't already at, seats last", () => {
    const things = thingsOf({ doors: [{ x: 10, z: 0, label: "Enter A" }, { x: 20, z: 0, label: "Enter B" }], seats: [{ x: 1, z: 0 }] });
    expect(walkTarget(things, { x: 0, z: 0, rot: 0 })!.name).toBe("A door");
    // Standing at A: next is B (not A again, not the seat).
    expect(walkTarget(things, { x: 10, z: 0, rot: 0 })!.name).toBe("B door");
  });

  it("walks straight where it's open", () => {
    const route = planRoute([], field, { x: 0, z: 0 }, { x: 10, z: 0, stop: 1.2 })!;
    expect(route).toHaveLength(1);
    expect(Math.hypot(route[0]!.x - 10, route[0]!.z)).toBeLessThanOrEqual(1.2);
  });

  it("goes round a wall instead of through it, and ends within reach of the thing", () => {
    // A wall across the way with a gap at the far end.
    const wall = [{ minX: 4, maxX: 5, minZ: -20, maxZ: 8 }];
    const route = planRoute(wall, field, { x: 0, z: 0 }, { x: 10, z: 0, stop: 1.2 })!;
    expect(route.length).toBeGreaterThan(1);
    // No leg of the route cuts through the wall (sampled finely).
    let p = { x: 0, z: 0 };
    for (const q of route) {
      for (let k = 0; k <= 80; k++) {
        const x = p.x + ((q.x - p.x) * k) / 80;
        const z = p.z + ((q.z - p.z) * k) / 80;
        expect(x > 4 - 0.35 && x < 5 + 0.35 && z > -20 && z < 8).toBe(false);
      }
      p = q;
    }
    expect(Math.hypot(p.x - 10, p.z)).toBeLessThanOrEqual(1.2);
    expect(length({ x: 0, z: 0 }, route)).toBeLessThan(45);
  });

  it("finds no route into a sealed room, and stays inside the walkable area", () => {
    const sealed = [
      { minX: 8, maxX: 8.5, minZ: -3, maxZ: 3 },
      { minX: 11.5, maxX: 12, minZ: -3, maxZ: 3 },
      { minX: 8, maxX: 12, minZ: -3, maxZ: -2.5 },
      { minX: 8, maxX: 12, minZ: 2.5, maxZ: 3 },
    ];
    expect(planRoute(sealed, field, { x: 0, z: 0 }, { x: 10, z: 0, stop: 0.5 })).toBeNull();
    // A thing beyond the edge of the walkable area can't be reached either.
    expect(planRoute([], [{ minX: -5, maxX: 5, minZ: -5, maxZ: 5 }], { x: 0, z: 0 }, { x: 20, z: 0, stop: 1 })).toBeNull();
  });
});
