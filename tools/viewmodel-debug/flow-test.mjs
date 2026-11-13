// node tools/viewmodel-debug/flow-test.mjs -> plays the real game: lighter from the desk drawer (E), torch from the wall (E), light it (F); screenshots in docs/viewmodel-grip/flow/
import { chromium } from 'playwright';
import path from 'node:path'; import fs from 'node:fs';
const out = path.resolve(import.meta.dirname, '../../docs/viewmodel-grip/flow'); fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', e => { errors.push(e.message); console.log('pageerror', e.message); });
const seed = { version: 1, x: -1.75, z: 3.6, items: [], doors: { technical: false, surveillance: false, archive: false, reception: false },
  dutyRead: false, diagramRead: false, power: false, breaker: [], archiveClue: false, archiveIndex: false, anomaly: false, finished: false, lightOn: false, lit: false };
await page.addInitScript(([save]) => {
  const key = '100gate.isometric.save.v1', set = Storage.prototype.setItem;
  localStorage.setItem(key, save);
  Storage.prototype.setItem = function (k, v) { if (k === key) return; return set.call(this, k, v); };
}, [JSON.stringify(seed)]);
await page.goto('http://localhost:5173/');
await page.getByRole('button', { name: 'Продолжить' }).first().click({ timeout: 150000 });
await page.waitForTimeout(6000);
await page.mouse.click(640, 360).catch(() => {});
const st = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const shot = async n => { await page.screenshot({ path: path.join(out, n + '.png') }); };
const wait = async (cond, ms, label) => { const t0 = Date.now(); for (;;) { const s = await st(); if (cond(s)) return s; if (Date.now() - t0 > ms) { console.log('TIMEOUT', label, JSON.stringify({ target: s.target, items: s.state.items, lightOn: s.state.lightOn })); return s; } await page.waitForTimeout(250); } };
const stand = async (x, z, yaw, pitch) => { await page.evaluate(([x, z, yaw, pitch]) => { window.isoSetState({ x, z }); window.isoLook(yaw, pitch); }, [x, z, yaw, pitch]); await page.waitForTimeout(800); };
const press = async key => { await page.keyboard.down(key); await page.waitForTimeout(120); await page.keyboard.up(key); };

// 1. the lighter in the desk drawer
let s;
for (const [x, z, p] of [[-2.86, 1.9, -0.5], [-2.86, 2.1, -1.0], [-3, 1.9, -0.5], [-3, 2.1, -0.5], [-3, 1.9, -1.15]]) {
  await stand(x, z, Math.PI, p); await page.waitForTimeout(500); s = await st(); if (s.target === 'drawer') break;
} console.log('at the drawer: target', s.target, 'quest', s.state && JSON.stringify(s.state.items));
await shot('1-at-drawer');
await press('KeyE'); await page.waitForTimeout(700); await shot('2-drawer-reach');
s = await wait(s => s.state.items.includes('lighter'), 12000, 'lighter'); console.log('lighter taken:', s.state.items.includes('lighter'));
await page.waitForTimeout(4000); await shot('3-lighter-taken');
// 2. the torch against the wall
await stand(-4.2, 2.45, -Math.PI / 2, -0.75);
s = await st(); console.log('at the torch: target', s.target);
await shot('4-at-torch');
await press('KeyE'); await page.waitForTimeout(900); await shot('5-torch-reach');
for (let i = 0; i < 3 && !(await st()).state.items.includes('torch') && !(await page.evaluate(() => window.isoWorld().busy)); i++) { await press('KeyE'); await page.waitForTimeout(900); }
s = await wait(s => s.state.items.includes('torch'), 12000, 'torch'); console.log('torch taken:', s.state.items.includes('torch'));
await page.waitForTimeout(2500); await shot('6-torch-held');
// 3. light it
for (let i = 0; i < 80; i++) { const ok = await page.evaluate(() => { const w = window.isoWorld(); return w.handPhase === 'holding' && !w.busy; }); if (ok) break; await page.waitForTimeout(250); }
await shot('6b-ready'); await press('KeyF'); await page.waitForTimeout(1200); await shot('7-ignite-a'); await page.waitForTimeout(1500); await shot('8-ignite-b');
s = await wait(s => s.state.lightOn, 15000, 'ignite'); console.log('torch lit:', s.state.lightOn, 'lit once:', s.state.lit);
await page.waitForTimeout(3500); await shot('9-burning');
console.log('final', JSON.stringify({ items: s.state.items, lightOn: s.state.lightOn, lit: s.state.lit }), 'errors', errors.length);
await browser.close();
