import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('test-results/environments', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1536, height: 1000 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
await page.goto('http://127.0.0.1:5173');
await page.getByRole('button', { name: '첫 던전 입장' }).click();
for (let room = 0; room < 5; room++) {
  await page.evaluate(index => {
    const scene = window.__wordmaster.scene;
    scene.setPaused(false); scene.room = index; scene.loadRoom(); scene.setPaused(true);
  }, room);
  await page.screenshot({ path: `test-results/environments/room-${room + 1}.png`, fullPage: true });
}
await page.setViewportSize({ width: 900, height: 800 });
await page.screenshot({ path: 'test-results/environments/compact.png', fullPage: true });
console.log(JSON.stringify({ errors }));
await browser.close();
