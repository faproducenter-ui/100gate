// node tools/viewmodel-debug/shoot-pickup.mjs [dx dz yaw] -> docs/viewmodel-grip/pickup-game/t*.png (the game's ViewModel playing flashlight_pickup)
import { chromium } from 'playwright';
import path from 'node:path'; import fs from 'node:fs';
const [dx = 0, dz = 0, yaw = 0] = process.argv.slice(2).map(Number);
const out = path.resolve(import.meta.dirname, '../../docs/viewmodel-grip/pickup-game'); fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('pageerror', e.message));
await page.goto('http://localhost:5173/tools/viewmodel-debug/index.html');
await page.waitForFunction(() => window.__vm?.ready, null, { timeout: 90000 });
console.log('target', await page.evaluate(([a, b, c]) => window.startPickup(a, b, c), [dx, dz, yaw]));
for (const t of [0.1, 0.3, 0.5, 0.66, 0.8, 1.0, 1.25, 1.55]) {
  const at = await page.evaluate(s => window.advanceTo(s), t);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, `t${String(Math.round(t * 100)).padStart(3, '0')}.png`) });
  console.log('t', at.toFixed(2));
}
await browser.close();
