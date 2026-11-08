import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { testBrowser } from './browser.mjs';

const base=new URL(process.env.GAME_URL??'http://127.0.0.1:5182');
assert(['127.0.0.1','localhost'].includes(base.hostname));
const out='outputs/quality-overhaul/stop/browser';
await mkdir(out,{recursive:true});
const browser=await testBrowser();
const page=await browser.newPage({viewport:{width:800,height:450}});
const errors=[],frames=[],stepRates=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
await page.addInitScript(()=>localStorage.setItem('100gate.settings.v1',JSON.stringify({quality:'low'})));
try{
  await page.goto(new URL('?story-home=1&quality-motion=1&quality-stop-camera=1',base).href);
  await page.waitForFunction(()=>typeof window.advanceTime==='function',undefined,{timeout:90000});
  await page.evaluate(()=>window.advanceTime(0));
  await page.getByTestId('start-story-home').click();
  const step=ms=>page.evaluate(ms=>{window.advanceTime(ms);return window.__storyHomeTest().street;},ms);
  for(const ms of [9000,10000,8000,3000,2000,2000,3000,6590])await step(ms);
  for(let i=0;i<27;i++){
    const f=await step(1000/15);
    assert(f.beat==='WALK_HOME'||f.beat==='ABDUCTION');
    frames.push({beat:f.beat,time:f.seconds,position:f.heroPosition,stop:f.stop,feet:f.hero.feet,hips:f.hero.hips});
    await page.screenshot({path:`${out}/frame-${String(i).padStart(3,'0')}.png`,timeout:90000});
  }
  const planted=frames.filter(f=>f.stop?.key==='stop-80');
  assert(planted.length>=10);
  assert(planted.every(f=>JSON.stringify(f.position)===JSON.stringify(planted[0].position)));
  assert(planted.some(f=>f.stop.time>.3&&Math.hypot(...f.feet[0].map((x,i)=>x-planted[0].feet[0][i]))>.045));
  const idle=planted.filter(f=>f.beat==='ABDUCTION');
  assert(idle.length>=3);
  assert(idle.every(f=>JSON.stringify(f.feet)===JSON.stringify(idle[0].feet)));
  for(const hz of [24,120]){
    await page.reload();
    await page.waitForFunction(()=>typeof window.advanceTime==='function',undefined,{timeout:90000});
    await page.evaluate(()=>window.advanceTime(0));
    await page.getByTestId('start-story-home').click();
    for(const ms of [9000,10000,8000,3000,2000,2000,3000,7470])await step(ms);
    const f=await page.evaluate(hz=>{
      for(let i=0;i<hz/4;i++)window.advanceTime(1000/hz);
      return window.__storyHomeTest().street;
    },hz);
    assert(f.stop?.key==='stop-80');
    stepRates.push({hz,feet:f.hero.feet.flat(),hips:f.hero.hips});
  }
  assert(stepRates[0].feet.every((value,i)=>Math.abs(value-stepRates[1].feet[i])<.0005));
  assert(stepRates[0].hips.every((value,i)=>Math.abs(value-stepRates[1].hips[i])<.0005));
  assert.deepEqual(errors,[]);
  console.log('PASS: real WebGL stop progression, stable idle across cut, no console errors');
}finally{await browser.close();await writeFile(out+'/report.json',JSON.stringify({errors,frames,stepRates},null,2));}
