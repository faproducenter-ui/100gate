import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { testBrowser } from './browser.mjs';

const out=resolve('../../outputs');await mkdir(out,{recursive:true});
const browser=await testBrowser();
try{
  const page=await browser.newPage({viewport:{width:1024,height:620}});
  const errors=[], loaded=new Set();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&/shader|webgl/i.test(m.text()))errors.push(m.text());});
  page.on('response',r=>{const name=new URL(r.url()).pathname.split('/').at(-1);if(r.ok()&&name?.endsWith('.glb'))loaded.add(name);});
  await page.route('**/api/save',r=>r.fulfill({status:200,json:{ok:true}}));
  await page.addInitScript(()=>{
    localStorage.setItem('100gate.settings.v1',JSON.stringify({quality:'medium',language:'ru'}));
    localStorage.setItem('100gate.chapter1.save.v1',JSON.stringify({version:1,flags:['chairTipped','free'],items:['bag','knife'],read:[],doors:[],moved:[],position:[0,3.6,-2.23],yaw:0,pitch:-.26,room:0,updatedAt:new Date().toISOString()}));
  });
  await page.goto('http://127.0.0.1:3000/');
  await page.getByTestId('start').click({timeout:80000});
  const state=()=>page.evaluate(()=>window.__episodeTest.state());
  const wait=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:22000});
  const aim=async id=>{
    await page.evaluate(id=>window.__episodeTest.aim(id),id);
    await wait(id=>window.__episodeTest.state().target===id,id);
  };
  await wait(()=>window.__episodeTest.state().rig.authored&&window.__episodeTest.state().rig.body);
  assert.equal(await page.locator('main').getAttribute('data-release'),'chapter1-refinement-05');
  await wait(()=>window.__episodeTest.foley().ready);
  for(const id of ['gear-flashlight','gear-brass-key','player-boot','player-trouser','player-hand-open','player-hand-grip','player-sleeve','player-torso','player-upper-shadow'])assert(loaded.has(id+'.glb'),id+' was not downloaded');
  assert((await state()).rig.shadowUpper,'full silhouette not active with shadows enabled');
  await aim('flashlight');
  await page.keyboard.press('KeyE');
  await wait(()=>{const s=window.__episodeTest.state();return s.rig.held==='flashlight'&&s.lamp;});
  await page.screenshot({path:resolve(out,'100gate-gear-flashlight-in-hand.png')});
  await page.keyboard.press('KeyT');
  await wait(()=>!window.__episodeTest.state().lamp);
  await page.keyboard.press('KeyT');
  await wait(()=>window.__episodeTest.state().lamp);
  await page.evaluate(()=>window.__episodeTest.pose(.65,3.6,-2.24,0,-.2));
  await aim('hatchKey');
  await page.keyboard.press('KeyE');
  await wait(()=>{const s=window.__episodeTest.state();return s.rig.held==='key'&&!s.lamp&&s.save.items.includes('hatchKey');});
  assert.equal(await page.evaluate(()=>window.__episodeTest.foley().recorded.keyPickup),1);
  await page.screenshot({path:resolve(out,'100gate-gear-key-in-hand.png')});
  await wait(()=>{const s=window.__episodeTest.state();return s.rig.held==='flashlight'&&s.lamp;});
  await page.evaluate(()=>window.__episodeTest.pose(3,3.6,-.5));
  await aim('hatch');
  await page.keyboard.press('KeyE');
  await wait(()=>{const s=window.__episodeTest.state();return s.save.flags.includes('unlock:hatch')&&s.rig.held==='key';});
  await page.keyboard.press('KeyG');
  await wait(()=>window.__episodeTest.state().save.doors.includes('hatch'));
  await page.evaluate(()=>window.__episodeTest.pose(.50,3.6,2,0,-1.26));
  await page.getByTestId('bag-toggle').evaluate(el=>el.click());
  await page.getByRole('button',{name:'Убрать из рук'}).click();
  await wait(()=>{const s=window.__episodeTest.state();return s.mode==='playing'&&s.rig.held===null;});
  await page.screenshot({path:resolve(out,'100gate-gear-player-body.png')});
  const before=(await state()).rig.footfall;
  await page.keyboard.down('KeyW');
  try{await wait(value=>window.__episodeTest.state().rig.footfall>value,before);}
  finally{await page.keyboard.up('KeyW');}
  await page.evaluate(()=>window.__episodeTest.pose(-.8,3.6,3.15,Math.PI,-.26));
  await wait(()=>window.__episodeTest.state().position[2]>3.1);
  await page.screenshot({path:resolve(out,'100gate-character-shadow.png')});
  assert.deepEqual(errors,[]);
  console.log('PASS Blender GLBs loaded: hands, boots, jacket, trousers; lamp switches, key preview and unlock, flashlight restored, animated stride');
}finally{await browser.close();}
