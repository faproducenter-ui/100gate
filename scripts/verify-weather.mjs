import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { testBrowser } from './browser.mjs';

const url='http://127.0.0.1:3000/';
const output=resolve('../../outputs');await mkdir(output,{recursive:true});
const browser=await testBrowser();
try{
  const page=await browser.newPage({viewport:{width:1024,height:600}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',msg=>{if(msg.type()==='error'&&/shader|webgl/i.test(msg.text()))errors.push(msg.text());});
  await page.route('**/api/save',route=>route.fulfill({status:200,json:{ok:true}}));
  await page.addInitScript(()=>{
    if(!localStorage.getItem('100gate.settings.v1'))localStorage.setItem('100gate.settings.v1',JSON.stringify({quality:'high',weather:'rain'}));
    localStorage.setItem('100gate.chapter1.save.v1',JSON.stringify({version:1,flags:['chairTipped','free','power','alarm','unlock:exit'],items:['bag','exitKey'],read:[],doors:[],moved:[],position:[5.5,0,-33],yaw:-Math.PI/2,pitch:0,room:9,updatedAt:new Date().toISOString()}));
  });
  for(const weather of ['rain','snow']){
    await page.goto(url);await page.getByTestId('start').waitFor({timeout:90000});
    if(weather==='snow'){
      await page.getByRole('button',{name:'Настройки',exact:true}).click();
      await page.getByText('Погода снаружи',{exact:true}).locator('..').locator('select').selectOption('snow');
      await page.getByRole('button',{name:'Готово',exact:true}).click();
    }
    await page.getByTestId('start').click();
    await page.evaluate(()=>window.__episodeTest.aim('exit'));
    await page.waitForFunction(()=>window.__episodeTest.state().target==='exit',null,{timeout:25000});
    await page.keyboard.press('KeyG');
    await page.waitForFunction(snow=>{const {mode,weather}=window.__episodeTest.state();return mode==='ending'&&weather.exterior&&weather.reflection&&weather.snow===snow&&weather.particles>0;},weather==='snow',{timeout:35000});
    await page.screenshot({path:resolve(output,`100gate-yard-${weather}.png`),timeout:60000});
  }
  assert.deepEqual(errors,[]);
  console.log('PASS high graphics: exterior reveal, animated rain/snow, planar puddle reflection, no shader errors');
}finally{await browser.close();}
