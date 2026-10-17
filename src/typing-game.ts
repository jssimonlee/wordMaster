import Phaser from 'phaser';
import { DungeonScene, type GameEvent, type RunMode, type Snapshot } from './game';
import { DEFAULT_WORDS, type Word } from './data';
import { animateWalking, newWalk, type WalkState, type WalkingKind } from './walking';
import { RuneTowers, TOWER_SLOTS, towerAppearance, towerGlyph, towerInitial, towerSlotName, towerStats, type TowerUpgrade } from './towers';
import {
  letterCount, loadTypingRecords, loadTypingSettings, normalizeTyping, reactionCapacity, recordTypingSpeed,
  TYPING_MAP_NAME, TYPING_ROUNDS, typingPair, typingSpawnInterval, typingTier, type TypingSettings, type TypingView,
} from './typing';

interface StormMinion {
  shadow: Phaser.GameObjects.Ellipse; walk: WalkState; kind: WalkingKind;
  word: Word; sprite: Phaser.GameObjects.Sprite; label: Phaser.GameObjects.Text;
  aura: Phaser.GameObjects.Arc; health: Phaser.GameObjects.Graphics;
  rune: Phaser.GameObjects.Text;
  lane: number; hp: number; color: number; burn: number; dead: boolean; heat: number;
}
interface TowerMissile {
  image: Phaser.GameObjects.Image; target: StormMinion; initial: string; damage: number;
  expires: number; trailAt: number; slot: number; range: number; vx: number; vy: number;
}
const FONT = '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
const PALETTE = [0x89d5ed, 0xcba9ef, 0xe9c179, 0x8ac6aa, 0xe5a1b8, 0x9cb2ef];

/** A separate scene keeps typing/IME controls and storm effects out of the weapon combat. */
export class TypingScene extends DungeonScene {
  private typingEmit: (event: GameEvent) => void;
  private typingPlayer!: Phaser.GameObjects.Sprite;
  private typingShadow!: Phaser.GameObjects.Ellipse;
  private guardian!: Phaser.GameObjects.Sprite;
  private guardianLabel!: Phaser.GameObjects.Text;
  private guardianHealth!: Phaser.GameObjects.Graphics;
  private playerHealth!: Phaser.GameObjects.Graphics;
  private playerLabel!: Phaser.GameObjects.Text;
  private lightning!: Phaser.GameObjects.Graphics;
  private fire!: Phaser.GameObjects.Graphics;
  private scenery!: Phaser.GameObjects.Container;
  private swarm: StormMinion[] = [];
  private memories: Word[] = DEFAULT_WORDS;
  private typingSettings: TypingSettings = loadTypingSettings();
  private speedRecords = loadTypingRecords();
  private typingLive = false;
  private typingPaused = false;
  private typingFinished = false;
  private round = 1;
  private healthPoints = 100;
  private stormScore = 0;
  private stormKills = 0;
  private stormCombo = 0;
  private stormLeaks = 0;
  private stormClock = 0;
  private waveClock = 0;
  private waveSpawned = 0;
  private spawnAt = 0;
  private waveEndsAt = 0;
  private bootTime = 0;
  private pauseBegan = 0;
  private pausedTime = 0;
  private attemptBegan: number | null = null;
  private rawInput = '';
  private committedInput = '';
  private composingInput = false;
  private lastError = false;
  private matchingWord: Word | null = null;
  private resultText = '';
  private resultUntil = 0;
  private resultRecord = false;
  private publishAt = 0;
  private w = 1040;
  private h = 620;
  private top = 150;
  private bottom = 480;
  private goal = 85;
  private spawnX = 860;
  private laneCount = 3;
  private laneGap = 90;
  private moveTo: { x: number; y: number } | null = null;
  private connected: StormMinion[] = [];
  private pendingComposition: { value: string; completedAt: number } | null = null;
  private fortifications = new RuneTowers();
  private towerPads: Phaser.GameObjects.Container[] = [];
  private towerReach!: Phaser.GameObjects.Graphics;
  private towerEditing = false;
  private towerRune: string | null = null;
  private towerSelected: number | null = null;
  private towerMoving = false;
  private towerMissiles: TowerMissile[] = [];

  constructor(emit: (event: GameEvent) => void) { super(emit, 1, 'typing'); this.typingEmit = emit; }
  override preload() { /* Assets are shared with the already-loaded dungeon scene. */ }

  override create(data: { words?: Word[] } = {}) {
    this.memories = data.words?.length ? data.words : DEFAULT_WORDS;
    this.typingSettings = loadTypingSettings(); this.speedRecords = loadTypingRecords();
    this.typingLive = true; this.typingPaused = this.typingFinished = false;
    this.time.paused = false;
    this.round = 1; this.healthPoints = 100;
    this.stormScore = this.stormKills = this.stormCombo = this.stormLeaks = this.stormClock = 0;
    this.pausedTime = this.pauseBegan = 0; this.bootTime = performance.now();
    this.swarm = []; this.connected = []; this.moveTo = null;
    this.fortifications = new RuneTowers(); this.towerPads = [];
    this.towerMissiles = [];
    this.towerEditing = this.towerMoving = false; this.towerRune = null; this.towerSelected = null;
    this.resultText = ''; this.resultRecord = false; this.resultUntil = 0; this.publishAt = 0;
    this.resetInput();
    this.scenery = this.add.container(0, 0).setDepth(-20);
    this.lightning = this.add.graphics().setDepth(700);
    this.fire = this.add.graphics().setDepth(701);
    this.typingShadow = this.add.ellipse(0, 0, 62, 20, 0x020915, .5);
    this.typingPlayer = this.add.sprite(0, 0, 'lightning-mage').setOrigin(.5, .85).setDisplaySize(108, 108);
    this.playerHealth = this.add.graphics().setDepth(805);
    this.playerLabel = this.add.text(0, 0, '', { resolution: 3, fontFamily: FONT, fontSize: '12px', color: '#e9f8ff', stroke: '#102030', strokeThickness: 3 }).setOrigin(.5, 1).setDepth(806);
    this.guardian = this.add.sprite(0, 0, 'characters', 'boss').setDisplaySize(89, 100).setTint(0xc4d9ed);
    this.guardianLabel = this.add.text(0, 0, '백뢰의 파수꾼', { resolution: 3, fontFamily: FONT, fontSize: '14px', color: '#e8f4ff', stroke: '#101a2b', strokeThickness: 4 }).setOrigin(.5, 1).setDepth(800);
    this.guardianHealth = this.add.graphics().setDepth(800);
    this.towerReach = this.add.graphics().setDepth(-1);
    for (let slot = 0; slot < TOWER_SLOTS; slot++) {
      this.towerPads.push(this.add.container(0, 0, [this.add.graphics(),
        this.add.image(0, 0, 'guardian-evolution-1').setOrigin(.5, .73).setVisible(false),
        this.add.text(0, -4, '', { resolution: 3, fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#ecfbff', stroke: '#102538', strokeThickness: 3 }).setOrigin(.5).setName('tower-rune'),
        this.add.text(0, 29, '', { resolution: 3, fontFamily: FONT, fontSize: '10px', color: '#c6e9f6', stroke: '#102538', strokeThickness: 3 }).setOrigin(.5)]).setDepth(600));
    }
    this.resizeTyping();
    this.typingPlayer.setPosition(Math.max(120, Math.min(240, this.w * .21)), (this.top + this.bottom) / 2 + 24);
    this.scale.on('resize', this.resizeTyping, this);
    this.events.once('shutdown', () => { this.scale.off('resize', this.resizeTyping, this); this.typingLive = false; });
    this.input.keyboard!.clearCaptures();
    const onPointer = (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonDown() || !this.typingLive || this.typingFinished || (this.typingPaused && !this.towerEditing)) return;
      const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const slot = this.towerPads.findIndex(pad => Math.abs(point.x - pad.x) <= 29 && Math.abs(point.y - pad.y) <= 32);
      if (slot >= 0) {
        if (!this.towerEditing) this.editTowers();
        this.selectTowerSlot(slot); return;
      }
      if (this.towerEditing) {
        this.closeTowers();
        document.getElementById('typing-input')?.focus({ preventScroll: true });
        return;
      }
      this.moveTo = { x: Phaser.Math.Clamp(point.x, 72, this.w - 65), y: Phaser.Math.Clamp(point.y, this.top + 35, this.bottom - 15) };
      document.getElementById('typing-input')?.focus({ preventScroll: true });
    };
    this.input.on('pointerdown', onPointer);
    this.events.once('shutdown', () => this.input.off('pointerdown', onPointer));
    this.beginWave(); this.drawBars(); this.publish();
    this.audio.unlock();
  }

  override start(words: Word[], _mode: RunMode = 'typing') {
    this.typingLive = false;
    this.game.scene.start('typing', { words });
  }
  override isRunning() { return this.typingLive && !this.typingFinished; }
  override setPaused(paused: boolean) {
    if (!this.typingLive || this.typingPaused === paused) return;
    this.typingPaused = paused;
    if (paused) { this.pauseBegan = performance.now(); this.time.paused = true; this.tweens.pauseAll(); }
    else { this.pausedTime += performance.now() - this.pauseBegan; this.time.paused = false; this.tweens.resumeAll(); }
  }
  override equip(_slot: number) { /* Native typing keys never equip or fire a weapon. */ }
  override getPlayerAnchor() { return { x: this.typingPlayer.x / this.w, y: this.typingPlayer.y / this.h, head: 90 / this.h }; }
  private activeNow() { return (this.typingPaused ? this.pauseBegan : performance.now()) - this.bootTime - this.pausedTime; }
  private quota() { return 10 + Math.floor((this.round - 1) / 3) * 2; }
  private laneY(lane: number) { return (this.top + this.bottom) / 2 + (lane - (this.laneCount - 1) / 2) * this.laneGap; }

  private resizeTyping() {
    const bounds = this.game.canvas.parentElement!.getBoundingClientRect();
    const zoom = Math.min(1.35, Math.max(1, bounds.width / 1040));
    const oldW = this.w, oldH = this.h, oldGoal = this.goal, oldSpawn = this.spawnX;
    this.w = bounds.width / zoom; this.h = bounds.height / zoom;
    this.cameras.main.setZoom(this.scale.gameSize.width / this.w).setScroll((this.w - this.scale.gameSize.width) / 2, (this.h - this.scale.gameSize.height) / 2);
    const hud = document.querySelector<HTMLElement>('.bottom-hud');
    const status = document.querySelector<HTMLElement>('.arena-status');
    this.top = Math.max(135 / zoom, ((status?.offsetTop ?? 90) + (status?.offsetHeight ?? 20) + 45) / zoom);
    this.bottom = this.h - ((hud?.offsetHeight ?? 180) + 26) / zoom;
    this.goal = Math.min(85, this.w * .15); this.spawnX = this.w - 135;
    this.laneCount = this.bottom - this.top > 390 ? 3 : this.bottom - this.top > 305 ? 2 : 1;
    this.laneGap = Math.min(115, Math.max(50, (this.bottom - this.top - 220) / Math.max(1, this.laneCount - 1)));
    for (const enemy of this.swarm) if (!enemy.dead) {
      enemy.sprite.setPosition(this.goal + (enemy.sprite.x - oldGoal) / Math.max(1, oldSpawn - oldGoal) * (this.spawnX - this.goal), this.laneY(enemy.lane % this.laneCount));
      enemy.lane %= this.laneCount;
    }
    this.typingPlayer?.setPosition(Phaser.Math.Clamp(this.typingPlayer.x / oldW * this.w, 72, this.w - 65), Phaser.Math.Clamp(this.typingPlayer.y / oldH * this.h, this.top + 35, this.bottom));
    this.guardian?.setPosition(this.w - 60, (this.top + this.bottom) / 2 + 20);
    this.moveTo = null;
    if (this.scenery) this.paintStormMap();
    this.paintTowerPads();
  }

  private paintStormMap() {
    this.scenery.removeAll(true);
    const texture = this.textures.get('background-tempest'), source = texture.getSourceImage();
    if (!texture.has('storm-road')) {
      const north = Math.round(source.height * .25), south = Math.round(source.height * .66);
      texture.add('storm-north', 0, 0, 0, source.width, north);
      texture.add('storm-road', 0, 0, north, source.width, south - north);
      texture.add('storm-south', 0, 0, south, source.width, source.height - south);
    }
    const roadTop = this.top - 20, roadBottom = this.bottom + 15;
    for (const [frame, y, height] of [['storm-north', 0, roadTop], ['storm-road', roadTop, roadBottom - roadTop], ['storm-south', roadBottom, this.h - roadBottom]] as const) {
      this.scenery.add(this.add.image(0, y, 'background-tempest', frame).setOrigin(0).setDisplaySize(this.w, height));
    }
    const wards = this.add.graphics(); this.scenery.add(wards);
    wards.lineStyle(5, 0xb3e9ff, .12).lineBetween(this.goal, roadTop, this.goal, roadBottom);
    wards.lineStyle(1.5, 0xe4f9ff, .75).lineBetween(this.goal, roadTop, this.goal, roadBottom);
    for (let y = roadTop + 12; y < roadBottom; y += 32) wards.lineStyle(1, 0xccf3ff, .5).strokeCircle(this.goal, y, 5);
    this.scenery.add(this.add.text(this.goal, roadBottom + 12, '수호선', { resolution: 3, fontFamily: FONT, fontSize: '12px', color: '#d9eeff', stroke: '#0d2435', strokeThickness: 3 }).setOrigin(.5, 0));
  }

  editTowers() {
    if (!this.isRunning() || (this.typingPaused && !this.towerEditing)) return;
    this.towerEditing = true; this.moveTo = null; this.setPaused(true);
    this.paintTowerPads(); this.publish();
  }
  closeTowers() {
    if (!this.towerEditing) return;
    this.towerEditing = this.towerMoving = false; this.towerRune = null; this.towerSelected = null;
    this.setPaused(false); this.paintTowerPads(); this.publish();
  }
  chooseTowerRune(initial: string) {
    if (!this.towerEditing || !this.fortifications.runes.includes(initial)) return;
    this.towerRune = initial; this.towerSelected = null; this.towerMoving = false;
    this.paintTowerPads(); this.publish();
  }
  selectTowerSlot(slot: number) {
    if (!this.towerEditing || !Number.isInteger(slot) || slot < 0 || slot >= TOWER_SLOTS) return;
    if (this.fortifications.at(slot)) {
      this.towerSelected = slot; this.towerRune = null; this.towerMoving = false;
    } else if (this.towerMoving && this.towerSelected !== null) {
      if (this.fortifications.move(this.towerSelected, slot)) { this.towerSelected = slot; this.towerMoving = false; }
    } else if (this.towerRune && this.fortifications.build(slot, this.towerRune, this.stormClock)) {
      this.towerSelected = slot; this.towerRune = null; this.audio.play('clear');
    }
    this.paintTowerPads(); this.publish();
  }
  upgradeTower(kind: TowerUpgrade) {
    if (!this.towerEditing || this.towerSelected === null) return;
    const tower = this.fortifications.at(this.towerSelected);
    if (!tower) return;
    const oldInterval = towerStats(tower.upgrades).interval;
    if (!this.fortifications.upgrade(this.towerSelected, kind)) return;
    tower.nextShot = this.stormClock + Math.max(0, tower.nextShot - this.stormClock) * towerStats(tower.upgrades).interval / oldInterval;
    this.audio.play('break'); this.paintTowerPads(); this.publish();
    const pad = this.towerPads[this.towerSelected], level = this.fortifications.at(this.towerSelected)!.level;
    const glow = this.add.circle(pad.x, pad.y + 10, 14).setStrokeStyle(2, level >= 4 ? 0xffdf9b : 0x9fefff, .8).setDepth(601);
    this.tweens.add({ targets: glow, scale: 2.4, alpha: 0, duration: 420, onComplete: () => glow.destroy() });
  }
  moveTower() {
    if (!this.towerEditing || this.towerSelected === null || !this.fortifications.at(this.towerSelected)) return;
    this.towerMoving = true; this.towerRune = null; this.paintTowerPads(); this.publish();
  }
  private towerRange(scale: number) { return Math.max(260, (this.bottom - this.top) / 2 + 40) * scale; }
  private paintTowerPads() {
    if (!this.towerReach) return;
    this.towerReach.clear();
    const left = this.goal + Math.min(100, (this.spawnX - this.goal) * .22), right = this.spawnX - 30;
    for (let slot = 0; slot < this.towerPads.length; slot++) {
      const pad = this.towerPads[slot], tower = this.fortifications.at(slot);
      const selected = this.towerEditing && slot === this.towerSelected;
      const available = this.towerEditing && !tower && Boolean(this.towerRune || this.towerMoving);
      pad.setPosition(Phaser.Math.Linear(left, right, slot % 3 / 2), slot < 3 ? this.top + 22 : this.bottom - 30);
      const [stone, illustration, glyph, label] = pad.list as [Phaser.GameObjects.Graphics, Phaser.GameObjects.Image, Phaser.GameObjects.Text, Phaser.GameObjects.Text];
      const color = selected ? 0xffe2a0 : available ? 0xacf1cf : 0x8fcee6;
      stone.clear().fillStyle(0x123349, tower ? .4 : .2).fillEllipse(0, 17, 57, 24)
        .lineStyle(selected ? 2.5 : 1.2, color, tower || available ? .8 : .32).strokeEllipse(0, 17, 58, 25);
      if (!tower) stone.lineStyle(1, color, .3).strokeCircle(0, -3, 17);
      const appearance = towerAppearance(tower?.level ?? 1), size = Math.min(appearance.size, Math.max(54, (right - left) / 2 * .88));
      illustration.setTexture(appearance.texture).setVisible(Boolean(tower)).setDisplaySize(size, size).setTint(tower && tower.level >= 5 ? 0xffefce : 0xffffff);
      glyph.setPosition((appearance.runeX - .5) * size, (appearance.runeY - .73) * size).setColor(tower && tower.level >= 5 ? '#ffe3a5' : '#effbff');
      glyph.setFontSize(tower ? 17 : 15).setStroke('#102538', tower ? 2 : 3).setText(tower ? towerGlyph(tower.initial) : '+').setAlpha(tower || this.towerEditing ? 1 : .5);
      label.setText(`${towerSlotName(slot)}${tower ? ` · Lv.${tower.level}` : ''}`).setAlpha(tower || this.towerEditing ? 1 : .5);
      if (selected && tower) this.towerReach.fillStyle(0x9ae3ff, .045).fillCircle(pad.x, pad.y, this.towerRange(towerStats(tower.upgrades).range))
        .lineStyle(1, 0xa5e7ff, .35).strokeCircle(pad.x, pad.y, this.towerRange(towerStats(tower.upgrades).range));
    }
  }
  private updateTowers() {
    for (const tower of this.fortifications.towers) {
      if (this.stormClock < tower.nextShot) continue;
      const pad = this.towerPads[tower.slot], stats = towerStats(tower.upgrades);
      const targets = this.swarm.filter(enemy => !enemy.dead && towerInitial(typingPair(enemy.word, this.round).answer) === tower.initial
        && Phaser.Math.Distance.Between(pad.x, pad.y, enemy.sprite.x, enemy.sprite.y) <= this.towerRange(stats.range)).sort((a, b) => a.sprite.x - b.sprite.x);
      if (!targets.length) continue;
      tower.nextShot = this.stormClock + stats.interval; tower.shots++;
      const appearance = towerAppearance(tower.level), illustration = pad.list[1] as Phaser.GameObjects.Image;
      const muzzleY = pad.y - appearance.muzzle * illustration.displayWidth / appearance.size, size = 39 + Math.min(9, tower.level - 1);
      for (let index = 0; index < stats.projectiles; index++) {
        // Distribute a volley across matching targets; spare shots focus the nearest ones.
        const target = targets[index % targets.length], spread = index - (stats.projectiles - 1) / 2;
        const angle = Math.atan2(target.sprite.y - 12 - muzzleY, target.sprite.x - pad.x) + spread * .2;
        const image = this.add.image(pad.x + spread * 3, muzzleY, 'guardian-missile').setDepth(704).setRotation(angle);
        image.setDisplaySize(size, size * image.frame.realHeight / image.frame.realWidth);
        this.towerMissiles.push({ image, target, initial: tower.initial, damage: stats.damage, expires: this.stormClock + 2200,
          trailAt: 0, slot: tower.slot, range: stats.range, vx: Math.cos(angle) * .72, vy: Math.sin(angle) * .72 });
      }
      const glow = this.add.circle(pad.x, muzzleY, 6, 0xc9f6ff, .65).setDepth(703);
      this.tweens.add({ targets: glow, scale: 2, alpha: 0, duration: 170, onComplete: () => glow.destroy() });
    }
  }

  private updateTowerMissiles(dt: number) {
    this.towerMissiles = this.towerMissiles.filter(missile => {
      if (this.stormClock >= missile.expires) { missile.image.destroy(); return false; }
      if (missile.target.dead) {
        const pad = this.towerPads[missile.slot];
        const replacement = this.swarm.filter(enemy => !enemy.dead && towerInitial(typingPair(enemy.word, this.round).answer) === missile.initial
          && Phaser.Math.Distance.Between(pad.x, pad.y, enemy.sprite.x, enemy.sprite.y) <= this.towerRange(missile.range))
          .sort((a, b) => a.sprite.x - b.sprite.x)[0];
        if (!replacement) { missile.image.destroy(); return false; }
        missile.target = replacement;
      }
      const target = missile.target, image = missile.image;
      const dx = target.sprite.x - image.x, dy = target.sprite.y - 12 - image.y;
      const distance = Math.hypot(dx, dy), step = dt * .72;
      const steer = 1 - Math.exp(-dt / 90);
      missile.vx += (dx / Math.max(1, distance) * .72 - missile.vx) * steer;
      missile.vy += (dy / Math.max(1, distance) * .72 - missile.vy) * steer;
      image.setRotation(Math.atan2(missile.vy, missile.vx));
      if (distance <= step + 12) {
        const hit = this.add.circle(target.sprite.x, target.sprite.y - 12, 6).setStrokeStyle(2, 0xbdf1ff, .9).setDepth(705);
        this.tweens.add({ targets: hit, scale: 2.5, alpha: 0, duration: 180, onComplete: () => hit.destroy() });
        target.hp -= missile.damage; image.destroy();
        if (target.hp <= 0) {
          const wasTypingTarget = this.committedInput && normalizeTyping(typingPair(target.word, this.round).answer).startsWith(normalizeTyping(this.committedInput));
          this.destroyMinion(target);
          if (wasTypingTarget && !this.swarm.some(enemy => !enemy.dead && normalizeTyping(typingPair(enemy.word, this.round).answer).startsWith(normalizeTyping(this.committedInput)))) {
            this.resetInput(); this.resultText = `${towerGlyph(missile.initial)} 탑이 대상 처치 · 다음 답을 입력하세요`; this.resultUntil = this.stormClock + 1800; this.resultRecord = false;
            this.publish(true);
          }
        }
        return false;
      }
      if (this.stormClock >= missile.trailAt) {
        missile.trailAt = this.stormClock + 45;
        const trail = this.add.circle(image.x, image.y, 2.5, 0x9de6ff, .45).setDepth(702);
        this.tweens.add({ targets: trail, alpha: 0, scale: .2, duration: 180, onComplete: () => trail.destroy() });
      }
      image.x += missile.vx * dt; image.y += missile.vy * dt;
      return true;
    });
  }

  private beginWave() {
    for (const missile of this.towerMissiles) missile.image.destroy();
    this.towerMissiles = [];
    this.waveClock = this.stormClock; this.waveSpawned = 0; this.waveEndsAt = 0; this.spawnAt = this.stormClock + 2500;
    this.resetInput(); this.publish(true);
    const count = Math.min(this.laneCount, this.memories.length);
    for (let i = 0; i < count; i++) this.spawnMinion(i, this.spawnX - i * 16);
    this.announce(`ROUND ${this.round} / ${TYPING_ROUNDS}`, this.round === 7 ? '기억 반전 · 이제 문제·뜻을 타이핑하세요' : this.round === 1 ? '문제에 맞는 답을 타이핑하세요' : '새로운 기억이 밀려옵니다');
  }

  private spawnMinion(lane = this.waveSpawned % this.laneCount, x = this.spawnX) {
    if (this.waveSpawned >= this.quota() || this.swarm.filter(enemy => !enemy.dead).length >= 22) return null;
    if (this.swarm.some(enemy => !enemy.dead && enemy.lane === lane && enemy.sprite.x > x - Math.min(135, (this.spawnX - this.goal) * .42))) return null;
    const poolSize = Math.min(this.memories.length, 3 + Math.floor((this.round - 1) / 2));
    const index = ((this.round - 1) * 2 + this.waveSpawned % poolSize) % this.memories.length;
    const word = this.memories[index], color = PALETTE[index % PALETTE.length], y = this.laneY(lane);
    const kind = (['chaser', 'charger', 'caster'] as const)[index % 3];
    const sprite = this.add.sprite(x, y, 'characters', kind).setDisplaySize(52, 58).setFlipX(true).setTint(color);
    const shadow = this.add.ellipse(x, y + 26, 35, 10, 0x020c1c, .4).setDepth(y - 1);
    sprite.once('destroy', () => shadow.destroy());
    const pair = typingPair(word, this.round);
    const label = this.add.text(x, y - 48, pair.prompt, { resolution: 3, fontFamily: FONT, fontSize: pair.prompt.length > 22 ? '12px' : '15px', fontStyle: 'bold', color: '#f7f3e9', backgroundColor: '#0c2034ed', stroke: '#071526', strokeThickness: 2, padding: { x: 7, y: 4 }, align: 'center', wordWrap: { width: Math.min(165, this.w * .34), useAdvancedWrap: true } }).setOrigin(.5, 1).setDepth(800);
    const rune = this.add.text(x + 31, y - 12, towerGlyph(towerInitial(pair.answer)), { resolution: 3, fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#b7edff', backgroundColor: '#112c42', padding: { x: 4, y: 2 } }).setOrigin(.5).setDepth(802);
    sprite.once('destroy', () => rune.destroy());
    const aura = this.add.circle(x, y - 8, 35, 0xff4935, .18).setStrokeStyle(2, 0xffb869, .55).setVisible(false);
    const enemy: StormMinion = { word, sprite, label, aura, rune, shadow, walk: newWalk(this.waveSpawned + this.round * 3), kind, health: this.add.graphics().setDepth(801), lane, hp: 100, color, burn: 0, dead: false, heat: 0 };
    this.swarm.push(enemy); this.waveSpawned++;
    this.publish(); return enemy;
  }

  noteTypingKey() { if (this.isRunning() && !this.typingPaused && this.attemptBegan === null) this.attemptBegan = this.activeNow(); }
  acceptTyping(value: string, composing = false, committed = value, confirm = false) {
    if (!this.isRunning() || this.typingPaused) return;
    if (!confirm && value === this.rawInput && composing === this.composingInput) return;
    if (value) this.noteTypingKey();
    const wasComposing = this.composingInput, previousPending = this.pendingComposition;
    this.pendingComposition = null;
    this.rawInput = value; this.committedInput = composing ? committed : value; this.composingInput = composing;
    if (!value) { this.resetInput(); this.publish(); return; }
    if (composing && !/[\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\ud7b0-\ud7ff]/u.test(value)) {
      const normalized = normalizeTyping(value);
      const provisional = this.swarm.filter(enemy => !enemy.dead && normalizeTyping(typingPair(enemy.word, this.round).answer).startsWith(normalized));
      if (provisional.length) this.committedInput = value;
      if (provisional.some(enemy => normalizeTyping(typingPair(enemy.word, this.round).answer) === normalized)) {
        this.pendingComposition = { value, completedAt: this.activeNow() };
      }
    }
    const prefix = normalizeTyping(this.committedInput);
    const candidates = this.swarm.filter(enemy => !enemy.dead && normalizeTyping(typingPair(enemy.word, this.round).answer).startsWith(prefix));
    if (!composing && !candidates.length) {
      if (!this.lastError) {
        const word = this.matchingWord ?? this.swarm.find(enemy => !enemy.dead)?.word;
        if (word) this.typingEmit({ type: 'attempt', word, result: 'wrong' });
        this.audio.play('wrong'); this.stormCombo = 0;
      }
      this.lastError = true; this.connected = []; this.publish(); return;
    }
    this.lastError = false;
    if (candidates.length && prefix) this.matchingWord = candidates[0].word;
    if (!composing) {
      const exact = candidates.find(enemy => normalizeTyping(typingPair(enemy.word, this.round).answer) === prefix);
      const longer = candidates.some(enemy => normalizeTyping(typingPair(enemy.word, this.round).answer) !== prefix);
      const completedAt = previousPending?.value === value ? previousPending.completedAt : this.activeNow();
      if (exact && (confirm || !longer)) { this.completeSpell(exact, completedAt); return; }
      if (exact && wasComposing) this.pendingComposition = { value, completedAt };
    }
    this.publish();
  }

  private resetInput() {
    this.rawInput = this.committedInput = ''; this.composingInput = this.lastError = false;
    this.attemptBegan = null; this.matchingWord = null; this.connected = [];
    this.pendingComposition = null;
  }
  private currentView(): TypingView {
    const prefix = normalizeTyping(this.committedInput), letters = letterCount(this.committedInput);
    const elapsed = this.attemptBegan === null ? 0 : Math.max(0, this.activeNow() - this.attemptBegan);
    const rate = letters ? elapsed / 1000 / letters : null;
    const matches = prefix ? this.swarm.filter(enemy => !enemy.dead && normalizeTyping(typingPair(enemy.word, this.round).answer).startsWith(prefix)).sort((a, b) => a.sprite.x - b.sprite.x) : [];
    const capacity = reactionCapacity(elapsed, letters, this.typingSettings);
    this.connected = matches.slice(0, capacity);
    const progress = matches.length ? Math.max(...matches.map(enemy => letters / letterCount(typingPair(enemy.word, this.round).answer))) : 0;
    const exact = matches.some(enemy => normalizeTyping(typingPair(enemy.word, this.round).answer) === prefix);
    return { value: this.rawInput, composing: this.composingInput, valid: !this.lastError, letters, progress, rate,
      capacity: Number.isFinite(capacity) ? capacity : -1, connected: this.connected.length,
      ambiguous: exact && matches.some(enemy => normalizeTyping(typingPair(enemy.word, this.round).answer) !== prefix),
      result: this.stormClock < this.resultUntil ? this.resultText : '', record: this.stormClock < this.resultUntil && this.resultRecord };
  }

  private completeSpell(primary: StormMinion, completedAt = this.activeNow()) {
    const answer = typingPair(primary.word, this.round).answer;
    const seconds = Math.max(.001, (completedAt - (this.attemptBegan ?? completedAt)) / 1000);
    const rate = seconds / Math.max(1, letterCount(answer)), tier = typingTier(rate, this.typingSettings);
    const targets = this.swarm.filter(enemy => !enemy.dead && normalizeTyping(typingPair(enemy.word, this.round).answer) === normalizeTyping(answer)).sort((a, b) => a.sprite.x - b.sprite.x).slice(0, Math.max(1, tier));
    const origin = { x: targets[0].sprite.x, y: targets[0].sprite.y };
    const recordKey = `${this.round >= 7 ? 'reverse' : 'forward'}:${primary.word.id}:${normalizeTyping(answer)}`;
    const record = recordTypingSpeed(this.speedRecords, recordKey, rate);
    this.typingEmit({ type: 'attempt', word: primary.word, result: 'correct' });
    this.stormCombo++; this.stormScore += tier ? 60 + tier * 35 : 20;
    this.audio.play(tier ? 'break' : 'hit');
    for (const target of targets) {
      this.flashBolt(target.sprite.x, target.sprite.y - 12);
      if (tier) this.destroyMinion(target);
      else { target.hp = Math.max(1, target.hp - 28); target.burn = this.stormClock + 1800; }
    }
    if (record) this.recordShockwave(origin.x, origin.y, targets);
    const towerReward = this.fortifications.earn(answer, tier);
    this.resultRecord = record; this.resultUntil = this.stormClock + 2500;
    this.resultText = `${towerReward ? '탑 포인트 +1 · ' : ''}${record ? '기록 경신 · ' : ''}${tier ? `${Math.min(tier, targets.length)}연쇄 폭발` : '불꽃 피해'} · ${rate.toFixed(3)}초/글자`;
    this.resetInput(); this.publish(true);
    if (towerReward) {
      const initial = towerInitial(answer), existing = this.fortifications.towers.find(tower => tower.initial === initial);
      this.towerSelected = existing?.slot ?? null;
      this.towerRune = existing ? null : initial;
      this.towerMoving = false;
      this.lightning.clear(); this.fire.clear();
      this.editTowers();
    }
  }

  private recordShockwave(x: number, y: number, directTargets: StormMinion[]) {
    const radius = Math.min(180, this.w * .35);
    this.explosion(x, y, 0xe6faff, radius);
    for (const enemy of this.swarm) {
      if (enemy.dead || directTargets.includes(enemy)) continue;
      const distance = Phaser.Math.Distance.Between(x, y, enemy.sprite.x, enemy.sprite.y);
      if (distance > radius) continue;
      enemy.hp -= distance < 48 ? 100 : Math.max(12, Math.round(85 * (1 - distance / radius)));
      enemy.burn = this.stormClock + 900;
      if (enemy.hp <= 0) this.destroyMinion(enemy);
    }
  }
  private destroyMinion(enemy: StormMinion) {
    if (enemy.dead) return;
    enemy.dead = true; this.stormKills++; this.stormScore += 45;
    enemy.shadow.destroy();
    this.explosion(enemy.sprite.x, enemy.sprite.y - 8, 0xffa657, 60);
    enemy.label.destroy(); enemy.aura.destroy(); enemy.health.destroy(); enemy.rune.destroy();
    this.tweens.add({ targets: enemy.sprite, alpha: 0, scaleX: enemy.sprite.scaleX * 1.3, scaleY: enemy.sprite.scaleY * 1.3, duration: 180, onComplete: () => enemy.sprite.destroy() });
  }
  private explosion(x: number, y: number, color: number, radius: number) {
    const ring = this.add.circle(x, y, 10, color, .5).setStrokeStyle(3, 0xffffff, .9).setDepth(900);
    this.tweens.add({ targets: ring, radius, alpha: 0, duration: 450, onComplete: () => ring.destroy() });
    for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI / 6, spark = this.add.circle(x, y, 2 + i % 3, i % 2 ? color : 0xffffff).setDepth(901);
      this.tweens.add({ targets: spark, x: x + Math.cos(angle) * radius, y: y + Math.sin(angle) * radius * .7, alpha: 0, duration: 350 + i * 12, onComplete: () => spark.destroy() });
    }
  }
  private strokeBolt(g: Phaser.GameObjects.Graphics, x: number, y: number, seed: number) {
    const fromX = this.typingPlayer.x + (this.typingPlayer.flipX ? -35 : 35), fromY = this.typingPlayer.y - 62;
    const points = Array.from({ length: 11 }, (_, i) => ({ x: Phaser.Math.Linear(fromX, x, i / 10), y: Phaser.Math.Linear(fromY, y, i / 10) + (i && i < 10 ? Math.sin(seed * 31 + i * 13 + this.stormClock / 48) * 9 : 0) }));
    for (const [width, color, alpha] of [[7, 0xa4e3ff, .14], [3, 0xffffff, .65], [1.2, 0xffffff, 1]]) {
      g.lineStyle(width, color, alpha).beginPath().moveTo(points[0].x, points[0].y);
      for (const point of points.slice(1)) g.lineTo(point.x, point.y);
      g.strokePath();
    }
  }
  private flashBolt(x: number, y: number) {
    const bolt = this.add.graphics().setDepth(899); this.strokeBolt(bolt, x, y, 1);
    this.tweens.add({ targets: bolt, alpha: 0, duration: 220, onComplete: () => bolt.destroy() });
  }
  private announce(kicker: string, message: string) {
    const text = this.add.text(this.w / 2, this.top + 18, `${kicker}\n${message}`, { resolution: 3, fontFamily: FONT, fontSize: '17px', fontStyle: 'bold', align: 'center', color: '#f0faff', stroke: '#102234', strokeThickness: 5 }).setOrigin(.5).setDepth(920);
    this.tweens.add({ targets: text, alpha: 0, y: text.y - 12, delay: 1300, duration: 500, onComplete: () => text.destroy() });
  }

  override update(_time: number, delta: number) {
    if (!this.typingLive || this.typingPaused || this.typingFinished) return;
    const dt = Math.min(80, delta); this.stormClock += dt;
    if (this.pendingComposition && this.activeNow() - this.pendingComposition.completedAt >= 250) {
      const pending = this.pendingComposition; this.pendingComposition = null;
      const target = this.swarm.find(enemy => !enemy.dead && normalizeTyping(typingPair(enemy.word, this.round).answer) === normalizeTyping(pending.value));
      if (target && this.rawInput === pending.value) this.completeSpell(target, pending.completedAt);
    }
    if (this.typingPaused || this.typingFinished) return;
    if (this.moveTo) {
      const distance = Phaser.Math.Distance.Between(this.typingPlayer.x, this.typingPlayer.y, this.moveTo.x, this.moveTo.y), step = dt * .2;
      if (distance < step) { this.typingPlayer.setPosition(this.moveTo.x, this.moveTo.y); this.moveTo = null; }
      else { const angle = Math.atan2(this.moveTo.y - this.typingPlayer.y, this.moveTo.x - this.typingPlayer.x); this.typingPlayer.x += Math.cos(angle) * step; this.typingPlayer.y += Math.sin(angle) * step; }
    }
    if (!this.waveEndsAt && this.stormClock >= this.spawnAt && this.waveSpawned < this.quota()) {
      const spawned = this.spawnMinion();
      this.spawnAt = this.stormClock + (spawned ? typingSpawnInterval(this.round, this.stormClock - this.waveClock) : 250);
    }
    for (const enemy of this.swarm) if (!enemy.dead) {
      const distance = (this.spawnX - this.goal) / 47000 * (1 + (this.round - 1) * .035) * dt;
      enemy.sprite.x -= distance;
      enemy.shadow.setPosition(enemy.sprite.x, enemy.sprite.y + 26).setDepth(enemy.sprite.y - 1);
      animateWalking(enemy.sprite, enemy.shadow, enemy.walk, enemy.kind, distance, dt);
      if (enemy.burn > this.stormClock) { enemy.hp -= dt * .008; if (enemy.hp <= 0) { this.destroyMinion(enemy); continue; } }
      if (enemy.sprite.x < this.goal) {
        enemy.dead = true; this.stormLeaks++; this.healthPoints = Math.max(0, this.healthPoints - 12); this.stormScore -= 50; this.stormCombo = 0;
        for (const part of [enemy.sprite, enemy.label, enemy.aura, enemy.health, enemy.rune]) part.destroy();
        this.audio.play('hurt'); this.resultText = '수호선 돌파 · 생명력 −12'; this.resultUntil = this.stormClock + 1800; this.resultRecord = false;
        if (!this.healthPoints) { this.endStorm(false); return; }
      }
    }
    this.updateTowerMissiles(dt); this.updateTowers();
    const view = this.currentView(); this.lightning.clear(); this.fire.clear();
    if (this.connected.length) this.typingPlayer.setFlipX(this.connected[0].sprite.x < this.typingPlayer.x);
    for (const enemy of this.swarm) if (!enemy.dead) {
      const linked = this.connected.includes(enemy), pair = typingPair(enemy.word, this.round);
      enemy.heat = linked ? Math.min(1, view.letters / letterCount(pair.answer)) : 0;
      const burning = enemy.heat >= .7 || enemy.burn > this.stormClock;
      if (linked || burning) {
        const intensity = burning ? 1 : enemy.heat;
        enemy.sprite.setTint(Phaser.Display.Color.GetColor(255, Math.round(205 - intensity * 175), Math.round(180 - intensity * 160)));
        enemy.aura.setVisible(true).setPosition(enemy.sprite.x, enemy.sprite.y - 8).setDepth(enemy.sprite.y - 1).setAlpha(.45 + Math.sin(this.stormClock / 110) * .2).setScale(burning ? 1.35 : .8 + intensity * .5);
        if (burning) for (let flame = 0; flame < 5; flame++) {
          const x = enemy.sprite.x - 25 + flame * 12, height = 18 + Math.sin(this.stormClock / 90 + flame * 2) * 11;
          this.fire.fillStyle(flame % 2 ? 0xffce73 : 0xff5936, .6).fillTriangle(x - 6, enemy.sprite.y + 15, x + 7, enemy.sprite.y + 15, x + Math.sin(this.stormClock / 100 + flame) * 5, enemy.sprite.y - height);
        }
      } else { enemy.sprite.setTint(enemy.color); enemy.aura.setVisible(false); }
      if (linked) this.strokeBolt(this.lightning, enemy.sprite.x, enemy.sprite.y - 12, enemy.lane);
      enemy.sprite.setDepth(enemy.sprite.y); enemy.label.setPosition(enemy.sprite.x, enemy.sprite.y - 48);
      enemy.rune.setPosition(enemy.sprite.x + 31, enemy.sprite.y - 12).setText(towerGlyph(towerInitial(pair.answer)));
      enemy.health.clear().fillStyle(0x071423, .9).fillRoundedRect(enemy.sprite.x - 26, enemy.sprite.y - 43, 52, 5, 2);
      enemy.health.fillStyle(burning ? 0xff6943 : enemy.color).fillRoundedRect(enemy.sprite.x - 25, enemy.sprite.y - 42, Math.max(0, enemy.hp / 100 * 50), 3, 1);
    }
    this.typingPlayer.setDepth(this.typingPlayer.y + 4); this.typingShadow.setPosition(this.typingPlayer.x, this.typingPlayer.y + 5).setDepth(this.typingPlayer.y - 2);
    this.drawBars();
    if (!this.waveEndsAt && this.waveSpawned >= this.quota() && !this.swarm.some(enemy => !enemy.dead)) {
      if (this.round === TYPING_ROUNDS) { this.explosion(this.guardian.x, this.guardian.y, 0xffffff, 150); this.endStorm(true); return; }
      this.waveEndsAt = this.stormClock + 1400;
    }
    if (this.waveEndsAt && this.stormClock >= this.waveEndsAt) { this.round++; this.swarm = []; this.beginWave(); }
    if (this.stormClock >= this.publishAt) { this.publishAt = this.stormClock + 100; this.publish(); }
  }
  private drawBars() {
    const x = this.typingPlayer.x, y = this.typingPlayer.y - 102;
    this.playerHealth.clear().fillStyle(0x091727, .95).fillRoundedRect(x - 30, y, 60, 7, 3);
    this.playerHealth.fillStyle(0x95e2f5).fillRoundedRect(x - 29, y + 1, 58 * this.healthPoints / 100, 5, 2);
    this.playerLabel.setPosition(x, y - 2).setText(`${this.healthPoints} / 100`);
    this.guardianLabel.setPosition(this.guardian.x, this.guardian.y - 70);
    this.guardianHealth.clear().fillStyle(0x102035).fillRoundedRect(this.guardian.x - 35, this.guardian.y - 64, 70, 6, 2);
    this.guardianHealth.fillStyle(0xc4dbff).fillRoundedRect(this.guardian.x - 34, this.guardian.y - 63, 68 * (TYPING_ROUNDS - this.round + 1) / TYPING_ROUNDS, 4, 2);
  }
  private endStorm(won: boolean) {
    this.typingFinished = true; this.lightning.clear(); this.connected = [];
    if (won) this.guardian.setAlpha(0);
    this.publish(true); this.typingEmit({ type: 'finish', won, state: this.snapshot() });
  }
  hint() {
    const enemy = this.connected[0] ?? this.swarm.filter(enemy => !enemy.dead).sort((a, b) => a.sprite.x - b.sprite.x)[0];
    const word = enemy?.word ?? this.memories[0], pair = typingPair(word, this.round);
    return { ...word, word: pair.answer, meaning: pair.prompt, format: 'quiz' as const };
  }
  updateSettings(settings: TypingSettings) { this.typingSettings = { ...settings }; if (this.typingLive) this.publish(); }
  override snapshot(): Snapshot {
    const closest = this.hint(), index = this.memories.findIndex(word => word.id === closest.id);
    const best = this.speedRecords[`${this.round >= 7 ? 'reverse' : 'forward'}:${closest.id}:${normalizeTyping(closest.word)}`] ?? null;
    const alive = this.swarm.filter(enemy => !enemy.dead).length;
    return {
      hp: this.healthPoints, maxHp: 100, score: this.stormScore, combo: this.stormCombo, kills: this.stormKills,
      room: 0, totalRooms: 1, roomName: TYPING_MAP_NAME, words: this.memories, slot: Math.max(0, index), remaining: alive + this.quota() - this.waveSpawned,
      elapsed: this.stormClock / 1000, dash: 1, boss: true, bossSeals: this.typingFinished && this.healthPoints ? 12 : this.round - 1, totalSeals: TYPING_ROUNDS, environment: 'tempest',
      alive, incoming: this.quota() - this.waveSpawned, spawnEvery: typingSpawnInterval(this.round, this.stormClock - this.waveClock) / 1000, nextSide: null,
      level: 1, xp: 0, xpNeeded: 1, upgrades: { sword: 0, bow: 0, hammer: 0 }, attackBoost: 0, haste: 1, burst: 0, charge: 0,
      mode: 'typing', bossArrows: 0, bossMinions: alive, bossColumns: this.laneCount, bossRoundKills: this.stormKills, bossKillGoal: this.quota(),
      bossFireInterval: 0, bossGuided: 0, bossLeaks: this.stormLeaks, bossAutoFire: false, miniBosses: 0,
      typing: { round: this.round, reversed: this.round >= 7, spawned: this.waveSpawned, quota: this.quota(), nextSpawn: Math.max(0, this.spawnAt - this.stormClock), best,
        fortifications: { points: this.fortifications.points, runes: [...this.fortifications.runes], towers: this.fortifications.towers.map(({ slot, initial, level, upgrades }) => ({ slot, initial, level, upgrades: { ...upgrades } })),
          editing: this.towerEditing, rune: this.towerRune, selected: this.towerSelected, moving: this.towerMoving } },
    };
  }
  private publish(clearInput = false) {
    this.typingEmit({ type: 'state', state: this.snapshot() });
    this.typingEmit({ type: 'typing', view: this.currentView(), clearInput });
  }
}
