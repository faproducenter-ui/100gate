// node tools/viewmodel-debug/eye-shots.mjs prefix "x,y,z,pitch,yaw,roll" ["..." ...] -> eye views for several placements
import { chromium } from 'playwright';
import path from 'node:path';
const prefix = path.resolve(process.argv[2]);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', e => console.log('pageerror', e.message));
let i = 0;
for (const pl of process.argv.slice(3)) {
  await page.goto('http://localhost:5173/tools/viewmodel-debug/index.html?pl=' + pl);
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${prefix}-${i}.png` }); console.log('saved', i, pl); i++;
}
await browser.close();
