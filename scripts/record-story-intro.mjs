/** Continuous real input / real browser capture, not time-stepped test frames. */
import {testBrowser} from './browser.mjs';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=new URL(process.env.GAME_URL??'http://127.0.0.1:5182');
assert(['127.0.0.1','localhost'].includes(base.hostname));
const out='outputs/story-intro/full-browser';
await mkdir(out,{recursive:true});
const b=await testBrowser(),ctx=await b.newContext({viewport:{width:960,height:540},recordVideo:{dir:out,size:{width:960,height:540}}});
const page=await ctx.newPage(),report={errors:[],badRequests:[],timeline:[]};
page.on('pageerror',e=>report.errors.push(String(e)));
page.on('console',e=>{if(e.type()==='error')report.errors.push(e.text());});
page.on('response',r=>{if(r.status()>=400)report.badRequests.push(r.url());});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await page.route('**/api/save',r=>{report.badRequests.push(r.request().url());return r.abort();});
await page.addInitScript(()=>{localStorage.setItem('100gate.settings.v1',JSON.stringify({quality:'low',cameraMotion:.55}));});
let monitoring=true,monitor;
try{
  await page.goto(new URL('?story-intro=1',base).href);
  await page.getByTestId('start-story-home').click({timeout:75000});
  const start=Date.now();
  monitor=(async()=>{let prior;while(monitoring){
    const s=await page.evaluate(()=>window.__storyHomeTest());
    if(prior!==s.beat){prior=s.beat;const entry={beat:s.beat,wallSeconds:(Date.now()-start)/1000,seconds:s.seconds};report.timeline.push(entry);console.log(entry.beat,entry.wallSeconds.toFixed(2)+'s');}
    await page.waitForTimeout(160);
  }})();
  const beat=(name,timeout)=>page.waitForFunction(n=>window.__storyHomeTest?.().beat===n,name,{timeout,polling:150});
  await beat('REACH',180000);
  await page.keyboard.down('KeyR');await beat('RIGHT_CUT',12000);await page.keyboard.up('KeyR');
  await page.waitForTimeout(220);
  await page.keyboard.down('KeyR');await beat('SET_KNIFE_DOWN',18000);await page.keyboard.up('KeyR');
  await beat('FREE',22000);
  const before=await page.evaluate(()=>window.__storyHomeTest());
  assert(before.free&&before.escape.cutVerified);
  await page.keyboard.down('KeyW');await page.waitForTimeout(650);await page.keyboard.up('KeyW');
  const after=await page.evaluate(()=>window.__storyHomeTest());
  assert(Math.hypot(after.position[0]-before.position[0],after.position[2]-before.position[2])>.15);
  await page.screenshot({path:out+'/normal-gameplay.png'});
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.badRequests,[]);
  assert(report.timeline.some(t=>t.beat==='SHOP_ENTER')&&report.timeline.some(t=>t.beat==='AWAKE_BOUND'));
  report.passed=true;report.activeSeconds=(Date.now()-start)/1000;
}catch(e){report.failure=String(e);await page.screenshot({path:out+'/failure.png'}).catch(()=>{});throw e;}
finally{
  monitoring=false;await monitor?.catch(e=>report.errors.push(String(e)));
  const video=page.video();await ctx.close();
  if(video)await copyFile(await video.path(),out+(report.passed?'/intro-real-controls.webm':'/intro-incomplete-attempt.webm'));
  await writeFile(out+(report.passed?'/report.json':'/report-incomplete-attempt.json'),JSON.stringify(report,null,2));await b.close();
}
