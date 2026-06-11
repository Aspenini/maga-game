import { describe, expect, test } from "bun:test";
import {
  difficultyForElapsed,
  paceForVisibleWidth,
  phaseForElapsed,
  speedForElapsed,
} from "../src/game/simulation/progression";

describe("run progression", () => {
  test("cycles through the three disclosure environments", () => {
    expect(phaseForElapsed(0)).toBe("desert");
    expect(phaseForElapsed(30000)).toBe("archive");
    expect(phaseForElapsed(60000)).toBe("launch");
    expect(phaseForElapsed(90000)).toBe("desert");
  });

  test("increases speed without a sudden early spike", () => {
    expect(speedForElapsed(0)).toBe(300);
    expect(speedForElapsed(30000)).toBeGreaterThan(speedForElapsed(0));
    expect(speedForElapsed(90000)).toBeGreaterThan(speedForElapsed(30000));
    expect(speedForElapsed(90000)).toBeLessThanOrEqual(500);
  });

  test("clamps difficulty", () => {
    expect(difficultyForElapsed(-100)).toBe(0);
    expect(difficultyForElapsed(45000)).toBe(0.5);
    expect(difficultyForElapsed(200000)).toBe(1);
  });

  test("smoothly reduces pace as visible horizontal space shrinks", () => {
    expect(paceForVisibleWidth(960)).toBe(1);
    expect(paceForVisibleWidth(900)).toBeGreaterThan(paceForVisibleWidth(720));
    expect(paceForVisibleWidth(720)).toBeGreaterThan(paceForVisibleWidth(560));
    expect(paceForVisibleWidth(240)).toBe(0.62); // floor for narrow mobile viewports
    expect(paceForVisibleWidth(2000)).toBe(1);
  });
});
