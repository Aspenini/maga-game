import { describe, expect, test } from "bun:test";
import { RunModel } from "../src/game/simulation/runModel";

describe("run model", () => {
  test("tracks distance, score, phase, and collection combo", () => {
    const model = new RunModel(400);
    model.start(7);
    model.update(1000);
    const token = model.collect("token");
    const file = model.collect("file");
    expect(token.collectibles.token).toBe(1);
    expect(file.collectibles.file).toBe(1);
    expect(file.combo).toBeGreaterThan(token.combo);
    expect(file.score).toBeGreaterThan(token.score);
  });

  test("signal absorbs one collision and a later collision ends the run", () => {
    const model = new RunModel();
    model.start(8);
    model.collect("signal");
    expect(model.hit("crate").absorbed).toBe(true);
    const fatal = model.hit("barrier");
    expect(fatal.absorbed).toBe(false);
    expect(fatal.snapshot.mode).toBe("gameover");
  });

  test("pause blocks simulation updates", () => {
    const model = new RunModel();
    model.start(9);
    model.update(500);
    const before = model.pause();
    model.update(1000);
    expect(model.snapshot().elapsedMs).toBe(before.elapsedMs);
    expect(model.resume().mode).toBe("running");
  });
});
