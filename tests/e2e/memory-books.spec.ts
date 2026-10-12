import { test, expect } from '@playwright/test';

test('Korean answers fire while still composing, ignore late commits, and do not count the settle delay', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await page.locator('#custom-button').click();
  await page.locator('#custom-words').fill('수도? | 파리\n색? | 노랑\n도시? | 파리시');
  await page.locator('#create-typing').click();
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.state?.mode)).toBe('typing');
  await page.evaluate(() => {
    const s = (window as any).__wordmaster.typingScene; s.spawnAt = 1e9;
    const input = document.getElementById('typing-input') as HTMLInputElement;
    (window as any).oldCompositionInput = input;
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    input.value = '파ㄹ'; input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
  });
  await expect(page.locator('.spell-dock')).toHaveAttribute('data-valid', 'true');
  await page.evaluate(() => {
    const s = (window as any).__wordmaster.typingScene, input = document.getElementById('typing-input') as HTMLInputElement;
    s.attemptBegan = s.activeNow() - 200;
    input.value = '파리'; input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
  });
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.state.kills)).toBe(1);
  await expect(page.locator('#typing-input')).toHaveValue(''); await expect(page.locator('#typing-input')).toBeFocused();
  expect(await page.evaluate(() => Object.values((window as any).__wordmaster.typingScene.speedRecords)[0])).toBeLessThan(.15);
  await page.evaluate(() => {
    const old = (window as any).oldCompositionInput as HTMLInputElement;
    old.value = '파리'; old.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    old.dispatchEvent(new InputEvent('input', { bubbles: true }));
    const input = document.getElementById('typing-input') as HTMLInputElement;
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    input.value = '노랑'; input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
  });
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.state.kills)).toBe(2);
  await expect(page.locator('#typing-input')).toHaveValue(''); expect(errors).toEqual([]);
});

test('changing a composing syllable cancels its pending answer', async ({ page }) => {
  await page.goto('/'); await page.locator('#custom-button').click();
  await page.locator('#custom-words').fill('A | 가\nB | 강\nC | 나'); await page.locator('#create-typing').click();
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.state?.mode)).toBe('typing');
  await page.locator('#typing-input').evaluate(element => {
    const input = element as HTMLInputElement;
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    input.value = '가'; input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    input.value = '강'; input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
  });
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.state.kills)).toBe(1);
  const alive = await page.evaluate(() => (window as any).__wordmaster.typingScene.swarm.filter((m: any) => !m.dead).map((m: any) => m.word.word));
  expect(alive).toContain('가'); expect(alive).not.toContain('강');
});

test('named books save separately, can be selected, renamed and played, and persist across reloads', async ({ page }) => {
  await page.goto('/'); await page.locator('#custom-button').click();
  await page.locator('#memory-name').fill('영어 첫 책');
  const english = '호기심 | curious\n용기 | courage\n사라지다 | vanish';
  await page.locator('#custom-words').fill(english); await page.locator('#save-memory').click();
  await expect(page.locator('#memory-status')).toContainText('저장됨');
  await page.locator('#new-memory').click(); await expect(page.locator('#custom-words')).toHaveValue('');
  await page.locator('#memory-name').fill('상식 문제집');
  const quiz = '수도는? | 파리\n7 × 8 | 56\n물은? | H2O';
  await page.locator('#custom-words').fill(quiz); await page.locator('#save-memory').click();
  await expect(page.locator('#memory-deck option')).toHaveCount(3);
  await page.locator('#memory-deck').selectOption({ label: '영어 첫 책 · 3개' });
  await expect(page.locator('#custom-words')).toHaveValue(english);
  await page.locator('#memory-name').fill('영어 1'); await page.locator('#save-memory').click();
  await expect(page.locator('#memory-deck option')).toHaveCount(3);
  await page.locator('#create-typing').click();
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.state.words[0].word)).toBe('curious');
  await page.locator('#codex-button').click(); await page.locator('[data-tab="custom"]').click();
  await page.locator('#codex-memory-deck').selectOption({ label: '상식 문제집 · 3개' });
  await expect(page.locator('.codex-content').first()).toContainText('파리');
  await page.reload(); await page.locator('#custom-button').click();
  await expect(page.locator('#memory-name')).toHaveValue('상식 문제집');
  await expect(page.locator('#custom-words')).toHaveValue(quiz);
  await page.locator('#memory-deck').selectOption({ label: '영어 1 · 3개' });
  await expect(page.locator('#custom-words')).toHaveValue(english);
});

test('a Korean answer still completes automatically when its IME commits before the timer and a longer answer exists', async ({ page }) => {
  await page.goto('/'); await page.locator('#custom-button').click();
  await page.locator('#custom-words').fill('수도? | 파리\n도시? | 파리시\n색? | 노랑'); await page.locator('#create-typing').click();
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.state?.mode)).toBe('typing');
  await page.locator('#typing-input').evaluate(element => {
    const input = element as HTMLInputElement;
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    input.value = '파리'; input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
  });
  await expect.poll(() => page.evaluate(() => (window as any).__wordmaster.state.kills)).toBe(1);
  await expect(page.locator('#typing-input')).toHaveValue('');
  expect(await page.evaluate(() => (window as any).__wordmaster.typingScene.swarm.find((m: any) => m.word.word === '파리시').dead)).toBe(false);
});
