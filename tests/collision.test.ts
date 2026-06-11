import { describe, expect, test } from "bun:test";
import {
  aabbOverlap,
  boundsOf,
  centerYForLane,
  isStomp,
  type Box,
  type Lane,
  FOOTPRINT,
  LANE_BASELINE,
} from "../src/game/simulation/collision";
import type { SpawnKind } from "../src/game/simulation/types";

const allKinds: SpawnKind[] = ["token", "file", "signal", "crate", "barrier", "agent", "drone"];
const allLanes: Lane[] = ["ground", "low", "mid", "high"];

describe("collision", () => {
  test("aabbOverlap detects intersecting boxes", () => {
    const a: Box = { cx: 100, cy: 100, w: 40, h: 40 };
    const b: Box = { cx: 120, cy: 110, w: 40, h: 40 };
    expect(aabbOverlap(a, b)).toBe(true);
  });

  test("aabbOverlap rejects separated boxes", () => {
    const a: Box = { cx: 100, cy: 100, w: 40, h: 40 };
    const far: Box = { cx: 200, cy: 100, w: 40, h: 40 };
    expect(aabbOverlap(a, far)).toBe(false);
  });

  test("every object rests exactly on its lane baseline", () => {
    for (const kind of allKinds) {
      for (const lane of allLanes) {
        const center = centerYForLane(kind, lane);
        const bottom = center + FOOTPRINT[kind].h / 2;
        expect(bottom).toBe(LANE_BASELINE[lane]);
      }
    }
  });

  test("ground-lane hazards sit on the ground surface", () => {
    const barrier = centerYForLane("barrier", "ground");
    expect(boundsOf({ cx: 0, cy: barrier, ...FOOTPRINT.barrier }).bottom).toBe(
      LANE_BASELINE.ground,
    );
  });

  test("a fast descent onto the top of an enemy is a stomp", () => {
    const player: Box = { cx: 100, cy: 360, w: 30, h: 56 };
    const enemy: Box = { cx: 100, cy: 408, w: 40, h: 60 };
    expect(isStomp(player, enemy, 400)).toBe(true);
  });

  test("a side collision is not a stomp", () => {
    const player: Box = { cx: 100, cy: 408, w: 30, h: 56 };
    const enemy: Box = { cx: 110, cy: 408, w: 40, h: 60 };
    expect(isStomp(player, enemy, 400)).toBe(false);
    // nor is a slow/level approach onto the top
    const above: Box = { cx: 100, cy: 360, w: 30, h: 56 };
    expect(isStomp(above, enemy, 0)).toBe(false);
  });
});
