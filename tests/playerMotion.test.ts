import { describe, expect, test } from "bun:test";
import {
  initialPlayerState,
  stepPlayer,
  PLAYER_REST_Y,
  type PlayerState,
} from "../src/game/simulation/playerMotion";

const NO_INPUT = { jumpPressed: false, jumpReleased: false } as const;
const PRESS = { jumpPressed: true, jumpReleased: false } as const;

function advance(state: PlayerState, frames: number): PlayerState {
  let next = state;
  for (let i = 0; i < frames; i++) next = stepPlayer(next, 16, NO_INPUT);
  return next;
}

describe("player motion", () => {
  test("starts grounded at rest", () => {
    const state = initialPlayerState();
    expect(state.grounded).toBe(true);
    expect(state.y).toBe(PLAYER_REST_Y);
  });

  test("a jump leaves the ground and rises", () => {
    const jumped = stepPlayer(initialPlayerState(), 16, PRESS);
    expect(jumped.jumped).toBe(true);
    expect(jumped.grounded).toBe(false);
    expect(jumped.vy).toBeLessThan(0);
    expect(jumped.y).toBeLessThan(PLAYER_REST_Y);
  });

  test("rises to an apex then lands back on the ground", () => {
    let state = stepPlayer(initialPlayerState(), 16, PRESS);
    const apex = advance(state, 60).y; // ~1s, well past the apex
    expect(apex).toBe(PLAYER_REST_Y);
    // peak height was meaningfully above the ground at some point
    state = stepPlayer(initialPlayerState(), 16, PRESS);
    let highest = state.y;
    for (let i = 0; i < 30; i++) {
      state = stepPlayer(state, 16, NO_INPUT);
      highest = Math.min(highest, state.y);
    }
    expect(PLAYER_REST_Y - highest).toBeGreaterThan(100);
  });

  test("releasing early cuts the jump height", () => {
    const launched = stepPlayer(initialPlayerState(), 16, PRESS);
    const held = stepPlayer(launched, 16, NO_INPUT);
    const released = stepPlayer(launched, 16, {
      jumpPressed: false,
      jumpReleased: true,
    });
    // released keeps less upward momentum (vy closer to zero / less negative)
    expect(released.vy).toBeGreaterThan(held.vy);
  });

  test("cannot double jump in mid-air", () => {
    const launched = stepPlayer(initialPlayerState(), 16, PRESS);
    const again = stepPlayer(launched, 16, PRESS);
    expect(again.jumped).toBe(false);
  });

  test("a buffered press fires once the player lands", () => {
    // Airborne and descending toward the ground.
    const airborne: PlayerState = {
      y: PLAYER_REST_Y - 4,
      vy: 600,
      grounded: false,
      coyoteMs: 0,
      jumpBufferMs: 0,
    };
    // Press just before touchdown — too early to jump this frame.
    const landed = stepPlayer(airborne, 16, PRESS);
    expect(landed.grounded).toBe(true); // landed
    expect(landed.jumped).toBe(false); // but didn't jump yet (was airborne)
    // Next frame, grounded gives coyote time and the buffered press fires.
    const next = stepPlayer(landed, 16, NO_INPUT);
    expect(next.jumped).toBe(true);
  });
});
