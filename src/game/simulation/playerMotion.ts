import { GROUND_Y } from "../constants";
import { clampSimulationDelta } from "./worldMotion";

// Center-y at which the player's feet rest on the ground surface. (The old
// Arcade build spawned higher at GROUND_Y-58 and let gravity settle it here.)
export const PLAYER_REST_Y = GROUND_Y - 38;

const GRAVITY = 1480; // px / s^2
const JUMP_VELOCITY = -690; // px / s
const JUMP_CUT_VELOCITY = -280; // upward speed cap once the jump is released
const COYOTE_MS = 110; // grace window to still jump just after leaving ground
const JUMP_BUFFER_MS = 140; // grace window to remember a too-early jump press

export interface PlayerState {
  y: number;
  vy: number;
  grounded: boolean;
  coyoteMs: number;
  jumpBufferMs: number;
}

export interface JumpIntents {
  /** A jump was requested this frame (key/pointer just went down). */
  jumpPressed: boolean;
  /** The jump input was released this frame (enables variable jump height). */
  jumpReleased: boolean;
}

export interface PlayerStep extends PlayerState {
  /** True on the frame a jump actually launched (for SFX). */
  jumped: boolean;
}

export function initialPlayerState(): PlayerState {
  return {
    y: PLAYER_REST_Y,
    vy: 0,
    grounded: true,
    coyoteMs: COYOTE_MS,
    jumpBufferMs: 0,
  };
}

/**
 * Deterministic vertical integrator. Owns gravity, jump impulse, variable jump
 * height, ground clamp, and the coyote-time + jump-buffer grace windows that the
 * old Arcade-driven scene handled. Pure: same inputs always give the same output.
 */
export function stepPlayer(
  state: PlayerState,
  deltaMs: number,
  intents: JumpIntents,
): PlayerStep {
  const clamped = clampSimulationDelta(deltaMs);
  const dt = clamped / 1000;

  // Jump buffer: a fresh press refreshes it, otherwise it decays.
  let jumpBufferMs = intents.jumpPressed
    ? JUMP_BUFFER_MS
    : Math.max(0, state.jumpBufferMs - clamped);

  // Coyote time: replenished while grounded, decays once airborne.
  let coyoteMs = state.grounded
    ? COYOTE_MS
    : Math.max(0, state.coyoteMs - clamped);

  let vy = state.vy;
  let jumped = false;

  if (jumpBufferMs > 0 && coyoteMs > 0) {
    vy = JUMP_VELOCITY;
    jumpBufferMs = 0;
    coyoteMs = 0;
    jumped = true;
  }

  // Variable jump height: releasing early trims the remaining upward speed.
  if (intents.jumpReleased && vy < JUMP_CUT_VELOCITY) {
    vy = JUMP_CUT_VELOCITY;
  }

  vy += GRAVITY * dt;
  let y = state.y + vy * dt;

  let grounded = false;
  if (y >= PLAYER_REST_Y) {
    y = PLAYER_REST_Y;
    vy = 0;
    grounded = true;
  }

  return { y, vy, grounded, coyoteMs, jumpBufferMs, jumped };
}
