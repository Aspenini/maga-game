import Phaser from "phaser";
import "./styles.css";
import { GAME_HEIGHT, GAME_WIDTH } from "./game/constants";
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
  backgroundColor: "#050607",
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    fullscreenTarget: "game-shell",
  },
  scene: [runnerScene],
  banner: false,
});

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
