import Phaser from 'phaser';

export const ENVIRONMENTS = ['meadow', 'library', 'forge', 'frost', 'astral'] as const;
export type Environment = typeof ENVIRONMENTS[number];
const W = 1040, H = 620;

/** Decorative scenery stays outside the walkable arena (78..962, 110..542). */
export function paintEnvironment(scene: Phaser.Scene, g: Phaser.GameObjects.Graphics, decor: Phaser.GameObjects.Container, door: Phaser.GameObjects.Container, environment: Environment) {
  g.clear();
  scene.tweens.killTweensOf(decor.list);
  decor.removeAll(true); door.removeAll(true);
  const add = (item: Phaser.GameObjects.GameObject) => decor.add(item);
  const seed = (i: number, offset = 0) => {
    const value = Math.sin((i + 1) * 127.1 + offset * 311.7) * 43758.5453;
    return value - Math.floor(value);
  };

  if (environment === 'meadow') {
    g.fillStyle(0x213d32).fillRect(0, 0, W, H);
    // A winding dirt trail and stone stepping paths through an open garden.
    g.lineStyle(86, 0x5a5741, .42).beginPath().moveTo(515, 580).lineTo(470, 420).lineTo(560, 275).lineTo(520, 70).strokePath();
    g.lineStyle(48, 0x9b9470, .12).beginPath().moveTo(510, 580).lineTo(470, 420).lineTo(560, 275).lineTo(520, 70).strokePath();
    for (let i = 0; i < 380; i++) {
      const x = seed(i) * W, y = seed(i, 5) * H;
      g.lineStyle(1, [0x4d7650, 0x769366, 0x395d47][i % 3], .6).lineBetween(x, y, x - 3, y - 5).lineBetween(x, y, x + 2, y - 7);
      if (i % 19 === 0) g.fillStyle(i % 2 ? 0xe2c49a : 0xc5b6e0, .65).fillCircle(x, y - 5, 2);
    }
    for (const [x, y] of [[30, 30], [180, 25], [820, 30], [1010, 50], [20, 330], [1020, 360], [100, 605], [940, 605]]) {
      g.fillStyle(0x152d25).fillEllipse(x + 8, y + 23, 150, 78);
      g.fillStyle(0x142d24).fillCircle(x, y, 72).fillCircle(x - 38, y + 15, 44).fillCircle(x + 43, y + 7, 50);
      g.fillStyle(0x36513b).fillCircle(x - 12, y - 12, 48).fillCircle(x + 30, y - 14, 35);
      g.fillStyle(0x456347, .5).fillEllipse(x - 17, y - 25, 55, 20);
    }
    g.fillStyle(0x1b3a43).fillEllipse(106, 552, 145, 60); g.lineStyle(2, 0x558b85, .5).strokeEllipse(106, 552, 138, 51);
    g.fillStyle(0x648568).fillEllipse(91, 545, 18, 9).fillEllipse(124, 560, 14, 7);
    for (let i = 0; i < 10; i++) {
      const x = 420 + Math.sin(i * 1.5) * 32, y = 115 + i * 43;
      g.fillStyle(0x9a9b80, .2).fillRoundedRect(x, y, 42, 20, 7);
    }
    g.fillStyle(0x506553).fillRect(474, 40, 13, 57).fillRect(551, 40, 13, 57);
    g.lineStyle(7, 0x61745b).beginPath().arc(519, 46, 38, Math.PI, 0).strokePath();
  } else if (environment === 'library') {
    g.fillStyle(0x2a252e).fillRect(0, 0, W, H);
    for (let row = 0; row < 16; row++) {
      const y = row * 40;
      for (let col = 0; col < 9; col++) {
        const x = col * 140 - (row % 2) * 70;
        g.fillStyle([0x3b3034, 0x3f3335, 0x352c32][(row + col) % 3]).fillRect(x + 1, y + 1, 138, 38);
        g.lineStyle(1, 0x94735a, .11).lineBetween(x + 7, y + 12, x + 125, y + 12);
      }
    }
    g.fillStyle(0x34253d).fillRect(330, 85, 380, 480);
    g.lineStyle(2, 0xbc9168, .43).strokeRect(340, 95, 360, 460).strokeRect(347, 102, 346, 446);
    g.lineStyle(1, 0xb79b85, .2).strokeCircle(520, 325, 94);
    g.lineStyle(2, 0xbc9168, .3).strokeRect(470, 275, 100, 100);
    for (const x of [15, 944]) for (const y of [80, 220, 360]) {
      g.fillStyle(0x1b1821).fillRect(x - 3, y - 3, 88, 118);
      g.fillStyle(0x725445).fillRect(x, y, 80, 108);
      for (let shelf = 0; shelf < 3; shelf++) {
        g.fillStyle(0x24212b).fillRect(x + 4, y + shelf * 34 + 3, 72, 28);
        for (let book = 0; book < 7; book++) {
          const color = [0x5d7770, 0x947354, 0x6a577c, 0x815964][(book + shelf) % 4];
          g.fillStyle(color).fillRect(x + 7 + book * 9, y + shelf * 34 + 8 + book % 3, 7, 22 - book % 3);
          g.fillStyle(0xe2c596, .3).fillRect(x + 8 + book * 9, y + shelf * 34 + 12, 5, 1);
        }
      }
    }
    for (const x of [130, 800]) {
      g.fillStyle(0x211d28).fillRoundedRect(x, 548, 105, 47, 4);
      g.fillStyle(0x6a4e44).fillRoundedRect(x, 540, 100, 35, 4);
      g.fillStyle(0xb0a58d).fillRect(x + 16, 548, 20, 14); g.lineStyle(1, 0x554b50).lineBetween(x + 26, 548, x + 26, 563);
      g.fillStyle(0xdfc390).fillCircle(x + 72, 546, 3);
    }
    const moon = scene.add.circle(520, 45, 25, 0xb8beee, .16); add(moon);
    g.lineStyle(2, 0x6d6485).strokeCircle(520, 45, 31).lineBetween(520, 14, 520, 76).lineBetween(489, 45, 551, 45);
  } else if (environment === 'forge') {
    g.fillStyle(0x321d22).fillRect(0, 0, W, H);
    // Bright lava channels encircle irregular basalt paving.
    for (let i = 0; i < 28; i++) {
      const x = i * 39;
      g.fillStyle(0xf17b3f, .65).fillRect(x, 72 + Math.sin(i) * 8, 37, 15).fillRect(x, 556 + Math.sin(i * 2) * 8, 37, 14);
      g.fillStyle(0xffc377, .6).fillRect(x + 7, 76 + Math.sin(i) * 8, 12, 3);
    }
    g.fillStyle(0xc45436).fillRect(50, 95, 16, 440).fillRect(974, 95, 16, 440);
    for (let row = 0; row < 8; row++) for (let col = 0; col < 13; col++) {
      const x = 63 + col * 73 + (row % 2) * 12, y = 95 + row * 59;
      g.fillStyle([0x302d35, 0x34313a, 0x292932][(row + col) % 3]).fillPoints([{ x: x + 4, y }, { x: x + 66, y: y + 3 }, { x: x + 72, y: y + 46 }, { x: x + 58, y: y + 57 }, { x, y: y + 51 }], true);
      g.lineStyle(1, 0xb2856b, .13).lineBetween(x + 5, y + 4, x + 61, y + 7);
    }
    g.lineStyle(3, 0xf2a25c, .22).strokeCircle(520, 325, 128).strokeCircle(520, 325, 116);
    g.lineStyle(2, 0xf2a25c, .3).strokeTriangle(520, 205, 622, 385, 418, 385);
    for (const x of [130, 868]) {
      g.fillStyle(0x19181f).fillRect(x - 45, 20, 92, 48);
      g.fillStyle(0x5c4340).fillRect(x - 38, 21, 78, 12);
      g.fillStyle(0xc9643b).fillRect(x - 20, 37, 40, 22); g.fillStyle(0xf4b257).fillRect(x - 11, 42, 20, 12);
    }
    for (const x of [105, 935]) {
      g.fillStyle(0x484149).fillRect(x - 20, 550, 40, 28).fillRect(x - 32, 542, 64, 11);
      g.fillStyle(0x8a7270).fillRect(x - 30, 542, 60, 3);
    }
  } else if (environment === 'frost') {
    g.fillStyle(0x253a4d).fillRect(0, 0, W, H);
    for (let row = 0; row < 12; row++) for (let col = 0; col < 20; col++) {
      const x = col * 52, y = row * 52;
      g.fillStyle([0x304b5c, 0x2d4458, 0x345064][(row * 3 + col) % 3]).fillRect(x + 1, y + 1, 50, 50);
      if ((row + col) % 5 === 0) g.lineStyle(1, 0x9ecede, .26).strokePoints([{ x: x + 5, y: y + 2 }, { x: x + 28, y: y + 25 }, { x: x + 35, y: y + 48 }]);
    }
    for (let i = 0; i < 14; i++) {
      g.fillStyle(0x7495a3, .35).fillEllipse(i * 83, 30 + i % 3 * 12, 138, 82).fillEllipse(i * 83, 595 - i % 3 * 9, 118, 72);
      g.fillStyle(0xb8cbd0, .3).fillEllipse(i * 83, 20, 110, 60);
    }
    for (const [x, y] of [[36, 145], [37, 440], [1000, 177], [1001, 478], [205, 40], [828, 582]]) {
      g.fillStyle(0x527c96).fillTriangle(x - 22, y + 26, x + 3, y - 40, x + 22, y + 26);
      g.fillStyle(0x98c6d9, .7).fillTriangle(x + 3, y - 40, x + 3, y + 26, x + 22, y + 26);
      g.fillStyle(0xc8e7e8, .7).fillTriangle(x - 12, y + 14, x - 4, y - 32, x + 3, y + 14);
    }
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      g.lineStyle(2, 0x92c5d2, .24).lineBetween(520, 325, 520 + Math.cos(a) * 135, 325 + Math.sin(a) * 135);
      const x = 520 + Math.cos(a) * 90, y = 325 + Math.sin(a) * 90;
      g.lineStyle(1, 0x92c5d2, .25).lineBetween(x, y, x + Math.cos(a + .8) * 36, y + Math.sin(a + .8) * 36).lineBetween(x, y, x + Math.cos(a - .8) * 36, y + Math.sin(a - .8) * 36);
    }
  } else {
    g.fillStyle(0x131124).fillRect(0, 0, W, H);
    for (let i = 0; i < 160; i++) g.fillStyle(i % 4 ? 0x8a7faa : 0xe2c391, .15 + seed(i, 4) * .5).fillCircle(seed(i) * W, seed(i, 3) * H, i % 7 === 0 ? 1.5 : .7);
    g.fillStyle(0x292334).fillPoints([{ x: 100, y: 90 }, { x: 415, y: 60 }, { x: 820, y: 83 }, { x: 955, y: 195 }, { x: 937, y: 500 }, { x: 720, y: 576 }, { x: 204, y: 564 }, { x: 76, y: 404 }], true);
    g.lineStyle(2, 0x837397, .45).strokePoints([{ x: 100, y: 90 }, { x: 415, y: 60 }, { x: 820, y: 83 }, { x: 955, y: 195 }, { x: 937, y: 500 }, { x: 720, y: 576 }, { x: 204, y: 564 }, { x: 76, y: 404 }], true);
    for (let i = 0; i < 7; i++) g.lineStyle(1, 0x5e496d, .4).lineBetween(100 + i * 137, 110, 150 + i * 113, 540);
    for (const radius of [145, 132, 105]) g.lineStyle(2, 0xc4a778, .4).strokeCircle(520, 315, radius);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      g.lineStyle(1, 0xba9ccf, .35).lineBetween(520 + Math.cos(a) * 105, 315 + Math.sin(a) * 105, 520 + Math.cos(a) * 160, 315 + Math.sin(a) * 160);
    }
  }

  const color = { meadow: 0xb2e698, library: 0xbbaaff, forge: 0xffb478, frost: 0xc1ebf4, astral: 0xcc9fea }[environment];
  const doorway = scene.add.graphics();
  doorway.fillStyle(0x111b24, .8).fillRoundedRect(-31, -32, 62, 62, 17);
  doorway.lineStyle(2, color, .55).strokeRoundedRect(-33, -34, 66, 65, 17);
  doorway.fillStyle(color, .1).fillRect(-23, -23, 46, 48); door.add(doorway);
  for (let i = 0; i < 24; i++) {
    const x = 100 + seed(i, 7) * 840, y = 100 + seed(i, 9) * 420;
    const mote = scene.add.circle(x, y, environment === 'frost' ? 1.7 : 1.2, color, .25); add(mote);
    scene.tweens.add({ targets: mote, y: y + (environment === 'frost' ? 23 : -23), alpha: .05, duration: 2200 + i * 107, yoyo: true, repeat: -1 });
  }
}
