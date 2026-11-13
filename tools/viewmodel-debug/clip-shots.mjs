// node tools/viewmodel-debug/clip-shots.mjs ignite|lighter prefix -> frames of an authored clip in the game's ViewModel
import { chromium } from 'playwright';
import path from 'node:path';
const [kind = 'ignite', prefix = 'docs/viewmodel-grip/torch/clip'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', e => console.log('pageerror', e.message));
page.on('console', m => { if (/flame|lighter/.test(m.text())) console.log('event', m.text()); });
await page.goto('http://localhost:5173/tools/viewmodel-debug/index.html?lit=' + (kind === 'lit' ? 1 : 0));
await page.waitForTimeout(6000);
const frames = kind === 'ignite' ? [0.3, 1.3, 1.6, 2.2, 2.7, 3.1, 3.6] : [0.2, 0.5, 0.8, 1.1, 1.4];
await page.evaluate(k => k === 'ignite' ? window.startIgnite() : window.startLighter(), kind);
let t = 0;
for (const f of frames) {
  await page.evaluate(s => window.run(s), f - t); t = f;
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.resolve(`${prefix}-${kind}-${String(Math.round(f * 10)).padStart(2, '0')}.png`) });
}
console.log('done');
await browser.close();
