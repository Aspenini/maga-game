import { describe, expect, test } from "bun:test";
import { ChunkGenerator, minimumHazardGap } from "../src/game/content/chunks";

describe("seeded chunk generation", () => {
  test("always opens with a hazard-free onboarding chunk", () => {
    const generator = new ChunkGenerator(11);
    const opening = generator.next("desert", 0);
    expect(opening.id).toBe("signal-ramp");
    expect(opening.spawns.every((spawn) => ["token", "file", "signal"].includes(spawn.kind))).toBe(true);
  });

  test("is deterministic for a given seed", () => {
    const left = new ChunkGenerator(12345);
    const right = new ChunkGenerator(12345);
    const leftSequence = Array.from({ length: 12 }, () => left.next("launch", 1));
    const rightSequence = Array.from({ length: 12 }, () => right.next("launch", 1));
    expect(leftSequence).toEqual(rightSequence);
  });

  test("uses only reachable authored hazard spacing", () => {
    const generator = new ChunkGenerator(91);
    for (let index = 0; index < 80; index += 1) {
      const chunk = generator.next(index % 2 === 0 ? "archive" : "launch", 1);
      expect(minimumHazardGap(chunk)).toBeGreaterThanOrEqual(280);
      expect(chunk.length).toBeGreaterThanOrEqual(620);
    }
  });
});
