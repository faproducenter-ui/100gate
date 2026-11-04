import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const baseline=process.argv.includes('--baseline'),out=resolve('../../outputs/refinement-2026-11-05/hatch-save');
await mkdir(out,{recursive:true});const report={errors:[],consoleErrors:[]};
const b=await chromium.launch({headless:false});
try{
 const p=await b.newPage({viewport:{width:1280,height:720}});
 p.on('pageerror',e=>report.errors.push(e.message));p.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text())});
 await p.route('**/api/save',r=>r.fulfill({status:200,json:{ok:true}}));
 await p.addInitScript(()=>{
  localStorage.setItem('100gate.settings.v1',JSON.stringify({quality:'medium'}));
  if(!localStorage.getItem('100gate.chapter1.save.v1'))localStorage.setItem('100gate.chapter1.save.v1',JSON.stringify({version:1,flags:['chairTipped','free','unlock:hatch'],items:['knife','hatchKey'],read:[],doors:['hatch'],moved:[],position:[3,3.6,-.5],yaw:0,pitch:-1,room:0,updatedAt:new Date().toISOString()}));
 });
 const start=async()=>{await p.goto('http://127.0.0.1:3000/');await p.getByTestId('start').click({timeout:90000});await step(0)};
 const step=ms=>p.evaluate(ms=>window.advanceTime(ms),ms),state=()=>p.evaluate(()=>window.__episodeTest.state());
 const aim=async()=>{await p.evaluate(()=>window.__episodeTest.aim('hatch'));await step(20);assert.equal((await state()).target,'hatch')};
 const walk=async(key,ms)=>{await p.keyboard.down(key);try{await step(ms)}finally{await p.keyboard.up(key)}};
 await start();await aim();await p.keyboard.press('KeyG');await step(20);
 // Valid position on the open staircase, outside the current near-upright leaf.
 await p.evaluate(()=>window.__episodeTest.pose(3,2.1,-3.5));await step(9000);
 report.interrupted={state:await state(),leaf:await p.evaluate(()=>window.__episodeTest.hatchView()),saved:await p.evaluate(()=>JSON.parse(localStorage.getItem('100gate.chapter1.save.v1')))};
 assert(report.interrupted.leaf.angle>.1,'closing must be physically interrupted before the capsule');
 await start();report.restored=await state();await walk('KeyW',1000);report.walkAfterReload=await state();
 await p.screenshot({path:resolve(out,baseline?'before-reload-stuck.png':'after-reload-traversable.png')});
 if(!baseline){
  assert(report.interrupted.saved.doors.includes('hatch'),'unfinished closing must not persist an already closed lid over the player');
  assert(report.restored.save.doors.includes('hatch'),'interrupted closing must restore a safe open hatch');
  assert(report.walkAfterReload.position[2]<report.restored.position[2]-1,'reload must not strand the player in the staircase');
  await p.evaluate(()=>window.__episodeTest.pose(3,3.6,-.5));await aim();await p.keyboard.press('KeyG');await step(3000);
  assert(!(await state()).save.doors.includes('hatch'),'completed closure must persist closed');
  await start();assert(!(await state()).save.doors.includes('hatch'));
  await p.evaluate(()=>window.__episodeTest.pose(3,0,-7.3,Math.PI));await walk('KeyW',2800);
  report.closedFromBelow=await state();assert(report.closedFromBelow.position[1]<2.4,'standing player must not pass through the closed lid from below');
  await p.keyboard.down('ShiftLeft');await walk('KeyW',1600);await p.keyboard.up('ShiftLeft');await step(100);
  report.crouchedBelow=await state();assert(report.crouchedBelow.position[1]<2.45,'crouching must not bypass the closed lid');
  assert.equal(report.crouchedBelow.actorHeight,1.04,'standing up under the closed lid must remain blocked');
  await walk('KeyS',2800);report.retreat=await state();
  assert(report.retreat.position[1]<.4,'closed hatch must not remove stair support or prevent retreat');
  assert.equal(report.retreat.actorHeight,1.68);
  console.log('PASS interrupted-close save/reload, persisted completed closure, solid lid from below, crouch and retreat');
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.consoleErrors,[]);
 console.log(JSON.stringify({baseline,savedOpen:report.interrupted.saved.doors.includes('hatch'),reloadTravel:report.walkAfterReload.position[2]-report.restored.position[2],errors:report.errors}));
}finally{await b.close();await writeFile(resolve(out,baseline?'baseline.json':'regression.json'),JSON.stringify(report,null,2));}
