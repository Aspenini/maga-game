import Phaser from "phaser";
import { assetUrls } from "../assets";
import { gameAudio } from "../audio";
import { GAME_HEIGHT, GAME_WIDTH, GROUND_Y, PLAYER_X } from "../constants";
import { emitPublicEvent, gameBus, publishSnapshot, type UiCommand } from "../events";
import { ChunkGenerator } from "../content/chunks";
import { difficultyForElapsed } from "../simulation/progression";
import { RunModel } from "../simulation/runModel";
import type { CollectibleKind, Phase, RunSnapshot, SpawnKind } from "../simulation/types";

type ArcadeSprite = Phaser.Physics.Arcade.Sprite;

const laneY = {
  ground: GROUND_Y - 26,
  low: GROUND_Y - 66,
  mid: GROUND_Y - 132,
  high: GROUND_Y - 200,
} as const;

const objectFrame: Record<Exclude<SpawnKind, "agent" | "drone">, number> = {
  token: 0,
  file: 1,
  signal: 2,
  crate: 4,
  barrier: 5,
};

export class RunnerScene extends Phaser.Scene {
  private model!: RunModel;
  private chunkGenerator!: ChunkGenerator;
  private player!: ArcadeSprite;
  private ground!: Phaser.Physics.Arcade.Image;
  private groundVisual!: Phaser.GameObjects.TileSprite;
  private backgrounds = new Map<Phase, Phaser.GameObjects.Image>();
  private collectibles!: Phaser.Physics.Arcade.Group;
  private hazards!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private shieldFx!: Phaser.GameObjects.Sprite;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey?: Phaser.Input.Keyboard.Key;
  private fullscreenKey?: Phaser.Input.Keyboard.Key;
  private escapeKey?: Phaser.Input.Keyboard.Key;
  private jumpBufferMs = 0;
  private coyoteMs = 0;
  private jumpHeld = false;
  private spawnCursorX = 1080;
  private lastPhase: Phase = "desert";
  private uiHandler?: (event: Event) => void;
  private lastSnapshotAt = 0;
  private debugSnapshot: RunSnapshot | undefined;

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
    this.load.image("bg-desert", assetUrls.desertUrl);
    this.load.image("bg-archive", assetUrls.archiveUrl);
    this.load.image("bg-launch", assetUrls.launchUrl);
  }

  create(): void {
    this.model = new RunModel(this.initialHighScore);
    this.createTextures();
    this.createBackgrounds();
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
    const before = this.model.snapshot();
    const snapshot = this.model.update(delta);
    this.debugSnapshot = snapshot;

    if (snapshot.mode !== "running") {
      this.player.setVelocityX(0);
      return;
    }

    this.updateJump(delta);
    this.scrollWorld(snapshot, delta);
    this.updateAnimation(snapshot);
    this.updatePhase(before.phase, snapshot.phase);
    this.recycleOffscreen();
    this.spawnAhead(snapshot);
    this.updateShield(snapshot);
    gameAudio.tickMusic(snapshot.elapsedMs);

    if (this.player.y > GAME_HEIGHT + 50) {
      this.endRun("signal-lost");
    }

    if (snapshot.elapsedMs - this.lastSnapshotAt > 80) {
      this.lastSnapshotAt = snapshot.elapsedMs;
      this.publish();
    }
  }

  getTextState(): Record<string, unknown> {
    const snapshot = this.model?.snapshot();
    const visible = (group?: Phaser.Physics.Arcade.Group) =>
      group
        ? group
            .getChildren()
            .filter((child) => (child as ArcadeSprite).active)
            .slice(0, 12)
            .map((child) => {
              const sprite = child as ArcadeSprite;
              return {
                kind: sprite.getData("kind"),
                x: Math.round(sprite.x),
                y: Math.round(sprite.y),
              };
            })
        : [];
    return {
      coordinateSystem: "origin top-left; x increases right; y increases down; canvas 960x540",
      ...snapshot,
      player: this.player
        ? {
            x: Math.round(this.player.x),
            y: Math.round(this.player.y),
            velocityY: Math.round(this.player.body?.velocity.y ?? 0),
            grounded: Boolean(this.player.body?.blocked.down),
          }
        : null,
      hazards: visible(this.hazards),
      enemies: visible(this.enemies),
      collectiblesOnScreen: visible(this.collectibles),
    };
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

  private createBackgrounds(): void {
    (["desert", "archive", "launch"] as const).forEach((phase) => {
      const background = this.add
        .image(0, 0, `bg-${phase}`)
        .setOrigin(0)
        .setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
        .setDepth(-20)
        .setAlpha(phase === "desert" ? 1 : 0);
      this.backgrounds.set(phase, background);
    });
    this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.18)
      .setOrigin(0)
      .setDepth(-15);
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
    create("player-run", "player-run", 7, 12);
    create("player-jump", "player-jump", 3, 8);
    create("player-hurt", "player-hurt", 3, 10, 0);
    create("player-celebrate", "player-celebrate", 3, 8);
    create("agent-run", "agent-run", 5, 10);
    create("drone-hover", "drone-hover", 5, 8);
    create("token-spin", "objects", 0, 1);
  }

  private createWorld(): void {
    this.groundVisual = this.add
      .tileSprite(0, GROUND_Y, GAME_WIDTH, GAME_HEIGHT - GROUND_Y, "ground-tile")
      .setOrigin(0)
      .setDepth(4);
    this.ground = this.physics.add
      .staticImage(GAME_WIDTH / 2, GROUND_Y + 34, "ground-tile")
      .setDisplaySize(GAME_WIDTH, 68)
      .setVisible(false);
    this.ground.refreshBody();

    this.collectibles = this.physics.add.group({ allowGravity: false, maxSize: 48 });
    this.hazards = this.physics.add.group({ allowGravity: false, immovable: true, maxSize: 28 });
    this.enemies = this.physics.add.group({ allowGravity: false, immovable: true, maxSize: 20 });

    this.player = this.physics.add
      .sprite(PLAYER_X, GROUND_Y - 58, "player-idle", 0)
      .setDepth(8)
      .setScale(1.32)
      .setCollideWorldBounds(false);
    this.player.body!.setSize(25, 50).setOffset(20, 11);
    this.player.setGravityY(1480);
    this.player.play("player-idle");

    this.shieldFx = this.add.sprite(this.player.x, this.player.y, "effects", 2).setDepth(9).setVisible(false);
    this.shieldFx.setScale(1.7).setAlpha(0.72).setBlendMode(Phaser.BlendModes.ADD);

    this.physics.add.collider(this.player, this.ground);
    this.physics.add.overlap(this.player, this.collectibles, (_player, item) => {
      this.collect(item as ArcadeSprite);
    });
    this.physics.add.overlap(this.player, this.hazards, (_player, hazard) => {
      this.hitHazard(hazard as ArcadeSprite);
    });
    this.physics.add.overlap(this.player, this.enemies, (_player, enemy) => {
      this.hitEnemy(enemy as ArcadeSprite);
    });
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
    this.clearGroups();
    this.chunkGenerator = new ChunkGenerator(seed);
    this.model.start(seed);
    if (this.debugStartMs > 0) {
      for (let elapsed = 0; elapsed < this.debugStartMs; elapsed += 50) {
        this.model.update(50);
      }
    }
    if (this.debugShield) this.model.collect("signal");
    const snapshot = this.model.snapshot();
    this.player
      .setPosition(PLAYER_X, GROUND_Y - 58)
      .setVelocity(0, 0)
      .setAlpha(1)
      .setTint(0xffffff)
      .play("player-run", true);
    this.player.body!.enable = true;
    this.spawnCursorX = 930;
    this.jumpBufferMs = 0;
    this.coyoteMs = 0;
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
      this.physics.pause();
      this.anims.pauseAll();
      this.publish(true);
    }
  }

  private resumeRun(): void {
    const snapshot = this.model.resume();
    if (snapshot.mode === "running") {
      this.physics.resume();
      this.anims.resumeAll();
      this.publish(true);
    }
  }

  private requestJump(): void {
    if (this.model.snapshot().mode !== "running") return;
    this.jumpBufferMs = 140;
    this.jumpHeld = true;
  }

  private releaseJump(): void {
    this.jumpHeld = false;
    if (this.player?.body && this.player.body.velocity.y < -280) {
      this.player.setVelocityY(-280);
    }
  }

  private updateJump(delta: number): void {
    const body = this.player.body;
    if (!body) return;
    const keyDown = Boolean(
      this.spaceKey?.isDown || this.cursors?.up.isDown,
    );
    if (Phaser.Input.Keyboard.JustDown(this.spaceKey!) || Phaser.Input.Keyboard.JustDown(this.cursors!.up)) {
      this.requestJump();
    }
    if (!keyDown && this.jumpHeld && (this.spaceKey || this.cursors)) {
      this.releaseJump();
    }
    if (Phaser.Input.Keyboard.JustDown(this.fullscreenKey!)) {
      if (this.scale.isFullscreen) this.scale.stopFullscreen();
      else this.scale.startFullscreen();
    }
    if (Phaser.Input.Keyboard.JustDown(this.escapeKey!) && this.model.snapshot().mode === "running") {
      this.pauseRun();
    }

    if (body.blocked.down || body.touching.down) this.coyoteMs = 110;
    else this.coyoteMs = Math.max(0, this.coyoteMs - delta);
    this.jumpBufferMs = Math.max(0, this.jumpBufferMs - delta);

    if (this.jumpBufferMs > 0 && this.coyoteMs > 0) {
      this.player.setVelocityY(-690);
      this.jumpBufferMs = 0;
      this.coyoteMs = 0;
      gameAudio.jump();
    }
  }

  private scrollWorld(snapshot: RunSnapshot, delta: number): void {
    const move = (snapshot.speed * delta) / 1000;
    this.spawnCursorX -= move;
    this.groundVisual.tilePositionX += move;

    [this.collectibles, this.hazards, this.enemies].forEach((group) => {
      group.getChildren().forEach((child) => {
        const sprite = child as ArcadeSprite;
        if (!sprite.active) return;
        sprite.x -= move;
        sprite.body?.updateFromGameObject();
        if (sprite.getData("kind") === "drone") {
          const baseY = sprite.getData("baseY") as number;
          sprite.y = baseY + Math.sin((snapshot.elapsedMs + sprite.x * 4) / 260) * 12;
        }
      });
    });
  }

  private spawnAhead(snapshot: RunSnapshot): void {
    if (!this.chunkGenerator) return;
    while (this.spawnCursorX < 1260) {
      const chunk = this.chunkGenerator.next(
        snapshot.phase,
        difficultyForElapsed(snapshot.elapsedMs),
      );
      chunk.spawns.forEach((spawn) => this.spawn(spawn.kind, this.spawnCursorX + spawn.x, laneY[spawn.lane]));
      this.spawnCursorX += chunk.length;
    }
  }

  private spawn(kind: SpawnKind, x: number, y: number): void {
    let sprite: ArcadeSprite | null = null;
    if (kind === "agent") {
      sprite = this.enemies.get(x, y, "agent-run") as ArcadeSprite | null;
      sprite?.play("agent-run", true);
      sprite?.setScale(1.05);
    } else if (kind === "drone") {
      sprite = this.enemies.get(x, y, "drone-hover") as ArcadeSprite | null;
      sprite?.play("drone-hover", true);
      sprite?.setScale(0.92);
      sprite?.setData("baseY", y);
    } else if (kind === "barrier" || kind === "crate") {
      sprite = this.hazards.get(x, y, "objects", objectFrame[kind]) as ArcadeSprite | null;
      sprite?.setScale(kind === "crate" ? 0.92 : 0.82);
    } else {
      sprite = this.collectibles.get(x, y, "objects", objectFrame[kind]) as ArcadeSprite | null;
      sprite?.setScale(kind === "signal" ? 0.8 : 0.7);
    }
    if (!sprite) return;
    sprite
      .setActive(true)
      .setVisible(true)
      .setPosition(x, y)
      .setDepth(7)
      .setAlpha(1)
      .clearTint()
      .setData("kind", kind);
    sprite.body!.enable = true;
    sprite.body!.setSize(kind === "drone" ? 40 : 34, kind === "agent" ? 52 : 36);
    if (kind === "token" || kind === "file" || kind === "signal") {
      this.tweens.add({
        targets: sprite,
        angle: { from: -4, to: 4 },
        duration: 480,
        yoyo: true,
        repeat: -1,
      });
    }
  }

  private collect(item: ArcadeSprite): void {
    if (!item.active) return;
    const kind = item.getData("kind") as CollectibleKind;
    item.disableBody(true, true);
    this.model.collect(kind);
    gameAudio.collect(kind);
    this.spawnBurst(item.x, item.y, kind === "signal" ? 2 : 4, kind === "signal" ? 0x69f8ff : 0xffffff);
    this.publish(true);
  }

  private hitHazard(hazard: ArcadeSprite): void {
    if (!hazard.active) return;
    const kind = String(hazard.getData("kind"));
    this.resolveHit(kind, hazard);
  }

  private hitEnemy(enemy: ArcadeSprite): void {
    if (!enemy.active) return;
    const body = this.player.body;
    const enemyBody = enemy.body;
    const descending = (body?.velocity.y ?? 0) > 120;
    const playerBottom = body?.bottom ?? this.player.y + 30;
    const enemyTop = enemyBody?.top ?? enemy.y - 30;
    if (descending && playerBottom < enemyTop + 28) {
      enemy.disableBody(true, true);
      this.player.setVelocityY(-460);
      this.model.stomp();
      gameAudio.stomp();
      this.spawnBurst(enemy.x, enemy.y, 1, 0xe33a32);
      this.publish(true);
      return;
    }
    this.resolveHit(String(enemy.getData("kind")), enemy);
  }

  private resolveHit(reason: string, source: ArcadeSprite): void {
    const result = this.model.hit(reason);
    if (result.absorbed) {
      source.disableBody(true, true);
      gameAudio.shield();
      this.cameras.main.shake(100, 0.007);
      this.player.setTint(0x69f8ff);
      this.time.delayedCall(120, () => this.player.clearTint());
      this.publish(true);
      return;
    }
    this.endRun(reason);
  }

  private endRun(reason: string): void {
    const result = this.model.hit(reason);
    const snapshot = result.snapshot;
    if (snapshot.mode !== "gameover") return;
    this.player.play("player-hurt", true).setVelocity(0, -300).setTint(0xff726a);
    this.player.body!.enable = false;
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

  private updateAnimation(snapshot: RunSnapshot): void {
    if (snapshot.mode !== "running") return;
    const grounded = Boolean(this.player.body?.blocked.down);
    if (!grounded) this.player.play("player-jump", true);
    else this.player.play("player-run", true);
  }

  private updatePhase(previous: Phase, next: Phase, force = false): void {
    if (!force && previous === next && this.lastPhase === next) return;
    this.lastPhase = next;
    this.backgrounds.forEach((background, phase) => {
      this.tweens.killTweensOf(background);
      this.tweens.add({
        targets: background,
        alpha: phase === next ? 1 : 0,
        duration: force ? 0 : 900,
      });
    });
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
    [this.collectibles, this.hazards, this.enemies].forEach((group) => {
      group.getChildren().forEach((child) => {
        const sprite = child as ArcadeSprite;
        if (sprite.active && sprite.x < -90) {
          this.tweens.killTweensOf(sprite);
          sprite.disableBody(true, true);
        }
      });
    });
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

  private clearGroups(): void {
    [this.collectibles, this.hazards, this.enemies].forEach((group) => {
      group.getChildren().forEach((child) => {
        const sprite = child as ArcadeSprite;
        this.tweens.killTweensOf(sprite);
        sprite.disableBody(true, true);
      });
    });
  }

  private publish(force = false): void {
    const snapshot = this.model.snapshot();
    this.debugSnapshot = snapshot;
    if (force || snapshot.elapsedMs - this.lastSnapshotAt >= 0) publishSnapshot(snapshot);
  }
}
