import { test, expect, type Page } from '@playwright/test';

async function start(page: Page) {
  await page.goto('/'); await page.locator('#typing-start-button').click();
  await expect(page.locator('#typing-input')).toBeFocused();
  await page.evaluate(() => { const s = (window as any).__wordmaster.typingScene; s.spawnAt = 1e9; });
}
async function earnPoint(page: Page) {
  const answer = await page.evaluate(() => {
    const s = (window as any).__wordmaster.typingScene;
    for (const m of s.swarm) for (const part of [m.sprite, m.label, m.aura, m.health]) part.destroy();
    s.swarm = []; s.waveSpawned = 0; s.waveEndsAt = 0; s.spawnAt = 1e9; s.resetInput();
    for (let i = 0; i < 3; i++) { const m = s.spawnMinion(i, s.spawnX); m.word = s.memories[0]; }
    s.publish(true); return s.memories[0].word;
  });
  await page.locator('#typing-input').pressSequentially(answer, { delay: 3 });
  await expect(page.locator('#typing-input')).toHaveValue('');
}
async function clickSlot(page: Page, slot: number) {
  const point = await page.evaluate(index => {
    const s = (window as any).__wordmaster.typingScene, pad = s.towerPads[index];
    const canvas = s.game.canvas.getBoundingClientRect();
    return { x: canvas.x + pad.x / s.w * canvas.width, y: canvas.y + pad.y / s.h * canvas.height };
  }, slot);
  await page.mouse.click(point.x, point.y);
}

test('a top-tier answer awards one point, and fixed slots build, upgrade and move a letter tower', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await start(page); await earnPoint(page);
  await expect(page.locator('#tower-points')).toHaveText('1');
  expect(await page.evaluate(() => (window as any).__wordmaster.typingScene.stormKills)).toBe(3);
  await expect(page.locator('#tower-panel')).toBeVisible();
  await expect(page.locator('[data-rune="r"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#typing-input')).toHaveAttribute('readonly', '');
  await page.locator('[data-rune="r"]').click();
  const clock = await page.evaluate(() => (window as any).__wordmaster.typingScene.stormClock);
  await page.waitForTimeout(180);
  expect(await page.evaluate(() => (window as any).__wordmaster.typingScene.stormClock)).toBe(clock);
  await clickSlot(page, 0);
  await expect(page.locator('#tower-points')).toHaveText('0');
  await expect(page.locator('[data-tower-slot="0"]')).toContainText('Lv.1');
  await expect(page.locator('#tower-upgrade')).toBeDisabled();
  expect(await page.evaluate(() => (window as any).__wordmaster.typingScene.moveTo)).toBeNull();
  await page.keyboard.press('Escape'); await expect(page.locator('#typing-input')).toBeFocused();
  await earnPoint(page);
  await expect(page.locator('#tower-panel')).toBeVisible();
  await expect(page.locator('[data-tower-slot="0"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#tower-upgrade').click();
  await expect(page.locator('.tower-selection')).toContainText('Lv.2');
  await page.locator('#tower-move').click(); await page.locator('[data-tower-slot="4"]').click();
  await expect(page.locator('[data-tower-slot="4"]')).toContainText('Lv.2');
  await expect(page.locator('[data-tower-slot="0"]')).toContainText('빈 자리');
  expect(await page.evaluate(() => {
    const s = (window as any).__wordmaster.typingScene;
    return { glyph: s.towerPads[4].getByName('tower-rune').text, points: s.fortifications.points, level: s.fortifications.at(4).level };
  })).toEqual({ glyph: 'R', points: 0, level: 2 });
  await page.screenshot({ path: '/private/tmp/wordmaster-tower-system.png' });
  await page.locator('#tower-close').click();
  await page.evaluate(() => { const s = (window as any).__wordmaster.typingScene; s.round = 2; s.beginWave(); s.spawnAt = 1e9; });
  expect(await page.evaluate(() => (window as any).__wordmaster.typingScene.fortifications.at(4).level)).toBe(2);
  await page.keyboard.press('Escape'); await page.locator('#restart-button').click();
  await expect(page.locator('#tower-points')).toHaveText('0');
  expect(await page.evaluate(() => (window as any).__wordmaster.typingScene.fortifications.towers.length)).toBe(0);
  expect(errors).toEqual([]);
});

test('towers repeatedly fire weaker shots only at matching initials, pause cleanly and never earn their own points', async ({ page }) => {
  await start(page);
  const result = await page.evaluate(() => {
    const s = (window as any).__wordmaster.typingScene;
    for (const m of s.swarm) m.sprite.destroy(); s.swarm = []; s.waveSpawned = 0;
    s.fortifications.earn('reluctant', 3); s.fortifications.build(1, 'r', s.stormClock); s.paintTowerPads();
    const pad = s.towerPads[1], enemies = [];
    for (let i = 0; i < 2; i++) {
      const enemy = s.spawnMinion(i, s.spawnX); enemy.word = s.memories[i];
      enemy.sprite.setPosition(pad.x + 40 + i * 50, s.laneY(0)); enemies.push(enemy);
    }
    const tower = s.fortifications.at(1);
    s.stormClock = tower.nextShot; s.update(0, 0);
    const beforeImpact = enemies[0].hp, projectile = s.towerMissiles[0];
    const missileTexture = projectile.image.texture.key;
    s.setPaused(true); const frozenPosition = projectile.image.x; s.update(0, 2000);
    const frozenFlight = projectile.image.x === frozenPosition && enemies[0].hp === 100;
    s.setPaused(false);
    for (let frame = 0; frame < 10; frame++) s.update(0, 40);
    const firstHp = enemies[0].hp, wrongHp = enemies[1].hp;
    s.update(0, 0); const noEarlyShot = tower.shots === 1;
    s.setPaused(true); const frozen = s.stormClock; s.update(0, 2000);
    const paused = frozen === s.stormClock && enemies[0].hp === firstHp;
    s.setPaused(false);
    for (let i = 0; i < 8; i++) {
      s.stormClock = tower.nextShot; s.update(0, 0);
      for (let frame = 0; frame < 10; frame++) s.update(0, 40);
    }
    return { firstHp, wrongHp, finalWrongHp: enemies[1].hp, noEarlyShot, paused, dead: enemies[0].dead,
      kills: s.stormKills, points: s.fortifications.points, shots: tower.shots, combo: s.stormCombo, beforeImpact, frozenFlight, missileTexture };
  });
  expect(result).toEqual({ firstHp: 88, wrongHp: 100, finalWrongHp: 100, noEarlyShot: true, paused: true, dead: true, kills: 1, points: 0, shots: 9, combo: 0, beforeImpact: 100, frozenFlight: true, missileTexture: 'guardian-missile' });
});

test('reverse rounds use the typed Korean answer initial and tower kills safely release unfinished input', async ({ page }) => {
  await start(page);
  const result = await page.evaluate(() => {
    const s = (window as any).__wordmaster.typingScene;
    for (const m of s.swarm) m.sprite.destroy(); s.swarm = []; s.waveSpawned = 0; s.round = 7;
    s.fortifications.earn('reluctant', 3); s.fortifications.build(1, 'r', s.stormClock);
    const enemy = s.spawnMinion(0, s.spawnX); enemy.word = s.memories[0];
    const answer = enemy.word.meaning;
    s.fortifications.earn(answer, 3); s.fortifications.build(4, Array.from(answer)[0], s.stormClock); s.paintTowerPads();
    const north = s.towerPads[1], south = s.towerPads[4];
    enemy.sprite.setPosition(north.x, (north.y + south.y) / 2); enemy.hp = 5;
    s.acceptTyping(answer.slice(0, 1));
    s.stormClock = s.fortifications.at(4).nextShot; s.update(0, 0);
    for (let frame = 0; frame < 15; frame++) s.update(0, 40);
    return { englishShots: s.fortifications.at(1).shots, koreanShots: s.fortifications.at(4).shots, dead: enemy.dead,
      input: s.rawInput, error: s.lastError, points: s.fortifications.points };
  });
  expect(result).toEqual({ englishShots: 0, koreanShots: 1, dead: true, input: '', error: false, points: 0 });
  await expect(page.locator('#typing-input')).toHaveValue('');
});

test('tower slots and management fit portrait and short screens and follow resizing', async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 600 }]) {
    await page.setViewportSize(viewport); await start(page); await earnPoint(page);
    await expect(page.locator('#tower-panel')).toBeVisible(); await page.locator('[data-rune="r"]').click();
    await page.locator('[data-tower-slot="4"]').click();
    const panel = await page.locator('#tower-panel').boundingBox();
    expect(panel!.x).toBeGreaterThanOrEqual(0); expect(panel!.x + panel!.width).toBeLessThanOrEqual(viewport.width);
    expect(panel!.y + panel!.height).toBeLessThanOrEqual(viewport.height);
    const slots = await page.evaluate(() => {
      const s = (window as any).__wordmaster.typingScene;
      return s.towerPads.map((pad: any) => ({ x: pad.x, y: pad.y, safe: pad.x > 30 && pad.x < s.w - 30 && pad.y > 50 && pad.y + 34 < s.h }));
    });
    expect(slots.every((slot: any) => slot.safe)).toBe(true);
    expect(slots[0].y).toBeLessThan(slots[3].y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/private/tmp/wordmaster-towers-${viewport.width}.png` });
    const outside = await page.evaluate(() => {
      const s = (window as any).__wordmaster.typingScene, canvas = s.game.canvas.getBoundingClientRect();
      const card = document.getElementById('tower-panel')!.getBoundingClientRect();
      const middle = canvas.y + (s.top + s.bottom) / 2 / s.h * canvas.height;
      return { x: canvas.x + 25, y: innerWidth <= 580 ? Math.min(middle, card.top - 20) : middle };
    });
    await page.mouse.click(outside.x, outside.y);
    await expect(page.locator('#tower-panel')).toBeHidden();
    await expect(page.locator('#typing-input')).toBeFocused();
    await page.setViewportSize({ width: viewport.width + 80, height: viewport.height });
    expect(await page.evaluate(() => (window as any).__wordmaster.typingScene.fortifications.at(4).initial)).toBe('r');
  }
});

test('illustrated towers launch crystal missiles and retarget only another matching initial', async ({ page }) => {
  await start(page);
  await page.waitForTimeout(1900); // Let the opening banner fade before the visual proof.
  const result = await page.evaluate(() => {
    const s = (window as any).__wordmaster.typingScene;
    for (const m of s.swarm) for (const part of [m.sprite, m.label, m.aura, m.health]) part.destroy();
    s.swarm = []; s.waveSpawned = 0; s.spawnAt = 1e9;
    for (let i = 0; i < 5; i++) s.fortifications.earn('rune', 3);
    s.fortifications.earn('arcane', 3);
    s.fortifications.build(1, 'r', s.stormClock); s.fortifications.upgrade(1, 'power'); s.fortifications.upgrade(1, 'power');
    s.fortifications.build(4, 'a', s.stormClock); s.fortifications.upgrade(4, 'power'); s.paintTowerPads();
    const north = s.towerPads[1], south = s.towerPads[4], words = [s.memories[0], s.memories[2], s.memories[1]];
    const midY = (north.y + south.y) / 2;
    for (let i = 0; i < 3; i++) {
      const m = s.spawnMinion(i, s.spawnX); m.word = words[i]; m.label.setText(words[i].meaning);
      m.sprite.setPosition(north.x + 60 + i * 55, midY + (i - 1) * 45);
    }
    s.stormClock = Math.max(...s.fortifications.towers.map((tower: any) => tower.nextShot));
    s.update(0, 0);
    const loaded = s.towerPads[1].list.some((part: any) => part.texture?.key === 'guardian-evolution-3' && part.visible);
    const missiles = s.towerMissiles.length;
    s.swarm[0].dead = true;
    for (const part of [s.swarm[0].sprite, s.swarm[0].label, s.swarm[0].aura, s.swarm[0].health]) part.destroy();
    s.update(0, 80);
    const retarget = s.towerMissiles.find((missile: any) => missile.initial === 'r').target === s.swarm[1];
    const textures = s.towerMissiles.every((missile: any) => missile.image.texture.key === 'guardian-missile');
    s.setPaused(true); s.publish();
    return { loaded, missiles, retarget, textures, healthy: s.swarm[1].hp === 100 && s.swarm[2].hp === 100 };
  });
  expect(result).toEqual({ loaded: true, missiles: 2, retarget: true, textures: true, healthy: true });
  await page.screenshot({ path: '/private/tmp/wordmaster-tower-art.png' });
});

test('each earned point automatically opens its choice and upgrades replace all four tower forms', async ({ page }) => {
  await start(page); await earnPoint(page);
  await expect(page.locator('#tower-panel')).toBeVisible();
  await page.locator('[data-tower-slot="0"]').click();
  const texture = () => page.evaluate(() => (window as any).__wordmaster.typingScene.towerPads[0].list[1].texture.key);
  expect(await texture()).toBe('guardian-evolution-1');
  await page.locator('#tower-close').click();
  for (let level = 2; level <= 4; level++) {
    await earnPoint(page);
    await expect(page.locator('#tower-panel')).toBeVisible();
    await expect(page.locator('[data-tower-slot="0"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#tower-upgrade').click();
    expect(await texture()).toBe(`guardian-evolution-${level}`);
    await expect(page.locator('.tower-selection')).toContainText(`Lv.${level}`);
    await page.locator('#tower-close').click();
    await expect(page.locator('#tower-panel')).toBeHidden();
    await expect(page.locator('#typing-input')).toBeFocused();
  }
  await page.evaluate(() => {
    const s = (window as any).__wordmaster.typingScene;
    // A display fixture places the four verified forms side by side for visual QA.
    s.fortifications.move(0, 4);
    for (let i = 0; i < 6; i++) s.fortifications.earn('rune', 3);
    s.fortifications.build(0, 'r', s.stormClock);
    s.fortifications.build(1, 'r', s.stormClock); s.fortifications.upgrade(1, 'power');
    s.fortifications.build(3, 'r', s.stormClock); s.fortifications.upgrade(3, 'power'); s.fortifications.upgrade(3, 'power');
    s.paintTowerPads(); s.lightning.clear(); s.fire.clear(); s.setPaused(true); s.publish();
  });
  await page.screenshot({ path: '/private/tmp/wordmaster-tower-evolution.png' });
});

test('clicking the battlefield dismisses tower choices without spending points or ordering a move', async ({ page }) => {
  await start(page); await earnPoint(page);
  // The card itself is interactive; inspecting its art must keep battle paused.
  await page.locator('.tower-showcase').click();
  await expect(page.locator('#tower-panel')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__wordmaster.typingScene.typingPaused)).toBe(true);
  const field = await page.evaluate(() => {
    const s = (window as any).__wordmaster.typingScene, canvas = s.game.canvas.getBoundingClientRect();
    return { x: canvas.x + (s.goal + 100) / s.w * canvas.width, y: canvas.y + (s.top + s.bottom) / 2 / s.h * canvas.height };
  });
  await page.mouse.click(field.x, field.y);
  await expect(page.locator('#tower-panel')).toBeHidden();
  await expect(page.locator('#typing-input')).toBeFocused();
  expect(await page.evaluate(() => {
    const s = (window as any).__wordmaster.typingScene;
    return { paused: s.typingPaused, points: s.fortifications.points, towers: s.fortifications.towers.length, move: s.moveTo, rune: s.towerRune };
  })).toEqual({ paused: false, points: 1, towers: 0, move: null, rune: null });
  await page.locator('#tower-button').click();
  await page.locator('[data-rune="r"]').click();
  await page.locator('[data-tower-slot="0"]').click();
  await page.locator('#tower-close').click(); await earnPoint(page);
  await expect(page.locator('.tower-stats')).toContainText('12.0');
  await expect(page.locator('.tower-next img')).toHaveAttribute('src', '/assets/art/guardian-evolution-2.png');
  await expect(page.locator('#tower-upgrade')).toBeEnabled();
  await page.screenshot({ path: '/private/tmp/wordmaster-defense-command.png' });
  await page.locator('#tower-move').click();
  await page.mouse.click(field.x, field.y);
  await expect(page.locator('#tower-panel')).toBeHidden();
  await expect(page.locator('#typing-input')).toBeFocused();
  expect(await page.evaluate(() => {
    const s = (window as any).__wordmaster.typingScene;
    return { paused: s.typingPaused, points: s.fortifications.points, slot: s.fortifications.towers[0].slot, moving: s.towerMoving, move: s.moveTo };
  })).toEqual({ paused: false, points: 1, slot: 0, moving: false, move: null });
  // A subsequent click still performs the usual movement command.
  await page.mouse.click(field.x, field.y);
  expect(await page.evaluate(() => (window as any).__wordmaster.typingScene.moveTo)).not.toBeNull();
});

test('players choose independent tower upgrades and can keep upgrading abilities after the final visual form', async ({ page }) => {
  await start(page); await earnPoint(page); await page.locator('[data-tower-slot="0"]').click();
  await page.evaluate(() => {
    const s = (window as any).__wordmaster.typingScene;
    for (let i = 0; i < 6; i++) s.fortifications.earn('rune', 3);
    s.publish();
  });
  await expect(page.locator('.tower-showcase img')).toHaveAttribute('src', '/assets/art/guardian-evolution-1.png');
  await expect(page.locator('[data-tower-upgrade="power"]')).toContainText('12.0');
  await expect(page.locator('[data-tower-upgrade="power"]')).toContainText('19.4');
  const oldCooldown = await page.evaluate(() => { const s = (window as any).__wordmaster.typingScene; return s.fortifications.at(0).nextShot - s.stormClock; });
  for (const [index, kind] of ['speed', 'volley', 'range', 'power'].entries()) {
    await page.locator(`[data-tower-upgrade="${kind}"]`).click();
    const tower = await page.evaluate(() => (window as any).__wordmaster.typingScene.fortifications.at(0));
    expect(tower.level).toBe(index + 2);
    if (index === 0) {
      const cooldown = await page.evaluate(() => { const s = (window as any).__wordmaster.typingScene; return s.fortifications.at(0).nextShot - s.stormClock; });
      expect(cooldown).toBeCloseTo(oldCooldown * (450 + 1150 / 1.35) / 1600);
    }
    for (const key of ['power', 'speed', 'volley', 'range']) {
      expect(tower.upgrades[key]).toBe(['speed', 'volley', 'range', 'power'].slice(0, index + 1).includes(key) ? 1 : 0);
    }
    await expect(page.locator('.tower-showcase img')).toHaveAttribute('src', `/assets/art/guardian-evolution-${Math.min(4, index + 2)}.png`);
  }
  await expect(page.locator('#tower-points')).toHaveText('2');
  await expect(page.locator('.tower-stats')).toContainText('2발');
  await expect(page.locator('.tower-stats')).toContainText('1.30초');
  await expect(page.locator('.tower-stats')).toContainText('116%');
  await page.locator('.tower-content').evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: '/private/tmp/wordmaster-tower-specializations.png' });
  await page.evaluate(() => {
    const s = (window as any).__wordmaster.typingScene;
    for (let i = 0; i < 3; i++) s.fortifications.earn('rune', 3);
    s.publish();
  });
  for (let i = 0; i < 4; i++) await page.locator('[data-tower-upgrade="volley"]').click();
  await expect(page.locator('[data-tower-upgrade="volley"]')).toBeDisabled();
  await expect(page.locator('[data-tower-upgrade="power"]')).toBeEnabled();
  await expect(page.locator('.tower-stats')).toContainText('6발');
  await expect(page.locator('#tower-points')).toHaveText('1');
  await page.locator('#tower-close').click();
  await expect(page.locator('#typing-input')).toBeFocused();
});

test('multishot spreads real homing missiles across matching enemies and speed changes its next firing time', async ({ page }) => {
  await start(page);
  const result = await page.evaluate(() => {
    const s = (window as any).__wordmaster.typingScene;
    for (const m of s.swarm) for (const part of [m.sprite, m.label, m.aura, m.health, m.rune]) part.destroy();
    s.swarm = []; s.waveSpawned = 0; s.waveEndsAt = 0; s.spawnAt = 1e9;
    for (let i = 0; i < 4; i++) s.fortifications.earn('reluctant', 3);
    s.fortifications.build(1, 'r', s.stormClock);
    s.fortifications.upgrade(1, 'volley'); s.fortifications.upgrade(1, 'volley'); s.fortifications.upgrade(1, 'speed');
    s.paintTowerPads();
    const pad = s.towerPads[1], enemies: any[] = [];
    for (let i = 0; i < 3; i++) {
      const m = s.spawnMinion(i, s.spawnX); m.word = s.memories[i < 2 ? 0 : 1];
      m.sprite.setPosition(pad.x + 65 + i * 25, pad.y + 100); enemies.push(m);
    }
    const tower = s.fortifications.at(1);
    s.stormClock = tower.nextShot; const firedAt = s.stormClock; s.update(0, 0);
    const launch = { count: s.towerMissiles.length, targets: s.towerMissiles.map((m: any) => enemies.indexOf(m.target)),
      distinctAngles: new Set(s.towerMissiles.map((m: any) => m.image.rotation)).size };
    s.setPaused(true); const x = s.towerMissiles[0].image.x; s.update(0, 500);
    const frozen = s.towerMissiles[0].image.x === x; s.setPaused(false);
    for (let i = 0; i < 15; i++) s.update(0, 40);
    const hp = enemies.map(m => m.hp), interval = tower.nextShot - firedAt;
    s.stormClock = tower.nextShot - 1; s.update(0, 0); const before = tower.shots;
    s.stormClock = tower.nextShot; s.update(0, 0);
    const after = tower.shots;
    for (const missile of s.towerMissiles) missile.image.destroy(); s.towerMissiles = [];
    enemies[1].dead = true;
    s.stormClock = tower.nextShot; s.update(0, 0);
    const focused = s.towerMissiles.length === 3 && s.towerMissiles.every((m: any) => m.target === enemies[0]);
    return { launch, hp, frozen, interval, before, after, focused, points: s.fortifications.points };
  });
  expect(result.launch).toEqual({ count: 3, targets: [0, 1, 0], distinctAngles: 3 });
  expect(result.hp).toEqual([76, 88, 100]); expect(result.frozen).toBe(true);
  expect(result.interval).toBeCloseTo(450 + 1150 / 1.35); expect(result.before).toBe(1); expect(result.after).toBe(2); expect(result.points).toBe(0); expect(result.focused).toBe(true);
});
