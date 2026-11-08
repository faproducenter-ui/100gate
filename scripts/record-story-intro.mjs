/** Continuous real input / real browser capture, not time-stepped test frames. */
import {testBrowser} from './browser.mjs';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {installStoryRecording} from './browser-story-recording.mjs';
const base=new URL(process.env.GAME_URL??'http://127.0.0.1:5182');
assert(['127.0.0.1','localhost'].includes(base.hostname));
const final=process.env.STORY_FINAL_REVIEW==='1';
const candidate=final||process.env.STORY_QUALITY_REVIEW==='1';
const out=final?'outputs/quality-overhaul/final-browser':candidate?'outputs/quality-overhaul/full-browser':'outputs/story-intro/full-browser';
await mkdir(out,{recursive:true});
const viewport=final?{width:800,height:450}:{width:960,height:540};
const b=await testBrowser(),ctx=await b.newContext({viewport,recordVideo:{dir:out,size:viewport}});
const videoStarted=Date.now();
const page=await ctx.newPage(),report={errors:[],badRequests:[],timeline:[],studyAssets:[]};
page.on('pageerror',e=>report.errors.push(String(e)));
page.on('console',e=>{if(e.type()==='error')report.errors.push(e.text());});
page.on('response',r=>{
  if(r.status()>=400)report.badRequests.push(r.url());
  const path=new URL(r.url()).pathname;
  if(r.ok()&&path.startsWith('/outputs/quality-overhaul/')&&path.endsWith('.glb'))report.studyAssets.push(path);
});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await page.route('**/api/save',r=>{report.badRequests.push(r.request().url());return r.abort();});
await page.addInitScript(()=>{localStorage.setItem('100gate.settings.v1',JSON.stringify({quality:'low',cameraMotion:.55}));});
if(final)await installStoryRecording(page,out+'/100gate-cinematic.pcm');
let monitoring=true,monitor;
try{
  await page.goto(new URL('?story-intro=1'+(candidate?'&quality-pass=1&quality-motion=1&quality-car=1':'')+
    (final?'&quality-egress=1&quality-sleeves=1&quality-face=1':''),base).href);
  await page.getByTestId('start-story-home').click({timeout:75000});
  const start=Date.now();
  report.videoClickOffsetSeconds=(start-videoStarted)/1000;
  monitor=(async()=>{let prior;while(monitoring){
    const s=await page.evaluate(()=>window.__storyHomeTest());
    if(prior!==s.beat){prior=s.beat;const entry={beat:s.beat,wallSeconds:(Date.now()-start)/1000,seconds:s.seconds};report.timeline.push(entry);console.log(entry.beat,entry.wallSeconds.toFixed(2)+'s');}
    await page.waitForTimeout(160);
  }})();
  // The quality study includes the extra detailed GLBs. SwiftShader + VP9
  // recording can run below realtime; don't confuse a wall-clock limit with
  // a gameplay stall. Still require every real R and W input.
  const beat=(name,timeout)=>page.waitForFunction(n=>window.__storyHomeTest?.().beat===n,name,
    {timeout:timeout*(candidate?2.5:1),polling:150});
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
  if(candidate)assert.deepEqual([...new Set(report.studyAssets)].sort(),[
    '/outputs/quality-overhaul/gait/story-hero-walk-mocap.glb',
    '/outputs/quality-overhaul/home/story-home.glb',
    '/outputs/quality-overhaul/vehicle/story-sedan.glb',
    ...(final?['/outputs/quality-overhaul/egress/egress-L.glb','/outputs/quality-overhaul/egress/egress-R.glb',
      '/outputs/quality-overhaul/sleeves/story-upright-escape.glb',
      '/outputs/quality-overhaul/dialogue/story-hero-home-face.glb',
      '/outputs/quality-overhaul/dialogue/story-partner-home-face.glb']:[]),
  ].sort());
  if(final){
    report.media=await page.evaluate(()=>window.__finishStoryMedia());
    assert.equal(report.media.channels,2);assert(report.media.frames>10*report.media.rate);
  }
  assert(report.timeline.some(t=>t.beat==='SHOP_ENTER')&&report.timeline.some(t=>t.beat==='AWAKE_BOUND'));
  report.passed=true;report.activeSeconds=(Date.now()-start)/1000;
}catch(e){report.failure=String(e);
  if(final)await page.evaluate(()=>window.__finishStoryMedia?.()).catch(()=>{});
  await page.screenshot({path:out+'/failure.png'}).catch(()=>{});throw e;}
finally{
  monitoring=false;await monitor?.catch(e=>report.errors.push(String(e)));
  const video=page.video();await ctx.close();
  try{
    if(video&&final&&report.passed){
      const m=report.media;
      m.delayMs=Math.max(0,Math.round(m.firstMs-videoStarted));
      execFileSync('ffmpeg',['-y','-v','error','-i',await video.path(),
        '-f','s16le','-ar',String(m.rate),'-ac','2','-i',out+'/100gate-cinematic.pcm',
        '-map','0:v:0','-map','1:a:0','-af',`adelay=${m.delayMs}:all=1,apad`,
        '-c:v','copy','-c:a','libopus','-b:a','128k','-shortest',out+'/100gate-cinematic.webm']);
    }else if(video)await copyFile(await video.path(),out+(report.passed?'/intro-real-controls.webm':'/intro-incomplete-attempt.webm'));
  }catch(e){report.passed=false;report.failure=String(e);throw e;}
  finally{await writeFile(out+(report.passed?'/report.json':'/report-incomplete-attempt.json'),JSON.stringify(report,null,2));await b.close();}
}
