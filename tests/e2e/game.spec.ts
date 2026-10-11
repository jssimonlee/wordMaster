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
  await clickWorld(page, target.x, target.y);
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
  } finally {
    await page.keyboard.up('Space');
    await page.keyboard.down('a');
    await expect.poll(() => page.evaluate(() => Boolean((window as any).__wordmaster.scene.lockedTarget))).toBe(false);
    await page.keyboard.up('a');
  }
  await settleUpgrades(page);
  if (target.boss && target.seal < await page.evaluate(() => (window as any).__wordmaster.scene.words.length - 1)) {
    await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.scene.enemies[0].shielded), { timeout: 4000 }).toBe(true);
  }
}

test('incorrect strikes rebound; every chamber and boss seal can be cleared', async ({ page }) => {
  test.setTimeout(180000);
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
  await fillCombatRoom(page);
  for (let enemy = 0; enemy < 9; enemy++) await attackEnemy(page);
  await page.locator('[data-reward]').first().click();
  await expect(page.locator('.word-slot')).toHaveCount(1);
  await page.waitForTimeout(900);
  await fillCombatRoom(page);
  for (let enemy = 0; enemy < 3; enemy++) await attackEnemy(page);
  await page.locator('[data-reward]').first().click();
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
