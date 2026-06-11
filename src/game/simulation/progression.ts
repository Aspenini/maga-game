import type { Phase } from "./types";

const REFERENCE_VISIBLE_WIDTH = 960;
/** Slowest pace (narrowest mobile viewports). Shared with worldMotion's clamp. */
export const MINIMUM_PACE_SCALE = 0.62;

export function phaseForElapsed(elapsedMs: number): Phase {
  const cycle = Math.floor(elapsedMs / 30000) % 3;
  return cycle === 0 ? "desert" : cycle === 1 ? "archive" : "launch";
}

export function speedForElapsed(elapsedMs: number): number {
  const seconds = Math.max(0, elapsedMs / 1000);
  const eased = Math.min(1, seconds / 95);
  return Math.round(300 + eased * 175 + Math.floor(seconds / 30) * 8);
}

export function difficultyForElapsed(elapsedMs: number): number {
  return Math.min(1, Math.max(0, elapsedMs / 90000));
}

export function paceForVisibleWidth(visibleWorldWidth: number): number {
  const widthRatio = Math.max(0, visibleWorldWidth) / REFERENCE_VISIBLE_WIDTH;
  return Math.min(
    1,
    Math.max(MINIMUM_PACE_SCALE, Math.pow(widthRatio, 0.72)),
  );
}
