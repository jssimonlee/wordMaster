import { test, expect, type Page } from '@playwright/test';

async function start(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '첫 던전 입장' }).click();
  await expect(page.locator('#game-overlay')).toBeHidden();
}

test('question-answer runes support other subjects, explanations, matching attacks and persisted codex entries', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const quiz = '프랑스의 수도는? | 파리 | 프랑스의 수도이자 가장 큰 도시예요.\n7 × 8 = ? | 56\n물의 화학식은? | H2O | 수소 2개와 산소 1개';
  await page.goto('/'); await page.getByRole('button', { name: '내 단어로 던전 만들기' }).click();
  await expect(page.locator('[data-format]')).toHaveCount(0); await page.locator('#custom-words').fill(quiz);
  await expect(page.locator('.preview-creature strong')).toHaveText('프랑스의 수도는?');
  await expect(page.locator('.preview-rune strong').nth(2)).toHaveText('H2O');
  await page.getByRole('button', { name: '저장하고 던전 입장' }).click();
  await expect(page.locator('#collection-label')).toHaveText('기억');
  await expect(page.locator('[data-slot="2"] .slot-text strong')).toHaveText('H2O');
  await expect(page.locator('[data-slot="0"] .slot-art')).toHaveCSS('background-position', '0% 50%');
  const combat = await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene; scene.nextSpawnAt = scene.clock + 100000;
    const enemy = scene.spawnEnemy(scene.equipped[0], 'chaser', 600, 400); enemy.staggerUntil = enemy.attackAt = scene.clock + 100000;
    const question = enemy.label.text;
    scene.strike(enemy, scene.equipped[1]); const wrongHp = scene.hp;
    scene.strike(enemy, scene.equipped[0]);
    return { question, label: enemy.label.text, wrongHp, shielded: enemy.shielded, answer: scene.equipped[0].word };
  });
  expect(combat).toEqual({ question: '프랑스의 수도는?', label: '✓ 파리', wrongHp: 92, shielded: false, answer: '파리' });
  await page.keyboard.press('Tab');
  await expect(page.locator('.hint-panel blockquote')).toHaveText('프랑스의 수도이자 가장 큰 도시예요.');
  await page.keyboard.press('Tab');
  await page.getByRole('button', { name: '단어 도감', exact: true }).click(); await page.locator('[data-tab="custom"]').click();
  await expect(page.locator('.codex-word')).toHaveCount(3);
  await page.getByRole('searchbox', { name: '도감 검색' }).fill('H2O');
  await expect(page.locator('.codex-word')).toHaveCount(1); await expect(page.locator('.codex-content')).toContainText('물의 화학식은?');
  await expect(page.locator('.codex-content')).toContainText('수소 2개와 산소 1개');
  await page.reload(); await page.getByRole('button', { name: '내 단어로 던전 만들기' }).click();
  await expect(page.locator('[data-format]')).toHaveCount(0);
  await expect(page.locator('#custom-words')).toHaveValue(quiz);
  await page.getByRole('button', { name: '저장하고 보스전 도전' }).click();
  const boss = await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene; scene.nextAttack = scene.clock + 100000;
    const boss = scene.enemies[0]; boss.attackAt = scene.clock + 100000; scene.launchBossMinion(boss);
    const minion = scene.enemies.find((enemy: any) => !enemy.boss);
    return { prompt: boss.label.text, minion: minion.label.text, formats: scene.equipped.map((word: any) => word.format), ranged: scene.equipped.every((word: any) => word.kind === 'bow') };
  });
  expect(['프랑스의 수도는?', '7 × 8 = ?', '물의 화학식은?']).toContain(boss.prompt);
  expect(boss.minion).toBe(boss.prompt);
  expect(boss).toMatchObject({ formats: ['quiz', 'quiz', 'quiz'], ranged: true });
  await expect(page.locator('[data-slot="0"]')).toHaveClass(/sword/);
  await expect(page.locator('[data-slot="1"]')).toHaveClass(/bow/);
  await expect(page.locator('[data-slot="2"]')).toHaveClass(/hammer/);
  expect(errors).toEqual([]);
});

test('rune workshop and archive stay within narrow and short screens and reject invalid quiz pairs', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/'); await page.getByRole('button', { name: '내 단어로 던전 만들기' }).click();
  await page.locator('#custom-words').fill('질문 하나? | 답\n질문 둘? | 답\n질문 셋? | 다른 답');
  await page.getByRole('button', { name: '저장하고 던전 입장' }).click();
  await expect(page.locator('#custom-error')).toContainText('중복');
  await expect(page.locator('.workshop-modal')).toBeVisible();
  const modal = await page.locator('.workshop-modal').boundingBox();
  expect(modal!.x).toBeGreaterThanOrEqual(0); expect(modal!.x + modal!.width).toBeLessThanOrEqual(390);
  expect(await page.locator('.workshop-modal').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.getByRole('button', { name: '닫기', exact: true }).click(); await page.getByRole('button', { name: '단어 도감', exact: true }).click();
  await expect(page.locator('.codex-word')).toHaveCount(12);
  expect(await page.locator('.codex-modal').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 600 });
  const short = await page.locator('.codex-modal').boundingBox(); expect(short!.height).toBeLessThanOrEqual(560);
  await page.getByRole('searchbox', { name: '도감 검색' }).fill('nonexistent');
  await expect(page.locator('.empty-codex')).toContainText('이 기억은 아직 없어요.');
});

test('image skill choices float above the hero, follow resizing, and accept keyboard selection once', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await page.getByRole('button', { name: '보스전 바로 도전', exact: false }).click();
  await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene;
    scene.banner = () => {}; scene.nextAttack = scene.clock + 100000;
    scene.enemies[0].attackAt = scene.clock + 100000;
    scene.bossLaunched = 2; scene.launchBossMinion(scene.enemies[0]);
    scene.kill(scene.enemies.find((enemy: any) => enemy.miniBoss));
  });
  await expect(page.locator('#upgrade-picker')).toBeVisible();
  await expect(page.locator('#game-overlay')).toBeHidden();
  await expect(page.locator('[data-boss-upgrade]')).toHaveCount(3);
  await expect(page.locator('[data-boss-upgrade="speed"]')).toBeEnabled();
  const layout = () => page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene, anchor = scene.getPlayerAnchor();
    const stage = document.querySelector('.game-stage')!.getBoundingClientRect();
    const picker = document.querySelector('#upgrade-picker')!.getBoundingClientRect();
    return { left: picker.left, right: picker.right, top: picker.top, bottom: picker.bottom, width: stage.width,
      heroHead: stage.top + (anchor.y - anchor.head) * stage.height, heroY: stage.top + anchor.y * stage.height, heroX: stage.left + anchor.x * stage.width,
      placement: (document.querySelector('#upgrade-picker') as HTMLElement).dataset.placement };
  });
  await expect.poll(async () => (await layout()).placement).toBe('above');
  expect((await layout()).bottom).toBeLessThan((await layout()).heroHead);
  const image = await page.evaluate(async () => {
    const image = new Image(); image.src = '/assets/art/upgrade-buttons.png'; await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight, style: getComputedStyle(document.querySelector('.skill-art')!).backgroundImage };
  });
  expect(image.width).toBeGreaterThan(1000); expect(image.height).toBe(image.width); expect(image.style).toContain('upgrade-buttons.png');
  const frozen = await page.evaluate(() => (window as any).__wordmaster.scene.clock);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect.poll(async () => (await layout()).width).toBe(1920);
  await expect.poll(async () => (await layout()).heroHead - (await layout()).bottom).toBeGreaterThan(10);
  await page.setViewportSize({ width: 1280, height: 600 });
  await expect.poll(async () => (await layout()).placement).toBe('side');
  await expect.poll(async () => (await layout()).left - (await layout()).heroX).toBeGreaterThan(40);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await layout()).placement).toBe('below');
  const compact = await layout();
  expect(compact.left).toBeGreaterThanOrEqual(0); expect(compact.right).toBeLessThanOrEqual(390);
  expect(compact.top).toBeGreaterThan(compact.heroY + 30);
  expect(await page.evaluate(() => (window as any).__wordmaster.scene.clock)).toBe(frozen);
  await page.keyboard.press('Tab'); await expect(page.locator('[data-boss-upgrade="guided"]')).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(page.locator('[data-boss-upgrade="speed"]')).toBeFocused();
  await page.keyboard.press('3'); await expect(page.locator('#upgrade-picker')).toBeHidden();
  expect(await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene;
    return { arrows: scene.bossArrows, slot: scene.slot, pending: scene.pendingBossRewards, paused: scene.paused };
  })).toEqual({ arrows: 2, slot: 0, pending: 0, paused: false });
  expect(errors).toEqual([]);
});

test('normal evolution and room rewards use image buttons, including healing after maxed weapons', async ({ page }) => {
  await start(page);
  await page.evaluate(() => { const scene = (window as any).__wordmaster.scene; scene.nextSpawnAt = scene.clock + 100000; scene.pendingUpgrades = 1; });
  await expect(page.locator('#upgrade-picker')).toBeVisible();
  await expect(page.locator('[data-upgrade]')).toHaveCount(3);
  await expect(page.locator('[data-upgrade="hammer"] .skill-art')).toHaveCSS('background-position', '100% 50%');
  await page.locator('[data-upgrade="bow"]').click();
  expect(await page.evaluate(() => (window as any).__wordmaster.scene.weaponLevels.bow)).toBe(1);
  await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene;
    scene.weaponLevels = { sword: 2, bow: 2, hammer: 2 }; scene.hp = 30; scene.pendingUpgrades = 1;
  });
  await expect(page.locator('[data-upgrade="heal"]')).toBeVisible();
  await expect(page.locator('[data-upgrade="heal"] .skill-art')).toHaveCSS('background-position', '100% 100%');
  await expect(page.locator('[data-upgrade="heal"]')).toBeEnabled();
  await page.keyboard.press('3');
  expect(await page.evaluate(() => { const scene = (window as any).__wordmaster.scene; return [scene.hp, scene.maxHp]; })).toEqual([65, 110]);
  await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene; scene.clearEntities();
    scene.kill(scene.spawnEnemy(scene.equipped[0], 'chaser', scene.player.x, scene.player.y));
  });
  await expect(page.locator('[data-reward]')).toHaveCount(3);
  await expect(page.locator('#game-overlay')).toBeHidden();
  await page.locator('[data-reward="power"]').click();
  await expect(page.locator('#upgrade-picker')).toBeHidden();
  expect(await page.evaluate(() => { const scene = (window as any).__wordmaster.scene; return [scene.room, scene.hp, scene.attackBoost, scene.paused]; })).toEqual([1, 75, 8, false]);
});

test('upgrade waits through early clicks, floor and description clicks, and attack Space until a deliberate choice', async ({ page }) => {
  await start(page); await page.keyboard.down('Space');
  const initial = await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene;
    scene.pendingUpgrades = 1; scene.nextSpawnAt = scene.clock + 100000; scene.update(0, 16);
    const button = document.querySelector<HTMLButtonElement>('[data-upgrade="bow"]')!;
    const disabled = button.disabled;
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: '2' }));
    return { disabled, hidden: (document.querySelector('#upgrade-picker') as HTMLElement).hidden, level: scene.weaponLevels.bow, clock: scene.clock };
  });
  expect(initial).toMatchObject({ disabled: true, hidden: false, level: 0 });
  await expect(page.locator('[data-upgrade="bow"]')).toBeEnabled();
  await page.keyboard.up('Space');
  await expect(page.locator('#upgrade-picker')).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await page.mouse.click(900, 650);
    await page.keyboard.press('Space');
  }
  await page.locator('#skill-description-1').click();
  await expect(page.locator('#upgrade-picker')).toBeVisible();
  expect(await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene;
    return { clock: scene.clock, levels: scene.weaponLevels, paused: scene.paused, pending: scene.pendingUpgrades };
  })).toEqual({ clock: initial.clock, levels: { sword: 0, bow: 0, hammer: 0 }, paused: true, pending: 1 });
  await page.locator('[data-upgrade="bow"]').click();
  await expect(page.locator('#upgrade-picker')).toBeHidden();
  expect(await page.evaluate(() => (window as any).__wordmaster.scene.weaponLevels.bow)).toBe(1);
});

test('a press begun during the upgrade guard and repeated hotkeys cannot apply the reward', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: '보스전 바로 도전', exact: false }).click();
  const button = await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene;
    scene.nextAttack = scene.clock + 100000; scene.enemies[0].attackAt = scene.clock + 100000;
    scene.bossLaunched = 2; scene.launchBossMinion(scene.enemies[0]); scene.kill(scene.enemies.find((enemy: any) => enemy.miniBoss));
    scene.update(0, 16);
    const bounds = document.querySelector('[data-boss-upgrade="guided"]')!.getBoundingClientRect();
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  });
  await page.mouse.move(button.x, button.y); await page.mouse.down();
  await expect(page.locator('[data-boss-upgrade="guided"]')).toBeEnabled();
  await page.mouse.up();
  await page.evaluate(() => {
    // Also reject a click completed without a new press on the image button.
    document.querySelector('[data-boss-upgrade="guided"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: '2', repeat: true }));
  });
  await expect(page.locator('#upgrade-picker')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__wordmaster.scene.bossGuided)).toBe(0);
  await page.keyboard.press('2');
  await expect(page.locator('#upgrade-picker')).toBeHidden();
  expect(await page.evaluate(() => (window as any).__wordmaster.scene.bossGuided)).toBe(1);
});

test('boss is selectable immediately, launches matching minions, and all words fire from range', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: '보스전 바로 도전', exact: false }).click();
  await expect(page.locator('#room-tag')).toHaveText('BOSS');
  await expect(page.locator('#route-fraction')).toHaveText('보스전');
  await expect(page.locator('#burst-status')).toHaveText('동시 발사 1발');
  await expect(page.locator('#boss-round')).toHaveText('라운드 1 / 12');
  await page.evaluate(() => { (window as any).__wordmaster.scene.nextAttack = 100000; });
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene.bossLaunched), { timeout: 15000 }).toBe(3);
  const info = await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene;
    scene.enemies.forEach((enemy: any) => { enemy.staggerUntil = scene.clock + 100000; enemy.attackAt = scene.clock + 100000; });
    const boss = scene.enemies[0], minions = scene.enemies.filter((enemy: any) => !enemy.boss);
    scene.player.setPosition(250, scene.defenseField().midY);
    minions.forEach((enemy: any, i: number) => enemy.sprite.setPosition(i ? 1100 + i * 80 : 600, scene.defenseField().midY));
    scene.invulnerableUntil = scene.clock + 100000;
    const correct = scene.equipped.findIndex((word: any) => word.id === boss.word.id);
    scene.equip((correct + 1) % scene.equipped.length);
    return { minionIds: minions.map((enemy: any) => enemy.word.id), bossId: boss.word.id, kinds: scene.equipped.map((word: any) => word.kind), hp: scene.hp,
      layout: boss.sprite.x > scene.arenaWidth * .85 && scene.player.x < scene.arenaWidth * .3, gates: scene.gates.commandBuffer.length, bars: scene.enemies.every((enemy: any) => enemy.healthBar.active && enemy.healthBar.visible && enemy.maxHp > 0), correct };
  });
  expect(info.minionIds.slice(0, 2)).toEqual([info.bossId, info.bossId]); expect(info.minionIds[2]).not.toBe(info.bossId);
  expect(info.kinds).toEqual(['bow', 'bow', 'bow']); expect(info.bars).toBe(true); expect(info.layout).toBe(true); expect(info.gates).toBe(0);
  expect(await page.evaluate(() => (window as any).__wordmaster.scene.shots.some((shot: any) => !shot.word))).toBe(false);
  await page.evaluate(() => { const scene = (window as any).__wordmaster.scene; scene.nextAttack = scene.clock; });
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene.hp)).toBeLessThan(info.hp);
  expect(await page.evaluate(() => (window as any).__wordmaster.scene.score)).toBeLessThan(0);
  expect(await page.evaluate(() => (window as any).__wordmaster.scene.player.x)).toBe(250);
  await page.evaluate(slot => { const scene = (window as any).__wordmaster.scene; scene.shots.forEach((shot: any) => shot.object.destroy()); scene.shots = []; scene.equip(slot); scene.nextAttack = scene.clock; }, info.correct);
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene.enemies[1].hp)).toBeLessThan(64);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '현재 단어로 처음부터 다시' }).click();
  await expect(page.locator('#room-tag')).toHaveText('BOSS');
  await expect(page.locator('#burst-status')).toHaveText('동시 발사 1발');
  expect(await page.evaluate(() => (window as any).__wordmaster.scene.bossIndex)).toBe(0);
  expect(errors).toEqual([]);
});

test('boss floor movement works in both directions and only fires after arrival in the facing direction', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: '보스전 바로 도전', exact: false }).click();
  const origin = await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene, boss = scene.enemies[0];
    boss.attackAt = scene.clock + 100000; scene.player.setPosition(420, scene.player.y);
    scene.bossGuided = 1; scene.bossArrows = 3; scene.nextAttack = scene.clock;
    const target = scene.spawnEnemy(boss.word, 'chaser', 700, scene.player.y);
    target.staggerUntil = scene.clock + 100000;
    scene.equip(scene.equipped.findIndex((word: any) => word.id === boss.word.id));
    scene._firedAt = [];
    const attack = scene.attack.bind(scene);
    scene.attack = () => {
      attack();
      scene._firedAt.push({ x: scene.player.x, y: scene.player.y, angles: scene.shots.filter((shot: any) => shot.attackId === scene.attackSerial).map((shot: any) => Math.atan2(shot.vy, shot.vx)) });
    };
    return { x: scene.player.x, y: scene.player.y };
  });
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene._firedAt.length)).toBeGreaterThan(0);
  await page.evaluate(() => { (window as any).__wordmaster.scene._firedAt = []; });
  await clickWorld(page, 150, origin.y);
  await expect(page.locator('#burst-status')).toContainText('이동 중');
  await page.waitForTimeout(250);
  const moving = await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene;
    return { x: scene.player.x, destination: scene.moveTarget?.x, attacks: scene._firedAt.length, shots: scene.shots.length };
  });
  expect(moving.x).toBeLessThan(origin.x); expect(moving.x).toBeGreaterThan(150);
  expect(moving.destination).toBeCloseTo(150, 0);
  expect(moving).toMatchObject({ attacks: 0, shots: 0 });
  await page.keyboard.press('2');
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene._firedAt.length)).toBeGreaterThan(0);
  expect(await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene;
    return { arrived: Math.abs(scene.player.x - 150) < 1, backward: scene.player.flipX,
      stationaryShots: scene._firedAt.every((shot: any) => Math.abs(shot.x - scene.player.x) < .001 && Math.abs(shot.y - scene.player.y) < .001),
      backwardShots: scene._firedAt.every((shot: any) => shot.angles.length === 3 && shot.angles.every((angle: number) => Math.abs(angle) > 3)) };
  })).toEqual({ arrived: true, backward: true, stationaryShots: true, backwardShots: true });
  await page.evaluate(() => { (window as any).__wordmaster.scene._firedAt = []; });
  await clickWorld(page, 430, origin.y - 80);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => (window as any).__wordmaster.scene._firedAt.length)).toBe(0);
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene._firedAt.length)).toBeGreaterThan(0);
  expect(await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene, expected = Math.atan2(-80, 280);
    return scene._firedAt.every((shot: any) => Math.abs(shot.x - 430) < 1 && Math.abs(shot.y - (scene.defenseField().midY - 80)) < 1 && Math.abs(shot.angles[0] - expected) < .01);
  })).toBe(true);
});

test('keyboard movement and dodge stop boss fire, then release fires in the last direction', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: '보스전 바로 도전', exact: false }).click();
  await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene;
    scene.enemies[0].attackAt = scene.clock + 100000;
    scene.player.setPosition(420, scene.player.y); scene.nextAttack = scene.clock;
  });
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene.shots.length)).toBeGreaterThan(0);
  await page.keyboard.down('a'); await page.waitForTimeout(80);
  const attackCount = await page.evaluate(() => (window as any).__wordmaster.scene.attackSerial);
  await page.keyboard.down('Shift'); await page.waitForTimeout(240); await page.keyboard.up('Shift');
  expect(await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene;
    return { count: scene.attackSerial, shots: scene.shots.length, firing: scene.bossAutoFire, moved: scene.player.x < 400 };
  })).toEqual({ count: attackCount, shots: 0, firing: false, moved: true });
  await page.keyboard.up('a');
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene.attackSerial)).toBeGreaterThan(attackCount);
  expect(await page.evaluate(() => (window as any).__wordmaster.scene.angle)).toBeCloseTo(Math.PI);
  await expect(page.locator('#burst-status')).toContainText('동시 발사');
});

test('orange mini bosses use a different selectable word, reserve space, and reward a kill without restarting the round', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: '보스전 바로 도전', exact: false }).click();
  const encounter = await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene, boss = scene.enemies[0];
    scene.nextAttack = scene.clock + 100000;
    scene.launchBossMinion(boss); scene.launchBossMinion(boss); scene.launchBossMinion(boss);
    const waiting = scene.bossLaunched === 2;
    const field = scene.defenseField();
    scene.enemies.slice(1).forEach((enemy: any, i: number) => {
      enemy.sprite.setPosition(350 + i * 140, field.midY + field.laneGap);
      enemy.lane = 1; enemy.staggerUntil = scene.clock + 100000;
    });
    scene.launchBossMinion(boss);
    const mini = scene.enemies.find((enemy: any) => enemy.miniBoss);
    const different = mini.word.id !== boss.word.id;
    const selectable = scene.equipped.findIndex((word: any) => word.id === mini.word.id);
    const texture = mini.sprite.frame.name, hp = mini.hp;
    scene.launchBossMinion(boss); const afterGap = scene.bossLaunched === 3;
    boss.attackAt = scene.clock + 100000;
    mini.staggerUntil = scene.clock + 100000;
    return { waiting, afterGap, different, selectable, texture, hp, x: mini.sprite.x, y: mini.sprite.y,
      separated: scene.enemies.filter((enemy: any) => !enemy.dead && !enemy.boss && !enemy.miniBoss).every((enemy: any) => Math.abs(enemy.sprite.x - mini.sprite.x) >= 160) };
  });
  expect(encounter).toMatchObject({ waiting: true, afterGap: true, different: true, texture: 'miniboss', hp: 96, separated: true });
  expect(encounter.selectable).toBeGreaterThanOrEqual(0);
  await page.keyboard.press(String(encounter.selectable + 1));
  await page.evaluate(() => { const scene = (window as any).__wordmaster.scene; scene.nextAttack = scene.clock; });
  await clickWorld(page, encounter.x, encounter.y);
  await expect(page.getByText('미니 보스 처치! 강화 보상', { exact: true })).toBeVisible({ timeout: 15000 });
  const paused = await page.evaluate(() => (window as any).__wordmaster.scene.clock);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => (window as any).__wordmaster.scene.clock)).toBe(paused);
  await page.locator('[data-boss-upgrade="speed"]').click();
  expect(await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene;
    return { round: scene.bossIndex, progress: scene.bossRoundKills, launched: scene.bossLaunched, speed: scene.bossFireSpeed,
      rewards: scene.pendingBossRewards, regulars: scene.enemies.filter((enemy: any) => !enemy.dead && !enemy.boss).length };
  })).toEqual({ round: 0, progress: 1, launched: 3, speed: 1.3, rewards: 0, regulars: 2 });
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene.bossAutoFire)).toBe(true);
  await expect(page.locator('#burst-status')).toContainText('동시 발사');
});

test('guided volleys concentrate on the chosen mini boss without shooting a different-word neighbor', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: '보스전 바로 도전', exact: false }).click();
  const target = await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene, boss = scene.enemies[0], field = scene.defenseField();
    boss.attackAt = scene.clock + 100000;
    scene.bossArrows = 3; scene.bossGuided = 1;
    const alternative = scene.equipped.find((word: any) => word.id !== boss.word.id);
    const mini = scene.spawnEnemy(alternative, 'charger', 600, field.midY);
    mini.miniBoss = true; mini.hp = mini.maxHp = 96; mini.sprite.setTexture('characters', 'miniboss').setDisplaySize(55, 64);
    const regular = scene.spawnEnemy(boss.word, 'chaser', 810, field.midY + field.laneGap);
    regular.lane = 1;
    mini.staggerUntil = regular.staggerUntil = scene.clock + 100000;
    scene.equip(scene.equipped.findIndex((word: any) => word.id === alternative.id)); scene.nextAttack = scene.clock;
    return { x: mini.sprite.x, y: mini.sprite.y };
  });
  await clickWorld(page, target.x, target.y);
  await expect(page.getByText('미니 보스 처치! 강화 보상', { exact: true })).toBeVisible({ timeout: 10000 });
  expect(await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene;
    return { hp: scene.hp, neighbor: scene.enemies[2].hp, miniDead: scene.enemies[1].dead, shots: scene.shots.length };
  })).toEqual({ hp: 100, neighbor: 64, miniDead: true, shots: 0 });
});

test('single-word final rounds provide a temporary weapon for their mini boss and a breach gives no reward', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: '내 단어로 던전 만들기' }).click();
  await page.locator('#custom-words').fill('호기심이 많은 | curious\n사라지다 | vanish\n용기 | courage\n꾸준한 | steady');
  await page.getByRole('button', { name: '저장하고 보스전 도전' }).click();
  const mini = await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene;
    scene.bossIndex = 3; scene.beginBossRound(); scene.nextAttack = scene.clock + 100000;
    const before = scene.equipped.length, boss = scene.enemies[0];
    scene.bossLaunched = 2; scene.launchBossMinion(boss);
    const enemy = scene.enemies.find((item: any) => item.miniBoss);
    scene.breachGoal(enemy);
    return { before, after: scene.equipped.length, selectable: scene.equipped.some((word: any) => word.id === enemy.word.id), different: enemy.word.id !== boss.word.id,
      hp: scene.hp, reward: scene.pendingBossRewards, upgrades: scene.bossUpgradeOpen };
  });
  expect(mini).toEqual({ before: 1, after: 2, selectable: true, different: true, hp: 88, reward: 0, upgrades: false });
});

test('boss upgrades offer speed, guided missiles, and volley choices without advancing while paused', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: '보스전 바로 도전', exact: false }).click();
  const choices = ['speed', 'guided', 'volley'];
  for (let round = 0; round < 9; round++) {
    await page.evaluate(() => {
      const scene = (window as any).__wordmaster.scene, boss = scene.enemies[0];
      scene.nextAttack = scene.clock + 100000;
      scene.bossRoundKills = scene.bossKillGoal();
      scene.strike(boss, { ...boss.word, kind: 'bow' });
    });
    if ((round + 1) % 3 === 0) {
      await expect(page.getByText('방어 무기를 업그레이드!', { exact: true })).toBeVisible();
      await expect(page.locator('[data-boss-upgrade]')).toHaveCount(3);
      const elapsed = await page.evaluate(() => (window as any).__wordmaster.scene.clock);
      await page.waitForTimeout(200);
      expect(await page.evaluate(() => (window as any).__wordmaster.scene.clock)).toBe(elapsed);
      await page.locator(`[data-boss-upgrade="${choices[(round + 1) / 3 - 1]}"]`).click();
      await expect(page.locator('#game-overlay')).toBeHidden();
      const upgrades = await page.evaluate(() => {
        const scene = (window as any).__wordmaster.scene;
        scene.shots.forEach((shot: any) => shot.object.destroy()); scene.shots = []; scene.attack();
        scene.nextAttack = scene.clock + 100000;
        return { interval: scene.snapshot().bossFireInterval, guided: scene.bossGuided, arrows: scene.bossArrows, shots: scene.shots.length };
      });
      expect(upgrades.interval).toBeCloseTo(700 / 1.3);
      expect(upgrades.guided).toBe(round >= 5 ? 1 : 0);
      expect(upgrades.arrows).toBe(round >= 8 ? 2 : 1);
      expect(upgrades.shots).toBe(upgrades.arrows);
    } else await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene.bossTransition)).toBe(false);
    await expect(page.locator('#boss-round')).toHaveText(`라운드 ${round + 2} / 12`);
  }
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: '현재 단어로 처음부터 다시' }).click();
  await expect(page.locator('#burst-status')).toHaveText('동시 발사 1발');
  expect(await page.evaluate(() => { const scene = (window as any).__wordmaster.scene; return [scene.bossFireSpeed, scene.bossGuided, scene.bossLeaks]; })).toEqual([1, 0, 0]);
});

test('boss reinforcements continue slowly and grow into staggered parallel columns', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: '보스전 바로 도전', exact: false }).click();
  await page.evaluate(() => { const scene = (window as any).__wordmaster.scene; scene.invulnerableUntil = scene.clock + 100000; scene.nextAttack = scene.clock + 100000; scene.nextMiniBossAt = Infinity; });
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene.bossLaunched), { timeout: 15000 }).toBe(1);
  for (let count = 2; count <= 5; count++) {
    await page.evaluate(() => { const scene = (window as any).__wordmaster.scene; scene.clock = scene.enemies[0].attackAt; });
    await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene.bossLaunched)).toBe(count);
  }
  const slow = await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene, minion = scene.enemies[1];
    scene.enemies[0].attackAt = scene.clock + 100000;
    scene.enemies.filter((enemy: any) => !enemy.boss).forEach((enemy: any, i: number) => enemy.sprite.setPosition(120 + i * 140, 180));
    minion.sprite.setPosition(400, scene.defenseField().midY); minion.staggerUntil = 0; minion.attackAt = scene.clock - 1;
    scene.player.setPosition(800, 500);
    const x = minion.sprite.x, y = minion.sprite.y;
    scene.updateEnemy(minion, 40);
    return { left: minion.sprite.x < x, sameLane: minion.sprite.y === y, distance: Math.hypot(minion.sprite.x - x, minion.sprite.y - y), charge: minion.chargeUntil, launchX: minion.chargeX, launchY: minion.chargeY };
  });
  expect(slow.distance).toBeLessThanOrEqual(2.01); expect(slow.left).toBe(true); expect(slow.sameLane).toBe(true);
  expect(slow.charge).toBe(0); expect(slow.launchX).toBe(0); expect(slow.launchY).toBe(0);
  await page.keyboard.press('Escape');
  const paused = await page.evaluate(() => ({ clock: (window as any).__wordmaster.scene.clock, count: (window as any).__wordmaster.scene.bossLaunched }));
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => ({ clock: (window as any).__wordmaster.scene.clock, count: (window as any).__wordmaster.scene.bossLaunched }))).toEqual(paused);
  await page.keyboard.press('Escape');
  for (const [round, columns] of [[3, 2], [6, 3], [9, 4]]) {
    const formation = await page.evaluate(({ round, columns }) => {
      const scene = (window as any).__wordmaster.scene;
      scene.dismissBossMinions(); scene.bossIndex = round; scene.beginBossRound(); scene.nextMiniBossAt = Infinity; scene.nextAttack = scene.clock + 100000;
      const boss = scene.enemies[0], launches = [];
      for (let i = 0; i < columns * 2; i++) {
        scene.launchBossMinion(boss); const minion = scene.enemies.at(-1);
        launches.push({ x: minion.sprite.x - boss.sprite.x, y: minion.sprite.y, delay: boss.attackAt - scene.clock, charge: minion.chargeUntil, alpha: minion.sprite.alpha });
      }
      boss.attackAt = scene.clock + 100000;
      return { launches, goal: scene.bossKillGoal(), live: scene.bossMinionsRemaining() };
    }, { round, columns });
    expect(formation.goal).toBe(columns * 3); expect(formation.live).toBe(columns * 2);
    expect(formation.launches.slice(0, columns).map(item => item.y)).toEqual(formation.launches.slice(columns).map(item => item.y));
    expect(new Set(formation.launches.map(item => item.y)).size).toBe(columns);
    formation.launches.forEach((item, i) => {
      expect(item.charge).toBe(0); expect(item.alpha).toBe(0);
      expect(item.delay).toBe(i % columns < columns - 1 ? 450 : 1800 - (columns - 1) * 200);
    });
    await expect(page.locator('#wave-status')).toContainText(`${columns}열 지원군`);
  }
  expect(await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene;
    for (let i = 0; i < 30; i++) scene.launchBossMinion(scene.enemies[0]);
    return scene.bossMinionsRemaining();
  })).toBe(24);
  expect(await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene, enemy = scene.enemies.at(-1);
    scene.strike(enemy, { ...enemy.word, kind: 'bow' });
    return { sprite: enemy.sprite.alpha, label: enemy.label.alpha, health: enemy.healthBar.alpha };
  })).toEqual({ sprite: 1, label: 1, health: 1 });
});

test('a boss seal opens at the kill goal while survivors remain and a new word clears the old horde', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: '보스전 바로 도전', exact: false }).click();
  const target = await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene, boss = scene.enemies[0];
    scene.nextMiniBossAt = Infinity; // This fixture isolates the seal from the separately tested mini boss.
    for (let i = 0; i < 5; i++) scene.launchBossMinion(boss);
    boss.attackAt = scene.clock + 100000;
    const minions = scene.enemies.filter((enemy: any) => !enemy.boss);
    for (const enemy of minions.slice(0, 3)) scene.kill(enemy);
    minions.slice(3).forEach((enemy: any, i: number) => { enemy.sprite.setPosition(150 + i * 120, 500); enemy.staggerUntil = scene.clock + 100000; });
    scene.player.setPosition(boss.sprite.x, boss.sprite.y + 140); scene.angle = -Math.PI / 2; scene.invulnerableUntil = scene.clock + 100000;
    scene.equip(scene.equipped.findIndex((word: any) => word.id === boss.word.id)); scene.nextAttack = scene.clock;
    return { x: boss.sprite.x, y: boss.sprite.y, live: scene.bossMinionsRemaining(), autoBoss: scene.getAttackTarget() === boss };
  });
  expect(target.live).toBe(2); expect(target.autoBoss).toBe(true);
  await expect(page.locator('#wave-status')).toContainText('봉인 노출!');
  await clickWorld(page, target.x, target.y);
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene.bossIndex)).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene.bossTransition)).toBe(false);
  expect(await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene;
    return { live: scene.bossMinionsRemaining(), roundKills: scene.bossRoundKills, kills: scene.kills, hp: scene.hp };
  })).toEqual({ live: 0, roundKills: 0, kills: 3, hp: 100 });
});

for (const mode of ['campaign', 'boss']) {
  test(`player health bar follows movement, damage, healing, and restart in ${mode}`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: mode === 'boss' ? '보스전 바로 도전' : '첫 던전 입장', exact: mode !== 'boss' }).click();
    const damaged = await page.evaluate(mode => {
      const scene = (window as any).__wordmaster.scene;
      scene.nextAttack = scene.nextSpawnAt = scene.clock + 100000;
      if (mode === 'boss') scene.enemies[0].attackAt = scene.clock + 100000;
      const before = [...scene.playerHealthBar.commandBuffer];
      scene.hurt(62, true);
      return { label: scene.playerHealthLabel.text, changed: JSON.stringify(before) !== JSON.stringify(scene.playerHealthBar.commandBuffer),
        visible: scene.playerHealthBar.visible && scene.playerHealthLabel.visible, barAbove: scene.playerHealthBar.y < scene.player.y - 25 };
    }, mode);
    expect(damaged).toEqual({ label: '38 / 100', changed: true, visible: true, barAbove: true });
    await expect(page.locator('#health-text')).toContainText('38');
    await page.keyboard.down('d'); await page.waitForTimeout(180); await page.keyboard.up('d');
    expect(await page.evaluate(() => {
      const scene = (window as any).__wordmaster.scene;
      return scene.playerHealthBar.x === scene.player.x && scene.playerHealthBar.y === scene.player.y - 36 && scene.playerHealthLabel.x === scene.player.x;
    })).toBe(true);
    expect(await page.evaluate(() => {
      const scene = (window as any).__wordmaster.scene;
      scene.applyUpgrade('heal');
      return { hp: scene.hp, max: scene.maxHp, label: scene.playerHealthLabel.text };
    })).toEqual({ hp: 73, max: 110, label: '73 / 110' });
    await page.evaluate(() => { const scene = (window as any).__wordmaster.scene; scene.start(scene.words, scene.mode); });
    expect(await page.evaluate(() => (window as any).__wordmaster.scene.playerHealthLabel.text)).toBe('100 / 100');
  });
}

test('enemy health bars follow damage in normal rooms and a guarded boss requires its kill goal', async ({ page }) => {
  await start(page);
  const bars = await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene;
    scene.spawnEnemy(scene.equipped[0], 'chaser', 400, 350);
    const enemy = scene.enemies[0], before = [...enemy.healthBar.commandBuffer];
    scene.strike(enemy, enemy.word);
    return { hp: enemy.hp, maxHp: enemy.maxHp, changed: JSON.stringify(before) !== JSON.stringify(enemy.healthBar.commandBuffer), visible: enemy.healthBar.active && enemy.healthBar.visible };
  });
  expect(bars).toEqual({ hp: 34, maxHp: 64, changed: true, visible: true });
  await page.getByRole('button', { name: '내 단어로 던전 만들기' }).click();
  await page.locator('#custom-words').fill('호기심이 많은 | curious\n사라지다 | vanish\n용기 | courage\n꾸준한 | steady');
  await page.getByRole('button', { name: '저장하고 보스전 도전' }).click();
  await expect(page.locator('#boss-count')).toHaveText('0 / 4 봉인 파괴');
  const result = await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene, boss = scene.enemies[0];
    scene.strike(boss, { ...boss.word, kind: 'bow' });
    const blocked = boss.hp === boss.maxHp && scene.bossIndex === 0;
    const minion = scene.spawnEnemy(boss.word, 'chaser', 400, 400);
    minion.shielded = false; scene.invulnerableUntil = scene.clock + 10000;
    const wrong = scene.equipped.find((word: any) => word.id !== minion.word.id);
    scene.strike(minion, wrong, false, 101);
    scene.strike(minion, wrong, false, 101);
    const playerHp = scene.hp;
    scene.strike(minion, wrong, false, 102);
    return { blocked, minionHp: minion.hp, playerHp, nextVolleyHp: scene.hp, score: scene.score };
  });
  expect(result).toEqual({ blocked: true, minionHp: 64, playerHp: 92, nextVolleyHp: 84, score: -50 });
});

test('defense minions pass the hero and crossing the goal costs health and score exactly once', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: '보스전 바로 도전', exact: false }).click();
  const result = await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene, boss = scene.enemies[0], field = scene.defenseField();
    scene.nextAttack = scene.clock + 100000; boss.attackAt = scene.clock + 100000;
    const minion = scene.spawnEnemy(boss.word, 'chaser', scene.player.x + .5, field.midY);
    minion.staggerUntil = 0; scene.invulnerableUntil = scene.clock + 100000;
    scene.updateEnemy(minion, 40);
    const pass = { hp: scene.hp, passed: minion.sprite.x < scene.player.x, dead: minion.dead };
    minion.sprite.x = field.goalX + .5; scene.updateEnemy(minion, 40);
    scene.breachGoal(minion);
    const breach = { hp: scene.hp, score: scene.score, leaks: scene.bossLeaks, kills: scene.kills, goalProgress: scene.bossRoundKills, dead: minion.dead, healthBarDestroyed: !minion.healthBar.active };
    return { pass, breach };
  });
  expect(result.pass).toEqual({ hp: 100, passed: true, dead: false });
  expect(result.breach).toEqual({ hp: 88, score: -50, leaks: 1, kills: 0, goalProgress: 0, dead: true, healthBarDestroyed: true });
  await expect(page.locator('#health-text')).toContainText('88');
  await expect(page.locator('#score')).toHaveText('-50');
  await expect(page.locator('#build-label')).toContainText('골인 1회');
});

test('guided auto missiles turn toward moving targets, keep their word, and retarget after a kill', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: '보스전 바로 도전', exact: false }).click();
  await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene, boss = scene.enemies[0], field = scene.defenseField();
    scene.nextAttack = scene.clock + 100000; boss.attackAt = scene.clock + 100000;
    const target = scene.spawnEnemy(boss.word, 'chaser', 650, field.midY);
    target.staggerUntil = scene.clock + 100000;
    scene.bossGuided = 1; scene.equip(scene.equipped.findIndex((word: any) => word.id === boss.word.id));
    scene.nextAttack = scene.clock;
  });
  // No firing key or mouse input: the launcher must fire on its own.
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene.shots.length)).toBeGreaterThan(0);
  const turn = await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene, shot = scene.shots[0], target = shot.target;
    scene.nextAttack = scene.clock + 100000;
    const original = { vx: shot.vx, vy: shot.vy, word: shot.word.id };
    target.lane = -1; target.sprite.y = scene.defenseField().midY - scene.defenseField().laneGap;
    scene.updateShots(40);
    const changed = shot.vy < original.vy;
    scene.kill(target);
    const replacement = scene.spawnEnemy(scene.enemies[0].word, 'chaser', 700, scene.defenseField().midY);
    replacement.staggerUntil = scene.clock + 100000;
    scene.updateShots(40);
    return { changed, word: shot.word.id === original.word, retargeted: shot.target === replacement, guided: shot.guided };
  });
  expect(turn).toEqual({ changed: true, word: true, retargeted: true, guided: 1 });
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene.enemies.at(-1).hp), { timeout: 6000 }).toBeLessThan(64);
});

test('missiles hit the front minion before the guarded boss when both overlap one frame of travel', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: '보스전 바로 도전', exact: false }).click();
  const damage = await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene, boss = scene.enemies[0];
    scene.nextAttack = scene.clock + 100000; boss.attackAt = scene.clock + 100000;
    const minion = scene.spawnEnemy(boss.word, 'chaser', boss.sprite.x - 50, boss.sprite.y);
    minion.staggerUntil = scene.clock + 100000;
    scene.fireProjectile({ ...boss.word, kind: 'bow' }, 0);
    scene.shots[0].object.setPosition(boss.sprite.x - 70, boss.sprite.y);
    scene.updateShots(40);
    return { minion: minion.hp, boss: boss.hp, bossMax: boss.maxHp, shields: [minion.shielded, boss.shielded] };
  });
  expect(damage.minion).toBe(34); expect(damage.boss).toBe(damage.bossMax); expect(damage.shields).toEqual([false, true]);
});

test('automatic boss finishing shots pierce matching reinforcements after the kill goal', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: '보스전 바로 도전', exact: false }).click();
  await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene, boss = scene.enemies[0], field = scene.defenseField();
    scene.bossRoundKills = scene.bossKillGoal(); boss.attackAt = scene.clock + 100000;
    for (const x of [500, 650, 800]) {
      const minion = scene.spawnEnemy(boss.word, 'chaser', x, field.midY);
      minion.staggerUntil = scene.clock + 100000;
    }
    scene.equip(scene.equipped.findIndex((word: any) => word.id === boss.word.id)); scene.nextAttack = scene.clock;
  });
  // Correct word selection is enough: neither moving nor firing is required.
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene.bossIndex), { timeout: 10000 }).toBe(1);
  expect(await page.evaluate(() => (window as any).__wordmaster.scene.hp)).toBe(100);
});

test('defense resize keeps boss at the right and marching lanes on the road', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: '보스전 바로 도전', exact: false }).click();
  await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene;
    scene.bossIndex = 9; scene.beginBossRound(); scene.nextMiniBossAt = Infinity; scene.nextAttack = scene.clock + 100000;
    for (let i = 0; i < 4; i++) scene.launchBossMinion(scene.enemies[0]);
    scene.enemies[0].attackAt = scene.clock + 100000;
    for (const enemy of scene.enemies) enemy.staggerUntil = scene.clock + 100000;
  });
  for (const viewport of [{ width: 1900, height: 900 }, { width: 720, height: 1050 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.evaluate(() => {
      const scene = (window as any).__wordmaster.scene, field = scene.defenseField();
      return scene.enemies[0].sprite.x === field.bossX && scene.enemies.every((enemy: any) => enemy.sprite.y > field.roadTop && enemy.sprite.y < field.roadBottom);
    })).toBe(true);
    await expect(page.locator('#boss-round')).toBeVisible();
    await expect(page.locator('#boss-round')).toHaveText('라운드 10 / 12');
    expect(await page.evaluate(() => (window as any).__wordmaster.scene.bossLeaks)).toBe(0);
  }
});

test('ranged arrows hit enemies touching the player and do not skip them between frames', async ({ page }) => {
  await start(page);
  for (const distance of [0, 12, 28]) {
    await page.evaluate((gap) => {
      const scene = (window as any).__wordmaster.scene;
      scene.clearEntities(); scene.roomComplete = false;
      scene.attackTarget = scene.lockedTarget = null;
      const slot = scene.equipped.findIndex((word: any) => word.kind === 'bow');
      scene.equip(slot); scene.nextAttack = scene.clock;
      scene.player.setPosition(600, 400 + gap); scene.invulnerableUntil = scene.clock + 100000;
      const enemy = scene.spawnEnemy(scene.equipped[slot], 'chaser', 600, 400);
      enemy.staggerUntil = scene.clock + 100000;
    }, distance);
    await page.keyboard.down('Space');
    await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene.enemies[0].hp)).toBeLessThan(64);
    await page.keyboard.up('Space');
  }
});

test('movement, weapon switching, hint pause, persistence and custom dungeon', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await start(page);
  const x = await page.evaluate(() => (window as any).__wordmaster.scene.player.x);
  const canvas = await page.locator('canvas').boundingBox();
  if (!canvas) throw new Error('Canvas not found');
  expect(canvas.width).toBeGreaterThan(1200);
  expect(canvas.height).toBeGreaterThan(700);
  await clickWorld(page, 720, 480);
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene.moveTarget), { timeout: 7000 }).toBeNull();
  expect(await page.evaluate(() => (window as any).__wordmaster.scene.player.x)).toBeGreaterThan(x + 20);
  const arrived = await page.evaluate(() => ({ x: (window as any).__wordmaster.scene.player.x, target: (window as any).__wordmaster.scene.moveTarget }));
  expect(arrived.x).toBeCloseTo(720, 0); expect(arrived.target).toBeNull();
  await page.keyboard.press('2'); await expect(page.locator('#weapon-word')).toHaveText('abundant');
  await page.keyboard.press('Tab'); await expect(page.getByText('풍부한', { exact: true })).toBeVisible();
  const elapsed = await page.evaluate(() => (window as any).__wordmaster.state.elapsed);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => (window as any).__wordmaster.state.elapsed)).toBe(elapsed);
  await page.keyboard.press('Tab'); await expect(page.locator('#game-overlay')).toBeHidden();
  await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: '탐험 계속하기' })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('#game-overlay')).toBeHidden();
  await page.getByRole('button', { name: '내 단어로 던전 만들기' }).click();
  await page.locator('#custom-words').fill('호기심이 많은 | curious | She was curious.\n사라지다 | vanish | The stars vanish.\n용기 | courage | Have courage.\n꾸준한 | steady | Stay steady.');
  await page.getByRole('button', { name: '저장하고 던전 입장' }).click();
  await expect(page.locator('#word-count')).toHaveText('4');
  await expect(page.locator('#weapon-word')).toHaveText('curious');
  await expect(page.locator('#route-fraction')).toHaveText('1 / 3');
  await page.reload();
  await page.getByRole('button', { name: '단어 도감' }).click();
  await page.locator('[data-tab="custom"]').click();
  await expect(page.locator('.codex-list')).toContainText('curious');
  expect(errors).toEqual([]);
});

test('HD artwork stays sharp at display density, uses every map, and keeps sprite sizes after hits', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await start(page);
  const art = await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene, canvas = scene.game.canvas;
    scene.banner = () => {}; // Inspect four maps without stacking room-intro overlays.
    const themes = [];
    for (let room = 0; room < 4; room++) {
      scene.room = room; scene.loadRoom();
      const image = scene.backdrop.texture.getSourceImage();
      themes.push({ texture: scene.backdrop.texture.key, width: image.width, height: image.height });
    }
    scene.room = 0; scene.loadRoom(); scene.nextSpawnAt = scene.clock + 100000;
    return { pixels: [canvas.width, canvas.height], css: [canvas.clientWidth, canvas.clientHeight],
      smoothing: getComputedStyle(canvas).imageRendering, themes,
      frame: scene.player.frame.realHeight, mipmapped: scene.textures.get('characters').source[0].isPowerOf2 };
  });
  expect(art.pixels).toEqual([2880, 1800]); expect(art.css).toEqual([1440, 900]);
  expect(art.smoothing).toBe('auto'); expect(art.frame).toBeGreaterThan(300); expect(art.mipmapped).toBe(true);
  expect(art.themes.map(theme => theme.texture)).toEqual(['background-meadow', 'background-library', 'background-forge', 'background-frost']);
  expect(art.themes.every(theme => theme.width > 1500 && theme.height > 900)).toBe(true);
  const destination = await page.evaluate(() => { const scene = (window as any).__wordmaster.scene; return { x: scene.player.x + 80, y: scene.player.y + 60 }; });
  await clickWorld(page, destination.x, destination.y);
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene.moveTarget), { timeout: 15000 }).toBeNull();
  expect(Math.abs(await page.evaluate(() => (window as any).__wordmaster.scene.player.x) - destination.x)).toBeLessThan(1);
  await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene;
    const enemy = scene.spawnEnemy(scene.equipped[0], 'chaser', scene.player.x + 180, scene.player.y);
    enemy.staggerUntil = scene.clock + 100000; scene.strike(enemy, enemy.word);
  });
  await expect.poll(() => page.evaluate(() => Math.round((window as any).__wordmaster.scene.enemies[0].sprite.displayWidth))).toBe(43);
  expect(await page.evaluate(() => Math.round((window as any).__wordmaster.scene.enemies[0].sprite.displayHeight))).toBe(53);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene.game.canvas.width)).toBeGreaterThan(3700);
  expect(await page.evaluate(() => { const canvas = (window as any).__wordmaster.scene.game.canvas; return canvas.width * canvas.height; })).toBeLessThanOrEqual(8_010_000);
  expect(errors).toEqual([]); await context.close();
});

// Position fixtures isolate the combat logic from enemy navigation; actual input
// still drives attacks, weapon swaps and room/reward transitions.
async function attackEnemy(page: Page, wrong = false) {
  const target = await page.evaluate((incorrect) => {
    const scene = (window as any).__wordmaster.scene;
    for (const enemy of scene.enemies) { enemy.staggerUntil = scene.clock + 100000; enemy.attackAt = scene.clock + 100000; }
    const enemy = scene.enemies.find((item: any) => !item.dead && !item.boss) ?? scene.enemies.find((item: any) => !item.dead);
    if (!enemy) return null;
    scene.attackTarget = null; scene.lockedTarget = null; scene.moveTarget = null;
    scene.player.setPosition(enemy.sprite.x, Math.min(520, enemy.sprite.y + 65));
    scene.invulnerableUntil = scene.clock + 100000;
    const correctSlot = scene.equipped.findIndex((word: any) => word.id === enemy.word.id);
    scene.equip(incorrect ? (correctSlot + 1) % scene.equipped.length : correctSlot); scene.nextAttack = scene.clock;
    return { x: enemy.sprite.x, y: enemy.sprite.y, index: scene.enemies.indexOf(enemy), boss: enemy.boss, seal: scene.bossIndex, shielded: enemy.shielded, wrongBefore: Object.values(JSON.parse(localStorage.getItem('wordmaster.v1') || '{"words":{}}').words).reduce((sum: number, word: any) => sum + word.wrong, 0) };
  }, wrong);
  if (!target) return;
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('Canvas not found');
  await clickWorld(page, target.x, target.y);
  await page.keyboard.down('Space');
  try {
    await expect.poll(() => page.evaluate(({ index, boss, seal, wrongBefore, wrong }) => {
      const scene = (window as any).__wordmaster.scene;
      if (wrong) return Object.values(JSON.parse(localStorage.getItem('wordmaster.v1') || '{"words":{}}').words).reduce((sum: number, word: any) => sum + word.wrong, 0) > (wrongBefore as number);
      return boss ? scene.bossIndex > seal : scene.enemies[index]?.dead || scene.bossIndex > seal;
    }, { ...target, wrong }), { timeout: 8000, intervals: [100, 200, 300] }).toBe(true);
  } catch (error) {
    const details = await page.evaluate(() => {
      const scene = (window as any).__wordmaster.scene;
      return { player: [scene.player.x, scene.player.y], weapon: scene.equipped[scene.slot].word, aim: scene.angle,
        lock: scene.lockedTarget?.word.word, target: scene.attackTarget?.word.word,
        enemies: scene.enemies.map((enemy: any) => ({ word: enemy.word.word, hp: enemy.hp, dead: enemy.dead, position: [enemy.sprite.x, enemy.sprite.y] })) };
    });
    throw new Error(`${String(error)}\nExpected target: ${JSON.stringify(target)}\nCombat state: ${JSON.stringify(details)}`);
  } finally {
    await page.evaluate(() => { const s = (window as any).__wordmaster.scene; if (s.isBossRoom()) s.nextAttack = s.clock + 100000; });
    await page.keyboard.up('Space');
    await page.keyboard.down('a');
    await expect.poll(() => page.evaluate(() => Boolean((window as any).__wordmaster.scene.lockedTarget))).toBe(false);
    await page.keyboard.up('a');
  }
  await settleUpgrades(page);
  if (target.boss && target.seal < await page.evaluate(() => (window as any).__wordmaster.scene.words.length - 1)) {
    await expect.poll(() => page.evaluate(() => {
      const scene = (window as any).__wordmaster.scene;
      return scene.bossUpgradeOpen || scene.enemies[0].shielded;
    }), { timeout: 4000 }).toBe(true);
    if (await page.locator('[data-boss-upgrade="volley"]').isVisible()) await page.locator('[data-boss-upgrade="volley"]').click();
    await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene.enemies[0].shielded), { timeout: 4000 }).toBe(true);
  }
}

async function attackBossRound(page: Page) {
  const seal = await page.evaluate(() => (window as any).__wordmaster.scene.bossIndex);
  // Load the required horde, then isolate combat from continuous reinforcements.
  // Spawn pacing and formation are checked separately below.
  await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene, boss = scene.enemies[0]; scene.nextAttack = scene.clock + 100000;
    scene.nextMiniBossAt = Infinity; // Mini boss pacing and live combat have dedicated tests.
    while (scene.bossMinionsRemaining() + scene.bossRoundKills < scene.bossKillGoal()) scene.launchBossMinion(boss);
    boss.attackAt = scene.clock + 100000;
    scene.enemies.filter((enemy: any) => !enemy.dead && !enemy.boss).forEach((enemy: any, i: number) => {
      scene.tweens.killTweensOf([enemy.sprite, enemy.shadow, enemy.label, enemy.ring, enemy.healthBar]);
      // Leave room for knockback so this input fixture does not hide a frozen
      // minion inside the much larger, fixed boss collision body.
      enemy.sprite.setAlpha(1).setPosition(170 + i % 6 * 115, 350 + Math.floor(i / 6) * 100);
      enemy.lane = (enemy.sprite.y - scene.defenseField().midY) / scene.defenseField().laneGap;
      enemy.staggerUntil = scene.clock + 100000;
    });
  });
  while (await page.evaluate((index) => {
    const scene = (window as any).__wordmaster.scene;
    return scene.bossIndex === index && scene.enemies.some((enemy: any) => !enemy.dead && !enemy.boss);
  }, seal)) await attackEnemy(page);
  if (await page.evaluate(index => (window as any).__wordmaster.scene.bossIndex === index, seal)) await attackEnemy(page);
  if (seal < await page.evaluate(() => (window as any).__wordmaster.scene.words.length - 1)) {
    await expect.poll(() => page.evaluate(() => {
      const scene = (window as any).__wordmaster.scene;
      return scene.bossUpgradeOpen || !scene.bossTransition;
    })).toBe(true);
    if (await page.locator('[data-boss-upgrade="volley"]').isVisible()) await page.locator('[data-boss-upgrade="volley"]').click();
  }
  expect(await page.evaluate(() => (window as any).__wordmaster.scene.bossIndex)).toBe(seal + 1);
}

test('incorrect strikes rebound; every chamber and boss seal can be cleared', async ({ page }) => {
  test.setTimeout(360000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await start(page);
  await page.waitForTimeout(900);
  await fillCombatRoom(page);
  await attackEnemy(page, true);
  expect(await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('wordmaster.v1')!).words).some((word: any) => word.wrong > 0))).toBe(true);
  for (let room = 0; room < 4; room++) {
    await expect(page.locator('.game-stage')).toHaveAttribute('data-environment', ['meadow', 'library', 'forge', 'frost'][room]);
    if (room > 0) await fillCombatRoom(page);
    for (let enemy = 0; enemy < 9; enemy++) await attackEnemy(page);
    await expect(page.locator('[data-reward]').first()).toBeVisible();
    await page.locator('[data-reward]').first().click();
    await page.waitForTimeout(900);
  }
  await expect(page.locator('#room-tag')).toHaveText('BOSS');
  await expect(page.locator('.game-stage')).toHaveAttribute('data-environment', 'defense');
  for (let seal = 0; seal < 12; seal++) await attackBossRound(page);
  await expect(page.getByText('던전을 정복했습니다.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('wordmaster.v1')!).cleared)).toBe(1);
  expect(errors).toEqual([]);
});

test('a four-word dungeon supports the final single-weapon room and boss stage', async ({ page }) => {
  test.setTimeout(240000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: '내 단어로 던전 만들기' }).click();
  await page.locator('#custom-words').fill('호기심이 많은 | curious | She was curious.\n사라지다 | vanish | The stars vanish.\n용기 | courage | Have courage.\n꾸준한 | steady | Stay steady.');
  await page.getByRole('button', { name: '저장하고 던전 입장' }).click();
  await page.waitForTimeout(900);
  await fillCombatRoom(page);
  for (let enemy = 0; enemy < 9; enemy++) await attackEnemy(page);
  await page.locator('[data-reward]').first().click();
  await expect(page.locator('.word-slot')).toHaveCount(1);
  await page.waitForTimeout(900);
  await fillCombatRoom(page);
  for (let enemy = 0; enemy < 3; enemy++) await attackEnemy(page);
  await page.locator('[data-reward]').first().click();
  await page.waitForTimeout(900);
  for (let seal = 0; seal < 4; seal++) await attackBossRound(page);
  await expect(page.getByText('던전을 정복했습니다.', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('defeat can restart cleanly, and restarting cancels old room callbacks', async ({ page }) => {
  await start(page);
  await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene;
    scene.hp = 9; scene.invulnerableUntil = 0;
    scene.spawnEnemy(scene.equipped[0], 'chaser', scene.player.x, scene.player.y);
  });
  await expect(page.getByText('다시 깨어날 시간.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '다시 도전하기' }).click();
  await expect(page.locator('#health-text')).toContainText('100');
  await page.evaluate(() => {
    (window as any).__wordmaster.scene.time.delayedCall(1000, () => { (window as any).staleCallback = true; });
  });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '현재 단어로 처음부터 다시' }).click();
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => (window as any).staleCallback)).toBeUndefined();
  await expect(page.locator('#game-overlay')).toBeHidden();
});

async function clickWorld(page: Page, x: number, y: number) {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('Canvas not found');
  const size = await page.evaluate(() => { const scene = (window as any).__wordmaster.scene; return { w: scene.arenaWidth, h: scene.arenaHeight }; });
  await page.mouse.click(box.x + x / size.w * box.width, box.y + y / size.h * box.height);
}

async function clickCombatFixture(page: Page, kind: string) {
  await start(page);
  return page.evaluate((weaponKind) => {
    const scene = (window as any).__wordmaster.scene;
    scene.clearEntities();
    scene.equipped.forEach((word: any, i: number) => scene.spawnEnemy(word, 'chaser', 200 + i * 110, 140));
    scene.enemies.forEach((enemy: any, i: number) => {
      enemy.sprite.setPosition(200 + i * 110, 140);
      enemy.staggerUntil = scene.clock + 100000;
      enemy.attackAt = scene.clock + 100000;
    });
    const slot = scene.equipped.findIndex((word: any) => word.kind === weaponKind);
    const enemy = scene.enemies.find((item: any) => item.word.id === scene.equipped[slot].id);
    enemy.sprite.setPosition(820, 400);
    scene.player.setPosition(350, 400);
    scene.equip(slot); scene.nextAttack = scene.clock;
    scene.invulnerableUntil = scene.clock + 100000;
    return { index: scene.enemies.indexOf(enemy), x: 820, y: 400 };
  }, kind);
}

for (const kind of ['sword', 'hammer', 'bow']) {
  test(`${kind}: clicking a monster attacks it without Space and stops after killing it`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    const target = await clickCombatFixture(page, kind);
    await clickWorld(page, target.x, target.y);
    if (kind !== 'bow') {
      expect(await page.evaluate(index => (window as any).__wordmaster.scene.enemies[index].shielded, target.index)).toBe(true);
      await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene.player.x)).toBeGreaterThan(370);
    }
    await expect.poll(() => page.evaluate(index => (window as any).__wordmaster.scene.enemies[index].dead, target.index), { timeout: 8000 }).toBe(true);
    if (kind === 'bow') {
      expect(await page.evaluate(() => (window as any).__wordmaster.scene.player.x)).toBe(350);
      expect(await page.evaluate(() => (window as any).__wordmaster.scene.player.y)).toBe(400);
    }
    expect(await page.evaluate(() => (window as any).__wordmaster.scene.lockedTarget)).toBeNull();
    const nextAttack = await page.evaluate(() => (window as any).__wordmaster.scene.nextAttack);
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => (window as any).__wordmaster.scene.nextAttack)).toBe(nextAttack);
    expect(errors).toEqual([]);
  });
}

test('floor clicks cancel pursuit and move to the floor without attacking', async ({ page }) => {
  await clickCombatFixture(page, 'sword');
  await clickWorld(page, 820, 400);
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene.player.x)).toBeGreaterThan(365);
  await clickWorld(page, 350, 470);
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene.moveTarget)).toBeNull();
  const state = await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene;
    return { x: scene.player.x, y: scene.player.y, lock: scene.lockedTarget, shields: scene.enemies.every((enemy: any) => enemy.shielded) };
  });
  expect(Math.abs(state.x - 350)).toBeLessThan(1);
  expect(Math.abs(state.y - 470)).toBeLessThan(1);
  expect(state.lock).toBeNull(); expect(state.shields).toBe(true);
});

test('weapon switching changes pursuit to stationary firing; keyboard and pause cancel orders', async ({ page }) => {
  const target = await clickCombatFixture(page, 'sword');
  await clickWorld(page, target.x, target.y);
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene.player.x)).toBeGreaterThan(365);
  await page.keyboard.press('2');
  await expect(page.locator('#weapon-word')).toHaveText('abundant');
  const x = await page.evaluate(() => (window as any).__wordmaster.scene.player.x);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => (window as any).__wordmaster.scene.player.x)).toBe(x);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('wordmaster.v1') || '{"words":{}}').words.reluctant?.wrong ?? 0)).toBeGreaterThan(0);
  await page.keyboard.press('1');
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene.player.x), { timeout: 4000 }).toBeGreaterThan(x + 15);
  await page.keyboard.down('a');
  await expect.poll(() => page.evaluate(() => Boolean((window as any).__wordmaster.scene.lockedTarget))).toBe(false);
  await page.keyboard.up('a');
  await clickWorld(page, target.x, target.y);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '탐험 계속하기' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__wordmaster.scene.lockedTarget)).toBeNull();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift', { delay: 100 });
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene.nextDash)).toBeGreaterThan(0);
});

async function fillCombatRoom(page: Page) {
  await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene;
    const orders = [...scene.spawnQueue];
    scene.clearEntities();
    orders.forEach((order: any, index: number) => scene.spawnEnemy(order.word, order.kind, 180 + index % 5 * 150, 180 + Math.floor(index / 5) * 150));
  });
}

async function settleUpgrades(page: Page) {
  for (let choice = 0; choice < 12; choice++) {
    await expect.poll(() => page.evaluate(() => {
      const scene = (window as any).__wordmaster.scene;
      return scene.upgradeOpen || scene.gems.length === 0;
    }), { timeout: 6000 }).toBe(true);
    if (await page.locator('[data-upgrade]').first().isVisible()) {
      await page.locator('[data-upgrade]').first().click();
    } else return;
  }
  throw new Error('Too many pending upgrades');
}

test('the arena fills wide and portrait viewports and keeps health inside its bottom HUD', async ({ page }) => {
  for (const viewport of [{ width: 1536, height: 1000 }, { width: 811, height: 830 }]) {
    await page.setViewportSize(viewport); await page.goto('/');
    const canvas = await page.locator('canvas').boundingBox();
    const health = await page.locator('#health-text').boundingBox();
    expect(canvas?.x).toBe(0); expect(canvas?.y).toBe(0);
    expect(canvas?.width).toBe(viewport.width); expect(canvas?.height).toBe(viewport.height);
    expect(health!.y).toBeGreaterThan(viewport.height - 200);
    expect(health!.y + health!.height).toBeLessThan(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(viewport.height);
    await page.getByRole('button', { name: '플레이 방법' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: '닫기' }).click();
  }
});

test('empty opening, warning portals rotate through four sides, spawn rate accelerates and alive count is capped', async ({ page }) => {
  await start(page);
  expect(await page.evaluate(() => (window as any).__wordmaster.scene.enemies.length)).toBe(0);
  await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene;
    scene.nextSpawnAt = scene.clock + 800; scene.roomStarted = scene.clock - 60000;
    scene.invulnerableUntil = scene.clock + 100000;
  });
  for (let side = 0; side < 4; side++) {
    await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.state.nextSide)).toBe(side);
    expect(await page.evaluate(() => (window as any).__wordmaster.scene.enemies.length)).toBe(side);
    if (side === 0) {
      await page.setViewportSize({ width: 900, height: 800 });
      await expect.poll(() => page.evaluate(() => {
        const scene = (window as any).__wordmaster.scene, gate = scene.gatePosition(0), marker = scene.spawnWarning?.marker;
        return marker ? Math.hypot(marker.x - gate.x, marker.y - gate.y) : 100;
      })).toBeLessThan(1);
    }
    await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene.enemies.length)).toBe(side + 1);
    const position = await page.evaluate((index) => {
      const scene = (window as any).__wordmaster.scene;
      const enemy = scene.enemies[index]; enemy.staggerUntil = scene.clock + 100000; enemy.attackAt = scene.clock + 100000;
      return { x: enemy.sprite.x, y: enemy.sprite.y, gate: scene.gatePosition(index) };
    }, side);
    expect(Math.hypot(position.x - position.gate.x, position.y - position.gate.y)).toBeLessThan(35);
  }
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene.enemies.length), { timeout: 5000 }).toBe(6);
  await page.evaluate(() => { const scene = (window as any).__wordmaster.scene; scene.enemies.forEach((enemy: any) => enemy.staggerUntil = scene.clock + 100000); });
  await page.waitForTimeout(1900);
  expect(await page.evaluate(() => (window as any).__wordmaster.scene.enemies.length)).toBe(6);
  expect(await page.evaluate(() => (window as any).__wordmaster.state.spawnEvery)).toBe(1.5);
  expect(await page.evaluate(() => (window as any).__wordmaster.state.incoming)).toBe(3);
});

test('kill shards level up, pause for a choice, and triple arrows spare unmatched shields', async ({ page }) => {
  await clickCombatFixture(page, 'bow');
  await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene;
    scene.enemies.forEach((enemy: any, i: number) => { enemy.shielded = false; enemy.ring.setVisible(false); enemy.hp = i < 2 ? 1 : 1000; enemy.sprite.setPosition(600 + i * 100, 400); });
  });
  for (let i = 0; i < 2; i++) {
    await clickWorld(page, 600 + i * 100, 400);
    await expect.poll(() => page.evaluate(index => (window as any).__wordmaster.scene.enemies[index].dead, i)).toBe(true);
    if (!i) await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.state.xp)).toBe(12);
  }
  await expect(page.getByText('무기가 진화합니다.', { exact: true })).toBeVisible();
  const elapsed = await page.evaluate(() => (window as any).__wordmaster.state.elapsed);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => (window as any).__wordmaster.state.elapsed)).toBe(elapsed);
  await page.locator('[data-upgrade="bow"]').click();
  await expect(page.locator('#level-text')).toHaveText('LV. 2');
  expect(await page.evaluate(() => (window as any).__wordmaster.state.upgrades.bow)).toBe(1);
  await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene;
    scene.spawnEnemy(scene.equipped[0], 'chaser', 650, 445);
    scene.enemies[3].staggerUntil = scene.clock + 100000;
    scene.nextAttack = scene.clock;
  });
  await clickWorld(page, 800, 400);
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene.shots.filter((shot: any) => shot.word).length)).toBe(3);
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene.enemies[2].hp)).toBeLessThan(1000);
  expect(await page.evaluate(() => (window as any).__wordmaster.scene.enemies[3].shielded)).toBe(true);
  expect(await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('wordmaster.v1') || '{"words":{}}').words).some((word: any) => word.wrong > 0))).toBe(false);
});

test('three correct shields trigger a five-second overdrive and a hint freezes its timer', async ({ page }) => {
  await clickCombatFixture(page, 'sword');
  for (let i = 0; i < 3; i++) {
    const target = await page.evaluate(index => {
      const scene = (window as any).__wordmaster.scene, enemy = scene.enemies[index];
      enemy.hp = 1000; enemy.sprite.setPosition(650, 400); scene.player.setPosition(650, 465);
      scene.equip(index); scene.nextAttack = scene.clock;
      return { x: enemy.sprite.x, y: enemy.sprite.y };
    }, i);
    await clickWorld(page, target.x, target.y);
    await expect.poll(() => page.evaluate(index => (window as any).__wordmaster.scene.enemies[index].shielded, i)).toBe(false);
    await page.keyboard.down('a');
    await expect.poll(() => page.evaluate(() => Boolean((window as any).__wordmaster.scene.lockedTarget))).toBe(false);
    await page.keyboard.up('a');
    await page.evaluate(index => { (window as any).__wordmaster.scene.enemies[index].sprite.setPosition(150 + index * 130, 180); }, i);
  }
  await expect(page.locator('#burst-status')).toHaveClass('active');
  const burst = await page.evaluate(() => (window as any).__wordmaster.state.burst);
  expect(burst).toBeGreaterThan(3); expect(burst).toBeLessThanOrEqual(5);
  await page.keyboard.press('Tab');
  const frozen = await page.evaluate(() => (window as any).__wordmaster.state.burst);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => (window as any).__wordmaster.state.burst)).toBe(frozen);
});


test('five-arrow upgrades pierce exposed enemies without rebounding off another meaning shield', async ({ page }) => {
  await clickCombatFixture(page, 'bow');
  await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene;
    scene.weaponLevels.bow = 2;
    scene.enemies[0].sprite.setPosition(620, 445);
    scene.enemies[1].sprite.setPosition(600, 400);
    scene.enemies[2].sprite.setPosition(720, 400); scene.enemies[2].shielded = false; scene.enemies[2].hp = 200;
  });
  await clickWorld(page, 600, 400);
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene.shots.filter((shot: any) => shot.word).length)).toBe(5);
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene.enemies[1].shielded)).toBe(false);
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene.enemies[2].hp)).toBeLessThan(200);
  expect(await page.evaluate(() => (window as any).__wordmaster.scene.enemies[0].shielded)).toBe(true);
  expect(await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('wordmaster.v1') || '{"words":{}}').words).some((word: any) => word.wrong > 0))).toBe(false);
});

for (const kind of ['sword', 'hammer']) {
  test(`${kind} final evolution damages nearby exposed enemies and spares shields`, async ({ page }) => {
    await clickCombatFixture(page, kind);
    const primary = await page.evaluate(weaponKind => {
      const scene = (window as any).__wordmaster.scene;
      scene.weaponLevels[weaponKind] = 2;
      const primary = scene.enemies.find((enemy: any) => enemy.word.kind === weaponKind);
      const others = scene.enemies.filter((enemy: any) => enemy !== primary);
      primary.sprite.setPosition(500, 400); primary.shielded = false; primary.hp = 1000;
      others[0].sprite.setPosition(weaponKind === 'sword' ? 420 : 650, weaponKind === 'sword' ? 515 : 460); others[0].shielded = false; others[0].hp = 200;
      others[1].sprite.setPosition(weaponKind === 'sword' ? 460 : 650, weaponKind === 'sword' ? 270 : 350);
      return { exposed: scene.enemies.indexOf(others[0]), protected: scene.enemies.indexOf(others[1]) };
    }, kind);
    await clickWorld(page, 500, 400);
    await expect.poll(() => page.evaluate(index => (window as any).__wordmaster.scene.enemies[index].hp, primary.exposed)).toBeLessThan(200);
    expect(await page.evaluate(index => (window as any).__wordmaster.scene.enemies[index].shielded, primary.protected)).toBe(true);
    expect(await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('wordmaster.v1') || '{"words":{}}').words).some((word: any) => word.wrong > 0))).toBe(false);
  });
}

test('restart resets upgrades, level, experience and overdrive', async ({ page }) => {
  await start(page);
  await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene;
    scene.weaponLevels = { sword: 2, bow: 2, hammer: 2 }; scene.level = 5; scene.xp = 20;
    scene.burstUntil = scene.clock + 5000; scene.attackBoost = 24; scene.haste = 1.5;
  });
  await expect(page.locator('#level-text')).toHaveText('LV. 5');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '현재 단어로 처음부터 다시' }).click();
  await expect(page.locator('#level-text')).toHaveText('LV. 1');
  const reset = await page.evaluate(() => (window as any).__wordmaster.state);
  expect(reset.xp).toBe(0); expect(reset.upgrades).toEqual({ sword: 0, bow: 0, hammer: 0 });
  expect(reset.burst).toBe(0); expect(reset.attackBoost).toBe(0); expect(reset.haste).toBe(1);
  expect(reset.alive).toBe(0); expect(reset.incoming).toBe(9);
});


test('title menu fits desktop, portrait and short screens and legacy memories keep their scores in the unified workshop', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('wordmaster.v1', JSON.stringify({ words: { reluctant: { correct: 1, wrong: 0, hints: 0 }, 'custom:curious:호기심이 많은': { correct: 2, wrong: 0, hints: 0 } }, cleared: 0, best: 0, muted: true, custom: [
      { id: 'custom:curious:호기심이 많은', word: 'curious', meaning: '호기심이 많은', example: 'She was curious.', kind: 'sword' },
      { id: 'custom:vanish:사라지다', word: 'vanish', meaning: '사라지다', example: '', kind: 'bow' },
      { id: 'custom:courage:용기', word: 'courage', meaning: '용기', example: '', kind: 'hammer' },
    ] }));
  });
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled();
  for (const viewport of [{ width: 1536, height: 1000 }, { width: 390, height: 844 }, { width: 1280, height: 600 }]) {
    await page.setViewportSize(viewport);
    await expect(page.locator('.bottom-hud')).toBeHidden();
    const menu = await page.locator('.title-screen').boundingBox();
    expect(menu!.x).toBeGreaterThanOrEqual(0); expect(menu!.y).toBeGreaterThanOrEqual(0);
    expect(menu!.x + menu!.width).toBeLessThanOrEqual(viewport.width);
    expect(menu!.y + menu!.height).toBeLessThanOrEqual(viewport.height);
    await expect(page.locator('.title-screen h1>span')).toHaveCSS('font-size', await page.locator('.title-screen h1').evaluate(e => getComputedStyle(e).fontSize));
  }
  await page.locator('#title-codex').click();
  await expect(page.locator('.codex-progress>strong').first()).toHaveText('18 / 100');
  await page.locator('.mastery-help summary').click();
  await expect(page.locator('.mastery-help p')).toContainText('실제 암기율은 아니에요');
  await page.locator('#modal-close').click(); await page.locator('#title-custom').click();
  await expect(page.locator('[data-format]')).toHaveCount(0);
  await expect(page.locator('#custom-words')).toHaveValue('호기심이 많은 | curious | She was curious.\n사라지다 | vanish\n용기 | courage');
  await page.locator('#create-dungeon').click();
  expect(await page.evaluate(() => (window as any).__wordmaster.scene.equipped[0].id)).toBe('custom:curious:호기심이 많은');
  await page.locator('#codex-button').click(); await page.locator('[data-tab="custom"]').click();
  await expect(page.locator('.codex-progress>strong').first()).toHaveText('36 / 100');
  expect(errors).toEqual([]);
});
