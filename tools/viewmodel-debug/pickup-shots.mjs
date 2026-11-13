// node tools/viewmodel-debug/pickup-shots.mjs prefix -> frames of the take-from-the-table clip in the game's ViewModel
import { chromium } from 'playwright';
import path from 'node:path';
const prefix = path.resolve(process.argv[2]);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', e => console.log('pageerror', e.message));
await page.goto('http://localhost:5173/tools/viewmodel-debug/index.html');
await page.waitForTimeout(6000);
console.log('start', await page.evaluate(() => window.startPickup(0, 0, 0)));
for (const f of [2, 8, 13, 16, 19, 26, 34, 40]) {
  await page.evaluate(s => window.advanceTo(s), f / 24);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${prefix}-${String(f).padStart(2, '0')}.png` });
}
console.log('done');
await browser.close();
