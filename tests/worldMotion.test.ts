import { describe, expect, test } from "bun:test";
import {
  agentApproachForDelta,
  cameraScrollPixels,
  cameraTravelStep,
  screenXForWorld,
  scrollSpeedForElapsed,
} from "../src/game/simulation/worldMotion";

describe("world motion", () => {
  test("keeps static props locked to the same camera travel", () => {
    const firstWorldX = 800;
    const secondWorldX = 1120;
    const beforeGap =
      screenXForWorld(secondWorldX, 0) - screenXForWorld(firstWorldX, 0);
    const afterGap =
      screenXForWorld(secondWorldX, 475.9) -
      screenXForWorld(firstWorldX, 475.9);

    expect(afterGap).toBe(beforeGap);
  });

  test("rounds scroll to whole canvas pixels", () => {
    expect(cameraScrollPixels(301.25)).toBe(301);
    expect(cameraScrollPixels(301.6)).toBe(302);
    expect(screenXForWorld(800, 301.25)).toBe(499);
    expect(Number.isInteger(screenXForWorld(800, 301.6))).toBe(true);
  });

  test("scroll step uses fractional speed and clamps delta like simulation", () => {
    const elapsedMs = 5000;
    const paceScale = 0.876;
    const expected =
      (scrollSpeedForElapsed(elapsedMs, paceScale) * 16.67) / 1000;

    expect(cameraTravelStep(16.67, elapsedMs, paceScale)).toBeCloseTo(expected, 5);
    expect(cameraTravelStep(100, elapsedMs, paceScale)).toBe(
      cameraTravelStep(50, elapsedMs, paceScale),
    );
  });

  test("static props never bounce backward on screen", () => {
    let cameraTravel = 0;
    let lastScreenX = screenXForWorld(900, cameraTravel);

    for (let frame = 0; frame < 180; frame++) {
      const elapsedMs = frame * 16.67;
      cameraTravel += cameraTravelStep(16.67, elapsedMs, 1);
      const screenX = screenXForWorld(900, cameraTravel);
      expect(screenX).toBeLessThanOrEqual(lastScreenX);
      expect(Number.isInteger(screenX)).toBe(true);
      lastScreenX = screenX;
    }
  });

  test("agents close distance slightly faster than static props", () => {
    const cameraTravel = 300.8;
    const approach = agentApproachForDelta(50, 1);
    const staticX = screenXForWorld(900, cameraTravel);
    const agentX = screenXForWorld(900, cameraTravel, approach);

    expect(agentX).toBeLessThan(staticX);
    expect(approach).toBeGreaterThan(0);
  });
});
