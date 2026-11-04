import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { devices, webkit } from 'playwright';
import { testBrowser } from './browser.mjs';

const url='http://127.0.0.1:3000/';
const output=resolve('../../outputs');await mkdir(output,{recursive:true});
const saveKey='100gate.chapter1.save.v1';
const settingsKey='100gate.settings.v1';
async function prepare(page,quality='low',withBag=false){
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',msg=>{if(msg.type()==='error'&&/shader|webgl/i.test(msg.text()))errors.push(msg.text());});
  await page.route('**/api/save',route=>route.fulfill({status:200,json:{ok:true}}));
  await page.addInitScript(({quality,withBag,saveKey,settingsKey})=>{
    if(!localStorage.getItem(settingsKey))localStorage.setItem(settingsKey,JSON.stringify({quality}));
    if(!localStorage.getItem(saveKey))localStorage.setItem(saveKey,JSON.stringify({version:1,flags:['chairTipped','free'],items:withBag?['bag','knife']:['knife'],read:['atticNote'],doors:[],moved:[],position:[.5,3.6,2],yaw:0,pitch:-1.19,room:0,updatedAt:new Date().toISOString()}));
  },{quality,withBag,saveKey,settingsKey});
  await page.goto(url);
  await page.getByTestId('start').click({timeout:65000});
  await page.waitForFunction(()=>window.__episodeTest.state().rig.body,null,{timeout:20000});
  return errors;
}
const desktop=await testBrowser();
try{
  const page=await desktop.newPage({viewport:{width:1024,height:620}});
  const errors=await prepare(page);
  const s=()=>page.evaluate(()=>window.__episodeTest.state());
  await page.screenshot({path:resolve(output,'100gate-first-person-boots.png')});
  const baseline=(await s()).rig.feet;
  await page.keyboard.down('KeyW');
  try{
    await page.waitForFunction(before=>JSON.stringify(window.__episodeTest.state().rig.feet)!==JSON.stringify(before),baseline,{timeout:10000});
    await page.waitForFunction(()=>window.__episodeTest.state().rig.footfall>0,null,{timeout:10000});
  }finally{await page.keyboard.up('KeyW');}
  await page.evaluate(()=>window.__episodeTest.pose(.5,3.6,2,0,-.9));
  await page.evaluate(()=>window.__episodeTest.aim('bag'));
  await page.waitForFunction(()=>window.__episodeTest.state().target==='bag',null,{timeout:10000});
  await page.keyboard.press('KeyE');
  await page.waitForFunction(()=>window.__episodeTest.state().save.items.includes('bag'));
  await page.keyboard.press('KeyH');
  await page.getByRole('dialog').waitFor();
  await page.screenshot({path:resolve(output,'100gate-travel-bag.png')});
  await page.getByTestId('pack-compass').click();
  await page.getByTestId('pack-equip').click();
  await page.waitForFunction(()=>window.__episodeTest.state().rig.held==='compass');
  await page.screenshot({path:resolve(output,'100gate-compass-in-hand.png')});
  for(const id of ['candy','water']){
    await page.keyboard.press('KeyH');
    await page.getByTestId(`pack-${id}`).click();
    await page.getByTestId('pack-consume').click();
    await page.waitForFunction(id=>window.__episodeTest.state().save.flags.includes(`pack:${id}:1`),id);
  }
  await page.reload();await page.getByTestId('start').click({timeout:65000});
  await page.keyboard.press('KeyH');
  assert.match(await page.getByTestId('pack-candy').innerText(),/×1/);
  assert.match(await page.getByTestId('pack-water').innerText(),/×2/);
  await page.getByTestId('bag-close').click();
  assert.equal((await s()).mode,'playing');
  assert.deepEqual(errors,[]);
  console.log('PASS desktop: animated boots, pickup, H, compass, consumables, reload, no GL errors');
}finally{await desktop.close();}

const mobile=await webkit.launch();
try{
  const page=await mobile.newPage(devices['iPhone 13 landscape']);
  const errors=await prepare(page,'low',true);
  await page.getByTestId('bag-toggle').tap();
  await page.getByTestId('pack-phone').tap();
  await page.screenshot({path:resolve(output,'100gate-travel-bag-mobile.png')});
  await page.getByTestId('pack-equip').tap();
  await page.waitForFunction(()=>window.__episodeTest.state().rig.held==='phone');
  assert.deepEqual(errors,[]);
  console.log('PASS WebKit iPhone 13 landscape: bag button, item selection, equipped phone');
}finally{await mobile.close();}
