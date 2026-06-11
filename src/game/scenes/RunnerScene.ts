import Phaser from "phaser";
import { assetUrls } from "../assets";
import { gameAudio } from "../audio";
import { GAME_HEIGHT, GAME_WIDTH, GROUND_Y, PLAYER_X } from "../constants";
import { emitPublicEvent, gameBus, publishSnapshot, type UiCommand } from "../events";
import { ChunkGenerator } from "../content/chunks";
import { difficultyForElapsed, paceForVisibleWidth } from "../simulation/progression";
import { RunModel } from "../simulation/runModel";
import type { CollectibleKind, Phase, RunSnapshot, SpawnKind } from "../simulation/types";
import {
  aabbOverlap,
  centerYForLane,
  isStomp,
  type Box,
  type Lane,
  FOOTPRINT,
  PLAYER_BOX,
} from "../simulation/collision";
import {
  initialPlayerState,
  stepPlayer,
  type PlayerState,
} from "../simulation/playerMotion";
import {
  agentApproachForDelta,
  cameraScrollPixels,
  cameraTravelStep,
  screenXForWorld,
} from "../simulation/worldMotion";

type Sprite = Phaser.GameObjects.Sprite;

/** A pooled world object. Positions live in world space; screen coords are
 *  derived (and rounded) once per frame in scrollWorld. */
interface Prop {
  sprite: Sprite;
  kind: SpawnKind;
  category: "collectible" | "hazard" | "enemy";
  worldX: number;
  baseCenterY: number;
  centerY: number;
  approachOffset: number;
  active: boolean;
}

const objectFrame: Record<Exclude<SpawnKind, "agent" | "drone">, number> = {
  token: 0,
  file: 1,
  signal: 2,
  crate: 4,
  barrier: 5,
};

const SPAWN_RECYCLE_X = -90;
const SPAWN_AHEAD_X = 1260;

export class RunnerScene extends Phaser.Scene {
  private model!: RunModel;
  private chunkGenerator!: ChunkGenerator;
  private player!: Sprite;
  private playerState: PlayerState = initialPlayerState();
  private groundVisual!: Phaser.GameObjects.TileSprite;
  private worldLayer!: Phaser.GameObjects.Container;
  private props: Prop[] = [];
  private shieldFx!: Phaser.GameObjects.Sprite;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey?: Phaser.Input.Keyboard.Key;
  private fullscreenKey?: Phaser.Input.Keyboard.Key;
  private escapeKey?: Phaser.Input.Keyboard.Key;
  private jumpPressedQueued = false;
  private jumpReleasedQueued = false;
  private cameraTravel = 0;
  private spawnCursorWorldX = 1080;
  private lastPhase: Phase = "desert";
  private uiHandler?: (event: Event) => void;
  private lastSnapshotAt = 0;
  private debugSnapshot: RunSnapshot | undefined;
  private paceScale = 1;
  private targetPaceScale = 1;

  constructor(
    private readonly initialHighScore: number,
    private readonly debugStartMs = 0,
    private readonly debugShield = false,
  ) {
    super("runner");
  }

  preload(): void {
    this.load.spritesheet("player-idle", assetUrls.playerIdleUrl, { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet("player-run", assetUrls.playerRunUrl, { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet("player-jump", assetUrls.playerJumpUrl, { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet("player-hurt", assetUrls.playerHurtUrl, { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet("player-celebrate", assetUrls.playerCelebrateUrl, { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet("agent-run", assetUrls.agentUrl, { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet("drone-hover", assetUrls.droneUrl, { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet("objects", assetUrls.objectsUrl, { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet("effects", assetUrls.effectsUrl, { frameWidth: 64, frameHeight: 64 });
  }

  create(): void {
    this.model = new RunModel(this.initialHighScore);
    this.createTextures();
    this.createAnimations();
    this.createWorld();
    this.createInput();
    this.bindUi();
    this.publish(true);
    emitPublicEvent("ready", { version: 1 });

    window.addEventListener("blur", () => {
      if (this.model.snapshot().mode === "running") this.pauseRun();
    });
  }

  update(_time: number, delta: number): void {
    const paceBlend = 1 - Math.exp(-delta / 650);
    this.paceScale += (this.targetPaceScale - this.paceScale) * paceBlend;
    const before = this.model.snapshot();
    const snapshot = this.model.update(delta, this.paceScale);
    this.debugSnapshot = snapshot;

    if (snapshot.mode !== "running") {
      this.jumpPressedQueued = false;
      this.jumpReleasedQueued = false;
      return;
    }

    this.updatePlayer(delta);
    this.scrollWorld(snapshot, delta);
    this.checkCollisions();
    this.updateAnimation();
    this.updatePhase(before.phase, snapshot.phase);
    this.recycleOffscreen();
    this.spawnAhead(snapshot);
    this.updateShield(snapshot);
    gameAudio.tickMusic(snapshot.elapsedMs);

    if (snapshot.elapsedMs - this.lastSnapshotAt > 80) {
      this.lastSnapshotAt = snapshot.elapsedMs;
      this.publish();
    }
  }

  getTextState(): Record<string, unknown> {
    const snapshot = this.model?.snapshot();
    const visible = (category: Prop["category"]) =>
      this.props
        .filter((prop) => prop.active && prop.category === category)
        .slice(0, 12)
        .map((prop) => ({
          kind: prop.kind,
          x: Math.round(prop.sprite.x),
          y: Math.round(prop.sprite.y),
        }));
    return {
      coordinateSystem: "origin top-left; x increases right; y increases down; canvas 960x540",
      ...snapshot,
      player: this.player
        ? {
            x: Math.round(this.player.x),
            y: Math.round(this.player.y),
            velocityY: Math.round(this.playerState.vy),
            grounded: this.playerState.grounded,
          }
        : null,
      hazards: visible("hazard"),
      enemies: visible("enemy"),
      collectiblesOnScreen: visible("collectible"),
      paceScale: Number(this.paceScale.toFixed(3)),
    };
  }

  setVisibleWorldWidth(visibleWorldWidth: number): void {
    const nextPaceScale = paceForVisibleWidth(visibleWorldWidth);
    if (!this.model || this.model.snapshot().mode !== "running") {
      this.paceScale = nextPaceScale;
    }
    this.targetPaceScale = nextPaceScale;
  }

  private createTextures(): void {
    const graphics = this.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x16191b);
    graphics.fillRect(0, 0, 32, 32);
    graphics.fillStyle(0x24282b);
    graphics.fillRect(0, 0, 16, 8);
    graphics.fillRect(16, 16, 16, 8);
    graphics.lineStyle(2, 0x4e1718);
    graphics.strokeRect(0, 0, 32, 32);
    graphics.generateTexture("ground-tile", 32, 32);
    graphics.destroy();
  }

  private createAnimations(): void {
    const create = (key: string, texture: string, end: number, frameRate: number, repeat = -1) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(texture, { start: 0, end }),
        frameRate,
        repeat,
      });
    };
    create("player-idle", "player-idle", 3, 5);
    create("player-run", "player-run", 7, 20);
    create("player-jump", "player-jump", 3, 8);
    create("player-hurt", "player-hurt", 3, 10, 0);
    create("player-celebrate", "player-celebrate", 3, 8);
    create("agent-run", "agent-run", 5, 10);
    create("drone-hover", "drone-hover", 5, 8);
  }

  private createWorld(): void {
    this.groundVisual = this.add
      .tileSprite(0, GROUND_Y, GAME_WIDTH, GAME_HEIGHT - GROUND_Y, "ground-tile")
      .setOrigin(0)
      .setDepth(4);

    this.worldLayer = this.add.container(0, 0).setDepth(7);

    this.playerState = initialPlayerState();
    this.player = this.add
      .sprite(PLAYER_X, this.playerState.y, "player-idle", 0)
      .setDepth(8)
      .setScale(1.32);
    this.player.play("player-idle");

    this.shieldFx = this.add.sprite(this.player.x, this.player.y, "effects", 2).setDepth(9).setVisible(false);
    this.shieldFx.setScale(1.7).setAlpha(0.72).setBlendMode(Phaser.BlendModes.ADD);
  }

  private createInput(): void {
    if (!this.input.keyboard) return;
    this.cursors = this.input.keyboard.createCursorKeys();
    this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.fullscreenKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.escapeKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this.input.on("pointerdown", () => this.requestJump());
    this.input.on("pointerup", () => this.releaseJump());
  }

  private bindUi(): void {
    this.uiHandler = (event: Event) => {
      const command = (event as CustomEvent<UiCommand>).detail;
      if (command.type === "start") this.startRun(command.seed);
      if (command.type === "pause") this.pauseRun();
      if (command.type === "resume") this.resumeRun();
      if (command.type === "jump-down") this.requestJump();
      if (command.type === "jump-up") this.releaseJump();
    };
    gameBus.addEventListener("ui-command", this.uiHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.uiHandler) gameBus.removeEventListener("ui-command", this.uiHandler);
    });
  }

  private startRun(seed = Date.now()): void {
    this.clearProps();
    this.chunkGenerator = new ChunkGenerator(seed);
    this.model.start(seed);
    if (this.debugStartMs > 0) {
      for (let elapsed = 0; elapsed < this.debugStartMs; elapsed += 50) {
        this.model.update(50);
      }
    }
    if (this.debugShield) this.model.collect("signal");
    const snapshot = this.model.snapshot();
    this.playerState = initialPlayerState();
    this.player
      .setPosition(PLAYER_X, this.playerState.y)
      .setAlpha(1)
      .setTint(0xffffff)
      .clearTint()
      .play("player-run", true);
    this.cameraTravel = 0;
    this.groundVisual.tilePositionX = 0;
    this.spawnCursorWorldX = 930;
    this.jumpPressedQueued = false;
    this.jumpReleasedQueued = false;
    this.lastPhase = snapshot.phase;
    this.updatePhase(snapshot.phase, snapshot.phase, true);
    this.spawnAhead(snapshot);
    gameAudio.start();
    emitPublicEvent("run-start", { seed: snapshot.seed });
    this.publish(true);
  }

  private pauseRun(): void {
    const snapshot = this.model.pause();
    if (snapshot.mode === "paused") {
      this.anims.pauseAll();
      this.publish(true);
    }
  }

  private resumeRun(): void {
    const snapshot = this.model.resume();
    if (snapshot.mode === "running") {
      this.anims.resumeAll();
      this.publish(true);
    }
  }

  private requestJump(): void {
    if (this.model.snapshot().mode !== "running") return;
    this.jumpPressedQueued = true;
  }

  private releaseJump(): void {
    this.jumpReleasedQueued = true;
  }

  private updatePlayer(delta: number): void {
    if (this.spaceKey && Phaser.Input.Keyboard.JustDown(this.spaceKey)) this.requestJump();
    if (this.cursors && Phaser.Input.Keyboard.JustDown(this.cursors.up)) this.requestJump();
    if (this.spaceKey && Phaser.Input.Keyboard.JustUp(this.spaceKey)) this.releaseJump();
    if (this.cursors && Phaser.Input.Keyboard.JustUp(this.cursors.up)) this.releaseJump();
    if (this.fullscreenKey && Phaser.Input.Keyboard.JustDown(this.fullscreenKey)) {
      if (this.scale.isFullscreen) this.scale.stopFullscreen();
      else this.scale.startFullscreen();
    }
    if (
      this.escapeKey &&
      Phaser.Input.Keyboard.JustDown(this.escapeKey) &&
      this.model.snapshot().mode === "running"
    ) {
      this.pauseRun();
    }

    const step = stepPlayer(this.playerState, delta, {
      jumpPressed: this.jumpPressedQueued,
      jumpReleased: this.jumpReleasedQueued,
    });
    this.jumpPressedQueued = false;
    this.jumpReleasedQueued = false;
    this.playerState = step;
    this.player.setY(Math.round(step.y));
    if (step.jumped) gameAudio.jump();
  }

  private scrollWorld(snapshot: RunSnapshot, delta: number): void {
    this.cameraTravel += cameraTravelStep(delta, snapshot.elapsedMs, this.paceScale);
    this.groundVisual.tilePositionX = cameraScrollPixels(this.cameraTravel);

    for (const prop of this.props) {
      if (!prop.active) continue;
      if (prop.kind === "agent") {
        prop.approachOffset += agentApproachForDelta(delta, this.paceScale);
      }
      if (prop.kind === "drone") {
        prop.centerY =
          prop.baseCenterY + Math.sin((snapshot.elapsedMs + prop.worldX * 4) / 260) * 12;
      } else {
        prop.centerY = prop.baseCenterY;
      }
      prop.sprite.setPosition(
        screenXForWorld(prop.worldX, this.cameraTravel, prop.approachOffset),
        Math.round(prop.centerY),
      );
    }
  }

  private playerBox(): Box {
    return { cx: this.player.x, cy: this.player.y, w: PLAYER_BOX.w, h: PLAYER_BOX.h };
  }

  private propBox(prop: Prop): Box {
    const size = FOOTPRINT[prop.kind];
    return { cx: prop.sprite.x, cy: prop.sprite.y, w: size.w, h: size.h };
  }

  private checkCollisions(): void {
    const player = this.playerBox();
    for (const prop of this.props) {
      if (!prop.active) continue;
      if (!aabbOverlap(player, this.propBox(prop))) continue;
      if (prop.category === "collectible") {
        this.collect(prop);
      } else if (prop.category === "enemy") {
        if (isStomp(player, this.propBox(prop), this.playerState.vy)) this.stomp(prop);
        else this.resolveHit(prop);
      } else {
        this.resolveHit(prop);
      }
      // A fatal hit ends the run mid-loop; stop touching anything else this frame.
      if (this.model.snapshot().mode !== "running") break;
    }
  }

  private spawnAhead(snapshot: RunSnapshot): void {
    if (!this.chunkGenerator) return;
    while (screenXForWorld(this.spawnCursorWorldX, this.cameraTravel) < SPAWN_AHEAD_X) {
      const chunk = this.chunkGenerator.next(
        snapshot.phase,
        difficultyForElapsed(snapshot.elapsedMs),
      );
      chunk.spawns.forEach((spawn) =>
        this.spawn(spawn.kind, this.spawnCursorWorldX + spawn.x, spawn.lane),
      );
      this.spawnCursorWorldX += chunk.length;
    }
  }

  private acquire(): Prop {
    const free = this.props.find((prop) => !prop.active);
    if (free) return free;
    const sprite = this.add.sprite(0, 0, "objects", 0);
    this.worldLayer.add(sprite);
    const prop: Prop = {
      sprite,
      kind: "token",
      category: "collectible",
      worldX: 0,
      baseCenterY: 0,
      centerY: 0,
      approachOffset: 0,
      active: false,
    };
    this.props.push(prop);
    return prop;
  }

  private spawn(kind: SpawnKind, worldX: number, lane: Lane): void {
    const prop = this.acquire();
    const centerY = centerYForLane(kind, lane);

    if (kind === "agent") {
      prop.category = "enemy";
      prop.sprite.setTexture("agent-run").setScale(1.05).play("agent-run", true);
    } else if (kind === "drone") {
      prop.category = "enemy";
      prop.sprite.setTexture("drone-hover").setScale(0.92).play("drone-hover", true);
    } else if (kind === "barrier" || kind === "crate") {
      prop.category = "hazard";
      prop.sprite
        .setTexture("objects", objectFrame[kind])
        .setScale(kind === "crate" ? 0.92 : 0.82)
        .stop();
    } else {
      prop.category = "collectible";
      prop.sprite
        .setTexture("objects", objectFrame[kind])
        .setScale(kind === "signal" ? 0.8 : 0.7)
        .stop();
    }

    prop.kind = kind;
    prop.worldX = worldX;
    prop.baseCenterY = centerY;
    prop.centerY = centerY;
    prop.approachOffset = 0;
    prop.active = true;
    prop.sprite
      .setActive(true)
      .setVisible(true)
      .setAlpha(1)
      .clearTint()
      .setPosition(screenXForWorld(worldX, this.cameraTravel), Math.round(centerY));
  }

  private release(prop: Prop): void {
    prop.active = false;
    prop.sprite.setActive(false).setVisible(false).stop();
  }

  private collect(prop: Prop): void {
    const kind = prop.kind as CollectibleKind;
    this.release(prop);
    this.model.collect(kind);
    gameAudio.collect(kind);
    this.spawnBurst(prop.sprite.x, prop.sprite.y, kind === "signal" ? 2 : 4, kind === "signal" ? 0x69f8ff : 0xffffff);
    this.publish(true);
  }

  private stomp(prop: Prop): void {
    this.release(prop);
    this.playerState = { ...this.playerState, vy: -460, grounded: false };
    this.model.stomp();
    gameAudio.stomp();
    this.spawnBurst(prop.sprite.x, prop.sprite.y, 1, 0xe33a32);
    this.publish(true);
  }

  private resolveHit(prop: Prop): void {
    const result = this.model.hit(prop.kind);
    if (result.absorbed) {
      this.release(prop);
      gameAudio.shield();
      this.cameras.main.shake(100, 0.007);
      this.player.setTint(0x69f8ff);
      this.time.delayedCall(120, () => this.player.clearTint());
      this.publish(true);
      return;
    }
    this.endRun(prop.kind);
  }

  private endRun(reason: string): void {
    const result = this.model.hit(reason);
    const snapshot = result.snapshot;
    if (snapshot.mode !== "gameover") return;
    this.player.play("player-hurt", true).setTint(0xff726a);
    gameAudio.hit();
    this.cameras.main.shake(280, 0.012);
    emitPublicEvent("run-end", {
      score: snapshot.score,
      highScore: snapshot.highScore,
      distance: Math.floor(snapshot.distance),
      reason,
    });
    this.publish(true);
  }

  private updateAnimation(): void {
    if (this.playerState.grounded) this.player.play("player-run", true);
    else this.player.play("player-jump", true);
  }

  private updatePhase(previous: Phase, next: Phase, force = false): void {
    if (!force && previous === next && this.lastPhase === next) return;
    this.lastPhase = next;
    if (!force) {
      this.cameras.main.flash(240, 105, 248, 255, false, undefined, 0.08);
    }
  }

  private updateShield(snapshot: RunSnapshot): void {
    const visible = snapshot.shieldMs > 0;
    this.shieldFx
      .setVisible(visible)
      .setPosition(this.player.x, this.player.y)
      .setRotation(this.shieldFx.rotation + 0.012);
  }

  private recycleOffscreen(): void {
    for (const prop of this.props) {
      if (!prop.active) continue;
      if (prop.sprite.x < SPAWN_RECYCLE_X) this.release(prop);
    }
  }

  private spawnBurst(x: number, y: number, frame: number, tint: number): void {
    const burst = this.add.sprite(x, y, "effects", frame).setDepth(10).setTint(tint);
    this.tweens.add({
      targets: burst,
      scale: { from: 0.7, to: 1.7 },
      alpha: { from: 1, to: 0 },
      duration: 260,
      onComplete: () => burst.destroy(),
    });
  }

  private clearProps(): void {
    for (const prop of this.props) this.release(prop);
  }

  private publish(force = false): void {
    const snapshot = this.model.snapshot();
    this.debugSnapshot = snapshot;
    if (force || snapshot.elapsedMs - this.lastSnapshotAt >= 0) publishSnapshot(snapshot);
  }
}
