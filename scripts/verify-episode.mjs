import { chromium, devices, request } from 'playwright';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { testBrowser } from './browser.mjs';
const out=resolve('../../outputs');mkdirSync(out,{recursive:true});
const browser=await testBrowser();
const results=[];const errors=[];
const pass=label=>{results.push(label);console.log('PASS '+label);};
const page=await browser.newPage({viewport:{width:1024,height:640}});
await page.addInitScript(()=>localStorage.setItem('100gate.settings.v1',JSON.stringify({quality:'low'})));
page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()>=400)console.log('HTTP '+r.status()+' '+r.url());});
const state=()=>page.evaluate(()=>window.__episodeTest.state());
const waitFlag=flag=>page.waitForFunction(flag=>window.__episodeTest.state().save.flags.includes(flag),flag,{timeout:18000});
async function hold(code,flag){await page.keyboard.down(code);try{await waitFlag(flag);}finally{await page.keyboard.up(code);}}
async function pose(x,y,z,yaw=0,pitch=0){await page.evaluate(args=>window.__episodeTest.pose(...args),[x,y,z,yaw,pitch]);await page.waitForTimeout(150);}
async function aim(id){await page.evaluate(id=>window.__episodeTest.aim(id),id);await page.waitForTimeout(250);await page.waitForFunction(id=>window.__episodeTest.state().target===id,id,{timeout:5000});}
async function take(id,x,y,z){await pose(x,y,z);await aim(id);await page.keyboard.press('KeyE');assert((await state()).save.items.includes(id),'item '+id);pass('take '+id);}
try{
  await page.goto('http://127.0.0.1:3000/');await page.waitForFunction(()=>window.__episodeTest?.state().mode==='title',null,{timeout:60000});
  pass('title renders');
  await page.getByTestId('start').click();await page.waitForTimeout(300);assert.equal((await state()).mode,'playing');
  await hold('KeyR','chairTipped');await page.keyboard.press('KeyE');assert((await state()).save.items.includes('knife'));await hold('KeyR','free');pass('chair, knife and ropes sequence');
  await pose(0,3.6,0);await page.keyboard.down('KeyW');await page.waitForTimeout(500);await page.keyboard.up('KeyW');assert((await state()).position[2]<-.15);pass('W moves forward');
  const before=(await state()).position;await page.keyboard.down('KeyD');await page.waitForTimeout(450);await page.keyboard.up('KeyD');assert((await state()).position[0]>before[0]+.1);pass('D moves right');
  await page.keyboard.press('Space');await page.waitForFunction(()=>window.__episodeTest.state().position[1]>3.7,null,{timeout:6000});await page.waitForFunction(()=>window.__episodeTest.state().grounded&&window.__episodeTest.state().position[1]<3.65,null,{timeout:6000});pass('jump and landing');
  await pose(-.7,3.6,-2);await aim('atticNote');await page.keyboard.press('KeyF');assert.equal((await state()).mode,'document');assert((await state()).save.read.includes('atticNote'));
  await page.keyboard.press('Escape');assert.equal((await state()).mode,'paused');await page.keyboard.press('Escape');assert.equal((await state()).mode,'document');await page.keyboard.press('KeyF');assert.equal((await state()).mode,'playing');pass('F document, ESC pause and resume document');
  await page.keyboard.press('Escape');const paused=(await state()).position;await page.keyboard.down('KeyW');await page.waitForTimeout(400);await page.keyboard.up('KeyW');assert.deepEqual((await state()).position,paused);await page.keyboard.press('Escape');pass('pause freezes movement');
  await take('flashlight',-.05,3.6,-2.25);await take('hatchKey',.65,3.6,-2.25);
  await pose(3,3.6,-.5);await aim('hatch');await page.keyboard.press('KeyG');assert(!(await state()).save.doors.includes('hatch'));await page.keyboard.press('KeyE');assert((await state()).save.flags.includes('unlock:hatch'));await page.keyboard.press('KeyG');assert((await state()).save.doors.includes('hatch'));pass('E unlock and G open hatch are distinct');
  await pose(3,3.6,-.5);await page.keyboard.down('KeyW');await page.waitForFunction(()=>window.__episodeTest.state().position[2]<-7.3,null,{timeout:18000});await page.keyboard.up('KeyW');assert((await state()).position[1]<.2);pass('continuous stair descent');
  await pose(-4.8,0,-15.4);await aim('storeCabinet');await page.keyboard.down('KeyR');await page.waitForFunction(()=>window.__episodeTest.state().save.moved.includes('storeCabinet'),null,{timeout:18000});await page.keyboard.up('KeyR');pass('hold R moves cabinet');
  await take('studyKey',-4.8,0,-15.4);
  await pose(.1,0,-15);await aim('door3');await page.keyboard.press('KeyE');assert((await state()).save.flags.includes('unlock:door3'));await page.keyboard.press('KeyG');assert((await state()).save.doors.includes('door3'));pass('study door uses matching key');
  await take('bedroomKey',5.3,0,-15.2);await take('veraKey',-2.4,0,-20.3);await take('exitKey',3.65,0,-21.3);await take('fuse',-2.25,0,-27.2);
  await pose(5.35,0,-28.6);await aim('power');await page.keyboard.press('KeyE');await waitFlag('power');pass('kitchen fuse restores power');
  await pose(-5.25,0,-33.4);await aim('alarmCabinet');await page.keyboard.down('KeyR');await page.waitForFunction(()=>window.__episodeTest.state().save.moved.includes('alarmCabinet'),null,{timeout:18000});await page.keyboard.up('KeyR');
  await aim('alarm');await page.keyboard.press('KeyE');await waitFlag('alarm');pass('hidden alarm panel releases exit');
  await pose(5.5,0,-33);await aim('exit');await page.keyboard.press('KeyE');await page.keyboard.press('KeyG');assert.equal((await state()).mode,'ending');pass('chapter ending is reachable');
  await page.screenshot({path:resolve(out,'100gate-chapter-complete.png')});
  await page.reload();await page.waitForFunction(()=>window.__episodeTest?.state().mode==='title',null,{timeout:60000});assert((await state()).save.flags.includes('complete'));assert((await state()).save.items.includes('fuse'));pass('save survives reload');
  assert.deepEqual(errors,[]);pass('no uncaught JavaScript errors');
}catch(e){console.log('FAILED STATE',JSON.stringify(await state()));await page.screenshot({path:resolve(out,'verification-failure.png')});throw e;}finally{writeFileSync(resolve(out,'verification.json'),JSON.stringify({checks:results,errors},null,2));await browser.close();}

await import('./verify-mobile.mjs');
