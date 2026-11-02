import { chromium, devices } from 'playwright';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { testBrowser } from './browser.mjs';
const browser=await testBrowser();
const results=[];const errors=[];
try{for(const model of ['iPhone 13','Pixel 7']){
  const context=await browser.newContext({...devices[model],viewport:{width:844,height:390},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  await context.addInitScript(()=>localStorage.setItem('100gate.settings.v1',JSON.stringify({quality:'low'})));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));const state=()=>page.evaluate(()=>window.__episodeTest.state());
  await page.goto('http://127.0.0.1:3000/');await page.waitForFunction(()=>window.__episodeTest?.state().mode==='title',null,{timeout:60000});
  assert.equal(await page.locator('.ep-rotate').isVisible(),false);await page.getByTestId('start').tap();
  const cdp=await context.newCDPSession(page);
  async function holdAction(flag){const rect=await page.locator('.ep-touch-interact').boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:rect.x+rect.width/2,y:rect.y+rect.height/2}]});await page.waitForFunction(flag=>window.__episodeTest.state().save.flags.includes(flag),flag,{timeout:18000});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(250);}
  await holdAction('chairTipped');await page.locator('.ep-touch-interact').tap();assert((await state()).save.items.includes('knife'));await page.waitForTimeout(250);await holdAction('free');
  results.push(model+': chair, knife, hold action');
  await page.evaluate(()=>window.__episodeTest.pose(0,3.6,0));
  const rect=await page.getByTestId('joystick').boundingBox(),cx=rect.x+rect.width/2,cy=rect.y+rect.height/2;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:cx,y:cy},{id:2,x:550,y:140}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:cx,y:cy-38},{id:2,x:590,y:150}]});await page.waitForTimeout(850);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const s=await state();assert(s.position[2]<-.1);assert(Math.abs(s.yaw)>.05);results.push(model+': simultaneous joystick and look');
  await page.getByRole('button',{name:'Присесть',exact:true}).tap();await page.waitForTimeout(200);await page.getByRole('button',{name:'Присесть',exact:true}).tap();await page.getByRole('button',{name:'Прыжок',exact:true}).tap();
  await page.waitForFunction(()=>window.__episodeTest.state().position[1]>3.7,null,{timeout:5000});results.push(model+': crouch toggle and jump');
  await page.screenshot({path:resolve('../../outputs',model==='iPhone 13'?'100gate-mobile.png':'100gate-android.png')});
  await page.getByRole('button',{name:'Пауза и настройки'}).tap();assert.equal((await state()).mode,'paused');await page.locator('select').first().selectOption('en');await page.getByRole('button',{name:'Done',exact:true}).tap();assert.equal((await state()).mode,'playing');results.push(model+': pause, English settings, resume');
  await page.setViewportSize({width:390,height:844});assert(await page.locator('.ep-rotate').isVisible());results.push(model+': portrait rotation prompt');
  await context.close();console.log('PASS '+model);
}assert.deepEqual(errors,[]);}finally{writeFileSync(resolve('../../outputs/mobile-verification.json'),JSON.stringify({checks:results,errors,note:'Chromium touch emulation; real iOS Safari and Android hardware not tested'},null,2));await browser.close();}
