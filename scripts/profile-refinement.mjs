import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import {resolve} from 'node:path';
const out=resolve('../../outputs/refinement-2026-11-05'); await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:false});
const report={};
const after=process.argv.includes('--after');
try{
 for(const slow of [false,true]){
  const context=await browser.newContext({viewport:{width:1280,height:720}});
  await context.route('**/api/save',r=>r.fulfill({status:200,json:{ok:true}}));
  await context.addInitScript(({slow})=>{
   localStorage.setItem('100gate.settings.v1',JSON.stringify({quality:'low'}));
   localStorage.setItem('100gate.chapter1.save.v1',JSON.stringify({version:1,flags:['chairTipped','free'],items:['knife'],read:[],doors:[],moved:[],position:[0,0,-19],yaw:0,pitch:0,room:1,updatedAt:new Date().toISOString()}));
   if(slow){const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>raf(()=>setTimeout(()=>cb(performance.now()),120));}
  },{slow});
  const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  const start=Date.now();await p.goto('http://127.0.0.1:3000/');await p.getByTestId('start').click({timeout:90000});
  await p.waitForFunction(()=>window.__episodeTest?.state().mode==='playing');
  const playable=Date.now();
  const initial=await p.evaluate(()=>window.__episodeTest.state());
  const frames=await p.evaluate(()=>new Promise(ok=>{const gaps=[];let last=performance.now();const end=last+1800;function tick(now){gaps.push(now-last);last=now;if(now>=end){gaps.sort((a,b)=>a-b);ok({frames:gaps.length,p50:gaps[Math.floor(gaps.length*.5)],p95:gaps[Math.floor(gaps.length*.95)],average:gaps.reduce((a,b)=>a+b)/gaps.length});}else requestAnimationFrame(tick)}requestAnimationFrame(tick)}));
  await p.keyboard.down('ControlLeft');await p.keyboard.down('KeyW');const t=Date.now();
  await p.waitForTimeout(2200);await p.keyboard.up('KeyW');await p.keyboard.up('ControlLeft');
  const finish=await p.evaluate(()=>window.__episodeTest.state());
  report[slow?'throttled':'normal']={loadToPlayableMs:playable-start,frames,seconds:(Date.now()-t)/1000,distance:initial.position[2]-finish.position[2],errors};
  if(!slow){
   await p.evaluate(()=>window.__episodeTest.pose(-4.8,0,-15.4));
   await p.evaluate(()=>window.__episodeTest.aim('storeCabinet'));
   await p.waitForFunction(()=>window.__episodeTest.state().target==='storeCabinet');
   await p.keyboard.down('KeyR');await p.waitForFunction(()=>window.__episodeTest.state().hold>.12);
   await p.evaluate(()=>window.__episodeTest.pose(-4.8,0,-19.4));
   await p.waitForTimeout(3300);await p.keyboard.up('KeyR');
   report.furnitureThroughWall=await p.evaluate(()=>({state:window.__episodeTest.state(),cabinet:window.__episodeTest.targets().find(t=>t.id==='storeCabinet')}));
   await p.screenshot({path:resolve(out,after?'after-furniture-wall.png':'before-furniture-wall.png')});
  }
  await context.close();
 }
}finally{await browser.close();await writeFile(resolve(out,after?'after.json':'baseline.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
if(after){
 if(report.furnitureThroughWall.state.save.moved.includes('storeCabinet'))throw Error('Furniture still moves through the wall');
 const speed1=report.normal.distance/report.normal.seconds,speed2=report.throttled.distance/report.throttled.seconds;
 if(Math.abs(speed1-speed2)/speed1>.14)throw Error('Low-FPS movement diverges beyond 14%');
 if(report.normal.errors.length||report.throttled.errors.length)throw Error('Runtime errors');
 console.log('PASS real-frame low FPS movement and furniture occlusion regression');
}
