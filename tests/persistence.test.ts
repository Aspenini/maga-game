import { describe, expect, test } from "bun:test";
import { HIGH_SCORE_KEY } from "../src/game/constants";
import { loadHighScore, saveHighScore, type StorageLike } from "../src/game/simulation/persistence";

class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("versioned high score persistence", () => {
  test("round-trips a normalized score", () => {
    const storage = new MemoryStorage();
    saveHighScore(storage, 1234.9);
    expect(loadHighScore(storage)).toBe(1234);
  });

  test("rejects malformed or old values", () => {
    const storage = new MemoryStorage();
    storage.setItem(HIGH_SCORE_KEY, "{broken");
    expect(loadHighScore(storage)).toBe(0);
    storage.setItem(HIGH_SCORE_KEY, JSON.stringify({ version: 0, score: 999 }));
    expect(loadHighScore(storage)).toBe(0);
  });
});
