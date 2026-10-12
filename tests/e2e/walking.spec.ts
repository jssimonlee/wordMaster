import { test, expect } from '@playwright/test';

test('typing monsters alternate walk frames without moving labels, freeze on pause and remove shadows on death', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await page.locator('#typing-start-button').click();
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.state?.mode)).toBe('typing');
  const motion = await page.evaluate(() => {
    const s = (window as any).__wordmaster.typingScene; s.spawnAt = 1e9;
    const before = s.swarm.map((m: any) => ({ frame: m.sprite.frame.name, x: m.sprite.x, y: m.sprite.y, width: m.sprite.displayWidth, height: m.sprite.displayHeight }));
    s.update(0, 80); s.update(0, 80); s.update(0, 80);
    return s.swarm.map((m: any, index: number) => ({
      walking: m.sprite.texture.key === `walk-${m.kind}`, changed: before[index].frame !== m.sprite.frame.name,
      moved: m.sprite.x < before[index].x, yStable: m.sprite.y === before[index].y,
      sizeStable: m.sprite.displayWidth === before[index].width && m.sprite.displayHeight === before[index].height,
      labelFollows: m.label.x === m.sprite.x && m.label.y === m.sprite.y - 48,
      shadowFollows: m.shadow.x === m.sprite.x && m.shadow.y === m.sprite.y + 26,
    }));
  });
  for (const monster of motion) expect(monster).toEqual({ walking: true, changed: true, moved: true, yStable: true, sizeStable: true, labelFollows: true, shadowFollows: true });
  await page.keyboard.press('Escape');
  const paused = await page.evaluate(() => {
    const s = (window as any).__wordmaster.typingScene, m = s.swarm[0]; const frame = m.sprite.frame.name, x = m.sprite.x;
    s.update(0, 80); return { sameFrame: frame === m.sprite.frame.name, sameX: x === m.sprite.x };
  });
  expect(paused).toEqual({ sameFrame: true, sameX: true });
  await page.keyboard.press('Escape');
  const removed = await page.evaluate(() => {
    const s = (window as any).__wordmaster.typingScene, m = s.swarm[0]; s.destroyMinion(m); return !m.shadow.scene;
  });
  expect(removed).toBe(true); expect(errors).toEqual([]);
});

test('normal enemies walk, stagger stops their gait, and hit recovery preserves sprite dimensions', async ({ page }) => {
  await page.goto('/'); await page.locator('#start-button').click();
  const stopped = await page.evaluate(() => {
    const s = (window as any).__wordmaster.scene; s.nextSpawnAt = 1e9;
    const m = s.spawnEnemy(s.equipped[0], 'chaser', s.player.x + 180, s.player.y);
    m.attackAt = 1e9; m.walk.phase = 0;
    for (let i = 0; i < 8; i++) s.updateEnemy(m, 40);
    const walking = m.sprite.texture.key === 'walk-chaser';
    m.staggerUntil = s.clock + 5000; const phase = m.walk.phase;
    for (let i = 0; i < 8; i++) s.updateEnemy(m, 40);
    const stopped = m.sprite.texture.key === 'characters' && m.walk.phase === phase;
    s.strike(m, s.equipped[0]); return { walking, stopped };
  });
  expect(stopped).toEqual({ walking: true, stopped: true });
  await expect.poll(() => page.evaluate(() => {
    const m = (window as any).__wordmaster.scene.enemies[0]; return Math.abs(m.sprite.displayWidth - 43) < .01 && Math.abs(m.sprite.displayHeight - 53) < .01;
  })).toBe(true);
});
