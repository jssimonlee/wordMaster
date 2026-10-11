import Phaser from 'phaser';
import { COLORS, DEFAULT_WORDS, ROOM_NAMES, sentencePrompt, wordGroups, type Word, type WeaponKind } from './data';
import { resolveStrike } from './progress';
import { GameAudio } from './audio';
import { ENVIRONMENTS, paintEnvironment, type Environment } from './environments';
import { arrowCount, emptyWeaponLevels, experienceNeeded, spawnInterval, upgradeOptions, type UpgradeId, type UpgradeOption } from './upgrades';

export const WIDTH = 1040;
export const HEIGHT = 620;
const FONT = '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
type EnemyKind = 'chaser' | 'charger' | 'caster';
interface Enemy {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  label: Phaser.GameObjects.Text;
  ring: Phaser.GameObjects.Arc;
  word: Word;
  hp: number;
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
}
interface Shot { object: Phaser.GameObjects.Arc; vx: number; vy: number; expires: number; word?: Word; trailAt?: number; secondary?: boolean; pierce?: number; struck?: Set<Enemy>; }
interface Gem { object: Phaser.GameObjects.Rectangle; born: number; value: number; }
interface SpawnOrder { word: Word; kind: EnemyKind; side: number; }
export interface Snapshot {
  hp: number; maxHp: number; score: number; combo: number; kills: number;
  room: number; totalRooms: number; roomName: string; words: Word[]; slot: number;
  remaining: number; elapsed: number; dash: number; boss: boolean; bossSeals: number; totalSeals: number; environment: Environment;
  alive: number; incoming: number; spawnEvery: number; nextSide: number | null;
  level: number; xp: number; xpNeeded: number; upgrades: Record<WeaponKind, number>; attackBoost: number; haste: number; burst: number; charge: number;
}
export type GameEvent =
  | { type: 'ready' }
  | { type: 'state'; state: Snapshot }
  | { type: 'attempt'; word: Word; result: 'correct' | 'wrong' }
  | { type: 'toast'; text: string }
  | { type: 'clear'; room: number }
  | { type: 'upgrade'; options: UpgradeOption[]; level: number }
  | { type: 'finish'; won: boolean; state: Snapshot };

export class DungeonScene extends Phaser.Scene {
  private emit: (event: GameEvent) => void;
  readonly audio = new GameAudio();
  private player!: Phaser.GameObjects.Sprite;
  private shadow!: Phaser.GameObjects.Ellipse;
  private held!: Phaser.GameObjects.Image;
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
  private door!: Phaser.GameObjects.Container;
  private words: Word[] = DEFAULT_WORDS;
  private groups: Word[][] = wordGroups(DEFAULT_WORDS);
  private equipped: Word[] = DEFAULT_WORDS.slice(0, 3);
  private slot = 0;
  private room = 0;
  private bossOrder: Word[] = [];
  private bossIndex = 0;
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

  constructor(emit: (event: GameEvent) => void) { super('dungeon'); this.emit = emit; }

  create() {
    this.makeTextures();
    this.floor = this.add.graphics().setDepth(-10);
    this.decoration = this.add.container(0, 0).setDepth(-5);
    this.door = this.add.container(WIDTH / 2, 62).setDepth(-4);
    this.gates = this.add.graphics().setDepth(-2);
    this.resizeArena();
    this.scale.on('resize', this.resizeArena, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.resizeArena, this));
    this.shadow = this.add.ellipse(520, 490, 31, 12, 0x000000, .5);
    this.player = this.add.sprite(520, 480, 'hero').setScale(2.5).setDepth(500);
    this.held = this.add.image(545, 472, 'sword').setScale(2.2).setOrigin(.5, .85).setDepth(502);
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
      this.attackTarget = null;
      // Clicking a creature selects it, without selecting the correct word for you.
      this.lockedTarget = this.enemies.filter(enemy => !enemy.dead && (Phaser.Math.Distance.Between(pointer.x, pointer.y, enemy.sprite.x, enemy.sprite.y) < (enemy.boss ? 58 : 40) || enemy.label.getBounds().contains(pointer.x, pointer.y)))
        .sort((a, b) => Phaser.Math.Distance.Between(pointer.x, pointer.y, a.sprite.x, a.sprite.y) - Phaser.Math.Distance.Between(pointer.x, pointer.y, b.sprite.x, b.sprite.y))[0] ?? null;
      this.moveTarget = null;
      this.movementMarker.clear();
      if (!this.lockedTarget) {
        this.moveTarget = { x: Phaser.Math.Clamp(pointer.x, 78, this.arenaWidth - 78), y: Phaser.Math.Clamp(pointer.y, this.arenaTop, this.arenaBottom) };
        this.showMovementMarker(this.moveTarget.x, this.moveTarget.y);
      }
    });
    this.player.setPosition(this.arenaWidth / 2, (this.arenaTop + this.arenaBottom) / 2);
    this.shadow.setPosition(this.player.x, this.player.y + 19).setDepth(this.player.y - 1);
    this.held.setPosition(this.player.x, this.player.y - 15).setDepth(this.player.y + 5);
    this.sendState();
    this.emit({ type: 'ready' });
  }

  private makeTextures() {
    const palette: Record<string, number> = { '.': 0, k: 0x10141f, d: 0x253744, t: 0x3b7d80, c: 0x6ee7cc, w: 0xd9fff2, p: 0x644c80, v: 0xb095db, r: 0xef777e, b: 0x48526b, g: 0xb6c0be, a: 0xe8bb75, n: 0x78593e };
    const texture = (name: string, rows: string[]) => {
      if (this.textures.exists(name)) return;
      const g = this.make.graphics({ x: 0, y: 0 });
      for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
        const color = rows[y][x]; if (color !== '.') g.fillStyle(palette[color] ?? 0xffffff).fillRect(x, y, 1, 1);
      }
      g.generateTexture(name, rows[0].length, rows.length); g.destroy();
    };
    texture('hero', ['.....cccc.......', '....cttttc......', '...ctddddtc.....', '..ctdkkkkdtc....', '..ctkkwwkktt....', '..ctkkkkkktc....', '...ctdddtcc.....', '...dtttttd......', '..ctttttttc.....', '.ccttdttdtcc....', '.cdttddddttc....', '..dttddddttd....', '..dttddddttd....', '...dd....dd.....', '..kkk....kkk....', '................']);
    texture('chaser', ['.....pppp.......', '....pvvvvp......', '...pvvppvvp.....', '..pvppkkppvp....', '..pvkkrrkkvp....', '..pvkkkkkkvp....', '...pvvvvvvp.....', '...ppvvvvpp.....', '..ppvvvvvvpp....', '..pvvpvvpvvp....', '..pvvppppvvp....', '...pvppppvp.....', '..ppvppppvpp....', '..ppp....ppp....', '...p......p.....', '................']);
    texture('charger', ['.....bbbb.......', '...ggbbbbgg.....', '..gbbggggbbg....', '..bggbbbbggb....', '..bgkkrrkkgb....', '..bggkkkkggb....', '...bbggggbb.....', '...bbbbbbbb.....', '..gbbbggbbbg....', '.ggbbggggbbgg...', '..gbbggggbbg....', '...bbggggbb.....', '...bbbggbbb.....', '...bb....bb.....', '..kkk....kkk....', '................']);
    texture('caster', ['......ppp.......', '.....ppvpp......', '....ppvvvpp.....', '...ppvvvvvpp....', '..ppvvkkkvvpp...', '..pvkkrrkkvvp...', '...pkkkkkkvp....', '....pvppvpp.....', '...ppvvvvpp.....', '..ppvvvvvvpp....', '..pvppvvppvp....', '.ppvppppppvpp...', '..pppppppppp....', '...pppppppp.....', '....pppppp......', '................']);
    texture('boss', ['....aa....aa....', '....abaaaa ba...'.replace(' ', 'b'), '...abbggggbba...', '..abggbbbbggba..', '..bbkkrrrrkkbb..', '..bbkkrrrrkkbb..', '...bggbbbbggb...', '...bbggggggbb...', '..abbggggggbba..', '.aabbbggggbbbaa.', '.abbggbbbbggbba.', '..bbggbbbbggbb..', '..abbggggggbba..', '...bbbggggbbb...', '...bbb....bbb...', '..kkkk....kkkk..']);
    texture('sword', ['...w....', '...w....', '..wc....', '..wc....', '..wc....', '..wc....', '..cc....', '.aaaa...', '...n....', '...n....']);
    texture('bow', ['..vv....', '...vv...', '....vv..', '...w.v..', '...w.v..', '...w.v..', '....vv..', '...vv...', '..vv....', '........']);
    texture('hammer', ['.aaaaaa.', '.agggaa.', '.aaaaaa.', '...n....', '...n....', '...n....', '...n....', '...a....', '........', '........']);
  }

  private paintRoom() {
    const theme = this.room >= this.groups.length ? 'astral' : ENVIRONMENTS[this.room % 4];
    paintEnvironment(this, this.floor, this.decoration, this.door, theme);
    this.floor.setScale(this.arenaWidth / WIDTH, this.arenaHeight / HEIGHT);
    this.decoration.setScale(this.arenaWidth / WIDTH, this.arenaHeight / HEIGHT);
    this.door.setPosition(this.arenaWidth / 2, 62);
    this.paintGates();
  }

  private resizeArena() {
    this.arenaWidth = this.scale.gameSize.width;
    this.arenaHeight = this.scale.gameSize.height;
    const hud = document.querySelector<HTMLElement>('.bottom-hud');
    this.arenaBottom = this.arenaHeight - Math.max(110, ((hud?.offsetHeight ?? 130) + 35) * this.scale.displayScale.y);
    const status = document.querySelector<HTMLElement>('.arena-status');
    this.arenaTop = Math.max(135, ((status?.offsetTop ?? 100) + (status?.offsetHeight ?? 20) + 45) * this.scale.displayScale.y);
    if (this.player) {
      this.player.setPosition(Phaser.Math.Clamp(this.player.x, 78, this.arenaWidth - 78), Phaser.Math.Clamp(this.player.y, this.arenaTop, this.arenaBottom));
      this.moveTarget = null; this.movementMarker.clear();
      for (const enemy of this.enemies) if (!enemy.dead) enemy.sprite.setPosition(Phaser.Math.Clamp(enemy.sprite.x, 92, this.arenaWidth - 92), Phaser.Math.Clamp(enemy.sprite.y, this.arenaTop, this.arenaBottom - 25));
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
    for (let side = 0; side < 4; side++) {
      const { x, y } = this.gatePosition(side);
      this.gates.fillStyle(0x101b24, .75).fillCircle(x, y, 31).lineStyle(2, 0x91c9b4, .35).strokeCircle(x, y, 31);
      this.gates.lineStyle(1, 0x91c9b4, .2).strokeCircle(x, y, 39);
    }
  }

  start(words: Word[]) {
    this.audio.unlock();
    this.time.removeAllEvents();
    this.time.paused = false; this.tweens.resumeAll();
    this.words = words; this.groups = wordGroups(words); this.room = 0; this.hp = this.maxHp = 100;
    this.score = this.combo = this.kills = this.elapsed = this.clock = this.lastState = 0;
    this.attackBoost = 0; this.haste = 1; this.paused = false; this.finished = false;
    this.nextAttack = this.nextDash = this.dashUntil = this.invulnerableUntil = this.stunUntil = 0;
    this.hitStopRemaining = 0; this.attackStarted = -1000;
    this.level = 1; this.xp = this.pendingUpgrades = 0; this.upgradeOpen = false;
    this.weaponLevels = emptyWeaponLevels(); this.swingCount = this.burstUntil = this.charge = 0;
    this.bossIndex = 0; this.running = true;
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
  equip(slot: number) {
    if (!this.equipped[slot]) return;
    this.slot = slot; this.held.setTexture(this.equipped[slot].kind); this.sendState();
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

  chooseReward(reward: UpgradeId) {
    if (!this.roomComplete) return;
    this.applyUpgrade(reward);
    // A small heal between rooms keeps a first run forgiving.
    this.hp = Math.min(this.maxHp, this.hp + 10);
    this.room++; this.setPaused(false); this.loadRoom();
  }

  private clearEntities() {
    for (const e of this.enemies) { e.dead = true; this.tweens.killTweensOf([e.sprite, e.shadow, e.label, e.ring]); e.sprite.destroy(); e.shadow.destroy(); e.label.destroy(); e.ring.destroy(); }
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
      this.equipped = this.groups[0];
      this.spawnEnemy(this.bossOrder[0], 'charger', this.arenaWidth / 2, this.arenaTop + 110, true);
    }
    this.equip(0); this.banner(this.room < this.groups.length ? `CHAMBER ${String(this.room + 1).padStart(2, '0')}` : 'THE FINAL GUARDIAN', this.roomTitle());
    this.sendState();
  }

  private roomTitle() { return this.room < this.groups.length ? ROOM_NAMES[this.room % ROOM_NAMES.length] : '기억을 삼킨 수호자'; }

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
      sprite: this.add.sprite(x, y, boss ? 'boss' : kind).setScale(boss ? 5.8 : 2.7),
      shadow: this.add.ellipse(x, y + 15, boss ? 80 : 37, boss ? 25 : 12, 0x000000, .4),
      label: this.add.text(x, y - (boss ? 65 : 41), word.meaning, { fontFamily: FONT, fontSize: boss ? '19px' : '16px', fontStyle: 'bold', color: '#ebe7f6', backgroundColor: '#171724', padding: { x: 11, y: 6 }, align: 'center', wordWrap: { width: boss ? 340 : 175 } }).setOrigin(.5, 1).setDepth(800),
      ring: this.add.circle(x, y, boss ? 54 : 27).setStrokeStyle(boss ? 2 : 1.5, 0xb9a2e8, .65),
      word, hp: boss ? this.words.length * 60 : 64, shielded: true, kind,
      attackAt: this.clock + 3000 + Math.random() * 1600, staggerUntil: 0, chargeUntil: 0, chargeX: 0, chargeY: 0, knockbackX: 0, knockbackY: 0, dead: false, boss,
    };
    this.enemies.push(enemy);
  }

  private banner(kicker: string, title: string) {
    const text = this.add.text(this.arenaWidth / 2, 95, `${kicker}\n${title}`, { fontFamily: FONT, fontSize: '19px', color: '#d6dbdd', align: 'center', lineSpacing: 8, backgroundColor: '#131923', padding: { x: 25, y: 13 } }).setOrigin(.5).setDepth(1000);
    this.tweens.add({ targets: text, alpha: 0, delay: 1600, duration: 600, onComplete: () => text.destroy() });
  }

  update(_time: number, delta: number) {
    if (!this.player) return;
    if (!this.running || this.paused || this.finished || this.roomComplete) return;
    if (this.hitStopRemaining > 0) { this.hitStopRemaining = Math.max(0, this.hitStopRemaining - delta); return; }
    const dt = Math.min(delta, 40); this.clock += dt; this.elapsed += dt / 1000;
    this.updateSpawns();
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
    const target = this.getAttackTarget();
    if (target) this.angle = Math.atan2(target.sprite.y - this.player.y, target.sprite.x - this.player.x);
    else if (length) this.angle = Math.atan2(my, mx);
    if (Phaser.Input.Keyboard.JustDown(key.SHIFT) && this.clock >= this.nextDash && this.clock >= this.stunUntil) {
      this.dashX = length ? mx : Math.cos(this.angle); this.dashY = length ? my : Math.sin(this.angle);
      this.dashUntil = this.clock + 165; this.nextDash = this.clock + 1300 / this.haste; this.invulnerableUntil = Math.max(this.invulnerableUntil, this.clock + 280);
      this.audio.play('dash');
    }
    if (this.clock < this.dashUntil) {
      this.player.x += this.dashX * .72 * dt; this.player.y += this.dashY * .72 * dt;
      if (Math.floor(this.clock / 32) !== Math.floor((this.clock - dt) / 32)) {
        const ghost = this.add.image(this.player.x, this.player.y, 'hero').setScale(2.5).setAlpha(.28).setDepth(this.player.y - 1);
        this.tweens.add({ targets: ghost, alpha: 0, duration: 200, onComplete: () => ghost.destroy() });
      }
    } else if (this.clock >= this.stunUntil) {
      this.player.x += mx * .21 * dt; this.player.y += my * .21 * dt;
    }
    this.player.x = Phaser.Math.Clamp(this.player.x, 78, this.arenaWidth - 78); this.player.y = Phaser.Math.Clamp(this.player.y, this.arenaTop, this.arenaBottom);
    this.player.setFlipX(Math.cos(this.angle) < 0).setDepth(this.player.y + 3);
    this.player.setAlpha(this.clock < this.invulnerableUntil ? .65 + Math.sin(this.clock / 55) * .25 : 1);
    this.player.setTint(this.clock < this.burstUntil ? 0xffe3a3 : 0xffffff);
    if (this.clock < this.burstUntil && Math.floor(this.clock / 70) !== Math.floor((this.clock - dt) / 70)) {
      const glow = this.add.image(this.player.x, this.player.y, 'hero').setScale(2.7).setTint(0xffdc85).setAlpha(.35).setDepth(this.player.y - 1);
      this.tweens.add({ targets: glow, alpha: 0, scale: 3.5, duration: 250, onComplete: () => glow.destroy() });
    }
    const bob = length && this.clock >= this.dashUntil ? Math.sin(this.clock / 65) * 2 : 0;
    this.shadow.setPosition(this.player.x, this.player.y + 19).setDepth(this.player.y - 1);
    const kind = this.equipped[this.slot].kind;
    const swingProgress = Phaser.Math.Clamp((this.clock - this.attackStarted) / (kind === 'hammer' ? 260 : 160), 0, 1);
    const swing = swingProgress < 1 ? Math.sin(swingProgress * Math.PI) : 0;
    const weaponAngle = this.angle + (kind === 'bow' ? 0 : swingProgress < 1 ? (swingProgress - .5) * 2.2 : 0);
    this.held.setPosition(this.player.x + Math.cos(weaponAngle) * (23 + swing * (kind === 'bow' ? -7 : 22)), this.player.y + Math.sin(weaponAngle) * (15 + swing * 20) + bob)
      .setRotation(weaponAngle + Math.PI / 2).setScale(2.2 + swing * .45).setDepth(this.player.y + 5);
    this.aimLine.clear().lineStyle(1, Phaser.Display.Color.HexStringToColor(COLORS[this.equipped[this.slot].kind]).color, .18);
    this.aimLine.lineBetween(this.player.x + Math.cos(this.angle) * 30, this.player.y + Math.sin(this.angle) * 30, this.player.x + Math.cos(this.angle) * 70, this.player.y + Math.sin(this.angle) * 70);
    if (target) {
      const x = target.sprite.x, y = target.sprite.y, r = target.boss ? 59 : 33;
      this.aimLine.lineStyle(1.5, 0x8debcf, .65);
      for (const side of [-1, 1]) this.aimLine.lineBetween(x + side * r, y - 10, x + side * r, y + 10).lineBetween(x + side * r, y - 10, x + side * (r - 6), y - 10).lineBetween(x + side * r, y + 10, x + side * (r - 6), y + 10);
    }
    const clickAttack = this.lockedTarget && (kind === 'bow' || Phaser.Math.Distance.Between(this.player.x, this.player.y, this.lockedTarget.sprite.x, this.lockedTarget.sprite.y) < this.meleeRange(kind) + (this.lockedTarget.boss ? 25 : 0));
    if ((key.SPACE.isDown || clickAttack) && this.clock >= this.nextAttack && this.clock >= this.stunUntil && this.clock >= this.dashUntil) this.attack();
    for (const enemy of this.enemies) if (!enemy.dead) this.updateEnemy(enemy, dt);
    this.updateShots(dt);
    this.updateGems(dt);
    if (this.pendingUpgrades && !this.upgradeOpen && !this.finished) {
      this.upgradeOpen = true; this.sendState(); this.emit({ type: 'upgrade', options: this.getUpgradeOptions(), level: this.level }); return;
    }
    if (this.running && !this.finished && !this.spawnQueue.length && !this.spawnWarning && !this.gems.length && this.enemies.length && this.enemies.every(enemy => enemy.dead)) {
      this.roomComplete = true; this.score += 150; this.audio.play('clear'); this.sendState();
      this.emit({ type: 'clear', room: this.room });
    }
    if (this.clock - this.lastState > 100) { this.lastState = this.clock; this.sendState(); }
  }

  private meleeRange(kind: WeaponKind) { return (kind === 'hammer' ? 107 : 100) + this.weaponLevels[kind] * 20; }

  private fireProjectile(word: Word, angle: number, secondary = false, pierce = 0) {
    const color = Phaser.Display.Color.HexStringToColor(COLORS[word.kind]).color;
    const wave = word.kind === 'sword';
    const object = this.add.circle(this.player.x + Math.cos(angle) * 28, this.player.y + Math.sin(angle) * 28, wave ? 11 : 4, color, wave ? .65 : 1)
      .setStrokeStyle(wave ? 2 : 1.5, 0xffffff).setScale(wave ? .7 : 2.8, wave ? 2 : .8).setRotation(angle).setDepth(900);
    const speed = wave ? .7 : .85;
    this.shots.push({ object, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, expires: this.clock + 2200, word, trailAt: 0, secondary, pierce, struck: new Set() });
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
    const target = this.getAttackTarget();
    this.attackTarget = target;
    if (target) this.angle = Math.atan2(target.sprite.y - this.player.y, target.sprite.x - this.player.x);
    const word = this.equipped[this.slot]; const color = Phaser.Display.Color.HexStringToColor(COLORS[word.kind]).color;
    const rank = this.weaponLevels[word.kind], frenzy = this.clock < this.burstUntil;
    this.nextAttack = this.clock + ({ sword: 360, bow: 490, hammer: 660 }[word.kind]) / (this.haste * (frenzy ? 1.65 : 1));
    this.attackStarted = this.clock;
    this.audio.play(word.kind === 'bow' ? 'shoot' : 'swing');
    if (word.kind === 'bow') {
      const volley = (direction: number) => {
        this.fireProjectile(word, direction, false, rank >= 2 ? 2 : 0);
        const count = arrowCount(rank);
        for (let i = 1; i <= (count - 1) / 2; i++) for (const side of [-1, 1]) this.fireProjectile(word, direction + side * i * .15, true, rank >= 2 ? 2 : 0);
      };
      volley(this.angle);
      if (frenzy) {
        const direction = this.angle;
        this.time.delayedCall(100, () => { if (this.running && !this.finished && !this.roomComplete) volley(direction); });
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
    if (primary) this.strike(primary, word);
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

  private strike(enemy: Enemy, word: Word, secondary = false) {
    if (enemy.dead || (secondary && enemy.shielded)) return;
    const result = resolveStrike(word.id, enemy.word.id, enemy.shielded);
    if (result === 'rebound') {
      this.combo = 0; this.charge = 0; this.stunUntil = this.clock + 180; this.audio.play('wrong');
      this.floatText(enemy.sprite.x, enemy.sprite.y - 24, '튕김 · 다른 단어!', '#ef8997');
      this.emit({ type: 'attempt', word: enemy.word, result: 'wrong' });
      this.emit({ type: 'toast', text: '방어막의 뜻에 맞는 단어로 무기를 바꿔 보세요.' });
      this.impact(enemy, word, 'rebound');
      this.burst(enemy.sprite.x, enemy.sprite.y, 0xee8592, 6); this.sendState(); return;
    }
    if (result === 'break') {
      enemy.shielded = false; enemy.ring.setVisible(false); enemy.label.setColor('#6ee7cc');
      enemy.label.setText(`✓ ${enemy.word.word}`); enemy.staggerUntil = this.clock + (enemy.boss ? 1000 : 1400);
      this.combo++; this.score += 60 + Math.min(this.combo, 5) * 10;
      if (this.clock >= this.burstUntil) {
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
        this.bossIndex++;
        if (this.bossIndex >= this.bossOrder.length) { this.kill(enemy); this.finish(true); return; }
        this.time.delayedCall(1000, () => {
          if (enemy.dead || this.finished) return;
          const newGroup = Math.floor(this.bossIndex / 3);
          if (this.equipped !== this.groups[newGroup]) { this.equipped = this.groups[newGroup]; this.equip(0); this.banner('NEW ARMORY', '다음 기억의 무기가 깨어납니다'); }
          enemy.word = this.bossOrder[this.bossIndex]; enemy.shielded = true; enemy.ring.setVisible(true);
          const prompt = this.bossIndex >= this.bossOrder.length - 3 ? sentencePrompt(enemy.word) : null;
          enemy.label.setText(prompt ?? enemy.word.meaning).setColor('#ebe7f6'); this.sendState();
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
    this.sendState();
  }

  private impact(enemy: Enemy, word: Word, result: 'hit' | 'break' | 'rebound') {
    const heavy = word.kind === 'hammer';
    const color = result === 'rebound' ? 0xef8997 : result === 'break' ? 0x93f4df : Phaser.Display.Color.HexStringToColor(COLORS[word.kind]).color;
    const x = enemy.sprite.x, y = enemy.sprite.y;
    const size = result === 'break' ? 48 : heavy ? 42 : 26;
    this.hitStopRemaining = Math.max(this.hitStopRemaining, result === 'break' ? 85 : result === 'rebound' ? 35 : heavy ? 70 : 45);
    this.cameras.main.shake(heavy || result === 'break' ? 150 : 85, heavy ? .006 : result === 'break' ? .0045 : .0025);
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
    this.tweens.killTweensOf(enemy.sprite);
    const scale = enemy.boss ? 5.8 : 2.7;
    enemy.sprite.setScale(scale * 1.22, scale * .8);
    this.tweens.add({ targets: enemy.sprite, scaleX: scale, scaleY: scale, duration: 210, ease: 'Back.Out' });
    enemy.staggerUntil = Math.max(enemy.staggerUntil, this.clock + (heavy ? 330 : 180));
    enemy.chargeUntil = 0;
    const away = Math.atan2(y - this.player.y, x - this.player.x);
    const force = (heavy ? .44 : .27) * (enemy.boss ? .25 : 1);
    enemy.knockbackX = Math.cos(away) * force; enemy.knockbackY = Math.sin(away) * force;
  }

  private kill(enemy: Enemy) {
    enemy.dead = true; this.kills++; this.score += enemy.boss ? 800 : 35;
    if (this.lockedTarget === enemy) this.lockedTarget = null;
    if (this.attackTarget === enemy) this.attackTarget = null;
    this.tweens.killTweensOf(enemy.sprite);
    this.burst(enemy.sprite.x, enemy.sprite.y, enemy.boss ? 0xe8bb75 : 0xafa0d7, enemy.boss ? 50 : 12);
    if (!enemy.boss) {
      for (let i = 0; i < 3; i++) this.gems.push({
        object: this.add.rectangle(enemy.sprite.x + (i - 1) * 14, enemy.sprite.y + (i % 2 ? -8 : 8), 8, 8, 0x9cf4e3).setRotation(Math.PI / 4).setStrokeStyle(1.5, 0xf1fff8).setDepth(920),
        born: this.clock, value: 4,
      });
    }
    enemy.sprite.destroy(); enemy.shadow.destroy(); enemy.label.destroy(); enemy.ring.destroy();
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
    if (this.clock >= enemy.staggerUntil) {
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
      if (enemy.boss && Math.floor(this.clock / 2400) !== Math.floor((this.clock - dt) / 2400)) {
        for (let i = 0; i < 8; i++) this.enemyShot(sprite.x, sprite.y, angle + i * Math.PI / 4, .14);
      }
      if (distance < (enemy.boss ? 52 : 30)) this.hurt(enemy.boss ? 16 : 9);
    }
    sprite.x = Phaser.Math.Clamp(sprite.x, 92, this.arenaWidth - 92); sprite.y = Phaser.Math.Clamp(sprite.y, this.arenaTop, this.arenaBottom - 25);
    // Push overlapping enemies apart, keeping their labels legible.
    for (const other of this.enemies) {
      if (other === enemy || other.dead) continue;
      const dx = sprite.x - other.sprite.x, dy = sprite.y - other.sprite.y;
      const separation = Math.hypot(dx, dy);
      if (separation > 0 && separation < 75) { sprite.x += dx / separation * .035 * dt; sprite.y += dy / separation * .035 * dt; }
    }
    sprite.setDepth(sprite.y).setFlipX(this.player.x < sprite.x);
    enemy.shadow.setPosition(sprite.x, sprite.y + (enemy.boss ? 39 : 18)).setDepth(sprite.y - 2);
    enemy.ring.setPosition(sprite.x, sprite.y).setDepth(sprite.y + 1).setAlpha(.75 + Math.sin(this.clock / 400) * .15);
    enemy.label.setPosition(sprite.x, sprite.y - (enemy.boss ? 64 : 34));
  }

  private enemyShot(x: number, y: number, angle: number, speed: number) {
    const object = this.add.circle(x, y, 6, 0xef879a).setStrokeStyle(2, 0xffd0d8).setDepth(900);
    this.shots.push({ object, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, expires: this.clock + 5000 });
  }

  private updateShots(dt: number) {
    this.shots = this.shots.filter(shot => {
      shot.object.x += shot.vx * dt; shot.object.y += shot.vy * dt;
      if (this.clock > shot.expires || shot.object.x < 60 || shot.object.x > this.arenaWidth - 60 || shot.object.y < 90 || shot.object.y > this.arenaBottom + 25) { shot.object.destroy(); return false; }
      if (shot.word) {
        if (this.clock >= (shot.trailAt ?? 0)) {
          shot.trailAt = this.clock + 32;
          const trail = this.add.circle(shot.object.x, shot.object.y, shot.word.kind === 'sword' ? 6 : 3, Phaser.Display.Color.HexStringToColor(COLORS[shot.word.kind]).color, .55).setDepth(899);
          this.tweens.add({ targets: trail, alpha: 0, scale: .2, duration: 160, onComplete: () => trail.destroy() });
        }
        const target = this.enemies.find(enemy => !enemy.dead && !shot.struck?.has(enemy) && (!shot.secondary || !enemy.shielded) && Phaser.Math.Distance.Between(shot.object.x, shot.object.y, enemy.sprite.x, enemy.sprite.y) < (enemy.boss ? 48 : shot.word!.kind === 'sword' ? 36 : 25));
        if (target) {
          this.strike(target, shot.word, shot.secondary); shot.struck?.add(target);
          if ((shot.pierce ?? 0) > 0 && !target.shielded) { shot.pierce!--; shot.secondary = true; return true; }
          shot.object.destroy(); return false;
        }
      } else if (Phaser.Math.Distance.Between(shot.object.x, shot.object.y, this.player.x, this.player.y) < 21) {
        this.hurt(8); shot.object.destroy(); return false;
      }
      return true;
    });
  }

  private hurt(amount: number) {
    if (this.clock < this.invulnerableUntil || this.finished) return;
    this.hp = Math.max(0, this.hp - amount); this.invulnerableUntil = this.clock + 850; this.combo = 0; this.charge = 0;
    this.audio.play('hurt'); this.cameras.main.shake(100, .003); this.floatText(this.player.x, this.player.y - 30, `−${amount}`, '#ff8a99');
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
    const text = this.add.text(x, y, message, { fontFamily: FONT, fontSize: message.startsWith('SHATTER') ? '24px' : '21px', fontStyle: 'bold', color, stroke: '#0b1018', strokeThickness: 5 }).setOrigin(.5).setScale(1.4).setDepth(1001);
    this.tweens.add({ targets: text, scale: 1, duration: 170, ease: 'Back.Out' });
    this.tweens.add({ targets: text, y: y - 52, alpha: 0, delay: 120, duration: 680, onComplete: () => text.destroy() });
  }

  snapshot(): Snapshot {
    return { hp: this.hp, maxHp: this.maxHp, score: this.score, combo: this.combo, kills: this.kills, room: this.room, totalRooms: this.groups.length + 1,
      roomName: this.roomTitle(), words: this.equipped, slot: this.slot, remaining: this.enemies.filter(enemy => !enemy.dead).length + this.spawnQueue.length + Number(Boolean(this.spawnWarning)),
      elapsed: this.elapsed, dash: Math.max(0, Math.min(1, 1 - (this.nextDash - this.clock) / (1300 / this.haste))),
      boss: this.room >= this.groups.length, bossSeals: this.bossIndex, totalSeals: this.words.length,
      environment: this.room >= this.groups.length ? 'astral' : ENVIRONMENTS[this.room % 4],
      alive: this.enemies.filter(enemy => !enemy.dead).length, incoming: this.spawnQueue.length + Number(Boolean(this.spawnWarning)),
      spawnEvery: spawnInterval(this.clock - this.roomStarted, this.room) / 1000, nextSide: this.spawnWarning?.order.side ?? null,
      level: this.level, xp: this.xp, xpNeeded: experienceNeeded(this.level), upgrades: { ...this.weaponLevels }, attackBoost: this.attackBoost, haste: this.haste,
      burst: Math.max(0, (this.burstUntil - this.clock) / 1000), charge: this.charge };
  }
  private getAttackTarget(): Enemy | null {
    if (this.lockedTarget && !this.lockedTarget.dead) return this.lockedTarget;
    // Keep finishing the same creature after knockback instead of accidentally
    // switching to a different meaning shield during a held Space attack.
    const retentionRange = this.equipped[this.slot].kind === 'bow' ? 700 : 160;
    if (this.attackTarget && !this.attackTarget.dead && Phaser.Math.Distance.Between(this.player.x, this.player.y, this.attackTarget.sprite.x, this.attackTarget.sprite.y) < retentionRange) return this.attackTarget;
    return this.enemies.filter(enemy => !enemy.dead).sort((a, b) =>
      Phaser.Math.Distance.Between(this.player.x, this.player.y, a.sprite.x, a.sprite.y) - Phaser.Math.Distance.Between(this.player.x, this.player.y, b.sprite.x, b.sprite.y))[0] ?? null;
  }
  private showMovementMarker(x: number, y: number) {
    this.movementMarker.clear().lineStyle(1.5, 0x98f6d4, .7).strokeEllipse(x, y, 24, 10);
    this.movementMarker.lineBetween(x - 5, y, x + 5, y).lineBetween(x, y - 3, x, y + 3);
  }
  private sendState() { this.emit({ type: 'state', state: this.snapshot() }); }
}

export function mountGame(parent: string, emit: (event: GameEvent) => void) {
  const scene = new DungeonScene(emit);
  const game = new Phaser.Game({ type: Phaser.AUTO, parent, width: WIDTH, height: HEIGHT, backgroundColor: '#10131b', pixelArt: true,
    scale: { mode: Phaser.Scale.EXPAND, autoCenter: Phaser.Scale.CENTER_BOTH }, scene,
    input: { mouse: { preventDefaultWheel: false } }, render: { antialias: false }, banner: false });
  return { game, scene };
}
