// node tools/viewmodel-debug/views-shot.mjs outPrefix -> the game's ViewModel (tools/viewmodel-debug/index.html): eye view and side/left/top views of the hand
import { chromium } from 'playwright';
import path from 'node:path';
const prefix = path.resolve(process.argv[2] ?? 'docs/viewmodel-grip/vm');
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('pageerror', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('console', m.text()); });
for (const v of ['', 'side', 'left', 'top']) {
  await page.goto('http://localhost:5173/tools/viewmodel-debug/index.html' + (v ? `?view=${v}` : ''));
  await page.waitForTimeout(7000);
  await page.screenshot({ path: `${prefix}-${v || 'eye'}.png` });
  console.log('saved', v || 'eye');
}
await browser.close();
