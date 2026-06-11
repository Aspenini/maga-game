import { MINIMUM_PACE_SCALE, speedForElapsed } from "./progression";

const AGENT_APPROACH_SPEED = 24;

export function clampSimulationDelta(deltaMs: number): number {
  return Math.min(50, Math.max(0, deltaMs));
}

export function responsivePace(paceScale: number): number {
  return Math.min(1, Math.max(MINIMUM_PACE_SCALE, paceScale));
}

export function scrollSpeedForElapsed(elapsedMs: number, paceScale: number): number {
  return speedForElapsed(elapsedMs) * responsivePace(paceScale);
}

export function cameraTravelStep(
  deltaMs: number,
  elapsedMs: number,
  paceScale: number,
): number {
  const clampedDelta = clampSimulationDelta(deltaMs);
  return (scrollSpeedForElapsed(elapsedMs, paceScale) * clampedDelta) / 1000;
}

/**
 * Whole-pixel offset for things locked to the camera but rendered without a
 * per-object world coordinate (e.g. the ground tile's tilePositionX). Rounding
 * the float camera travel a single, consistent way keeps the ground in lockstep
 * with every world object (which round the same way in screenXForWorld).
 */
export function cameraScrollPixels(cameraTravel: number): number {
  return Math.round(cameraTravel);
}

/**
 * Screen-space x for a world object. The float camera travel is subtracted in
 * full and the result is rounded exactly once, so motion is sub-pixel accurate
 * yet snapped to whole pixels — no sub-pixel shimmer, no floored-accumulation
 * stutter, and every object steps together.
 */
export function screenXForWorld(
  worldX: number,
  cameraTravel: number,
  approachOffset = 0,
): number {
  return Math.round(worldX - cameraTravel - approachOffset);
}

export function agentApproachForDelta(
  deltaMs: number,
  paceScale: number,
): number {
  const clampedDelta = clampSimulationDelta(deltaMs);
  return (AGENT_APPROACH_SPEED * responsivePace(paceScale) * clampedDelta) / 1000;
}
