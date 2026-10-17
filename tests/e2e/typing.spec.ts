import { test, expect, type Page } from '@playwright/test';

async function start(page: Page) {
  await page.goto('/'); await page.locator('#typing-start-button').click();
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.state?.mode)).toBe('typing');
  await expect(page.locator('#typing-input')).toBeFocused();
}
async function fixtures(page: Page) {
  const answer = await page.evaluate(() => {
    const s = (window as any).__wordmaster.typingScene;
    s.closeTowers(); // Finish the earned reward before the next typing fixture.
    for (const m of s.swarm) for (const part of [m.sprite, m.label, m.aura, m.health]) part.destroy();
    s.swarm = []; s.waveSpawned = 0; s.spawnAt = 1e9; s.waveEndsAt = 0; s.resetInput(); s.speedRecords = {};
    const word = s.memories[0];
    for (let i = 0; i < 3; i++) { const m = s.spawnMinion(i, 650); m.word = word; m.label.setText(word.meaning); }
    s.publish(true); return word.word;
  });
  await page.locator('#typing-input').focus();
  return answer;
}

test('mixed monsters, white lightning, ignition and wrong-input disconnection', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await start(page);
  expect(await page.evaluate(() => new Set((window as any).__wordmaster.typingScene.swarm.map((m: any) => m.word.id)).size)).toBe(3);
  const answer = await fixtures(page);
  await page.locator('#typing-input').pressSequentially(answer.slice(0, -1), { delay: 5 });
  await expect(page.locator('.spell-dock')).toHaveAttribute('data-burning', 'true');
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.typingScene.connected.length)).toBe(3);
  expect(await page.evaluate(() => (window as any).__wordmaster.typingScene.swarm.every((m: any) => m.aura.visible && m.heat >= .7))).toBe(true);
  await page.keyboard.type('!');
  await expect(page.locator('.spell-dock')).toHaveAttribute('data-valid', 'false');
  expect(await page.evaluate(() => (window as any).__wordmaster.typingScene.connected.length)).toBe(0);
  await page.locator('#typing-input').fill('');
  await page.locator('#typing-input').pressSequentially(answer, { delay: 4 });
  await expect(page.locator('#typing-input')).toHaveValue('');
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.state.kills)).toBe(3);
  expect(errors).toEqual([]);
});

test('three speed tiers explode 3/2/1 enemies, slow casts only injure, and best records damage neighbours', async ({ page }) => {
  await start(page);
  for (const [rate, killed] of [[.1, 3], [.175, 2], [.25, 1], [.4, 0]]) {
    const answer = await fixtures(page);
    const result = await page.evaluate(({ answer, rate }) => {
      const s = (window as any).__wordmaster.typingScene;
      s.acceptTyping(answer.slice(0, 1)); s.attemptBegan = s.activeNow() - rate * answer.length * 1000;
      s.acceptTyping(answer);
      return { dead: s.swarm.filter((m: any) => m.dead).length, hp: s.swarm[0].hp, burn: s.swarm[0].burn, clock: s.stormClock };
    }, { answer, rate });
    expect(result.dead).toBe(killed);
    if (!killed) { expect(result.hp).toBe(72); expect(result.burn).toBeGreaterThan(result.clock); }
  }
  const answer = await fixtures(page);
  const shock = await page.evaluate(answer => {
    const s = (window as any).__wordmaster.typingScene, primary = s.swarm[0];
    s.swarm[1].word = s.memories[1]; s.swarm[1].sprite.setPosition(primary.sprite.x + 30, primary.sprite.y);
    s.swarm[2].word = s.memories[2]; s.swarm[2].sprite.setPosition(primary.sprite.x + 100, primary.sprite.y);
    s.speedRecords[`forward:${primary.word.id}:${answer.toLowerCase()}`] = .25;
    s.acceptTyping(answer.slice(0, 1)); s.attemptBegan = s.activeNow() - answer.length * 150; s.acceptTyping(answer);
    return { closeDead: s.swarm[1].dead, nearbyHp: s.swarm[2].hp, record: s.resultRecord };
  }, answer);
  expect(shock.closeDead).toBe(true); expect(shock.nearbyHp).toBeGreaterThan(0); expect(shock.nearbyHp).toBeLessThan(100); expect(shock.record).toBe(true);
});

test('Korean IME survives partial jamo, reversal uses prompt as answer, and pause excludes typing time', async ({ page }) => {
  await start(page);
  const prompt = await page.evaluate(() => {
    const s = (window as any).__wordmaster.typingScene;
    s.closeTowers(); // Finish the earned reward before the next typing fixture.
    for (const m of s.swarm) for (const part of [m.sprite, m.label, m.aura, m.health]) part.destroy();
    s.swarm = []; s.round = 7; s.beginWave(); s.spawnAt = 1e9;
    return { answer: s.swarm[0].word.meaning, label: s.swarm[0].label.text, word: s.swarm[0].word.word };
  });
  expect(prompt.label).toBe(prompt.word);
  await expect(page.locator('#wave-status')).toContainText('반전');
  await page.locator('#typing-input').evaluate((input, answer) => {
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    (input as HTMLInputElement).value = 'ㄴ';
    input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
  }, prompt.answer);
  await expect(page.locator('.spell-dock')).toHaveAttribute('data-valid', 'true');
  expect(await page.evaluate(() => (window as any).__wordmaster.state.hp)).toBe(100);
  await page.locator('#typing-input').evaluate((input, answer) => {
    (input as HTMLInputElement).value = answer;
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: answer }));
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
  }, prompt.answer);
  await expect(page.locator('#typing-input')).toHaveValue('');
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.state.kills)).toBe(1);
  const answer = await fixtures(page);
  await page.evaluate(() => { const s = (window as any).__wordmaster.typingScene; s.round = 1; });
  await page.keyboard.type(answer.slice(0, 2));
  await page.keyboard.press('Escape');
  const before = await page.evaluate(() => (window as any).__wordmaster.typingScene.activeNow());
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => (window as any).__wordmaster.typingScene.activeNow());
  expect(after - before).toBeLessThan(3);
  await page.keyboard.press('Escape'); await expect(page.locator('#typing-input')).toBeFocused();
});

test('threshold settings validate and persist, custom question decks work, and restart resets the run', async ({ page }) => {
  await start(page);
  await page.locator('#typing-settings-button').click();
  await page.locator('#threshold-triple').fill('0.22'); await page.locator('#threshold-save').click();
  await expect(page.locator('#threshold-error')).toContainText('순으로');
  await page.locator('#threshold-double').fill('0.26'); await page.locator('#threshold-single').fill('0.4');
  await page.locator('#threshold-save').click();
  expect(await page.evaluate(() => (window as any).__wordmaster.typingScene.typingSettings)).toEqual({ triple: .22, double: .26, single: .4 });
  await page.locator('#custom-button').click();
  await page.locator('#custom-words').fill('프랑스의 수도는? | 파리\n물의 화학식은? | H2O\n7 × 8 = ? | 56');
  await page.locator('#create-typing').click();
  await expect(page.locator('#typing-input')).toBeFocused();
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.state.alive)).toBe(3);
  await page.keyboard.type('56'); await expect(page.locator('#typing-input')).toHaveValue('');
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.state.kills)).toBe(1);
  await page.locator('#tower-close').click();
  await page.keyboard.press('Escape'); await page.locator('#restart-button').click();
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.state.kills)).toBe(0);
  await page.reload(); await page.locator('#typing-settings-button').click();
  await expect(page.locator('#threshold-triple')).toHaveValue('0.22');
});

test('title, spell dock and battlefield fit mobile and short desktop screens', async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 600 }]) {
    await page.setViewportSize(viewport); await start(page);
    const bounds = await page.locator('.bottom-hud').boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.evaluate(() => { const s = (window as any).__wordmaster.typingScene; return s.bottom > s.top + 100; })).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`typing-${viewport.width}.png`) });
  }
});

test('connections narrow with elapsed time, hints resume input, and all twelve rounds conclude', async ({ page }) => {
  await start(page); const answer = await fixtures(page);
  await page.keyboard.type(answer.slice(0, -1));
  expect(await page.evaluate(() => {
    const s = (window as any).__wordmaster.typingScene;
    s.attemptBegan = s.activeNow() - 100; return s.currentView().connected;
  })).toBe(3);
  await page.evaluate(() => { const s = (window as any).__wordmaster.typingScene; s.attemptBegan = s.activeNow() - 6000; });
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.typingScene.currentView().connected)).toBe(1);
  await page.keyboard.press('Tab'); await expect(page.locator('.hint-panel')).toBeVisible();
  await page.keyboard.press('Tab'); await expect(page.locator('#typing-input')).toBeFocused();
  await page.keyboard.press('Control+a'); await page.keyboard.press('Backspace');
  for (let round = 1; round <= 12; round++) {
    await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.state.typing.round)).toBe(round);
    await page.evaluate(() => {
      const s = (window as any).__wordmaster.typingScene;
      // Resolve this wave with the real spell path; speed up only spawning and the inter-wave pause.
      for (let count = 0; count < 30; count++) {
        for (const m of s.swarm.filter((m: any) => !m.dead)) {
          s.acceptTyping(''); s.acceptTyping(s.round < 7 ? m.word.word : m.word.meaning, false, '', true);
          s.closeTowers(); // Each highest-tier cast now opens a paused reward choice.
        }
        if (s.waveSpawned >= s.quota()) break;
        s.spawnMinion(s.waveSpawned % s.laneCount, s.spawnX);
      }
      s.update(0, 16);
      if (s.waveEndsAt) s.waveEndsAt = s.stormClock + 1;
    });
  }
  await expect(page.locator('.finish-panel')).toContainText('정복');
  await page.locator('#again-button').click(); await expect(page.locator('#typing-input')).toBeFocused();
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.state.typing.round)).toBe(1);
  expect(await page.evaluate(() => (window as any).__wordmaster.state.hp)).toBe(100);
  await page.evaluate(() => {
    const s = (window as any).__wordmaster.typingScene;
    s.healthPoints = 12; s.swarm[0].sprite.x = s.goal - 1; s.update(0, 16);
  });
  await expect(page.locator('.finish-panel')).toContainText('다시 깨어날');
  await page.locator('#custom-button').click(); await page.locator('#create-dungeon').click();
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.state.mode)).toBe('campaign');
  expect(await page.evaluate(() => (window as any).__wordmaster.scene.scene.key)).toBe('dungeon');
  await expect(page.locator('.word-slot')).toHaveCount(3);
});
