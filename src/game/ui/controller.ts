import mascotUrl from "../../assets/brand/pixel-alien.webp";
import { emitPublicEvent, gameBus, sendUiCommand } from "../events";
import { loadHighScore, saveHighScore } from "../simulation/persistence";
import type { RunSnapshot } from "../simulation/types";
import { gameAudio } from "../audio";

const $ = <T extends HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing UI element: ${selector}`);
  return element;
};

const formatScore = (value: number) => Math.max(0, Math.floor(value)).toString().padStart(6, "0");

export function readInitialHighScore(): number {
  return loadHighScore(window.localStorage);
}

export function setupUi(initialHighScore: number): void {
  const startScreen = $("#start-screen");
  const pauseScreen = $("#pause-screen");
  const resultScreen = $("#result-screen");
  const hud = $("#hud");
  const jumpButton = $("#jump-button");
  const muteButton = $("#mute-button");
  const mascot = $<HTMLImageElement>("#brand-mascot");
  const menuHighScore = $("#menu-high-score");
  let muted = false;
  let previousMode = "menu";

  mascot.src = mascotUrl;
  menuHighScore.textContent = formatScore(initialHighScore);

  const begin = () => {
    void gameAudio.unlock();
    sendUiCommand({ type: "start" });
  };

  $("#start-button").addEventListener("click", begin);
  $("#replay-button").addEventListener("click", begin);
  $("#pause-button").addEventListener("click", () => sendUiCommand({ type: "pause" }));
  $("#resume-button").addEventListener("click", () => sendUiCommand({ type: "resume" }));
  muteButton.addEventListener("click", () => {
    muted = !muted;
    gameAudio.setMuted(muted);
    muteButton.textContent = muted ? "OFF" : "SND";
    muteButton.setAttribute("aria-label", muted ? "Unmute audio" : "Mute audio");
  });

  const jumpDown = (event: Event) => {
    event.preventDefault();
    void gameAudio.unlock();
    sendUiCommand({ type: "jump-down" });
  };
  const jumpUp = (event: Event) => {
    event.preventDefault();
    sendUiCommand({ type: "jump-up" });
  };
  jumpButton.addEventListener("pointerdown", jumpDown);
  jumpButton.addEventListener("pointerup", jumpUp);
  jumpButton.addEventListener("pointercancel", jumpUp);

  document.querySelectorAll<HTMLAnchorElement>("[data-cta]").forEach((link) => {
    link.addEventListener("click", () => {
      emitPublicEvent("cta-click", {
        cta: link.dataset.cta,
        href: link.href,
      });
    });
  });

  gameBus.addEventListener("game-snapshot", (event) => {
    const snapshot = (event as CustomEvent<RunSnapshot>).detail;
    $("#score-value").textContent = formatScore(snapshot.score);
    $("#phase-value").textContent =
      snapshot.phase === "desert"
        ? "AREA 51"
        : snapshot.phase === "archive"
          ? "THE ARCHIVE"
          : "LAUNCH SITE";
    $("#combo-value").textContent = `COMBO x${snapshot.combo}`;
    $("#token-value").textContent = String(snapshot.collectibles.token);
    $("#file-value").textContent = String(snapshot.collectibles.file);

    const shieldMeter = $("#shield-meter");
    const shieldPercent = Math.round((snapshot.shieldMs / snapshot.shieldMaxMs) * 100);
    shieldMeter.classList.toggle("is-hidden", snapshot.shieldMs <= 0);
    shieldMeter.style.setProperty("--shield", String(shieldPercent));

    startScreen.classList.toggle("is-hidden", snapshot.mode !== "menu");
    pauseScreen.classList.toggle("is-hidden", snapshot.mode !== "paused");
    resultScreen.classList.toggle("is-hidden", snapshot.mode !== "gameover");
    hud.classList.toggle("is-hidden", snapshot.mode !== "running");
    jumpButton.classList.toggle("is-hidden", snapshot.mode !== "running");

    if (snapshot.mode === "gameover" && previousMode !== "gameover") {
      saveHighScore(window.localStorage, snapshot.highScore);
      $("#result-score").textContent = formatScore(snapshot.score);
      $("#result-high-score").textContent = formatScore(snapshot.highScore);
      $("#result-distance").textContent = `${Math.floor(snapshot.distance)}m`;
      $("#result-files").textContent = String(snapshot.collectibles.file);
      menuHighScore.textContent = formatScore(snapshot.highScore);
    }
    previousMode = snapshot.mode;
  });
}
