import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const out=resolve('../../outputs/refinement-2026-11-05/headroom');await mkdir(out,{recursive:true});
const baseline=process.argv.includes('--baseline'),report={errors:[],consoleErrors:[]};
const b=await chromium.launch({headless:false});
try{
 const p=await b.newPage({viewport:{width:1280,height:720}});
 p.on('pageerror',e=>report.errors.push(e.message));
 p.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text())});
 await p.route('**/api/save',r=>r.fulfill({status:200,json:{ok:true}}));
 await p.addInitScript(()=>{
  localStorage.setItem('100gate.settings.v1',JSON.stringify({quality:'medium'}));
  localStorage.setItem('100gate.chapter1.save.v1',JSON.stringify({version:1,flags:['chairTipped','free','unlock:hatch'],items:['knife','hatchKey'],read:[],doors:['hatch'],moved:[],position:[3,2.34,-3.1],yaw:0,pitch:0,room:0,updatedAt:new Date().toISOString()}));
 });
 await p.goto('http://127.0.0.1:3000/');await p.getByTestId('start').click({timeout:90000});
 await p.waitForFunction(()=>typeof window.advanceTime==='function');
 await p.evaluate(()=>window.advanceTime(0));
 const step=ms=>p.evaluate(ms=>window.advanceTime(ms),ms);
 const state=()=>p.evaluate(()=>window.__episodeTest.state());
 await p.keyboard.press('Space');await step(200);
 report.openShaft=await state();
 await p.screenshot({path:resolve(out,baseline?'before-open-shaft.png':'after-open-shaft.png')});
 // A physically possible crouched position under the solid attic-floor lip.
 await p.keyboard.down('ShiftLeft');
 await p.evaluate(()=>window.__episodeTest.pose(3,2.25,-4.6,0,0));
 await step(20);await p.keyboard.up('ShiftLeft');await step(100);
 report.releaseUnderSlab={state:await state(),eye:await p.evaluate(()=>window.__episodeTest.introView().eye)};
 await p.screenshot({path:resolve(out,baseline?'before-crouch-clearance.png':'after-crouch-clearance.png')});
 if(!baseline){
  assert(report.openShaft.position[1]>2.75,'an invisible floor-height threshold still blocks jumping in the open stairwell');
  assert(report.releaseUnderSlab.state.actorHeight<1.2,'standing was allowed through the solid floor overhead');
  assert(report.releaseUnderSlab.eye[1]<=3.42-.05,'camera crosses the underside of the attic floor');
  await step(1200);
  assert.equal((await state()).actorHeight,1.68,'standing must restore automatically when headroom is clear');
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.consoleErrors,[]);
 console.log(JSON.stringify(report,null,2));
}finally{await b.close();await writeFile(resolve(out,baseline?'baseline.json':'regression.json'),JSON.stringify(report,null,2));}
