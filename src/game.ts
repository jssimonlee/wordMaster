import Phaser from 'phaser';
import { COLORS, DEFAULT_WORDS, ROOM_NAMES, sentencePrompt, wordGroups, type Word } from './data';
import { resolveStrike } from './progress';
import { GameAudio } from './audio';
import { ENVIRONMENTS, paintEnvironment, type Environment } from './environments';

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
  dead: boolean;
  boss: boolean;
}
interface Shot { object: Phaser.GameObjects.Arc; vx: number; vy: number; expires: number; word?: Word; }
export interface Snapshot {
  hp: number; maxHp: number; score: number; combo: number; kills: number;
  room: number; totalRooms: number; roomName: string; words: Word[]; slot: number;
  remaining: number; elapsed: number; dash: number; boss: boolean; bossSeals: number; totalSeals: number; environment: Environment;
}
export type GameEvent =
  | { type: 'ready' }
  | { type: 'state'; state: Snapshot }
  | { type: 'attempt'; word: Word; result: 'correct' | 'wrong' }
  | { type: 'toast'; text: string }
  | { type: 'clear'; room: number }
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

  constructor(emit: (event: GameEvent) => void) { super('dungeon'); this.emit = emit; }

  create() {
    this.makeTextures();
    this.floor = this.add.graphics().setDepth(-10);
    this.decoration = this.add.container(0, 0).setDepth(-5);
    this.door = this.add.container(WIDTH / 2, 62).setDepth(-4);
    this.paintRoom();
    this.shadow = this.add.ellipse(520, 490, 31, 12, 0x000000, .5);
    this.player = this.add.sprite(520, 480, 'hero').setScale(2.5).setDepth(500);
    this.held = this.add.image(545, 472, 'sword').setScale(2.2).setOrigin(.5, .85).setDepth(502);
    this.aimLine = this.add.graphics().setDepth(499);
    this.movementMarker = this.add.graphics().setDepth(-1);
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,SHIFT,ONE,TWO,THREE') as Record<string, Phaser.Input.Keyboard.Key>;
    // Let form inputs receive keystrokes; capture gameplay keys only while running.
    this.input.keyboard!.clearCaptures();
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonDown() || !this.running || this.paused || this.finished || this.roomComplete) return;
      this.audio.unlock();
      this.attackTarget = null;
      // Clicking a creature selects it, without selecting the correct word for you.
      this.lockedTarget = this.enemies.filter(enemy => !enemy.dead && (Phaser.Math.Distance.Between(pointer.x, pointer.y, enemy.sprite.x, enemy.sprite.y) < (enemy.boss ? 58 : 40) || enemy.label.getBounds().contains(pointer.x, pointer.y)))
        .sort((a, b) => Phaser.Math.Distance.Between(pointer.x, pointer.y, a.sprite.x, a.sprite.y) - Phaser.Math.Distance.Between(pointer.x, pointer.y, b.sprite.x, b.sprite.y))[0] ?? null;
      this.moveTarget = { x: Phaser.Math.Clamp(pointer.x, 78, WIDTH - 78), y: Phaser.Math.Clamp(pointer.y, 110, HEIGHT - 78) };
      this.showMovementMarker(this.moveTarget.x, this.moveTarget.y);
    });
    this.spawnPreview();
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
  }

  private spawnPreview() {
    for (let i = 0; i < 3; i++) this.spawnEnemy(DEFAULT_WORDS[i], ['chaser', 'caster', 'charger'][i] as EnemyKind, 350 + i * 170, 255);
  }

  start(words: Word[]) {
    this.audio.unlock();
    this.time.removeAllEvents();
    this.time.paused = false; this.tweens.resumeAll();
    this.words = words; this.groups = wordGroups(words); this.room = 0; this.hp = this.maxHp = 100;
    this.score = this.combo = this.kills = this.elapsed = this.clock = this.lastState = 0;
    this.attackBoost = 0; this.haste = 1; this.paused = false; this.finished = false;
    this.nextAttack = this.nextDash = this.dashUntil = this.invulnerableUntil = this.stunUntil = 0;
    this.bossIndex = 0; this.running = true;
    this.input.keyboard!.addCapture(['SPACE', 'UP', 'DOWN', 'LEFT', 'RIGHT']);
    this.loadRoom();
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    this.moveTarget = null; this.movementMarker.clear();
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

  chooseReward(reward: 'heal' | 'power' | 'haste') {
    if (!this.roomComplete) return;
    if (reward === 'heal') this.hp = Math.min(this.maxHp, this.hp + 35);
    if (reward === 'power') this.attackBoost += 8;
    if (reward === 'haste') this.haste = Math.min(1.8, this.haste + .16);
    // A small heal between rooms keeps a first run forgiving.
    this.hp = Math.min(this.maxHp, this.hp + 10);
    this.room++; this.setPaused(false); this.loadRoom();
  }

  private clearEntities() {
    for (const e of this.enemies) { e.dead = true; this.tweens.killTweensOf([e.sprite, e.shadow, e.label, e.ring]); e.sprite.destroy(); e.shadow.destroy(); e.label.destroy(); e.ring.destroy(); }
    for (const shot of this.shots) shot.object.destroy();
    this.enemies = []; this.shots = [];
  }

  private loadRoom() {
    this.clearEntities(); this.roomComplete = false; this.combo = 0;
    this.moveTarget = null; this.lockedTarget = null; this.attackTarget = null; this.movementMarker.clear();
    this.player.setPosition(520, 480).setAlpha(1); this.angle = -Math.PI / 2;
    this.invulnerableUntil = this.clock + 2200;
    this.nextAttack = this.clock + 800;
    this.paintRoom();
    if (this.room < this.groups.length) {
      this.equipped = this.groups[this.room];
      const sequence = Phaser.Utils.Array.Shuffle([...this.equipped, ...this.equipped]);
      const layouts = [
        [[230, 195], [505, 160], [805, 210], [305, 340], [730, 355], [535, 300]],
        [[265, 180], [520, 190], [775, 180], [265, 330], [775, 330], [520, 345]],
        [[300, 175], [520, 245], [740, 175], [215, 350], [825, 350], [520, 370]],
        [[225, 225], [465, 165], [780, 205], [350, 360], [745, 365], [555, 300]],
      ];
      const positions = layouts[this.room % 4];
      sequence.forEach((word, index) => this.spawnEnemy(word, (['chaser', 'charger', 'caster'] as EnemyKind[])[(index + this.room) % 3], positions[index][0], positions[index][1]));
    } else {
      this.bossIndex = 0;
      this.bossOrder = this.groups.flatMap(group => Phaser.Utils.Array.Shuffle([...group]));
      this.equipped = this.groups[0];
      this.spawnEnemy(this.bossOrder[0], 'charger', 520, 240, true);
    }
    this.equip(0); this.banner(this.room < this.groups.length ? `CHAMBER ${String(this.room + 1).padStart(2, '0')}` : 'THE FINAL GUARDIAN', this.roomTitle());
    this.sendState();
  }

  private roomTitle() { return this.room < this.groups.length ? ROOM_NAMES[this.room % ROOM_NAMES.length] : '기억을 삼킨 수호자'; }

  private spawnEnemy(word: Word, kind: EnemyKind, x: number, y: number, boss = false) {
    const enemy: Enemy = {
      sprite: this.add.sprite(x, y, boss ? 'boss' : kind).setScale(boss ? 5.8 : 2.7),
      shadow: this.add.ellipse(x, y + 15, boss ? 80 : 37, boss ? 25 : 12, 0x000000, .4),
      label: this.add.text(x, y - (boss ? 65 : 41), word.meaning, { fontFamily: FONT, fontSize: boss ? '19px' : '16px', fontStyle: 'bold', color: '#ebe7f6', backgroundColor: '#171724', padding: { x: 11, y: 6 }, align: 'center', wordWrap: { width: boss ? 340 : 175 } }).setOrigin(.5, 1).setDepth(800),
      ring: this.add.circle(x, y, boss ? 54 : 27).setStrokeStyle(boss ? 2 : 1.5, 0xb9a2e8, .65),
      word, hp: boss ? this.words.length * 60 : 64, shielded: true, kind,
      attackAt: this.clock + 3000 + Math.random() * 1600, staggerUntil: 0, chargeUntil: 0, chargeX: 0, chargeY: 0, dead: false, boss,
    };
    this.enemies.push(enemy);
  }

  private banner(kicker: string, title: string) {
    const text = this.add.text(520, 95, `${kicker}\n${title}`, { fontFamily: FONT, fontSize: '19px', color: '#d6dbdd', align: 'center', lineSpacing: 8, backgroundColor: '#131923', padding: { x: 25, y: 13 } }).setOrigin(.5).setDepth(1000);
    this.tweens.add({ targets: text, alpha: 0, delay: 1600, duration: 600, onComplete: () => text.destroy() });
  }

  update(_time: number, delta: number) {
    if (!this.player) return;
    if (!this.running || this.paused || this.finished || this.roomComplete) return;
    const dt = Math.min(delta, 40); this.clock += dt; this.elapsed += dt / 1000;
    const key = this.keys;
    if (Phaser.Input.Keyboard.JustDown(key.ONE)) this.equip(0);
    if (Phaser.Input.Keyboard.JustDown(key.TWO)) this.equip(1);
    if (Phaser.Input.Keyboard.JustDown(key.THREE)) this.equip(2);
    let mx = Number(key.D.isDown || key.RIGHT.isDown) - Number(key.A.isDown || key.LEFT.isDown);
    let my = Number(key.S.isDown || key.DOWN.isDown) - Number(key.W.isDown || key.UP.isDown);
    let length = Math.hypot(mx, my);
    if (length) { this.moveTarget = null; this.lockedTarget = null; this.attackTarget = null; this.movementMarker.clear(); }
    else if (this.moveTarget) {
      if (this.lockedTarget?.dead) this.lockedTarget = null;
      const destination = this.lockedTarget && !this.lockedTarget.dead ? this.lockedTarget.sprite : this.moveTarget;
      const dx = destination.x - this.player.x, dy = destination.y - this.player.y;
      const distance = Math.hypot(dx, dy);
      const stopRange = this.lockedTarget ? this.equipped[this.slot].kind === 'bow' ? 220 : this.lockedTarget.boss ? 104 : 74 : Math.max(4, .21 * dt);
      if (distance > stopRange) { mx = dx / distance; my = dy / distance; length = 1; }
      else if (!this.lockedTarget) { this.player.setPosition(this.moveTarget.x, this.moveTarget.y); this.moveTarget = null; this.movementMarker.clear(); }
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
    this.player.x = Phaser.Math.Clamp(this.player.x, 78, WIDTH - 78); this.player.y = Phaser.Math.Clamp(this.player.y, 110, HEIGHT - 78);
    this.player.setFlipX(Math.cos(this.angle) < 0).setDepth(this.player.y + 3);
    this.player.setAlpha(this.clock < this.invulnerableUntil ? .65 + Math.sin(this.clock / 55) * .25 : 1);
    const bob = length && this.clock >= this.dashUntil ? Math.sin(this.clock / 65) * 2 : 0;
    this.shadow.setPosition(this.player.x, this.player.y + 19).setDepth(this.player.y - 1);
    this.held.setPosition(this.player.x + Math.cos(this.angle) * 23, this.player.y + Math.sin(this.angle) * 15 + bob).setRotation(this.angle + Math.PI / 2).setDepth(this.player.y + 5);
    this.aimLine.clear().lineStyle(1, Phaser.Display.Color.HexStringToColor(COLORS[this.equipped[this.slot].kind]).color, .18);
    this.aimLine.lineBetween(this.player.x + Math.cos(this.angle) * 30, this.player.y + Math.sin(this.angle) * 30, this.player.x + Math.cos(this.angle) * 70, this.player.y + Math.sin(this.angle) * 70);
    if (target) {
      const x = target.sprite.x, y = target.sprite.y, r = target.boss ? 59 : 33;
      this.aimLine.lineStyle(1.5, 0x8debcf, .65);
      for (const side of [-1, 1]) this.aimLine.lineBetween(x + side * r, y - 10, x + side * r, y + 10).lineBetween(x + side * r, y - 10, x + side * (r - 6), y - 10).lineBetween(x + side * r, y + 10, x + side * (r - 6), y + 10);
    }
    if (key.SPACE.isDown && this.clock >= this.nextAttack && this.clock >= this.stunUntil && this.clock >= this.dashUntil) this.attack();
    for (const enemy of this.enemies) if (!enemy.dead) this.updateEnemy(enemy, dt);
    this.updateShots(dt);
    if (this.running && !this.finished && this.enemies.every(enemy => enemy.dead)) {
      this.roomComplete = true; this.score += 150; this.audio.play('clear'); this.sendState();
      this.emit({ type: 'clear', room: this.room });
    }
    if (this.clock - this.lastState > 100) { this.lastState = this.clock; this.sendState(); }
  }

  private attack() {
    const target = this.getAttackTarget();
    this.attackTarget = target;
    if (target) this.angle = Math.atan2(target.sprite.y - this.player.y, target.sprite.x - this.player.x);
    const word = this.equipped[this.slot]; const color = Phaser.Display.Color.HexStringToColor(COLORS[word.kind]).color;
    this.nextAttack = this.clock + ({ sword: 360, bow: 490, hammer: 660 }[word.kind]) / this.haste;
    this.audio.play('swing');
    if (word.kind === 'bow') {
      const object = this.add.circle(this.player.x + Math.cos(this.angle) * 24, this.player.y + Math.sin(this.angle) * 24, 5, color).setDepth(900);
      this.shots.push({ object, vx: Math.cos(this.angle) * .7, vy: Math.sin(this.angle) * .7, expires: this.clock + 1000, word });
    } else {
      const radius = word.kind === 'hammer' ? 107 : 100;
      const sweep = this.add.graphics().setDepth(900); sweep.lineStyle(word.kind === 'hammer' ? 8 : 4, color, .8);
      sweep.beginPath().arc(this.player.x, this.player.y, radius * .72, this.angle - .7, this.angle + .7).strokePath();
      if (word.kind === 'hammer') sweep.lineStyle(1, color, .35).strokeCircle(this.player.x + Math.cos(this.angle) * 68, this.player.y + Math.sin(this.angle) * 68, 35);
      this.tweens.add({ targets: sweep, alpha: 0, duration: 180, onComplete: () => sweep.destroy() });
      const targets = this.enemies.filter(enemy => {
        if (enemy.dead) return false;
        const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.sprite.x, enemy.sprite.y);
        const direction = Math.atan2(enemy.sprite.y - this.player.y, enemy.sprite.x - this.player.x);
        return distance < radius + (enemy.boss ? 25 : 0) && Math.abs(Phaser.Math.Angle.Wrap(direction - this.angle)) < 1;
      }).sort((a, b) => a === target ? -1 : b === target ? 1 : Phaser.Math.Distance.Between(this.player.x, this.player.y, a.sprite.x, a.sprite.y) - Phaser.Math.Distance.Between(this.player.x, this.player.y, b.sprite.x, b.sprite.y));
      if (targets[0]) this.strike(targets[0], word);
      if (word.kind === 'hammer' && targets[0] && !targets[0].shielded) for (const target of targets.slice(1)) if (!target.shielded) this.strike(target, word);
    }
  }

  private strike(enemy: Enemy, word: Word) {
    if (enemy.dead) return;
    const result = resolveStrike(word.id, enemy.word.id, enemy.shielded);
    if (result === 'rebound') {
      this.combo = 0; this.stunUntil = this.clock + 180; this.audio.play('wrong');
      this.floatText(enemy.sprite.x, enemy.sprite.y - 24, '튕김 · 다른 단어!', '#ef8997');
      this.emit({ type: 'attempt', word: enemy.word, result: 'wrong' });
      this.emit({ type: 'toast', text: '방어막의 뜻에 맞는 단어로 무기를 바꿔 보세요.' });
      this.burst(enemy.sprite.x, enemy.sprite.y, 0xee8592, 6); this.sendState(); return;
    }
    if (result === 'break') {
      enemy.shielded = false; enemy.ring.setVisible(false); enemy.label.setColor('#6ee7cc');
      enemy.label.setText(`✓ ${enemy.word.word}`); enemy.staggerUntil = this.clock + (enemy.boss ? 1000 : 1400);
      this.combo++; this.score += 60 + Math.min(this.combo, 5) * 10;
      this.emit({ type: 'attempt', word: enemy.word, result: 'correct' });
      this.audio.play('break'); this.cameras.main.shake(95, .0025); this.burst(enemy.sprite.x, enemy.sprite.y, 0x93f4df, 19);
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
      const damage = (word.kind === 'hammer' ? 42 : word.kind === 'bow' ? 28 : 26) + this.attackBoost;
      if (!enemy.boss) enemy.hp -= damage;
      this.floatText(enemy.sprite.x, enemy.sprite.y - 16, `−${enemy.boss ? 'STAGGER' : damage}`, COLORS[word.kind]);
      this.burst(enemy.sprite.x, enemy.sprite.y, 0xaaaed0, 5);
    }
    enemy.sprite.setTint(0xffffff);
    this.time.delayedCall(90, () => { if (!enemy.dead) enemy.sprite.clearTint(); });
    if (!enemy.boss && enemy.hp <= 0) this.kill(enemy);
    else if (!enemy.boss) {
      const away = Math.atan2(enemy.sprite.y - this.player.y, enemy.sprite.x - this.player.x);
      enemy.sprite.x = Phaser.Math.Clamp(enemy.sprite.x + Math.cos(away) * 16, 92, 948);
      enemy.sprite.y = Phaser.Math.Clamp(enemy.sprite.y + Math.sin(away) * 16, 115, 520);
    }
    this.sendState();
  }

  private kill(enemy: Enemy) {
    enemy.dead = true; this.kills++; this.score += enemy.boss ? 800 : 35;
    this.burst(enemy.sprite.x, enemy.sprite.y, enemy.boss ? 0xe8bb75 : 0xafa0d7, enemy.boss ? 50 : 12);
    enemy.sprite.destroy(); enemy.shadow.destroy(); enemy.label.destroy(); enemy.ring.destroy();
  }

  private updateEnemy(enemy: Enemy, dt: number) {
    const sprite = enemy.sprite;
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
    sprite.x = Phaser.Math.Clamp(sprite.x, 92, 948); sprite.y = Phaser.Math.Clamp(sprite.y, 125, 515);
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
      if (this.clock > shot.expires || shot.object.x < 60 || shot.object.x > 980 || shot.object.y < 90 || shot.object.y > 550) { shot.object.destroy(); return false; }
      if (shot.word) {
        const target = this.enemies.find(enemy => !enemy.dead && Phaser.Math.Distance.Between(shot.object.x, shot.object.y, enemy.sprite.x, enemy.sprite.y) < (enemy.boss ? 48 : 25));
        if (target) { this.strike(target, shot.word); shot.object.destroy(); return false; }
      } else if (Phaser.Math.Distance.Between(shot.object.x, shot.object.y, this.player.x, this.player.y) < 21) {
        this.hurt(8); shot.object.destroy(); return false;
      }
      return true;
    });
  }

  private hurt(amount: number) {
    if (this.clock < this.invulnerableUntil || this.finished) return;
    this.hp = Math.max(0, this.hp - amount); this.invulnerableUntil = this.clock + 850; this.combo = 0;
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
    const text = this.add.text(x, y, message, { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color, stroke: '#0b1018', strokeThickness: 4 }).setOrigin(.5).setDepth(1001);
    this.tweens.add({ targets: text, y: y - 38, alpha: 0, duration: 850, onComplete: () => text.destroy() });
  }

  snapshot(): Snapshot {
    return { hp: this.hp, maxHp: this.maxHp, score: this.score, combo: this.combo, kills: this.kills, room: this.room, totalRooms: this.groups.length + 1,
      roomName: this.roomTitle(), words: this.equipped, slot: this.slot, remaining: this.enemies.filter(enemy => !enemy.dead).length,
      elapsed: this.elapsed, dash: Math.max(0, Math.min(1, 1 - (this.nextDash - this.clock) / (1300 / this.haste))),
      boss: this.room >= this.groups.length, bossSeals: this.bossIndex, totalSeals: this.words.length,
      environment: this.room >= this.groups.length ? 'astral' : ENVIRONMENTS[this.room % 4] };
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
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene,
    input: { mouse: { preventDefaultWheel: false } }, render: { antialias: false }, banner: false });
  return { game, scene };
}
