// node tools/viewmodel-debug/game-shot.mjs [out.png] -> the real game (first person, flashlight in hand) with a seeded save
import { chromium } from 'playwright';
import path from 'node:path';
const out = path.resolve(process.argv[2] ?? 'docs/viewmodel-grip/game.png');
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('pageerror', e.message));
const seedState = (() => {
  const s = { version: 1, x: -1.75, z: 3.6, items: ['lighter', 'torch'], doors: { technical: false, surveillance: false, archive: false, reception: false },
    dutyRead: false, diagramRead: false, power: false, breaker: [], archiveClue: false, archiveIndex: false, anomaly: false, finished: false,
    lightOn: process.argv[4] === 'lit', lit: process.argv[4] === 'lit' };
  return s;
})();
// the game would overwrite the save while it runs: seed it on every load and ignore writes to that key
await page.addInitScript(([save]) => {
  const key = '100gate.isometric.save.v1', set = Storage.prototype.setItem;
  localStorage.setItem(key, save);
  Storage.prototype.setItem = function (k, v) { if (k === key) return; return set.call(this, k, v); };
}, [JSON.stringify(seedState)]);
await page.goto('http://localhost:5173/' + (process.argv[3] ?? ''));
await page.getByRole('button', { name: 'Продолжить' }).first().click({ timeout: 150000 });
await page.waitForTimeout(9000);
await page.mouse.click(640, 360).catch(() => {});
await page.waitForTimeout(4000);
await page.screenshot({ path: out });
console.log('saved', out);
await browser.close();
