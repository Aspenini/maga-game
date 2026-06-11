import type { RunSnapshot } from "./simulation/types";

export const gameBus = new EventTarget();

export type UiCommand =
  | { type: "start"; seed?: number }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "jump-down" }
  | { type: "jump-up" }
  | { type: "mute"; muted: boolean };

export function sendUiCommand(command: UiCommand): void {
  gameBus.dispatchEvent(new CustomEvent("ui-command", { detail: command }));
}

export function publishSnapshot(snapshot: RunSnapshot): void {
  gameBus.dispatchEvent(new CustomEvent("game-snapshot", { detail: snapshot }));
}

export function emitPublicEvent(
  type: "ready" | "run-start" | "run-end" | "cta-click",
  detail: Record<string, unknown> = {},
): void {
  window.dispatchEvent(
    new CustomEvent("maga-game:event", {
      detail: { type, timestamp: Date.now(), ...detail },
    }),
  );
}
