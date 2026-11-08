import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {testBrowser} from './browser.mjs';
const base=new URL(process.env.GAME_URL??'http://127.0.0.1:5182');
assert(['127.0.0.1','localhost'].includes(base.hostname));
const out='outputs/quality-overhaul/egress/browser';
await mkdir(out,{recursive:true});
const b=await testBrowser(),page=await b.newPage({viewport:{width:920,height:518}});
const report={frames:[],errors:[],loaded:[]};
page.on('pageerror',e=>report.errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
page.on('response',r=>{
  if(r.status()>=400)report.errors.push(r.status()+' '+r.url());
  if(r.ok()&&r.url().includes('/egress/'))report.loaded.push(new URL(r.url()).pathname);
});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
await page.addInitScript(()=>localStorage.setItem('100gate.settings.v1',JSON.stringify({quality:'low'})));
try{
  await page.goto(new URL('?story-home=1&quality-car=1&quality-motion=1&quality-egress=1',base).href);
  await page.waitForFunction(()=>typeof window.advanceTime==='function',undefined,{timeout:90000});
  await page.evaluate(()=>window.advanceTime(0));
  await page.getByTestId('start-story-home').click();
  const step=ms=>page.evaluate(ms=>{window.advanceTime(ms);return window.__storyHomeTest().street;},ms);
  for(const ms of [9000,10000,8000,3000,2000,2000,3000,8000])await step(ms);
  let elapsed=0;
  const frame=async(name,t,shot=true)=>{
    const f=await step(t-elapsed);elapsed=t;
    assert.equal(f.beat,'ABDUCTION');assert(f.unknowns.every(a=>a.bones===53&&a.visible));
    const entry={name,time:f.seconds,angles:f.sedan.angles,actor:f.unknowns};
    report.frames.push(entry);
    if(shot)await page.screenshot({path:out+'/'+name+'.png',timeout:120000});
    return entry;
  };
  const parked=await frame('01-parked',2090);
  assert.deepEqual(parked.angles,[0,0]);assert(parked.actor.every(a=>a.phase==='seated'));
  const near=await frame('02-near-exit',3510);
  assert(Math.abs(near.angles[0]+1.55)<1e-4&&near.actor[0].rendered);
  const far=await frame('03-far-exit',4430);
  assert(far.actor[1].rendered&&far.actor[1].phase==='egress');
  const before=await frame('before-handoff',4890,false);
  const after=await frame('after-handoff',4910,false);
  assert.equal(before.actor[0].phase,'egress');assert.equal(after.actor[0].phase,'approach');
  assert(Math.hypot(...after.actor[0].root.map((x,i)=>x-before.actor[0].root[i]))<.09);
  const walk=await frame('04-approach',6440);
  assert(walk.actor.every(a=>a.phase==='approach'&&a.rendered));
  assert(Math.hypot(...walk.actor[0].root.map((x,i)=>x-after.actor[0].root[i]))>.4);
  assert.equal(new Set(report.loaded).size,2);
  assert.deepEqual(report.errors,[]);
  report.passed=true;
  console.log('PASS: sedan door phase, near/far actual draws, continuous same-skin egress-to-walk');
}catch(e){report.failure=String(e);throw e;}
finally{await b.close();await writeFile(out+'/report.json',JSON.stringify(report,null,2));}
