export type RunMode = "menu" | "running" | "paused" | "gameover";
export type Phase = "desert" | "archive" | "launch";
export type CollectibleKind = "token" | "file" | "signal";
export type HazardKind = "barrier" | "crate" | "agent" | "drone";
export type SpawnKind = CollectibleKind | HazardKind;

export interface CollectibleCounts {
  token: number;
  file: number;
  signal: number;
}

export interface RunSnapshot {
  mode: RunMode;
  seed: number;
  elapsedMs: number;
  distance: number;
  speed: number;
  phase: Phase;
  score: number;
  highScore: number;
  combo: number;
  collectibles: CollectibleCounts;
  shieldMs: number;
  shieldMaxMs: number;
  reason?: string;
}

export interface SpawnSpec {
  kind: SpawnKind;
  x: number;
  lane: "ground" | "low" | "mid" | "high";
}

export interface GeneratedChunk {
  id: string;
  length: number;
  spawns: SpawnSpec[];
}
