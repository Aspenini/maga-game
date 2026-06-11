import type { CollectibleKind } from "./types";

const COLLECTIBLE_POINTS: Record<CollectibleKind, number> = {
  token: 75,
  file: 160,
  signal: 250,
};

export function distanceScore(previousDistance: number, nextDistance: number): number {
  return Math.max(0, Math.floor(nextDistance) - Math.floor(previousDistance));
}

export function collectibleScore(kind: CollectibleKind, combo: number): number {
  return COLLECTIBLE_POINTS[kind] * Math.max(1, combo);
}

export function stompScore(combo: number): number {
  return 220 * Math.max(1, combo);
}
