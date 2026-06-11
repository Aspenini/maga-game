import { collectibleScore, distanceScore, stompScore } from "./scoring";
import { phaseForElapsed, speedForElapsed } from "./progression";
import type { CollectibleKind, CollectibleCounts, RunSnapshot } from "./types";
import { clampSimulationDelta, responsivePace } from "./worldMotion";

const SHIELD_DURATION_MS = 6000;

export class RunModel {
  private snapshotState: RunSnapshot;
  private lastComboAt = 0;

  constructor(highScore = 0) {
    this.snapshotState = this.initialSnapshot(highScore);
  }

  start(seed: number): RunSnapshot {
    const highScore = this.snapshotState.highScore;
    this.snapshotState = {
      ...this.initialSnapshot(highScore),
      mode: "running",
      seed: seed >>> 0,
    };
    this.lastComboAt = 0;
    return this.snapshot();
  }

  update(deltaMs: number, paceScale = 1): RunSnapshot {
    if (this.snapshotState.mode !== "running") return this.snapshot();
    const clamped = clampSimulationDelta(deltaMs);
    const pace = responsivePace(paceScale);
    const previousDistance = this.snapshotState.distance;
    const elapsedMs = this.snapshotState.elapsedMs + clamped;
    const speed = Math.round(speedForElapsed(elapsedMs) * pace);
    const distance = previousDistance + (speed * clamped) / 10000;
    const score = this.snapshotState.score + distanceScore(previousDistance, distance);
    const shieldMs = Math.max(0, this.snapshotState.shieldMs - clamped);
    const combo =
      elapsedMs - this.lastComboAt > 2600 ? 1 : this.snapshotState.combo;

    this.snapshotState = {
      ...this.snapshotState,
      elapsedMs,
      distance,
      speed,
      score,
      combo,
      phase: phaseForElapsed(elapsedMs),
      shieldMs,
    };
    return this.snapshot();
  }

  collect(kind: CollectibleKind): RunSnapshot {
    if (this.snapshotState.mode !== "running") return this.snapshot();
    const combo = this.advanceCombo();
    const collectibles: CollectibleCounts = {
      ...this.snapshotState.collectibles,
      [kind]: this.snapshotState.collectibles[kind] + 1,
    };
    this.snapshotState = {
      ...this.snapshotState,
      combo,
      collectibles,
      score: this.snapshotState.score + collectibleScore(kind, combo),
      shieldMs: kind === "signal" ? SHIELD_DURATION_MS : this.snapshotState.shieldMs,
    };
    return this.snapshot();
  }

  stomp(): RunSnapshot {
    if (this.snapshotState.mode !== "running") return this.snapshot();
    const combo = this.advanceCombo();
    this.snapshotState = {
      ...this.snapshotState,
      combo,
      score: this.snapshotState.score + stompScore(combo),
    };
    return this.snapshot();
  }

  hit(reason: string): { absorbed: boolean; snapshot: RunSnapshot } {
    if (this.snapshotState.mode !== "running") {
      return { absorbed: false, snapshot: this.snapshot() };
    }
    if (this.snapshotState.shieldMs > 0) {
      this.snapshotState = {
        ...this.snapshotState,
        shieldMs: 0,
        combo: 1,
      };
      return { absorbed: true, snapshot: this.snapshot() };
    }
    const highScore = Math.max(this.snapshotState.highScore, this.snapshotState.score);
    this.snapshotState = {
      ...this.snapshotState,
      mode: "gameover",
      highScore,
      reason,
    };
    return { absorbed: false, snapshot: this.snapshot() };
  }

  pause(): RunSnapshot {
    if (this.snapshotState.mode === "running") {
      this.snapshotState = { ...this.snapshotState, mode: "paused" };
    }
    return this.snapshot();
  }

  resume(): RunSnapshot {
    if (this.snapshotState.mode === "paused") {
      this.snapshotState = { ...this.snapshotState, mode: "running" };
    }
    return this.snapshot();
  }

  snapshot(): RunSnapshot {
    return {
      ...this.snapshotState,
      collectibles: { ...this.snapshotState.collectibles },
    };
  }

  private advanceCombo(): number {
    const combo =
      this.snapshotState.elapsedMs - this.lastComboAt <= 2600
        ? Math.min(8, this.snapshotState.combo + 1)
        : 1;
    this.lastComboAt = this.snapshotState.elapsedMs;
    return combo;
  }

  private initialSnapshot(highScore: number): RunSnapshot {
    return {
      mode: "menu",
      seed: 0,
      elapsedMs: 0,
      distance: 0,
      speed: speedForElapsed(0),
      phase: "desert",
      score: 0,
      highScore,
      combo: 1,
      collectibles: { token: 0, file: 0, signal: 0 },
      shieldMs: 0,
      shieldMaxMs: SHIELD_DURATION_MS,
    };
  }
}
