import Phaser from 'phaser';
import { COLORS, DEFAULT_WORDS, ROOM_NAMES, wordGroups, type Word, type WeaponKind } from './data';
import { resolveStrike } from './progress';
import { GameAudio } from './audio';
import { renderingScale } from './rendering';
import { ENVIRONMENTS, paintEnvironment, paintDefenseEnvironment, type Environment } from './environments';
import { arrowCount, bossUpgradeOptions, emptyWeaponLevels, experienceNeeded, spawnInterval, upgradeOptions, ROOM_REWARD_INTERVAL, BOSS_UPGRADE_INTERVAL, MINI_BOSS_REWARD_INTERVAL, type UpgradeId, type UpgradeOption, type BossUpgradeId, type BossUpgradeOption } from './upgrades';

export const WIDTH = 1040;
export const HEIGHT = 620;
const FONT = '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
const MINI_BOSS_GAP = 160;
type EnemyKind = 'chaser' | 'charger' | 'caster';
export type RunMode = 'campaign' | 'boss';
interface Enemy {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  label: Phaser.GameObjects.Text;
  ring: Phaser.GameObjects.Arc;
  healthBar: Phaser.GameObjects.Graphics;
  word: Word;
  hp: number;
  maxHp: number;
  shielded: boolean;
  kind: EnemyKind;
  attackAt: number;
  staggerUntil: number;
  chargeUntil: number;
  chargeX: number;
  chargeY: number;
  knockbackX: number;
  knockbackY: number;
  dead: boolean;
  boss: boolean;
  lane?: number;
  miniBoss?: boolean;
}
interface Shot { object: Phaser.GameObjects.Arc | Phaser.GameObjects.Graphics; vx: number; vy: number; expires: number; word?: Word; trailAt?: number; secondary?: boolean; pierce?: number; struck?: Set<Enemy>; attackId?: number; guided?: number; target?: Enemy; targetWordId?: string; bossFinisher?: boolean; }
interface Gem { object: Phaser.GameObjects.Rectangle; born: number; value: number; }
interface SpawnOrder { word: Word; kind: EnemyKind; side: number; }
export interface Snapshot {
  hp: number; maxHp: number; score: number; combo: number; kills: number;
  room: number; totalRooms: number; roomName: string; words: Word[]; slot: number;
  remaining: number; elapsed: number; dash: number; boss: boolean; bossSeals: number; totalSeals: number; environment: Environment;
  alive: number; incoming: number; spawnEvery: number; nextSide: number | null;
  level: number; xp: number; xpNeeded: number; upgrades: Record<WeaponKind, number>; attackBoost: number; haste: number; burst: number; charge: number;
  mode: RunMode; bossArrows: number; bossMinions: number; bossColumns: number; bossRoundKills: number; bossKillGoal: number;
  bossFireInterval: number; bossGuided: number; bossLeaks: number;
  bossAutoFire: boolean; miniBosses: number;
}
export type GameEvent =
  | { type: 'ready' }
  | { type: 'state'; state: Snapshot }
  | { type: 'attempt'; word: Word; result: 'correct' | 'wrong' }
  | { type: 'toast'; text: string }
  | { type: 'clear'; room: number }
  | { type: 'upgrade'; options: UpgradeOption[]; level: number }
  | { type: 'bossUpgrade'; options: BossUpgradeOption[]; round: number; source?: 'round' | 'miniboss' }
  | { type: 'finish'; won: boolean; state: Snapshot };

export class DungeonScene extends Phaser.Scene {
  private emit: (event: GameEvent) => void;
  readonly audio = new GameAudio();
  private player!: Phaser.GameObjects.Sprite;
  private playerHealthBar!: Phaser.GameObjects.Graphics;
  private playerHealthLabel!: Phaser.GameObjects.Text;
  private playerMoving = false;
  private shadow!: Phaser.GameObjects.Ellipse;
  private held!: Phaser.GameObjects.Image;
  private nockedArrow!: Phaser.GameObjects.Graphics;
  private aimLine!: Phaser.GameObjects.Graphics;
  private movementMarker!: Phaser.GameObjects.Graphics;
  private moveTarget: { x: number; y: number } | null = null;
  private lockedTarget: Enemy | null = null;
  private attackTarget: Enemy | null = null;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private enemies: Enemy[] = [];
  private shots: Shot[] = [];
  private decoration!: Phaser.GameObjects.Container;
  private floor!: Phaser.GameObjects.Graphics;
  private backdrop!: Phaser.GameObjects.Image;
  private door!: Phaser.GameObjects.Container;
  private words: Word[] = DEFAULT_WORDS;
  private groups: Word[][] = wordGroups(DEFAULT_WORDS);
  private equipped: Word[] = DEFAULT_WORDS.slice(0, 3);
  private slot = 0;
  private room = 0;
  private bossOrder: Word[] = [];
  private bossIndex = 0;
  private mode: RunMode = 'campaign';
  private bossArrows = 1;
  private bossFireSpeed = 1;
  private bossGuided = 0;
  private bossLeaks = 0;
  private bossLaunched = 0;
  private bossRoundKills = 0;
  private bossTransition = false;
  private bossUpgradeOpen = false;
  private bossUpgradeSource: 'round' | 'miniboss' = 'round';
  private pendingBossRewards = 0;
  private nextMiniBossAt = 2;
  private miniBossSerial = 0;
  private miniBossKills = 0;
  private bossAutoFire = true;
  private attackSerial = 0;
  private penalizedAttacks = new Set<number>();
  private bossGuardToastAt = -1000;
  private hp = 100;
  private maxHp = 100;
  private score = 0;
  private combo = 0;
  private kills = 0;
  private running = false;
  private paused = false;
  private finished = false;
  private elapsed = 0;
  private nextAttack = 0;
  private nextDash = 0;
  private dashUntil = 0;
  private dashX = 0;
  private dashY = 0;
  private invulnerableUntil = 0;
  private stunUntil = 0;
  private angle = -Math.PI / 2;
  private attackBoost = 0;
  private haste = 1;
  private clock = 0;
  private lastState = 0;
  private roomComplete = false;
  private hitStopRemaining = 0;
  private attackStarted = -1000;
  private arenaWidth = WIDTH;
  private arenaHeight = HEIGHT;
  private arenaBottom = HEIGHT - 110;
  private arenaTop = 135;
  private gates!: Phaser.GameObjects.Graphics;
  private spawnQueue: SpawnOrder[] = [];
  private spawnWarning: { order: SpawnOrder; at: number; marker: Phaser.GameObjects.Arc } | null = null;
  private nextSpawnAt = 0;
  private roomStarted = 0;
  private gems: Gem[] = [];
  private level = 1;
  private xp = 0;
  private pendingUpgrades = 0;
  private upgradeOpen = false;
  private weaponLevels = emptyWeaponLevels();
  private swingCount = 0;
  private burstUntil = 0;
  private charge = 0;

  constructor(emit: (event: GameEvent) => void, private renderScale = 1) { super('dungeon'); this.emit = emit; }

  preload() {
    for (const theme of ['defense', 'meadow', 'library', 'forge', 'frost']) this.load.image(`background-${theme}`, `/assets/art/${theme}.png`);
    for (const atlas of ['characters', 'weapons']) {
      this.load.image(`${atlas}-source`, `/assets/art/${atlas}.png`);
      this.load.json(`${atlas}-frames`, `/assets/art/${atlas}.json`);
    }
  }

  create() {
    for (const atlas of ['characters', 'weapons']) this.prepareAtlas(atlas);
    this.backdrop = this.add.image(0, 0, 'background-meadow').setOrigin(0).setDepth(-20);
    this.floor = this.add.graphics().setDepth(-10);
    this.decoration = this.add.container(0, 0).setDepth(-5);
    this.door = this.add.container(WIDTH / 2, 62).setDepth(-4);
    this.gates = this.add.graphics().setDepth(-2);
    this.resizeArena();
    this.scale.on('resize', this.resizeArena, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.resizeArena, this));
    this.shadow = this.add.ellipse(520, 490, 31, 12, 0x000000, .5);
    this.player = this.add.sprite(520, 480, 'characters', 'hero').setDisplaySize(43, 54).setDepth(500);
    this.playerHealthBar = this.add.graphics().setDepth(805).setVisible(false);
    this.playerHealthLabel = this.add.text(520, 437, '', { resolution: 3, fontFamily: FONT, fontSize: '12px', color: '#e0fff3', stroke: '#09151a', strokeThickness: 3 }).setOrigin(.5, 1).setDepth(806).setVisible(false);
    this.held = this.add.image(545, 472, 'weapons', 'sword').setDisplaySize(17, 34).setOrigin(.5, .85).setDepth(502);
    this.nockedArrow = this.add.graphics().setVisible(false);
    this.aimLine = this.add.graphics().setDepth(499);
    this.movementMarker = this.add.graphics().setDepth(-1);
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,SHIFT,ONE,TWO,THREE') as Record<string, Phaser.Input.Keyboard.Key>;
    // Let form inputs receive keystrokes; capture gameplay keys only while running.
    this.input.keyboard!.clearCaptures();
    for (const [index, key] of ['ONE', 'TWO', 'THREE'].entries()) {
      this.input.keyboard!.on(`keydown-${key}`, () => {
        if (this.running && !this.paused && !this.finished && !this.roomComplete) this.equip(index);
      });
    }
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonDown() || !this.running || this.paused || this.finished || this.roomComplete) return;
      this.audio.unlock();
      const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.attackTarget = null;
      // Clicking a creature selects it, without selecting the correct word for you.
      this.lockedTarget = this.enemies.filter(enemy => !enemy.dead && (Phaser.Math.Distance.Between(point.x, point.y, enemy.sprite.x, enemy.sprite.y) < (enemy.boss ? 58 : 40) || enemy.label.getBounds().contains(point.x, point.y)))
        .sort((a, b) => Phaser.Math.Distance.Between(point.x, point.y, a.sprite.x, a.sprite.y) - Phaser.Math.Distance.Between(point.x, point.y, b.sprite.x, b.sprite.y))[0] ?? null;
      this.moveTarget = null;
      this.movementMarker.clear();
      if (!this.lockedTarget) {
        this.moveTarget = { x: Phaser.Math.Clamp(point.x, 78, this.arenaWidth - 78), y: Phaser.Math.Clamp(point.y, this.arenaTop, this.arenaBottom) };
        const dx = this.moveTarget.x - this.player.x, dy = this.moveTarget.y - this.player.y;
        this.playerMoving = Math.hypot(dx, dy) > .5;
        if (this.playerMoving) {
          this.angle = Math.atan2(dy, dx);
          if (this.isBossRoom()) this.holdBossFire();
        }
        this.showMovementMarker(this.moveTarget.x, this.moveTarget.y);
      } else {
        this.angle = Math.atan2(this.lockedTarget.sprite.y - this.player.y, this.lockedTarget.sprite.x - this.player.x);
      }
      this.sendState();
    });
    this.player.setPosition(this.arenaWidth / 2, (this.arenaTop + this.arenaBottom) / 2);
    this.shadow.setPosition(this.player.x, this.player.y + 19).setDepth(this.player.y - 1);
    this.held.setPosition(this.player.x, this.player.y - 15).setDepth(this.player.y + 5);
    this.sendState();
    this.emit({ type: 'ready' });
  }

  private prepareAtlas(key: string) {
    // Power-of-two backing textures enable smooth mipmapped sampling of small figures.
    // This pads the GPU texture only; the source images and atlas coordinates stay intact.
    const image = this.textures.get(`${key}-source`).getSourceImage();
    if (!(image instanceof HTMLImageElement) && !(image instanceof HTMLCanvasElement)) throw new Error(`Invalid image atlas: ${key}`);
    const canvas = document.createElement('canvas');
    canvas.width = Phaser.Math.Pow2.GetNext(image.width); canvas.height = Phaser.Math.Pow2.GetNext(image.height);
    canvas.getContext('2d')!.drawImage(image, 0, 0);
    const texture = this.textures.addCanvas(key, canvas)!;
    const frames = this.cache.json.get(`${key}-frames`).frames as Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
    for (const [name, { frame }] of Object.entries(frames)) texture.add(name, 0, frame.x, frame.y, frame.w, frame.h);
    this.textures.remove(`${key}-source`);
  }

  private paintRoom() {
    const environment = this.isBossRoom() ? 'defense' : ENVIRONMENTS[this.room % 4];
    this.backdrop.setTexture(`background-${environment}`).setVisible(!this.isBossRoom()).setOrigin(.5).setPosition(this.arenaWidth / 2, this.arenaHeight / 2);
    const image = this.backdrop.texture.getSourceImage();
    this.backdrop.setScale(Math.max(this.arenaWidth / image.width, this.arenaHeight / image.height));
    if (this.isBossRoom()) {
      this.floor.setScale(1); this.decoration.setScale(1);
      paintDefenseEnvironment(this, this.floor, this.decoration, this.door, this.defenseField());
    } else {
      paintEnvironment(this, this.floor, this.decoration, this.door, ENVIRONMENTS[this.room % 4]);
      this.floor.setScale(this.arenaWidth / WIDTH, this.arenaHeight / HEIGHT);
      this.decoration.setScale(this.arenaWidth / WIDTH, this.arenaHeight / HEIGHT);
    }
    this.door.setPosition(this.arenaWidth / 2, 62);
    this.paintGates();
  }

  private defenseField() {
    const midY = (this.arenaTop + this.arenaBottom) / 2;
    const laneGap = Math.min(96, Math.max(52, (this.arenaBottom - this.arenaTop - 130) / 3));
    return { width: this.arenaWidth, height: this.arenaHeight, goalX: 110, bossX: this.arenaWidth - 100,
      playerX: Math.max(210, this.arenaWidth * .23), midY, laneGap, roadTop: midY - laneGap * 1.5 - 32, roadBottom: midY + laneGap * 1.5 + 32 };
  }

  private resizeArena() {
    const bounds = this.game.canvas.parentElement!.getBoundingClientRect();
    const density = renderingScale(bounds.width, bounds.height);
    if (Math.abs(density - this.renderScale) > .005) {
      this.renderScale = density;
      // EXPAND reads these base dimensions each time it recomputes the framebuffer.
      Object.assign(this.game.config, { width: WIDTH * density, height: HEIGHT * density });
      this.scale.refresh(); return;
    }
    const previousField = this.defenseField();
    this.arenaWidth = this.scale.gameSize.width / this.renderScale;
    this.arenaHeight = this.scale.gameSize.height / this.renderScale;
    this.cameras.main.setZoom(this.renderScale).setScroll((this.arenaWidth - this.scale.gameSize.width) / 2, (this.arenaHeight - this.scale.gameSize.height) / 2);
    const hud = document.querySelector<HTMLElement>('.bottom-hud');
    this.arenaBottom = this.arenaHeight - Math.max(110, ((hud?.offsetHeight ?? 130) + 35) * this.scale.displayScale.y / this.renderScale);
    const status = document.querySelector<HTMLElement>('.arena-status');
    this.arenaTop = Math.max(135, ((status?.offsetTop ?? 100) + (status?.offsetHeight ?? 20) + 45) * this.scale.displayScale.y / this.renderScale);
    if (this.player) {
      this.player.setPosition(Phaser.Math.Clamp(this.player.x, 78, this.arenaWidth - 78), Phaser.Math.Clamp(this.player.y, this.arenaTop, this.arenaBottom));
      this.drawPlayerHealth();
      this.moveTarget = null; this.movementMarker.clear();
      const field = this.defenseField();
      for (const enemy of this.enemies) if (!enemy.dead) {
        if (this.isBossRoom()) {
          const progress = (enemy.sprite.x - previousField.goalX) / (previousField.bossX - previousField.goalX);
          enemy.sprite.setPosition(enemy.boss ? field.bossX : field.goalX + progress * (field.bossX - field.goalX), field.midY + (enemy.lane ?? 0) * field.laneGap);
        } else enemy.sprite.setPosition(Phaser.Math.Clamp(enemy.sprite.x, 92, this.arenaWidth - 92), Phaser.Math.Clamp(enemy.sprite.y, this.arenaTop, this.arenaBottom - 25));
        this.drawEnemyHealth(enemy);
      }
    }
    if (this.floor) this.paintRoom();
    if (this.spawnWarning) {
      const position = this.gatePosition(this.spawnWarning.order.side);
      this.spawnWarning.marker.setPosition(position.x, position.y);
    }
  }

  private gatePosition(side: number) {
    const midY = (this.arenaTop + 20 + this.arenaBottom - 28) / 2;
    return [{ x: this.arenaWidth / 2, y: this.arenaTop + 20 }, { x: this.arenaWidth - 110, y: midY }, { x: this.arenaWidth / 2, y: this.arenaBottom - 28 }, { x: 110, y: midY }][side];
  }

  private paintGates() {
    this.gates.clear();
  }

  start(words: Word[], mode: RunMode = 'campaign') {
    this.audio.unlock();
    this.time.removeAllEvents();
    this.time.paused = false; this.tweens.resumeAll();
    this.words = words; this.groups = wordGroups(words); this.mode = mode;
    this.room = mode === 'boss' ? this.groups.length : 0; this.hp = this.maxHp = 100;
    this.score = this.combo = this.kills = this.elapsed = this.clock = this.lastState = 0;
    this.attackBoost = 0; this.haste = 1; this.paused = false; this.finished = false;
    this.nextAttack = this.nextDash = this.dashUntil = this.invulnerableUntil = this.stunUntil = 0;
    this.hitStopRemaining = 0; this.attackStarted = -1000;
    this.playerMoving = false;
    this.level = 1; this.xp = this.pendingUpgrades = 0; this.upgradeOpen = false;
    this.weaponLevels = emptyWeaponLevels(); this.swingCount = this.burstUntil = this.charge = 0;
    this.bossIndex = 0; this.bossArrows = 1; this.bossLaunched = this.bossRoundKills = 0;
    this.bossFireSpeed = 1; this.bossGuided = this.bossLeaks = 0;
    this.pendingBossRewards = this.miniBossSerial = this.miniBossKills = 0; this.nextMiniBossAt = 2; this.bossAutoFire = true;
    this.bossTransition = this.bossUpgradeOpen = false; this.bossGuardToastAt = -1000;
    this.attackSerial = 0; this.penalizedAttacks.clear();
    this.running = true;
    this.input.keyboard!.addCapture(['SPACE', 'UP', 'DOWN', 'LEFT', 'RIGHT']);
    this.loadRoom();
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    this.moveTarget = null; this.lockedTarget = null; this.attackTarget = null; this.movementMarker.clear();
    this.time.paused = paused;
    if (paused) { this.tweens.pauseAll(); this.input.keyboard!.clearCaptures(); }
    else { this.tweens.resumeAll(); if (this.running) this.input.keyboard!.addCapture(['SPACE', 'UP', 'DOWN', 'LEFT', 'RIGHT']); }
    this.input.keyboard!.resetKeys();
  }

  isRunning() { return this.running && !this.finished; }
  getPlayerAnchor() {
    return { x: this.player.x / this.arenaWidth, y: this.player.y / this.arenaHeight, head: 48 / this.arenaHeight };
  }

  showUpgradeEffect(title: string, color: string) {
    this.audio.play('break');
    const glow = this.add.circle(this.player.x, this.player.y, 32).setStrokeStyle(3, Phaser.Display.Color.HexStringToColor(color).color).setDepth(804);
    this.tweens.add({ targets: glow, scale: 2.3, alpha: 0, duration: 650, onComplete: () => glow.destroy() });
    this.burst(this.player.x, this.player.y, Phaser.Display.Color.HexStringToColor(color).color, 16);
    this.floatText(this.player.x, this.player.y - 65, `${title} 강화!`, color);
  }

  equip(slot: number) {
    if (!this.equipped[slot]) return;
    this.slot = slot; this.held.setTexture('weapons', this.equipped[slot].kind); this.updateHeldWeapon(); this.sendState();
  }

  private applyUpgrade(reward: UpgradeId) {
    if (reward === 'heal') { this.maxHp += 10; this.hp = Math.min(this.maxHp, this.hp + 35); }
    else if (reward === 'power') this.attackBoost += 8;
    else if (reward === 'haste') this.haste = Math.min(2.2, this.haste + .16);
    else this.weaponLevels[reward] = Math.min(2, this.weaponLevels[reward] + 1);
    this.sendState();
  }

  getUpgradeOptions() { return upgradeOptions(this.weaponLevels, this.words.map(word => word.kind)); }

  chooseUpgrade(reward: UpgradeId) {
    if (!this.upgradeOpen || !this.getUpgradeOptions().some(option => option.id === reward)) return;
    this.applyUpgrade(reward); this.pendingUpgrades--; this.upgradeOpen = false;
    this.setPaused(false);
  }

  chooseBossUpgrade(choice: BossUpgradeId) {
    if (!this.bossUpgradeOpen || !bossUpgradeOptions(this.bossFireSpeed, this.bossGuided, this.bossArrows).some(option => option.id === choice)) return;
    if (choice === 'speed') this.bossFireSpeed += .3;
    else if (choice === 'guided') this.bossGuided++;
    else this.bossArrows++;
    this.bossUpgradeOpen = false;
    if (this.bossUpgradeSource === 'round') this.beginBossRound();
    else { this.pendingBossRewards--; this.nextAttack = this.clock + 1000; }
    this.setPaused(false); this.sendState();
  }

  chooseReward(reward?: UpgradeId) {
    if (!this.roomComplete) return;
    const rewardRoom = (this.room + 1) % ROOM_REWARD_INTERVAL === 0;
    if (rewardRoom && (!reward || !this.getUpgradeOptions().some(option => option.id === reward))) return;
    if (rewardRoom) this.applyUpgrade(reward!);
    // A small heal between rooms keeps a first run forgiving.
    this.hp = Math.min(this.maxHp, this.hp + 10);
    this.room++; this.setPaused(false); this.loadRoom();
  }

  private clearEntities() {
    for (const e of this.enemies) { e.dead = true; this.tweens.killTweensOf([e.sprite, e.shadow, e.label, e.ring]); e.sprite.destroy(); e.shadow.destroy(); e.label.destroy(); e.ring.destroy(); e.healthBar.destroy(); }
    for (const shot of this.shots) shot.object.destroy();
    for (const gem of this.gems) gem.object.destroy();
    if (this.spawnWarning) { this.tweens.killTweensOf(this.spawnWarning.marker); this.spawnWarning.marker.destroy(); }
    this.gems = []; this.spawnQueue = []; this.spawnWarning = null;
    this.enemies = []; this.shots = [];
  }

  private loadRoom() {
    this.clearEntities(); this.roomComplete = false; this.combo = 0;
    this.hitStopRemaining = 0; this.attackStarted = -1000;
    this.moveTarget = null; this.lockedTarget = null; this.attackTarget = null; this.movementMarker.clear();
    this.player.setPosition(this.arenaWidth / 2, (this.arenaTop + this.arenaBottom) / 2).setAlpha(1); this.angle = -Math.PI / 2;
    this.roomStarted = this.clock; this.nextSpawnAt = this.clock + 2000;
    this.burstUntil = 0; this.charge = 0;
    this.invulnerableUntil = this.clock + 2200;
    this.nextAttack = this.clock + 800;
    this.paintRoom();
    if (this.room < this.groups.length) {
      this.equipped = this.groups[this.room];
      const sequence = Array.from({ length: 3 }, () => Phaser.Utils.Array.Shuffle([...this.equipped])).flat();
      this.spawnQueue = sequence.map((word, index) => ({ word, kind: (['chaser', 'charger', 'caster'] as EnemyKind[])[(index + this.room) % 3], side: (index + this.room) % 4 }));
    } else {
      this.bossIndex = 0;
      this.bossOrder = this.groups.flatMap(group => Phaser.Utils.Array.Shuffle([...group]));
      this.bossArrows = 1; this.bossUpgradeOpen = false;
      this.bossFireSpeed = 1; this.bossGuided = this.bossLeaks = 0;
      this.pendingBossRewards = this.miniBossSerial = this.miniBossKills = 0; this.bossAutoFire = true;
      const field = this.defenseField();
      this.player.setPosition(field.playerX, field.midY); this.angle = 0;
      this.spawnEnemy(this.bossOrder[0], 'charger', field.bossX, field.midY, true);
      this.beginBossRound();
    }
    this.equip(0); this.banner(this.room < this.groups.length ? `CHAMBER ${String(this.room + 1).padStart(2, '0')}` : 'THE FINAL GUARDIAN', this.roomTitle());
    this.sendState();
  }

  private roomTitle() { return this.room < this.groups.length ? ROOM_NAMES[this.room % ROOM_NAMES.length] : '기억을 삼킨 수호자'; }

  private isBossRoom() { return this.room >= this.groups.length; }

  private bossMinionsRemaining() {
    return this.enemies.filter(enemy => !enemy.dead && !enemy.boss).length;
  }

  private bossColumns() { return Math.min(4, 1 + Math.floor(this.bossIndex / 3)); }
  private bossKillGoal() { return this.bossColumns() * 3; }
  private bossSpawnInterval() { return 1800 - (this.bossColumns() - 1) * 200; }
  private bossGuarded() { return this.bossRoundKills < this.bossKillGoal() || this.enemies.some(enemy => !enemy.dead && enemy.miniBoss); }

  private holdBossFire() {
    this.bossAutoFire = false;
    for (const shot of this.shots) if (shot.word) shot.object.destroy();
    this.shots = this.shots.filter(shot => !shot.word);
  }

  private beginBossRound() {
    const boss = this.enemies.find(enemy => enemy.boss && !enemy.dead);
    if (!boss) return;
    this.bossTransition = false; this.bossLaunched = this.bossRoundKills = 0;
    this.nextMiniBossAt = 2;
    this.nextAttack = this.clock + 1400;
    boss.word = this.bossOrder[this.bossIndex]; boss.shielded = true;
    boss.ring.setVisible(true).setStrokeStyle(2, 0xb9a2e8, .65); boss.label.setText(boss.word.meaning).setColor('#ebe7f6');
    boss.attackAt = this.clock + 1400; boss.staggerUntil = 0;
    // Keep vocabulary identity while giving every boss weapon a ranged form.
    this.equipped = this.groups[Math.floor(this.bossIndex / 3)].map(word => ({ ...word, kind: 'bow' }));
    this.lockedTarget = this.attackTarget = null; this.equip(0);
    this.banner(`ROUND ${this.bossIndex + 1} / ${this.bossOrder.length}`, `${this.bossColumns()}열 지원군 · ${this.bossKillGoal()}마리 처치하면 보스 봉인 개방`);
  }

  private launchBossMinion(boss: Enemy) {
    // Stagger parallel lanes instead of launching creatures at the player.
    const columns = this.bossColumns(), lane = this.bossLaunched % columns;
    if (this.bossMinionsRemaining() >= 24) { boss.attackAt = this.clock + 450; return; }
    const field = this.defenseField();
    const x = boss.sprite.x - 105;
    const live = this.enemies.filter(enemy => !enemy.dead && !enemy.boss);
    const miniWord = this.equipped.filter(word => word.id !== boss.word.id);
    const alternatives = miniWord.length ? miniWord : this.words.filter(word => word.id !== boss.word.id);
    const miniBoss = this.bossLaunched >= this.nextMiniBossAt && this.bossRoundKills < this.bossKillGoal() && !live.some(enemy => enemy.miniBoss) && alternatives.length > 0;
    // Reserve an empty stretch on both sides of the orange challenger.
    if (live.some(enemy => (miniBoss || enemy.miniBoss) && enemy.sprite.x > x - MINI_BOSS_GAP - 25)) { boss.attackAt = this.clock + 200; return; }
    const y = field.midY + (lane - (columns - 1) / 2) * field.laneGap;
    const word = miniBoss ? alternatives[this.miniBossSerial % alternatives.length] : boss.word;
    if (miniBoss && !this.equipped.some(weapon => weapon.id === word.id)) this.equipped = [...this.equipped, { ...word, kind: 'bow' }];
    const minion = this.spawnEnemy(word, this.bossLaunched % 2 ? 'charger' : 'chaser', x, y);
    minion.miniBoss = miniBoss;
    minion.lane = lane - (columns - 1) / 2;
    minion.label.setStyle({ fontSize: '13px', padding: { x: 6, y: 3 }, wordWrap: { width: 140 } });
    if (miniBoss) {
      minion.sprite.setTexture('characters', 'miniboss').setDisplaySize(55, 64);
      minion.hp = minion.maxHp = 96;
      minion.label.setText(`★ ${word.meaning}`).setColor('#ffdf9c').setBackgroundColor('#462a1c');
      minion.ring.setStrokeStyle(3, 0xffb451, .95);
      this.nextMiniBossAt = this.bossLaunched + 7; this.miniBossSerial++;
      this.emit({ type: 'toast', text: '주황 미니 보스! 이동 중에는 사격이 멈춰요. 다른 단어를 고르고 적을 클릭해 조준하세요.' });
    }
    this.drawEnemyHealth(minion);
    minion.sprite.setAlpha(0); minion.shadow.setAlpha(0); minion.label.setAlpha(0); minion.ring.setAlpha(0); minion.healthBar.setAlpha(0);
    this.tweens.add({ targets: [minion.sprite, minion.shadow, minion.label, minion.ring, minion.healthBar], alpha: 1, duration: 550 });
    minion.staggerUntil = this.clock + 550;
    this.bossLaunched++; boss.attackAt = this.clock + (lane < columns - 1 ? 450 : this.bossSpawnInterval());
    this.sendState();
  }

  private dismissBossMinions() {
    for (const enemy of this.enemies) {
      if (enemy.boss) continue;
      if (!enemy.dead) {
        enemy.dead = true;
        this.burst(enemy.sprite.x, enemy.sprite.y, 0xb9a2e8, 5);
        this.tweens.killTweensOf([enemy.sprite, enemy.shadow, enemy.label, enemy.ring, enemy.healthBar]);
        enemy.sprite.destroy(); enemy.shadow.destroy(); enemy.label.destroy(); enemy.ring.destroy(); enemy.healthBar.destroy();
      }
    }
    this.enemies = this.enemies.filter(enemy => enemy.boss);
  }

  private updateSpawns() {
    if (this.spawnWarning && this.clock >= this.spawnWarning.at) {
      const { order, marker } = this.spawnWarning;
      this.tweens.killTweensOf(marker); marker.destroy(); this.spawnWarning = null;
      const { x, y } = this.gatePosition(order.side);
      this.spawnEnemy(order.word, order.kind, x, y);
      this.burst(x, y, 0xc2a1ff, 12);
      this.nextSpawnAt = this.clock + spawnInterval(this.clock - this.roomStarted, this.room);
    }
    if (!this.spawnWarning && this.spawnQueue.length && this.enemies.filter(enemy => !enemy.dead).length < 6 && this.clock >= this.nextSpawnAt - 800) {
      const order = this.spawnQueue.shift()!;
      const { x, y } = this.gatePosition(order.side);
      const marker = this.add.circle(x, y, 30, 0xef879a, .12).setStrokeStyle(3, 0xffbb9e).setDepth(750);
      this.tweens.add({ targets: marker, scale: 1.3, alpha: .4, duration: 200, yoyo: true, repeat: -1 });
      this.spawnWarning = { order, marker, at: Math.max(this.clock + 800, this.nextSpawnAt) };
      this.sendState();
    }
  }

  private spawnEnemy(word: Word, kind: EnemyKind, x: number, y: number, boss = false) {
    const enemy: Enemy = {
      sprite: this.add.sprite(x, y, 'characters', boss ? 'boss' : kind).setDisplaySize(boss ? 96 : 43, boss ? 106 : 53),
      shadow: this.add.ellipse(x, y + 15, boss ? 80 : 37, boss ? 25 : 12, 0x000000, .4),
      label: this.add.text(x, y - (boss ? 65 : 41), word.meaning, { resolution: 3, fontFamily: FONT, fontSize: word.format === 'quiz' && word.meaning.length > 30 ? boss ? '16px' : '12px' : boss ? '19px' : '16px', fontStyle: 'bold', color: '#ebe7f6', backgroundColor: '#171724', padding: { x: 11, y: 6 }, align: 'center', wordWrap: { width: boss ? 340 : word.format === 'quiz' ? 220 : 175, useAdvancedWrap: word.format === 'quiz' } }).setOrigin(.5, 1).setDepth(800),
      ring: this.add.circle(x, y, boss ? 54 : 27).setStrokeStyle(boss ? 2 : 1.5, 0xb9a2e8, .65),
      healthBar: this.add.graphics().setDepth(801),
      word, hp: boss ? this.words.length * 60 : 64, maxHp: boss ? this.words.length * 60 : 64, shielded: true, kind,
      attackAt: this.clock + 3000 + Math.random() * 1600, staggerUntil: 0, chargeUntil: 0, chargeX: 0, chargeY: 0, knockbackX: 0, knockbackY: 0, dead: false, boss,
    };
    this.enemies.push(enemy);
    this.drawEnemyHealth(enemy);
    return enemy;
  }

  private drawEnemyHealth(enemy: Enemy) {
    const width = enemy.boss ? 108 : enemy.miniBoss ? 64 : 48, height = enemy.boss ? 8 : 5;
    const x = enemy.sprite.x - width / 2, y = enemy.sprite.y - (enemy.boss ? 62 : 39);
    const ratio = Phaser.Math.Clamp(enemy.hp / enemy.maxHp, 0, 1);
    enemy.healthBar.clear().fillStyle(0x080d17, .95).fillRoundedRect(x - 2, y - 2, width + 4, height + 4, 3);
    enemy.healthBar.fillStyle(enemy.boss || enemy.miniBoss ? 0xe7b875 : ratio <= .3 ? 0xef879a : 0x80e4c9).fillRect(x, y, width * ratio, height);
    enemy.label.setPosition(Phaser.Math.Clamp(enemy.sprite.x, enemy.label.width / 2 + 12, this.arenaWidth - enemy.label.width / 2 - 12), y - 7);
  }

  private drawPlayerHealth() {
    if (!this.playerHealthBar) return;
    const ratio = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);
    const color = ratio <= .3 ? 0xef879a : ratio <= .5 ? 0xe7b875 : 0x80e4c9;
    this.playerHealthBar.setVisible(this.running || this.finished).setPosition(this.player.x, this.player.y - 36);
    this.playerHealthBar.clear().fillStyle(0x080d17, .95).fillRoundedRect(-30, -2, 60, 10, 3);
    this.playerHealthBar.fillStyle(color).fillRect(-28, 0, 56 * ratio, 6);
    this.playerHealthLabel.setVisible(this.running || this.finished).setPosition(this.player.x, this.player.y - 41).setText(`${this.hp} / ${this.maxHp}`);
  }

  private banner(kicker: string, title: string) {
    const text = this.add.text(this.arenaWidth / 2, 95, `${kicker}\n${title}`, { resolution: 3, fontFamily: FONT, fontSize: '19px', color: '#d6dbdd', align: 'center', lineSpacing: 8, backgroundColor: '#131923', padding: { x: 25, y: 13 } }).setOrigin(.5).setDepth(1000);
    this.tweens.add({ targets: text, alpha: 0, delay: 1600, duration: 600, onComplete: () => text.destroy() });
  }

  update(_time: number, delta: number) {
    if (!this.player) return;
    if (!this.running || this.paused || this.finished || this.roomComplete) return;
    if (this.hitStopRemaining > 0) { this.hitStopRemaining = Math.max(0, this.hitStopRemaining - delta); return; }
    const dt = Math.min(delta, 40); this.clock += dt; this.elapsed += dt / 1000;
    this.updateSpawns();
    const previousX = this.player.x, previousY = this.player.y;
    const key = this.keys;
    let mx = Number(key.D.isDown || key.RIGHT.isDown) - Number(key.A.isDown || key.LEFT.isDown);
    let my = Number(key.S.isDown || key.DOWN.isDown) - Number(key.W.isDown || key.UP.isDown);
    let length = Math.hypot(mx, my);
    if (this.lockedTarget?.dead) { this.lockedTarget = null; this.attackTarget = null; }
    if (length) { this.moveTarget = null; this.lockedTarget = null; this.attackTarget = null; this.movementMarker.clear(); }
    else if (this.lockedTarget || this.moveTarget) {
      const destination = this.lockedTarget ? this.lockedTarget.sprite : this.moveTarget!;
      const dx = destination.x - this.player.x, dy = destination.y - this.player.y;
      const distance = Math.hypot(dx, dy);
      // A bow order fires from the current position; melee follows its target.
      const stopRange = this.lockedTarget ? this.equipped[this.slot].kind === 'bow' ? Infinity : this.lockedTarget.boss ? 104 : 74 : Math.max(4, .21 * dt);
      if (distance > stopRange) { mx = dx / distance; my = dy / distance; length = 1; }
      else if (!this.lockedTarget && this.moveTarget) { this.player.setPosition(this.moveTarget.x, this.moveTarget.y); this.moveTarget = null; this.movementMarker.clear(); }
    }
    if (length && Math.hypot(mx, my) > 1) { const magnitude = Math.hypot(mx, my); mx /= magnitude; my /= magnitude; }
    if (length) this.angle = Math.atan2(my, mx);
    else {
      const aim = this.getAttackTarget();
      if (aim && (!this.isBossRoom() || this.lockedTarget)) this.angle = Math.atan2(aim.sprite.y - this.player.y, aim.sprite.x - this.player.x);
    }
    if (Phaser.Input.Keyboard.JustDown(key.SHIFT) && this.clock >= this.nextDash && this.clock >= this.stunUntil) {
      this.dashX = length ? mx : Math.cos(this.angle); this.dashY = length ? my : Math.sin(this.angle);
      this.dashUntil = this.clock + 165; this.nextDash = this.clock + 1300 / this.haste; this.invulnerableUntil = Math.max(this.invulnerableUntil, this.clock + 280);
      this.audio.play('dash');
    }
    if (this.clock < this.dashUntil) {
      this.player.x += this.dashX * .72 * dt; this.player.y += this.dashY * .72 * dt;
      if (Math.floor(this.clock / 32) !== Math.floor((this.clock - dt) / 32)) {
        const ghost = this.add.image(this.player.x, this.player.y, 'characters', 'hero').setDisplaySize(43, 54).setFlipX(this.player.flipX).setAlpha(.28).setDepth(this.player.y - 1);
        this.tweens.add({ targets: ghost, alpha: 0, duration: 200, onComplete: () => ghost.destroy() });
      }
    } else if (this.clock >= this.stunUntil) {
      this.player.x += mx * .21 * dt; this.player.y += my * .21 * dt;
    }
    this.player.x = Phaser.Math.Clamp(this.player.x, 78, this.arenaWidth - 78); this.player.y = Phaser.Math.Clamp(this.player.y, this.arenaTop, this.arenaBottom);
    // Include the arrival snap and dash so even the last moving frame cannot fire.
    this.playerMoving = Boolean(length || this.clock < this.dashUntil || Math.hypot(this.player.x - previousX, this.player.y - previousY) > .001);
    if (this.isBossRoom()) {
      if (this.playerMoving && this.bossAutoFire) this.holdBossFire();
      this.bossAutoFire = !this.playerMoving && !this.pendingBossRewards;
    }
    const target = this.playerMoving ? null : this.getAttackTarget();
    this.drawPlayerHealth();
    this.player.setFlipX(Math.cos(this.angle) < 0).setDepth(this.player.y + 3);
    this.player.setAlpha(this.clock < this.invulnerableUntil ? .65 + Math.sin(this.clock / 55) * .25 : 1);
    this.player.setTint(this.clock < this.burstUntil ? 0xffe3a3 : 0xffffff);
    if (this.clock < this.burstUntil && Math.floor(this.clock / 70) !== Math.floor((this.clock - dt) / 70)) {
      const glow = this.add.image(this.player.x, this.player.y, 'characters', 'hero').setDisplaySize(46, 58).setFlipX(this.player.flipX).setTint(0xffdc85).setAlpha(.35).setDepth(this.player.y - 1);
      this.tweens.add({ targets: glow, alpha: 0, scaleX: glow.scaleX * 1.3, scaleY: glow.scaleY * 1.3, duration: 250, onComplete: () => glow.destroy() });
    }
    const bob = length && this.clock >= this.dashUntil ? Math.sin(this.clock / 65) * 2 : 0;
    this.shadow.setPosition(this.player.x, this.player.y + 19).setDepth(this.player.y - 1);
    const kind = this.equipped[this.slot].kind;
    this.updateHeldWeapon(bob);
    this.aimLine.clear().lineStyle(1, Phaser.Display.Color.HexStringToColor(COLORS[this.equipped[this.slot].kind]).color, .18);
    this.aimLine.lineBetween(this.player.x + Math.cos(this.angle) * 30, this.player.y + Math.sin(this.angle) * 30, this.player.x + Math.cos(this.angle) * 70, this.player.y + Math.sin(this.angle) * 70);
    if (target) {
      const x = target.sprite.x, y = target.sprite.y, r = target.boss ? 59 : 33;
      this.aimLine.lineStyle(1.5, 0x8debcf, .65);
      for (const side of [-1, 1]) this.aimLine.lineBetween(x + side * r, y - 10, x + side * r, y + 10).lineBetween(x + side * r, y - 10, x + side * (r - 6), y - 10).lineBetween(x + side * r, y + 10, x + side * (r - 6), y + 10);
    }
    const clickAttack = this.lockedTarget && (kind === 'bow' || Phaser.Math.Distance.Between(this.player.x, this.player.y, this.lockedTarget.sprite.x, this.lockedTarget.sprite.y) < this.meleeRange(kind) + (this.lockedTarget.boss ? 25 : 0));
    const automatic = this.isBossRoom() && this.bossAutoFire && !this.bossTransition;
    if (!this.playerMoving && (automatic || (!this.isBossRoom() && (key.SPACE.isDown || clickAttack))) && this.clock >= this.nextAttack && this.clock >= this.stunUntil && this.clock >= this.dashUntil) this.attack();
    for (const enemy of this.enemies) if (!enemy.dead) this.updateEnemy(enemy, dt);
    this.updateShots(dt);
    this.updateGems(dt);
    if (this.pendingBossRewards && !this.bossUpgradeOpen && !this.bossTransition && !this.finished) {
      this.holdBossFire(); this.bossUpgradeOpen = true; this.bossUpgradeSource = 'miniboss'; this.setPaused(true); this.sendState();
      this.emit({ type: 'bossUpgrade', source: 'miniboss', options: bossUpgradeOptions(this.bossFireSpeed, this.bossGuided, this.bossArrows), round: this.bossIndex + 1 }); return;
    }
    if (this.pendingUpgrades && !this.upgradeOpen && !this.finished) {
      this.upgradeOpen = true; this.sendState(); this.emit({ type: 'upgrade', options: this.getUpgradeOptions(), level: this.level }); return;
    }
    if (this.running && !this.finished && !this.spawnQueue.length && !this.spawnWarning && !this.gems.length && this.enemies.length && this.enemies.every(enemy => enemy.dead)) {
      this.roomComplete = true; this.score += 150; this.audio.play('clear'); this.sendState();
      if ((this.room + 1) % ROOM_REWARD_INTERVAL === 0) this.emit({ type: 'clear', room: this.room });
      else {
        this.banner('CHAMBER CLEAR', '체력 10 회복 · 다음 방으로 이동');
        this.time.delayedCall(900, () => this.chooseReward());
      }
    }
    if (this.clock - this.lastState > 100) { this.lastState = this.clock; this.sendState(); }
  }

  private meleeRange(kind: WeaponKind) { return (kind === 'hammer' ? 107 : 100) + this.weaponLevels[kind] * 20; }

  private drawArrow(graphics: Phaser.GameObjects.Graphics, color: number) {
    graphics.lineStyle(2, 0xfff4cf).lineBetween(-14, 0, 5, 0);
    graphics.fillStyle(color).fillTriangle(12, 0, 4, -4, 4, 4);
    graphics.fillTriangle(-10, 0, -17, -4, -15, 0).fillTriangle(-10, 0, -17, 4, -15, 0);
    return graphics;
  }

  private bowReleasePoint() {
    return { x: this.held.x - Math.cos(this.angle) * 4, y: this.held.y - Math.sin(this.angle) * 4 };
  }

  private updateHeldWeapon(bob = 0) {
    const kind = this.equipped[this.slot].kind;
    const progress = Phaser.Math.Clamp((this.clock - this.attackStarted) / (kind === 'hammer' ? 260 : 160), 0, 1);
    const swing = progress < 1 ? Math.sin(progress * Math.PI) : 0;
    this.held.setDepth(this.player.y + 5);
    this.nockedArrow.clear().setVisible(kind === 'bow' && this.clock - this.attackStarted >= 110);
    if (kind === 'bow') {
      // The atlas bow faces left with a vertical string; flip it to aim along +X.
      const reach = 22 - swing * 2;
      this.held.setOrigin(.75, .5).setFlipX(true).setRotation(this.angle)
        .setDisplaySize(this.held.frame.realWidth / this.held.frame.realHeight * 52, 52)
        .setPosition(this.player.x + Math.cos(this.angle) * reach, this.player.y + Math.sin(this.angle) * reach);
      const release = this.bowReleasePoint();
      this.drawArrow(this.nockedArrow, Phaser.Display.Color.HexStringToColor(COLORS.bow).color)
        .setPosition(release.x, release.y).setRotation(this.angle).setDepth(this.player.y + 6);
    } else {
      const weaponAngle = this.angle + (progress < 1 ? (progress - .5) * 2.2 : 0);
      this.held.setOrigin(.5, .85).setFlipX(false).setRotation(weaponAngle + Math.PI / 2)
        .setDisplaySize(this.held.frame.realWidth / this.held.frame.realHeight * 38 * (1 + swing * .2), 38 * (1 + swing * .2))
        .setPosition(this.player.x + Math.cos(weaponAngle) * (23 + swing * 22), this.player.y + Math.sin(weaponAngle) * (15 + swing * 20) + bob);
    }
  }

  private fireProjectile(word: Word, angle: number, secondary = false, pierce = 0, attackId = this.attackSerial, target?: Enemy, barrelOffset = 0) {
    const color = Phaser.Display.Color.HexStringToColor(COLORS[word.kind]).color;
    const wave = word.kind === 'sword';
    const speed = wave ? .7 : .85;
    const guided = this.isBossRoom() ? this.bossGuided : 0;
    const bossFinisher = Boolean(target?.boss && !this.bossGuarded());
    const release = wave ? { x: this.player.x + Math.cos(angle) * 12, y: this.player.y + Math.sin(angle) * 12 } : this.bowReleasePoint();
    const shotColor = guided ? 0xb9f3dd : bossFinisher ? 0xffd58a : color;
    const object = wave
      ? this.add.circle(0, 0, 11, shotColor, .65).setStrokeStyle(2, 0xffffff).setScale(.7, 2)
      : this.drawArrow(this.add.graphics(), shotColor);
    object.setPosition(release.x - Math.sin(angle) * barrelOffset, release.y + Math.cos(angle) * barrelOffset).setRotation(angle).setDepth(900);
    if (bossFinisher) pierce = 24;
    this.shots.push({ object, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, expires: this.clock + (guided ? 4000 : 2200), word, trailAt: 0, secondary, pierce, struck: new Set(), attackId, guided, target, targetWordId: target?.word.id, bossFinisher });
  }

  private shockwave(x: number, y: number, radius: number, word: Word, exclude?: Enemy) {
    const color = Phaser.Display.Color.HexStringToColor(COLORS[word.kind]).color;
    const ring = this.add.circle(x, y, radius / 4, color, .1).setStrokeStyle(5, color, .9).setDepth(910);
    this.tweens.add({ targets: ring, scale: 4, alpha: 0, duration: 350, ease: 'Cubic.Out', onComplete: () => ring.destroy() });
    for (const enemy of this.enemies) {
      if (enemy !== exclude && !enemy.dead && !enemy.shielded && Phaser.Math.Distance.Between(x, y, enemy.sprite.x, enemy.sprite.y) < radius) this.strike(enemy, word, true);
    }
  }

  private attack() {
    const attackId = ++this.attackSerial;
    const target = this.getAttackTarget();
    this.attackTarget = target;
    if (target && (!this.isBossRoom() || this.lockedTarget)) this.angle = Math.atan2(target.sprite.y - this.player.y, target.sprite.x - this.player.x);
    const word = this.equipped[this.slot]; const color = Phaser.Display.Color.HexStringToColor(COLORS[word.kind]).color;
    const rank = this.weaponLevels[word.kind], frenzy = this.clock < this.burstUntil;
    this.nextAttack = this.clock + (this.isBossRoom() ? 700 / this.bossFireSpeed : ({ sword: 360, bow: 490, hammer: 660 }[word.kind]) / (this.haste * (frenzy ? 1.65 : 1)));
    this.attackStarted = this.clock;
    this.updateHeldWeapon();
    this.audio.play(word.kind === 'bow' ? 'shoot' : 'swing');
    if (word.kind === 'bow') {
      if (this.isBossRoom()) {
        const targets = this.enemies.filter(enemy => !enemy.dead && !enemy.boss && enemy !== target && enemy.word.id === target?.word.id && this.inFacingDirection(enemy)).sort((a, b) => a.sprite.x - b.sprite.x);
        for (let i = 0; i < this.bossArrows; i++) {
          const aim = i === 0 ? target : targets[(i - 1) % targets.length] ?? target;
          const direction = aim && aim !== target ? Math.atan2(aim.sprite.y - this.player.y, aim.sprite.x - this.player.x) : this.angle;
          const barrelOffset = i === 0 ? 0 : Math.min(16, Math.ceil(i / 2) * 7) * (i % 2 ? -1 : 1);
          this.fireProjectile(word, direction, false, 0, attackId, aim ?? undefined, barrelOffset);
        }
        return;
      }
      const volley = (direction: number) => {
        this.fireProjectile(word, direction, false, rank >= 2 ? 2 : 0, attackId);
        const count = arrowCount(rank);
        for (let i = 1; i <= (count - 1) / 2; i++) for (const side of [-1, 1]) this.fireProjectile(word, direction + side * i * .15, true, rank >= 2 ? 2 : 0, attackId);
      };
      volley(this.angle);
      if (frenzy) {
        const direction = this.angle;
        this.time.delayedCall(100, () => { if (this.running && !this.paused && !this.playerMoving && !this.finished && !this.roomComplete) volley(direction); });
      }
      return;
    }
    const radius = this.meleeRange(word.kind);
    const sweep = this.add.graphics().setDepth(900);
    sweep.fillStyle(color, .2).slice(this.player.x, this.player.y, radius * .82, this.angle - .7, this.angle + .7).fillPath();
    sweep.lineStyle(word.kind === 'hammer' ? 12 : 7, color, .9);
    sweep.beginPath().arc(this.player.x, this.player.y, radius * .72, this.angle - .7, this.angle + .7).strokePath();
    sweep.lineStyle(2, 0xf0fff9, 1).beginPath().arc(this.player.x, this.player.y, radius * .78, this.angle - .6, this.angle + .7).strokePath();
    this.tweens.add({ targets: sweep, alpha: 0, duration: 180, onComplete: () => sweep.destroy() });
    const targets = this.enemies.filter(enemy => {
      if (enemy.dead) return false;
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.sprite.x, enemy.sprite.y);
      const direction = Math.atan2(enemy.sprite.y - this.player.y, enemy.sprite.x - this.player.x);
      return distance < radius + (enemy.boss ? 25 : 0) && Math.abs(Phaser.Math.Angle.Wrap(direction - this.angle)) < 1;
    }).sort((a, b) => a === target ? -1 : b === target ? 1 : Phaser.Math.Distance.Between(this.player.x, this.player.y, a.sprite.x, a.sprite.y) - Phaser.Math.Distance.Between(this.player.x, this.player.y, b.sprite.x, b.sprite.y));
    const primary = targets[0];
    const impactX = primary?.sprite.x ?? this.player.x + Math.cos(this.angle) * 68;
    const impactY = primary?.sprite.y ?? this.player.y + Math.sin(this.angle) * 68;
    if (primary) this.strike(primary, word, false, attackId);
    if (word.kind === 'sword') {
      if (rank || frenzy) this.fireProjectile(word, this.angle, true, rank >= 2 ? 2 : 0);
      this.swingCount++;
      if (rank >= 2 && this.swingCount % 3 === 0) this.shockwave(this.player.x, this.player.y, 170, word, primary);
    } else {
      if (rank || frenzy) this.shockwave(impactX, impactY, rank >= 2 ? 185 : 150, word, primary);
      else for (const enemy of targets.slice(1)) if (!enemy.dead && !enemy.shielded) this.strike(enemy, word, true);
      if (rank >= 2 || frenzy) {
        for (let i = 0; i < 3; i++) {
          const angle = this.angle + (i - 1) * .8;
          const x = impactX + Math.cos(angle) * 90, y = impactY + Math.sin(angle) * 90;
          this.time.delayedCall(160 + i * 90, () => {
            if (!this.running || this.finished || this.roomComplete) return;
            this.burst(x, y, color, 10); this.shockwave(x, y, 70, word, primary);
          });
        }
      }
    }
  }

  private strike(enemy: Enemy, word: Word, secondary = false, attackId?: number) {
    if (enemy.dead || this.finished || this.bossTransition || (secondary && enemy.shielded)) return;
    const result = this.isBossRoom() && word.id !== enemy.word.id ? 'rebound' : resolveStrike(word.id, enemy.word.id, enemy.shielded);
    if (result === 'rebound') {
      this.combo = 0; this.charge = 0; this.stunUntil = this.clock + 180; this.audio.play('wrong');
      this.floatText(enemy.sprite.x, enemy.sprite.y - 24, '튕김 · 다른 단어!', '#ef8997');
      this.emit({ type: 'attempt', word: enemy.word, result: 'wrong' });
      this.emit({ type: 'toast', text: this.isBossRoom() ? '오답! 생명력 −8 · 점수 −25. 단어를 바꿔 보세요.' : '다른 뜻을 공격해서 생명력 −8! 단어를 바꿔 보세요.' });
      this.impact(enemy, word, 'rebound');
      // One health penalty per volley; dodge immunity does not cancel a wrong answer.
      if (attackId === undefined || !this.penalizedAttacks.has(attackId)) {
        if (attackId !== undefined) this.penalizedAttacks.add(attackId);
        if (this.isBossRoom()) this.score -= 25;
        this.hurt(8, true);
      }
      this.burst(enemy.sprite.x, enemy.sprite.y, 0xee8592, 6); this.sendState(); return;
    }
    if (enemy.boss && this.bossGuarded()) {
      if (this.clock - this.bossGuardToastAt > 1500) {
        this.bossGuardToastAt = this.clock;
        this.emit({ type: 'toast', text: `미니언 ${Math.max(0, this.bossKillGoal() - this.bossRoundKills)}마리를 더 처치하면 보스의 봉인이 열려요.` });
      }
      return;
    }
    if (result === 'break') {
      enemy.shielded = false; enemy.ring.setVisible(false); enemy.label.setColor('#6ee7cc');
      enemy.label.setText(`${enemy.miniBoss ? '★ ' : ''}✓ ${enemy.word.word}`); enemy.staggerUntil = this.clock + (enemy.boss ? 1000 : 1400);
      this.combo++; this.score += 60 + Math.min(this.combo, 5) * 10;
      if (!this.isBossRoom() && this.clock >= this.burstUntil) {
        this.charge++;
        if (this.charge >= 3) {
          this.charge = 0; this.burstUntil = this.clock + 5000;
          this.banner('MEMORY OVERDRIVE', '기억 폭주 · 5초간 무기 해방');
          this.audio.play('clear');
        }
      }
      this.emit({ type: 'attempt', word: enemy.word, result: 'correct' });
      this.audio.play('break'); this.impact(enemy, word, 'break'); this.burst(enemy.sprite.x, enemy.sprite.y, 0x93f4df, 24);
      this.floatText(enemy.sprite.x, enemy.sprite.y - 20, this.combo >= 3 ? `SHATTER ×${this.combo}` : 'SHATTER!', '#8af0d9');
      enemy.hp -= enemy.boss ? 60 : 30;
      if (enemy.boss) {
        this.drawEnemyHealth(enemy);
        this.dismissBossMinions();
        this.bossIndex++;
        if (this.bossIndex >= this.bossOrder.length) { this.kill(enemy); this.finish(true); return; }
        this.bossTransition = true;
        this.lockedTarget = this.attackTarget = null;
        this.time.delayedCall(1000, () => {
          if (enemy.dead || this.finished) return;
          // Clear arrows from the previous word before the next round starts.
          for (const shot of this.shots) shot.object.destroy(); this.shots = [];
          if (this.bossIndex % BOSS_UPGRADE_INTERVAL === 0) {
            this.bossUpgradeOpen = true; this.bossUpgradeSource = 'round'; this.setPaused(true);
            this.emit({ type: 'bossUpgrade', source: 'round', options: bossUpgradeOptions(this.bossFireSpeed, this.bossGuided, this.bossArrows), round: this.bossIndex });
          } else this.beginBossRound();
          this.sendState();
        });
      }
    } else {
      const damage = Math.round(((word.kind === 'hammer' ? 42 : word.kind === 'bow' ? 28 : 26) + this.attackBoost) * (secondary ? .65 : 1) * (this.clock < this.burstUntil ? 1.25 : 1));
      if (!enemy.boss) enemy.hp -= damage;
      this.audio.play(word.kind === 'hammer' ? 'smash' : 'hit');
      this.impact(enemy, word, 'hit');
      this.floatText(enemy.sprite.x, enemy.sprite.y - 16, `−${enemy.boss ? 'STAGGER' : damage}`, COLORS[word.kind]);
      this.burst(enemy.sprite.x, enemy.sprite.y, Phaser.Display.Color.HexStringToColor(COLORS[word.kind]).color, word.kind === 'hammer' ? 18 : 10);
    }
    if (!enemy.boss && enemy.hp <= 0) this.kill(enemy);
    else this.drawEnemyHealth(enemy);
    this.sendState();
  }

  private impact(enemy: Enemy, word: Word, result: 'hit' | 'break' | 'rebound') {
    const heavy = word.kind === 'hammer';
    const color = result === 'rebound' ? 0xef8997 : result === 'break' ? 0x93f4df : Phaser.Display.Color.HexStringToColor(COLORS[word.kind]).color;
    const x = enemy.sprite.x, y = enemy.sprite.y;
    const size = result === 'break' ? 48 : heavy ? 42 : 26;
    this.hitStopRemaining = Math.max(this.hitStopRemaining, result === 'break' ? 85 : result === 'rebound' ? 35 : heavy ? 70 : 45);
    const flash = this.add.graphics().setDepth(960);
    flash.lineStyle(heavy ? 5 : 3, 0xffffff, 1);
    for (let i = 0; i < 4; i++) {
      const angle = Math.PI / 4 + i * Math.PI / 2;
      flash.lineBetween(x + Math.cos(angle) * 5, y + Math.sin(angle) * 5, x + Math.cos(angle) * size, y + Math.sin(angle) * size);
    }
    this.tweens.add({ targets: flash, alpha: 0, duration: 140, onComplete: () => flash.destroy() });
    const shock = this.add.circle(x, y, size * .45).setStrokeStyle(heavy ? 4 : 2, color).setDepth(950);
    this.tweens.add({ targets: shock, scale: heavy || result === 'break' ? 3 : 2, alpha: 0, duration: heavy ? 310 : 230, onComplete: () => shock.destroy() });
    if (result === 'rebound') return;
    enemy.sprite.setTintFill(0xffffff);
    this.time.delayedCall(100, () => { if (!enemy.dead) enemy.sprite.clearTint(); });
    const bodyParts = [enemy.sprite, enemy.shadow, enemy.label, enemy.ring, enemy.healthBar];
    this.tweens.killTweensOf(bodyParts);
    for (const part of bodyParts) part.setAlpha(1);
    const scaleX = (enemy.boss ? 96 : enemy.miniBoss ? 55 : 43) / enemy.sprite.frame.realWidth;
    const scaleY = (enemy.boss ? 106 : enemy.miniBoss ? 64 : 53) / enemy.sprite.frame.realHeight;
    enemy.sprite.setScale(scaleX * 1.22, scaleY * .8);
    this.tweens.add({ targets: enemy.sprite, scaleX, scaleY, duration: 210, ease: 'Back.Out' });
    enemy.staggerUntil = Math.max(enemy.staggerUntil, this.clock + (heavy ? 330 : 180));
    enemy.chargeUntil = 0;
    const away = Math.atan2(y - this.player.y, x - this.player.x);
    const force = enemy.boss ? 0 : (heavy ? .44 : .27);
    enemy.knockbackX = Math.cos(away) * force; enemy.knockbackY = Math.sin(away) * force;
  }

  private kill(enemy: Enemy) {
    if (enemy.dead) return;
    const wasGuarded = this.isBossRoom() && this.bossGuarded();
    enemy.dead = true; this.kills++; this.score += enemy.boss ? 800 : 35;
    if (enemy.miniBoss) {
      this.score += 100; this.miniBossKills++;
      if (this.miniBossKills % MINI_BOSS_REWARD_INTERVAL === 0) {
        this.pendingBossRewards++; this.bossAutoFire = false;
      }
    }
    if (!enemy.boss && this.isBossRoom()) {
      this.bossRoundKills++;
      if (wasGuarded && !this.bossGuarded()) {
        const boss = this.enemies.find(item => item.boss && !item.dead);
        if (boss) {
          boss.label.setText(`${boss.word.meaning} · 봉인 노출`).setColor('#ffe0a0');
          boss.ring.setStrokeStyle(3, 0xffcf80, .9);
          this.banner('BOSS EXPOSED', '지원군은 계속 온다 · 같은 단어로 보스 공격!');
        }
        this.attackTarget = null;
      }
    }
    if (this.lockedTarget === enemy) this.lockedTarget = null;
    if (this.attackTarget === enemy) this.attackTarget = null;
    this.tweens.killTweensOf([enemy.sprite, enemy.shadow, enemy.label, enemy.ring, enemy.healthBar]);
    this.burst(enemy.sprite.x, enemy.sprite.y, enemy.boss ? 0xe8bb75 : 0xafa0d7, enemy.boss ? 50 : 12);
    if (!enemy.boss && !this.isBossRoom()) {
      for (let i = 0; i < 3; i++) this.gems.push({
        object: this.add.rectangle(enemy.sprite.x + (i - 1) * 14, enemy.sprite.y + (i % 2 ? -8 : 8), 8, 8, 0x9cf4e3).setRotation(Math.PI / 4).setStrokeStyle(1.5, 0xf1fff8).setDepth(920),
        born: this.clock, value: 4,
      });
    }
    enemy.sprite.destroy(); enemy.shadow.destroy(); enemy.label.destroy(); enemy.ring.destroy(); enemy.healthBar.destroy();
  }

  private updateGems(dt: number) {
    this.gems = this.gems.filter(gem => {
      if (this.clock - gem.born < 200) return true;
      const dx = this.player.x - gem.object.x, dy = this.player.y - gem.object.y;
      const distance = Math.hypot(dx, dy);
      const step = Math.min(distance, (.35 + (this.clock - gem.born) * .0007) * dt);
      if (distance > 20) { gem.object.x += dx / distance * step; gem.object.y += dy / distance * step; return true; }
      gem.object.destroy(); this.xp += gem.value;
      while (this.xp >= experienceNeeded(this.level)) { this.xp -= experienceNeeded(this.level); this.level++; this.pendingUpgrades++; }
      return false;
    });
  }

  private updateEnemy(enemy: Enemy, dt: number) {
    const sprite = enemy.sprite;
    sprite.x += enemy.knockbackX * dt; sprite.y += enemy.knockbackY * dt;
    const drag = Math.exp(-dt / 95);
    enemy.knockbackX *= drag; enemy.knockbackY *= drag;
    const distance = Phaser.Math.Distance.Between(sprite.x, sprite.y, this.player.x, this.player.y);
    const angle = Math.atan2(this.player.y - sprite.y, this.player.x - sprite.x);
    if (enemy.boss) {
      const field = this.defenseField();
      sprite.setPosition(field.bossX, field.midY);
      if (!this.bossTransition && this.clock >= enemy.attackAt) this.launchBossMinion(enemy);
    } else if (this.isBossRoom()) {
      // March along the road, passing the hero rather than chasing or charging.
      const others = this.enemies.filter(other => !other.dead && !other.boss && other !== enemy && (enemy.miniBoss || other.miniBoss));
      const rear = others.filter(other => other.sprite.x > sprite.x).sort((a, b) => a.sprite.x - b.sprite.x)[0];
      if (rear) sprite.x = Math.min(sprite.x, rear.sprite.x - MINI_BOSS_GAP);
      if (this.clock >= enemy.staggerUntil) {
        const front = others.filter(other => other.sprite.x < sprite.x).sort((a, b) => b.sprite.x - a.sprite.x)[0];
        const nextX = sprite.x - Math.min(.065, .045 + this.bossIndex * .002) * dt;
        sprite.x = front ? Math.min(sprite.x, Math.max(nextX, front.sprite.x + MINI_BOSS_GAP)) : nextX;
      }
      sprite.y = this.defenseField().midY + (enemy.lane ?? 0) * this.defenseField().laneGap;
      if (sprite.x <= this.defenseField().goalX) { this.breachGoal(enemy); return; }
    } else if (this.clock >= enemy.staggerUntil) {
      let speed = enemy.boss ? .038 : enemy.kind === 'chaser' ? .06 + this.room * .005 : enemy.kind === 'charger' ? .032 : .025;
      if (enemy.kind === 'caster' && distance < 250) speed = -.025;
      if (enemy.chargeUntil > this.clock) {
        sprite.x += enemy.chargeX * dt; sprite.y += enemy.chargeY * dt;
      } else if (enemy.chargeUntil === -1) {
        sprite.setTint(0xf0bf77);
        if (this.clock >= enemy.attackAt) {
          enemy.chargeUntil = this.clock + 470; enemy.chargeX = Math.cos(angle) * (enemy.boss ? .4 : .32); enemy.chargeY = Math.sin(angle) * (enemy.boss ? .4 : .32);
          enemy.attackAt = this.clock + (enemy.boss ? 3000 : 4300); sprite.clearTint();
        }
      } else {
        if (distance > 34) { sprite.x += Math.cos(angle) * speed * dt; sprite.y += Math.sin(angle) * speed * dt; }
        if (this.clock >= enemy.attackAt) {
          if (enemy.kind === 'charger') { enemy.chargeUntil = -1; enemy.attackAt = this.clock + 700; this.floatText(sprite.x, sprite.y - 22, '!', '#f0bf77'); }
          else if (enemy.kind === 'caster') { this.enemyShot(sprite.x, sprite.y, angle, .18); enemy.attackAt = this.clock + 2800; }
        }
      }
      if (distance < 30) this.hurt(9);
    }
    sprite.x = Phaser.Math.Clamp(sprite.x, 92, this.arenaWidth - 92);
    if (!this.isBossRoom()) sprite.y = Phaser.Math.Clamp(sprite.y, this.arenaTop, this.arenaBottom - 25);
    // Push overlapping enemies apart, keeping their labels legible.
    for (const other of this.enemies) {
      if (this.isBossRoom() || enemy.boss || other === enemy || other.dead) continue;
      const dx = sprite.x - other.sprite.x, dy = sprite.y - other.sprite.y;
      const separation = Math.hypot(dx, dy);
      if (separation > 0 && separation < 75) {
        sprite.x += dx / separation * .035 * dt; sprite.y += dy / separation * .035 * dt;
      }
    }
    sprite.setDepth(sprite.y).setFlipX(this.isBossRoom() || this.player.x < sprite.x);
    enemy.shadow.setPosition(sprite.x, sprite.y + (enemy.boss ? 39 : 18)).setDepth(sprite.y - 2);
    enemy.ring.setPosition(sprite.x, sprite.y).setDepth(sprite.y + 1).setAlpha(.75 + Math.sin(this.clock / 400) * .15);
    this.drawEnemyHealth(enemy);
  }

  private breachGoal(enemy: Enemy) {
    if (enemy.dead || this.finished) return;
    enemy.dead = true; this.bossLeaks++; this.score -= 50;
    if (this.lockedTarget === enemy) this.lockedTarget = null;
    if (this.attackTarget === enemy) this.attackTarget = null;
    const parts = [enemy.sprite, enemy.shadow, enemy.label, enemy.ring, enemy.healthBar];
    this.tweens.killTweensOf(parts);
    this.burst(enemy.sprite.x, enemy.sprite.y, 0xef8997, 10);
    this.floatText(enemy.sprite.x + 30, enemy.sprite.y - 30, '돌파! −50점', '#ffb3a1');
    parts.forEach(part => part.destroy());
    this.emit({ type: 'toast', text: '골인선 돌파! 생명력 −12 · 점수 −50' });
    this.hurt(12, true);
  }

  private enemyShot(x: number, y: number, angle: number, speed: number) {
    const object = this.add.circle(x, y, 6, 0xef879a).setStrokeStyle(2, 0xffd0d8).setDepth(900);
    this.shots.push({ object, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, expires: this.clock + 5000 });
  }

  private updateShots(dt: number) {
    this.shots = this.shots.filter(shot => {
      if (shot.word && this.pendingBossRewards) { shot.object.destroy(); return false; }
      const previousX = shot.object.x, previousY = shot.object.y;
      if (shot.guided && shot.targetWordId) {
        if (!shot.target || shot.target.dead) {
          shot.target = this.enemies.filter(enemy => !enemy.dead && (!shot.targetWordId || enemy.word.id === shot.targetWordId) && (!enemy.boss || !this.bossGuarded())).sort((a, b) =>
            Math.hypot(a.sprite.x - previousX, a.sprite.y - previousY) - Math.hypot(b.sprite.x - previousX, b.sprite.y - previousY))[0];
        }
        if (shot.target && !shot.target.dead) {
          const desired = Math.atan2(shot.target.sprite.y - previousY, shot.target.sprite.x - previousX);
          const direction = Phaser.Math.Angle.RotateTo(Math.atan2(shot.vy, shot.vx), desired, .004 * shot.guided * dt);
          const speed = Math.hypot(shot.vx, shot.vy);
          shot.vx = Math.cos(direction) * speed; shot.vy = Math.sin(direction) * speed;
          shot.object.setRotation(direction);
        }
      }
      shot.object.x += shot.vx * dt; shot.object.y += shot.vy * dt;
      if (this.clock > shot.expires || shot.object.x < 60 || shot.object.x > this.arenaWidth - 60 || shot.object.y < 90 || shot.object.y > this.arenaBottom + 25) { shot.object.destroy(); return false; }
      if (shot.word) {
        if (this.clock >= (shot.trailAt ?? 0)) {
          shot.trailAt = this.clock + 32;
          const trail = this.add.circle(shot.object.x, shot.object.y, shot.word.kind === 'sword' ? 6 : 3, Phaser.Display.Color.HexStringToColor(COLORS[shot.word.kind]).color, .55).setDepth(899);
          this.tweens.add({ targets: trail, alpha: 0, scale: .2, duration: 160, onComplete: () => trail.destroy() });
        }
        // Resolve the first physical collision, even if the boss was created
        // before a minion that now stands in front of it.
        let target: Enemy | undefined, firstHit = Infinity;
        const dx = shot.object.x - previousX, dy = shot.object.y - previousY, lengthSquared = dx * dx + dy * dy || 1;
        for (const enemy of this.enemies) {
          if (enemy.dead || shot.struck?.has(enemy) || (shot.secondary && enemy.shielded)) continue;
          const projection = ((enemy.sprite.x - previousX) * dx + (enemy.sprite.y - previousY) * dy) / lengthSquared;
          const t = Phaser.Math.Clamp(projection, 0, 1);
          const radius = enemy.boss ? 48 : shot.word.kind === 'sword' ? 36 : 25;
          if (Phaser.Math.Distance.Between(previousX + dx * t, previousY + dy * t, enemy.sprite.x, enemy.sprite.y) >= radius) continue;
          const perpendicular = Math.hypot(enemy.sprite.x - previousX - dx * projection, enemy.sprite.y - previousY - dy * projection);
          const entry = Math.max(0, projection - Math.sqrt(Math.max(0, radius * radius - perpendicular * perpendicular) / lengthSquared));
          if (entry < firstHit) { firstHit = entry; target = enemy; }
        }
        if (target) {
          this.strike(target, shot.word, shot.secondary, shot.attackId); shot.struck?.add(target);
          if ((shot.pierce ?? 0) > 0 && !target.shielded && (!shot.bossFinisher || shot.word.id === target.word.id)) {
            shot.pierce!--;
            // The exposed boss needs a primary, word-checked hit. Its finishing
            // shot stays primary as it passes matching reinforcements.
            if (!shot.bossFinisher) shot.secondary = true;
            return true;
          }
          shot.object.destroy(); return false;
        }
      } else if (Phaser.Math.Distance.Between(shot.object.x, shot.object.y, this.player.x, this.player.y) < 21) {
        this.hurt(8); shot.object.destroy(); return false;
      }
      return true;
    });
  }

  private hurt(amount: number, wrongAnswer = false) {
    if ((!wrongAnswer && this.clock < this.invulnerableUntil) || this.finished) return;
    this.hp = Math.max(0, this.hp - amount); this.invulnerableUntil = this.clock + 850; this.combo = 0; this.charge = 0;
    this.audio.play('hurt'); this.floatText(this.player.x, this.player.y - 30, `−${amount}`, '#ff8a99');
    if (this.hp === 0) this.finish(false);
    this.sendState();
  }

  private finish(won: boolean) {
    this.finished = true; this.running = false; this.moveTarget = null; this.lockedTarget = null; this.movementMarker.clear();
    this.input.keyboard!.clearCaptures();
    if (won) { this.score += 1000 + Math.round(this.hp * 5); this.audio.play('clear'); }
    this.emit({ type: 'finish', won, state: this.snapshot() });
  }

  private burst(x: number, y: number, color: number, count: number) {
    for (let i = 0; i < count; i++) {
      const shard = this.add.rectangle(x, y, 2 + Math.random() * 5, 2 + Math.random() * 3, color).setRotation(Math.random() * Math.PI).setDepth(950);
      const angle = Math.random() * Math.PI * 2, distance = 20 + Math.random() * 60;
      this.tweens.add({ targets: shard, x: x + Math.cos(angle) * distance, y: y + Math.sin(angle) * distance, alpha: 0, rotation: angle, duration: 250 + Math.random() * 220, onComplete: () => shard.destroy() });
    }
  }

  private floatText(x: number, y: number, message: string, color: string) {
    const text = this.add.text(x, y, message, { resolution: 3, fontFamily: FONT, fontSize: message.startsWith('SHATTER') ? '24px' : '21px', fontStyle: 'bold', color, stroke: '#0b1018', strokeThickness: 5 }).setOrigin(.5).setScale(1.4).setDepth(1001);
    this.tweens.add({ targets: text, scale: 1, duration: 170, ease: 'Back.Out' });
    this.tweens.add({ targets: text, y: y - 52, alpha: 0, delay: 120, duration: 680, onComplete: () => text.destroy() });
  }

  snapshot(): Snapshot {
    return { hp: this.hp, maxHp: this.maxHp, score: this.score, combo: this.combo, kills: this.kills, room: this.room, totalRooms: this.groups.length + 1,
      roomName: this.roomTitle(), words: this.equipped, slot: this.slot, remaining: this.enemies.filter(enemy => !enemy.dead).length + this.spawnQueue.length + Number(Boolean(this.spawnWarning)),
      elapsed: this.elapsed, dash: Math.max(0, Math.min(1, 1 - (this.nextDash - this.clock) / (1300 / this.haste))),
      boss: this.room >= this.groups.length, bossSeals: this.bossIndex, totalSeals: this.words.length,
      environment: this.room >= this.groups.length ? 'defense' : ENVIRONMENTS[this.room % 4],
      alive: this.enemies.filter(enemy => !enemy.dead).length, incoming: this.spawnQueue.length + Number(Boolean(this.spawnWarning)),
      spawnEvery: spawnInterval(this.clock - this.roomStarted, this.room) / 1000, nextSide: this.spawnWarning?.order.side ?? null,
      level: this.level, xp: this.xp, xpNeeded: experienceNeeded(this.level), upgrades: { ...this.weaponLevels }, attackBoost: this.attackBoost, haste: this.haste,
      burst: Math.max(0, (this.burstUntil - this.clock) / 1000), charge: this.charge,
      mode: this.mode, bossArrows: this.bossArrows, bossMinions: this.isBossRoom() ? this.bossMinionsRemaining() : 0,
      bossColumns: this.bossColumns(), bossRoundKills: this.bossRoundKills, bossKillGoal: this.bossKillGoal(),
      bossFireInterval: 700 / this.bossFireSpeed, bossGuided: this.bossGuided, bossLeaks: this.bossLeaks,
      bossAutoFire: this.bossAutoFire, miniBosses: this.enemies.filter(enemy => !enemy.dead && enemy.miniBoss).length };
  }
  private getAttackTarget(): Enemy | null {
    if (this.lockedTarget && !this.lockedTarget.dead) return this.lockedTarget;
    // Keep finishing the same creature after knockback instead of accidentally
    // switching to a different meaning shield during a held Space attack.
    const retentionRange = this.equipped[this.slot].kind === 'bow' ? 700 : 160;
    const guardedBoss = this.isBossRoom() && this.bossGuarded();
    if (this.isBossRoom() && !guardedBoss && !this.bossTransition) {
      const boss = this.enemies.find(enemy => enemy.boss && !enemy.dead && this.inFacingDirection(enemy));
      if (boss) return boss;
    }
    if (this.isBossRoom()) return this.enemies.filter(enemy => !enemy.dead && !enemy.boss && this.inFacingDirection(enemy)).sort((a, b) => Phaser.Math.Distance.Between(this.player.x, this.player.y, a.sprite.x, a.sprite.y) - Phaser.Math.Distance.Between(this.player.x, this.player.y, b.sprite.x, b.sprite.y))[0] ?? null;
    if (this.attackTarget && !this.attackTarget.dead && !(guardedBoss && this.attackTarget.boss) && Phaser.Math.Distance.Between(this.player.x, this.player.y, this.attackTarget.sprite.x, this.attackTarget.sprite.y) < retentionRange) return this.attackTarget;
    return this.enemies.filter(enemy => !enemy.dead && !(guardedBoss && enemy.boss)).sort((a, b) =>
      Phaser.Math.Distance.Between(this.player.x, this.player.y, a.sprite.x, a.sprite.y) - Phaser.Math.Distance.Between(this.player.x, this.player.y, b.sprite.x, b.sprite.y))[0] ?? null;
  }
  private inFacingDirection(enemy: Enemy) {
    const direction = Math.atan2(enemy.sprite.y - this.player.y, enemy.sprite.x - this.player.x);
    return Math.abs(Phaser.Math.Angle.Wrap(direction - this.angle)) <= .6;
  }
  private showMovementMarker(x: number, y: number) {
    this.movementMarker.clear().lineStyle(1.5, 0x98f6d4, .7).strokeEllipse(x, y, 24, 10);
    this.movementMarker.lineBetween(x - 5, y, x + 5, y).lineBetween(x, y - 3, x, y + 3);
  }
  private sendState() { this.drawPlayerHealth(); this.emit({ type: 'state', state: this.snapshot() }); }
}

export function mountGame(parent: string, emit: (event: GameEvent) => void) {
  const bounds = document.getElementById(parent)!.getBoundingClientRect();
  const density = renderingScale(bounds.width, bounds.height);
  const scene = new DungeonScene(emit, density);
  const game = new Phaser.Game({ type: Phaser.AUTO, parent, width: WIDTH * density, height: HEIGHT * density, backgroundColor: '#10131b', pixelArt: false,
    scale: { mode: Phaser.Scale.EXPAND, autoCenter: Phaser.Scale.CENTER_BOTH }, scene,
    input: { mouse: { preventDefaultWheel: false } }, render: { antialias: true, antialiasGL: true, roundPixels: false, mipmapFilter: 'LINEAR_MIPMAP_LINEAR' }, banner: false });
  return { game, scene };
}
