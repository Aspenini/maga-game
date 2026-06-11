import Phaser from "phaser";
import "./styles.css";
import { GAME_HEIGHT, GAME_WIDTH, PLAYER_X } from "./game/constants";
import { RunnerScene } from "./game/scenes/RunnerScene";
import { readInitialHighScore, setupUi } from "./game/ui/controller";

const highScore = readInitialHighScore();
setupUi(highScore);

const query = new URLSearchParams(window.location.search);
const debugAllowed = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const debugPhase = debugAllowed ? query.get("phase") : null;
const debugStartMs = debugPhase === "archive" ? 30000 : debugPhase === "launch" ? 60000 : 0;
const debugShield = debugAllowed && query.get("shield") === "1";
const runnerScene = new RunnerScene(highScore, debugStartMs, debugShield);

const game = new Phaser.Game({
  type: Phaser.CANVAS,
  parent: "game-container",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  transparent: true,
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.ENVELOP,
    fullscreenTarget: "game-shell",
  },
  scene: [runnerScene],
  banner: false,
});

const gameShell = document.querySelector<HTMLElement>("#game-shell");
if (!gameShell) throw new Error("Missing game shell.");

const layoutCoverCanvas = (): void => {
  const viewportWidth = gameShell.clientWidth;
  const viewportHeight = gameShell.clientHeight;
  const coverScale = Math.max(
    viewportWidth / GAME_WIDTH,
    viewportHeight / GAME_HEIGHT,
  );
  const displayWidth = GAME_WIDTH * coverScale;
  const displayHeight = GAME_HEIGHT * coverScale;
  const playerScreenX = viewportWidth * (PLAYER_X / GAME_WIDTH);
  const visibleWorldWidth = viewportWidth / coverScale;

  Object.assign(game.canvas.style, {
    width: `${Math.round(displayWidth)}px`,
    height: `${Math.round(displayHeight)}px`,
    left: `${playerScreenX - PLAYER_X * coverScale}px`,
    top: `${viewportHeight - displayHeight}px`,
    imageRendering: "pixelated",
  });
  runnerScene.setVisibleWorldWidth(visibleWorldWidth);
};

game.scale.on(Phaser.Scale.Events.RESIZE, layoutCoverCanvas);
new ResizeObserver(layoutCoverCanvas).observe(gameShell);
requestAnimationFrame(layoutCoverCanvas);

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => Promise<void> | void;
    __MAGA_GAME__?: Phaser.Game;
  }
}

window.__MAGA_GAME__ = game;
window.render_game_to_text = () => JSON.stringify(runnerScene.getTextState());

if (!window.advanceTime) {
  window.advanceTime = (ms: number) =>
    new Promise((resolve) => {
      window.setTimeout(resolve, Math.max(0, ms));
    });
}
