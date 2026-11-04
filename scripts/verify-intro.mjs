import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { testBrowser } from './browser.mjs';

const out=resolve('../../outputs');await mkdir(out,{recursive:true});
const browser=await testBrowser();
try{
  const page=await browser.newPage({viewport:{width:1500,height:520}});
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  await page.route('**/api/save',r=>r.fulfill({status:200,json:{ok:true}}));
  await page.addInitScript(()=>localStorage.setItem('100gate.settings.v1',JSON.stringify({quality:'low'})));
  await page.goto('http://127.0.0.1:3000/');
  await page.getByTestId('start').click({timeout:80000});
  const wait=(fn)=>page.waitForFunction(fn,null,{timeout:26000});
  const view=()=>page.evaluate(()=>window.__episodeTest.introView());
  const hold=async flag=>{
    await page.keyboard.down('KeyR');
    try{await page.waitForFunction(id=>window.__episodeTest.state().save.flags.includes(id),flag,{timeout:26000});}
    finally{await page.keyboard.up('KeyR');}
  };
  await wait(()=>{const t=window.__episodeTest;return t.state().mode==='playing'&&t.introView().eye[1]>4.7;});
  const layout=await page.evaluate(()=>window.__episodeTest.layoutCheck());
  assert(layout.ceiling&&layout.east&&layout.west,'stair and landing enclosure has gaps');
  assert.equal(layout.keys.length,5);
  for(const key of layout.keys)assert(Math.abs(key.gap-.0015)<.001,`${key.id} has unexpected surface gap: ${key.gap}`);
  assert.equal((await view()).chairHits,0,'the backrest blocks the seated camera');
  await page.screenshot({path:resolve(out,'100gate-intro-seated-fixed.png')});
  await hold('chairTipped');
  await page.keyboard.press('KeyE');
  await wait(()=>window.__episodeTest.state().rig.held==='knife');
  assert.equal((await view()).chairHits,0,'the chair blocks the tipped camera');
  assert((await view()).eye[1]>4.46,'the tipped camera sinks into the lap');
  await page.screenshot({path:resolve(out,'100gate-intro-knife-fixed.png')});
  await hold('free');
  await wait(()=>window.__episodeTest.introView().eye[1]>5.15);
  assert.equal(await page.evaluate(()=>window.__episodeTest.state().rig.held),null);
  await page.screenshot({path:resolve(out,'100gate-intro-standing-fixed.png')});
  assert.deepEqual(errors,[]);
  console.log('PASS unobstructed wide intro, visible knife after tip, cut ropes and stand');
}finally{await browser.close();}
