import { HIGH_SCORE_KEY, HIGH_SCORE_VERSION } from "../constants";

interface StoredHighScore {
  version: number;
  score: number;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadHighScore(storage: StorageLike | undefined): number {
  if (!storage) return 0;
  try {
    const value = storage.getItem(HIGH_SCORE_KEY);
    if (!value) return 0;
    const parsed = JSON.parse(value) as Partial<StoredHighScore>;
    if (parsed.version !== HIGH_SCORE_VERSION) return 0;
    return Number.isFinite(parsed.score) && (parsed.score ?? 0) > 0
      ? Math.floor(parsed.score!)
      : 0;
  } catch {
    return 0;
  }
}

export function saveHighScore(storage: StorageLike | undefined, score: number): void {
  if (!storage || !Number.isFinite(score) || score < 0) return;
  try {
    const value: StoredHighScore = {
      version: HIGH_SCORE_VERSION,
      score: Math.floor(score),
    };
    storage.setItem(HIGH_SCORE_KEY, JSON.stringify(value));
  } catch {
    // Storage can be unavailable in embedded or privacy-restricted contexts.
  }
}
