import { testBrowser } from './browser.mjs';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
const url=process.env.TEST_URL||'http://127.0.0.1:3001/';
const browser=await testBrowser();const errors=[];const page=await browser.newPage({viewport:{width:1440,height:900}});
page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
try{
  await page.goto(url);await page.waitForFunction(()=>document.querySelector('.episode')?.dataset.mode==='title',null,{timeout:60000});await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.evaluate(()=>typeof window.__episodeTest),'undefined');
  await page.screenshot({path:resolve('../../outputs/100gate-title.png')});
  await page.getByTestId('start').click();await page.waitForTimeout(500);assert.equal(await page.locator('.episode').getAttribute('data-mode'),'playing');
  await page.screenshot({path:resolve('../../outputs/100gate-attic.png')});
  await page.keyboard.down('KeyR');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('100gate.chapter1.save.v1')||'{}').flags?.includes('chairTipped'),null,{timeout:18000});await page.keyboard.up('KeyR');
  await page.keyboard.press('Escape');await page.waitForTimeout(1500);
  assert.equal(await page.locator('.episode').getAttribute('data-mode'),'paused');
  assert.deepEqual(errors,[]);console.log('PASS production assets, startup, rope sequence, pause and no debug hooks: '+url);
}finally{await browser.close();}
