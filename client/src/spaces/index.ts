import type { SpaceDef, SpaceId } from "../world.ts";
import { buildClassroom } from "./classroom.ts";
import { buildHub } from "./hub.ts";
import { buildOutdoor } from "./outdoor.ts";

// Every space is built once, on first visit, and reused after that.
// Bounds must match server/spaces.ts, which clamps positions to them.

const builders: Record<SpaceId, () => SpaceDef> = {
  outdoor: buildOutdoor,
  hub: buildHub,
  comp8280: buildClassroom,
};
const built = new Map<SpaceId, SpaceDef>();

export function getSpace(id: SpaceId): SpaceDef {
  let def = built.get(id);
  if (!def) built.set(id, (def = builders[id]()));
  return def;
}

export const isSpaceId = (s: unknown): s is SpaceId => typeof s === "string" && Object.hasOwn(builders, s);

