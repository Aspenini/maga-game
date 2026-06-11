import { GROUND_Y } from "../constants";
import type { SpawnKind } from "./types";

export type Lane = "ground" | "low" | "mid" | "high";

/** Axis-aligned box described by its center and full extents. */
export interface Box {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

export interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Single source of truth for every spawnable's solid size. Used both for AABB
 * collision AND for resting an object on its lane baseline, so nothing can sit
 * at an inconsistent depth or collide before visual contact.
 */
export const FOOTPRINT: Record<SpawnKind, { w: number; h: number }> = {
  token: { w: 34, h: 34 },
  file: { w: 34, h: 40 },
  signal: { w: 38, h: 44 },
  crate: { w: 50, h: 50 },
  barrier: { w: 40, h: 48 },
  agent: { w: 40, h: 60 },
  drone: { w: 48, h: 34 },
};

/** Player solid box, centered on the player sprite. */
export const PLAYER_BOX = { w: 30, h: 56 } as const;

/**
 * The bottom edge each lane rests on. Ground hazards sit exactly on the ground
 * surface; the upper lanes are tuned so the jump arc can reach them.
 */
export const LANE_BASELINE: Record<Lane, number> = {
  ground: GROUND_Y,
  low: 430,
  mid: 362,
  high: 300,
};

/** Center-y so the object's footprint bottom rests on its lane baseline. */
export function centerYForLane(kind: SpawnKind, lane: Lane): number {
  return LANE_BASELINE[lane] - FOOTPRINT[kind].h / 2;
}

export function boundsOf(box: Box): Bounds {
  const hw = box.w / 2;
  const hh = box.h / 2;
  return {
    left: box.cx - hw,
    right: box.cx + hw,
    top: box.cy - hh,
    bottom: box.cy + hh,
  };
}

export function aabbOverlap(a: Box, b: Box): boolean {
  const ba = boundsOf(a);
  const bb = boundsOf(b);
  return (
    ba.left < bb.right &&
    ba.right > bb.left &&
    ba.top < bb.bottom &&
    ba.bottom > bb.top
  );
}

const STOMP_DESCENT_SPEED = 120;
const STOMP_OVERLAP_TOLERANCE = 28;

/**
 * A stomp is a falling player landing on the upper part of an enemy (as opposed
 * to running into its side). Ported from the original hitEnemy heuristic.
 */
export function isStomp(player: Box, enemy: Box, playerVy: number): boolean {
  if (playerVy <= STOMP_DESCENT_SPEED) return false;
  const playerBottom = boundsOf(player).bottom;
  const enemyTop = boundsOf(enemy).top;
  return playerBottom < enemyTop + STOMP_OVERLAP_TOLERANCE;
}
