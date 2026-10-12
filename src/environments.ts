import Phaser from 'phaser';

export const ENVIRONMENTS = ['meadow', 'library', 'forge', 'frost', 'astral'] as const;
export type Environment = typeof ENVIRONMENTS[number] | 'defense' | 'tempest';
const W = 1040, H = 620;

export interface DefenseField { width: number; height: number; goalX: number; bossX: number; playerX: number; midY: number; laneGap: number; roadTop: number; roadBottom: number; }

function resetScenery(scene: Phaser.Scene, g: Phaser.GameObjects.Graphics, decor: Phaser.GameObjects.Container, door: Phaser.GameObjects.Container) {
  g.clear(); scene.tweens.killTweensOf(decor.list); decor.removeAll(true); door.removeAll(true);
}

export function paintDefenseEnvironment(scene: Phaser.Scene, g: Phaser.GameObjects.Graphics, decor: Phaser.GameObjects.Container, door: Phaser.GameObjects.Container, field: DefenseField) {
  resetScenery(scene, g, decor, door);
  const { width, height, goalX, bossX, roadTop, roadBottom } = field;
  const texture = scene.textures.get('background-defense');
  if (!texture.has('road')) {
    const source = texture.getSourceImage();
    const top = Math.round(source.height * .25), bottom = Math.round(source.height * .75);
    texture.add('north', 0, 0, 0, source.width, top);
    texture.add('road', 0, 0, top, source.width, bottom - top);
    texture.add('south', 0, 0, bottom, source.width, source.height - bottom);
  }
  // Stretch the open road independently so every lane stays on dirt after a resize.
  for (const [frame, y, h] of [['north', 0, roadTop], ['road', roadTop, roadBottom - roadTop], ['south', roadBottom, height - roadBottom]] as const) {
    decor.add(scene.add.image(0, y, 'background-defense', frame).setOrigin(0).setDisplaySize(width, h));
  }
  const marks = scene.add.graphics(); decor.add(marks);
  marks.lineStyle(2, 0xece0b5, .5).lineBetween(goalX - 12, roadTop, goalX - 12, roadBottom).lineBetween(goalX + 12, roadTop, goalX + 12, roadBottom);
  for (let y = roadTop; y < roadBottom; y += 14) {
    const row = Math.round((y - roadTop) / 14);
    for (let col = 0; col < 2; col++) marks.fillStyle((row + col) % 2 ? 0x304c42 : 0xe5d5ad, .8).fillRect(goalX - 7 + col * 7, y, 7, Math.min(14, roadBottom - y));
  }
  const textStyle = { resolution: 3, fontFamily: '"Malgun Gothic", sans-serif', fontSize: '12px', color: '#e9e3cb', stroke: '#14291f', strokeThickness: 4 };
  decor.add(scene.add.text(goalX, roadTop - 23, '골인선', textStyle).setOrigin(.5));
  decor.add(scene.add.text(bossX - 16, roadBottom + 25, '미니언 침입로  ←', textStyle).setOrigin(.5));
  addMotes(scene, decor, width, height, 0xf2d8a0, false, 14);
}

export function paintEnvironment(scene: Phaser.Scene, g: Phaser.GameObjects.Graphics, decor: Phaser.GameObjects.Container, door: Phaser.GameObjects.Container, environment: typeof ENVIRONMENTS[number]) {
  resetScenery(scene, g, decor, door);
  const color = { meadow: 0xb2e698, library: 0xbbaaff, forge: 0xffb478, frost: 0xc1ebf4, astral: 0xcc9fea }[environment];
  // The original scenery is now in the image; only gentle ambient effects are live.
  addMotes(scene, decor, W, H, color, environment === 'frost', 20);
}

function addMotes(scene: Phaser.Scene, decor: Phaser.GameObjects.Container, width: number, height: number, color: number, falling: boolean, count: number) {
  for (let i = 0; i < count; i++) {
    const x = (Math.sin(i * 127.1) * 43758.5453 % 1 + 1) % 1 * width;
    const y = (Math.sin(i * 311.7) * 23421.631 % 1 + 1) % 1 * height;
    const mote = scene.add.circle(x, y, falling ? 1.3 : .9, color, .2);
    decor.add(mote);
    scene.tweens.add({ targets: mote, y: y + (falling ? 26 : -18), alpha: .03, duration: 2500 + i * 113, yoyo: true, repeat: -1 });
  }
}
