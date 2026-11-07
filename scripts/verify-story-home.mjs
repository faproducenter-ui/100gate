import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { testBrowser } from './browser.mjs';

const base = new URL(process.env.GAME_URL ?? 'http://127.0.0.1:5182');
assert(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'Story home smoke is local-only');
const out = 'outputs/story-intro/home/browser';
await mkdir(out, { recursive: true });
const browser = await testBrowser();
const reports = [];
try {
  for (const mobile of [false, true]) {
    const name = mobile ? 'touch' : 'desktop';
    const ctx = await browser.newContext({
      viewport: mobile ? { width: 844, height: 390 } : { width: 1280, height: 720 },
      hasTouch: mobile, isMobile: mobile,
    });
    const page = await ctx.newPage();
    const report = { name, errors: [], badResponses: [], unexpected: [] };
    reports.push(report);
    page.on('pageerror', e => report.errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    page.on('response', r => { if (r.status() >= 400) report.badResponses.push(r.url()); });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      // Existing global typography is optional; render with local fallbacks in offline QA.
      if (url.origin === 'https://fonts.googleapis.com' && url.pathname === '/css2') {
        return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
      }
      if (url.origin === base.origin && !url.pathname.startsWith('/api/save') &&
          !url.pathname.startsWith('/assets/chapter1/')) return route.continue();
      report.unexpected.push(url.href);
      return route.abort();
    });
    await page.addInitScript(() => {
      localStorage.setItem('100gate.chapter1.save.v1', 'untouched-story-smoke-marker');
      localStorage.setItem('100gate.settings.v1', JSON.stringify({ quality: 'medium' }));
    });
    try {
      await page.goto(new URL('?story-home=1', base).href);
      await page.getByTestId('start-story-home').click({ timeout: 35000 });
      const shot = page.getByTestId('story-home-shot');
      const diagnostics = () => page.evaluate(() => window.__storyHomeTest());
      await shot.waitFor();
      await page.waitForFunction(() => window.__storyHomeTest?.().seconds > .25);
      await page.screenshot({ path: `${out}/${name}-dialogue.png` });
      await page.getByTestId('story-home-pause').click();
      const paused = await diagnostics();
      await page.waitForTimeout(350);
      assert.deepEqual(await diagnostics(), paused);
      await page.getByTestId('story-home-pause').click();
      await page.waitForFunction(() => {
        const s = window.__storyHomeTest?.();
        return s?.beat === 'HOME_EXIT' && s.door > 1.3;
      }, undefined, { timeout: 35000 });
      report.door = await diagnostics();
      await page.screenshot({ path: `${out}/${name}-door.png` });
      // This smoke ends at the home door. The continuous street/escape run
      // has its own real-time capture; don't wait through it in every smoke.
      for(let i=0;i<5&&!(await diagnostics()).ended;i++)await page.evaluate(()=>window.advanceTime(10000));
      await page.getByTestId('story-home-end').waitFor({ timeout: 15000 });
      assert.equal(await page.evaluate(() => localStorage.getItem('100gate.chapter1.save.v1')), 'untouched-story-smoke-marker');
      assert.deepEqual(report.errors, []);
      assert.deepEqual(report.badResponses, []);
      assert.deepEqual(report.unexpected, []);
      await page.getByTestId('story-home-back').click();
      await page.getByTestId('start-story-home').waitFor();
      report.passed = true;
    } catch (error) {
      report.failure = String(error);
      await page.screenshot({ path: `${out}/${name}-failure.png` }).catch(() => {});
      throw error;
    } finally {
      await ctx.close();
    }
  }
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify(reports, null, 2));
  await browser.close();
}
