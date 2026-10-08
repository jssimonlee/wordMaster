import { test, expect, type Page } from '@playwright/test';

async function start(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '첫 던전 입장' }).click();
  await expect(page.locator('#game-overlay')).toBeHidden();
}

test('movement, weapon switching, hint pause, persistence and custom dungeon', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await start(page);
  const x = await page.evaluate(() => (window as any).__wordmaster.scene.player.x);
  const canvas = await page.locator('canvas').boundingBox();
  if (!canvas) throw new Error('Canvas not found');
  expect(canvas.width).toBeGreaterThan(1200);
  expect(canvas.height).toBeGreaterThan(700);
  await page.mouse.click(canvas.x + 720 / 1040 * canvas.width, canvas.y + 480 / 620 * canvas.height);
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
  await page.locator('#custom-words').fill('curious | 호기심이 많은 | She was curious.\nvanish | 사라지다 | The stars vanish.\ncourage | 용기 | Have courage.\nsteady | 꾸준한 | Stay steady.');
  await page.getByRole('button', { name: '단어 저장하고 던전 입장' }).click();
  await expect(page.locator('#word-count')).toHaveText('4');
  await expect(page.locator('#weapon-word')).toHaveText('curious');
  await expect(page.locator('#route-fraction')).toHaveText('1 / 3');
  await page.reload();
  await page.getByRole('button', { name: '단어 도감' }).click();
  await page.getByRole('button', { name: '내 단어', exact: false }).last().click();
  await expect(page.locator('.codex-list')).toContainText('curious');
  expect(errors).toEqual([]);
});

// Position fixtures isolate the combat logic from enemy navigation; actual input
// still drives attacks, weapon swaps and room/reward transitions.
async function attackEnemy(page: Page, wrong = false) {
  const target = await page.evaluate((incorrect) => {
    const scene = (window as any).__wordmaster.scene;
    for (const enemy of scene.enemies) { enemy.staggerUntil = scene.clock + 100000; enemy.attackAt = scene.clock + 100000; }
    const enemy = scene.enemies.find((item: any) => !item.dead);
    if (!enemy) return null;
    scene.attackTarget = null; scene.lockedTarget = null; scene.moveTarget = null;
    scene.player.setPosition(enemy.sprite.x, Math.min(520, enemy.sprite.y + 65));
    scene.invulnerableUntil = scene.clock + 100000;
    const correctSlot = scene.equipped.findIndex((word: any) => word.id === enemy.word.id);
    scene.equip(incorrect ? (correctSlot + 1) % scene.equipped.length : correctSlot);
    return { x: enemy.sprite.x, y: enemy.sprite.y, index: scene.enemies.indexOf(enemy), boss: enemy.boss, seal: scene.bossIndex, shielded: enemy.shielded, wrongBefore: Object.values(JSON.parse(localStorage.getItem('wordmaster.v1') || '{"words":{}}').words).reduce((sum: number, word: any) => sum + word.wrong, 0) };
  }, wrong);
  if (!target) return;
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('Canvas not found');
  await page.mouse.click(box.x + target.x / 1040 * box.width, box.y + target.y / 620 * box.height);
  await page.keyboard.down('Space');
  try {
    await expect.poll(() => page.evaluate(({ index, boss, seal, wrongBefore, wrong }) => {
      const scene = (window as any).__wordmaster.scene;
      if (wrong) return Object.values(JSON.parse(localStorage.getItem('wordmaster.v1') || '{"words":{}}').words).reduce((sum: number, word: any) => sum + word.wrong, 0) > (wrongBefore as number);
      return boss ? scene.bossIndex > seal : scene.enemies[index]?.dead;
    }, { ...target, wrong }), { timeout: 8000, intervals: [100, 200, 300] }).toBe(true);
  } catch (error) {
    const details = await page.evaluate(() => {
      const scene = (window as any).__wordmaster.scene;
      return { player: [scene.player.x, scene.player.y], weapon: scene.equipped[scene.slot].word, aim: scene.angle,
        lock: scene.lockedTarget?.word.word, target: scene.attackTarget?.word.word,
        enemies: scene.enemies.map((enemy: any) => ({ word: enemy.word.word, hp: enemy.hp, dead: enemy.dead, position: [enemy.sprite.x, enemy.sprite.y] })) };
    });
    throw new Error(`${String(error)}\nCombat state: ${JSON.stringify(details)}`);
  } finally { await page.keyboard.up('Space'); }
  if (target.boss && target.seal < await page.evaluate(() => (window as any).__wordmaster.scene.words.length - 1)) {
    await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene.enemies[0].shielded), { timeout: 4000 }).toBe(true);
  }
}

test('incorrect strikes rebound; every chamber and boss seal can be cleared', async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await start(page);
  await page.waitForTimeout(900);
  await attackEnemy(page, true);
  expect(await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('wordmaster.v1')!).words).some((word: any) => word.wrong > 0))).toBe(true);
  for (let room = 0; room < 4; room++) {
    await expect(page.locator('.game-stage')).toHaveAttribute('data-environment', ['meadow', 'library', 'forge', 'frost'][room]);
    for (let enemy = 0; enemy < 6; enemy++) await attackEnemy(page);
    await expect(page.getByRole('button', { name: /생명의 샘/ })).toBeVisible();
    await page.getByRole('button', { name: /생명의 샘/ }).click();
    await page.waitForTimeout(900);
  }
  await expect(page.locator('#room-tag')).toHaveText('BOSS');
  await expect(page.locator('.game-stage')).toHaveAttribute('data-environment', 'astral');
  for (let seal = 0; seal < 12; seal++) await attackEnemy(page);
  await expect(page.getByText('던전을 정복했습니다.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('wordmaster.v1')!).cleared)).toBe(1);
  expect(errors).toEqual([]);
});

test('a four-word dungeon supports the final single-weapon room and boss stage', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: '내 단어로 던전 만들기' }).click();
  await page.locator('#custom-words').fill('curious | 호기심이 많은 | She was curious.\nvanish | 사라지다 | The stars vanish.\ncourage | 용기 | Have courage.\nsteady | 꾸준한 | Stay steady.');
  await page.getByRole('button', { name: '단어 저장하고 던전 입장' }).click();
  await page.waitForTimeout(900);
  for (let enemy = 0; enemy < 6; enemy++) await attackEnemy(page);
  await page.getByRole('button', { name: /생명의 샘/ }).click();
  await expect(page.locator('.word-slot')).toHaveCount(1);
  await page.waitForTimeout(900);
  for (let enemy = 0; enemy < 2; enemy++) await attackEnemy(page);
  await page.getByRole('button', { name: /생명의 샘/ }).click();
  await page.waitForTimeout(900);
  for (let seal = 0; seal < 4; seal++) await attackEnemy(page);
  await expect(page.getByText('던전을 정복했습니다.', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('defeat can restart cleanly, and restarting cancels old room callbacks', async ({ page }) => {
  await start(page);
  await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene;
    scene.hp = 9; scene.invulnerableUntil = 0;
    scene.enemies[0].sprite.setPosition(scene.player.x, scene.player.y);
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

test('clicking a creature approaches without attacking, Space attacks and Shift dodges', async ({ page }) => {
  await start(page);
  const target = await page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene;
    for (const enemy of scene.enemies) { enemy.staggerUntil = scene.clock + 100000; enemy.attackAt = scene.clock + 100000; }
    const enemy = scene.enemies[0]; enemy.sprite.setPosition(700, 340);
    scene.equip(scene.equipped.findIndex((word: any) => word.id === enemy.word.id));
    scene.invulnerableUntil = scene.clock + 100000;
    return { x: enemy.sprite.x, y: enemy.sprite.y };
  });
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('Canvas not found');
  await page.mouse.click(box.x + target.x / 1040 * box.width, box.y + target.y / 620 * box.height);
  await expect.poll(() => page.evaluate(() => {
    const scene = (window as any).__wordmaster.scene;
    return Math.hypot(scene.player.x - scene.enemies[0].sprite.x, scene.player.y - scene.enemies[0].sprite.y);
  }), { timeout: 7000 }).toBeLessThan(230);
  expect(await page.evaluate(() => (window as any).__wordmaster.scene.enemies[0].shielded)).toBe(true);
  await page.keyboard.down('Space');
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene.enemies[0].shielded), { timeout: 7000 }).toBe(false);
  await page.keyboard.up('Space');
  await page.keyboard.down('Shift');
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene.nextDash), { timeout: 3000 }).toBeGreaterThan(0);
  await page.keyboard.up('Shift');
});
