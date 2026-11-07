import { testBrowser } from './browser.mjs';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.GAME_URL??'http://127.0.0.1:5182';
assert(['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname));
const out='outputs/story-intro/cast/browser';
await mkdir(out,{recursive:true});
const browser=await testBrowser();
const context=await browser.newContext({viewport:{width:1280,height:720},recordVideo:{dir:out,size:{width:1280,height:720}}});
const page=await context.newPage(),report={errors:[],network:[],shots:[]};
page.on('pageerror',e=>report.errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
page.on('response',r=>{if(r.status()>=400)report.network.push({url:r.url(),status:r.status()});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await page.route('**/api/save',()=>{throw Error('Cast review must not touch save API');});
await page.addInitScript(()=>{localStorage.setItem('100gate.chapter1.save.v1','cast-do-not-overwrite');localStorage.setItem('100gate.settings.v1',JSON.stringify({quality:'medium'}));});
const state=()=>page.evaluate(()=>window.__storyHomeTest());
try{
  await page.goto(base+'/?story-home=1');
  await page.getByTestId('start-story-home').click({timeout:40000});
  await page.waitForTimeout(400);
  const first=await state();
  assert.equal(first.actors.length,2,'Two actual skinned human characters must be in the opening');
  for(const a of first.actors){assert(a.skins>1);assert(a.bones>=53);assert(a.fingerBones>=30);}
  await page.screenshot({path:out+'/01-dialogue.png'});
  await page.waitForTimeout(2800);
  const gesture=await state();
  for(let i=0;i<2;i++)assert.notDeepEqual(first.actors[i].pose,gesture.actors[i].pose,'Both characters must react with skeletal motion');
  assert(await page.getByTestId('story-subtitle').isVisible());
  await page.screenshot({path:out+'/02-gesture.png'});
  await page.getByTestId('story-home-pause').click();
  const paused=await state();await page.waitForTimeout(400);assert.deepEqual(await state(),paused);
  await page.getByTestId('story-home-pause').click();
  await page.waitForFunction(()=>window.__storyHomeTest().beat==='HOME_EXIT',undefined,{timeout:16000});
  await page.waitForTimeout(1200);await page.screenshot({path:out+'/03-walking.png'});
  await page.waitForFunction(()=>window.__storyHomeTest().door>1.25,undefined,{timeout:15000});
  await page.screenshot({path:out+'/04-door-contact.png'});
  await page.waitForFunction(()=>window.__storyHomeTest().beat==='WALK_TO_SHOP',undefined,{timeout:22000});
  assert.equal(await page.evaluate(()=>localStorage.getItem('100gate.chapter1.save.v1')),'cast-do-not-overwrite');
  report.final=await state();assert.deepEqual(report.errors,[]);assert.deepEqual(report.network,[]);report.passed=true;
}catch(e){report.failure=String(e);await page.screenshot({path:out+'/failure.png'}).catch(()=>{});throw e;}
finally{const video=page.video();await context.close();if(video)await copyFile(await video.path(),out+'/home-performance.webm');await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();}
