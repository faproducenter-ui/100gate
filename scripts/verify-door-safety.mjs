import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const out=resolve('../../outputs/refinement-2026-11-05');await mkdir(out,{recursive:true});
const b=await chromium.launch({headless:false});const report={errors:[]};
try{
 const p=await b.newPage({viewport:{width:1280,height:720}});p.on('pageerror',e=>report.errors.push(e.message));
 await p.route('**/api/save',r=>r.fulfill({status:200,json:{ok:true}}));
 await p.addInitScript(()=>{
  localStorage.setItem('100gate.settings.v1',JSON.stringify({quality:'low'}));
  localStorage.setItem('100gate.chapter1.save.v1',JSON.stringify({version:1,flags:['chairTipped','free','unlock:door3'],items:['knife','studyKey'],read:[],doors:['door3'],moved:[],position:[2.2,0,-15.05],yaw:Math.PI,pitch:-.4,room:3,updatedAt:new Date().toISOString()}));
 });
 await p.goto('http://127.0.0.1:3000/');await p.getByTestId('start').click({timeout:90000});
 await p.waitForFunction(()=>window.__episodeTest?.state().target==='door3',null,{timeout:15000});
 report.before=await p.evaluate(()=>window.__episodeTest.state());
 await p.keyboard.press('KeyG');await p.waitForTimeout(600);
 report.after=await p.evaluate(()=>window.__episodeTest.state());
 await p.screenshot({path:resolve(out,process.argv.includes('--baseline')?'door-before-fix.png':'door-after-fix.png')});
 if(!process.argv.includes('--baseline'))assert(report.after.save.doors.includes('door3'),'door closes through the character');
 if(!process.argv.includes('--baseline')){
  await p.evaluate(()=>{
   window.__episodeTest.pose(0,0,-15,Math.atan2(-2.15,-.64),-.205);
   window.advanceTime(200);
  });
  await p.waitForFunction(()=>window.__episodeTest.state().target==='door3');
  await p.keyboard.press('KeyG');await p.evaluate(()=>window.advanceTime(2000));
  assert(!(await p.evaluate(()=>window.__episodeTest.state().save.doors)).includes('door3'),'safe closure should work');
  await p.evaluate(()=>{window.__episodeTest.pose(.1,0,-15);window.__episodeTest.aim('door3');window.advanceTime(20)});
  await p.keyboard.press('KeyG');
  await p.evaluate(()=>{window.__episodeTest.pose(2.2,0,-15.05);window.advanceTime(500)});
  assert.deepEqual(await p.evaluate(()=>window.__episodeTest.diagnostics().overlappingDoors),[]);
  await p.evaluate(()=>{window.__episodeTest.pose(0,0,-15);window.advanceTime(2000)});
  report.safeCycle=await p.evaluate(()=>window.__episodeTest.state().save.doors.includes('door3'));
  assert(report.safeCycle,'leaf must resume opening after the player steps away');
  console.log('PASS swept-door guard, safe close, interception while opening, resume after clearance');
 }
 assert.deepEqual(report.errors,[]);
 console.log(JSON.stringify(report,null,2));
}finally{await b.close();await writeFile(resolve(out,process.argv.includes('--baseline')?'door-baseline.json':'door-safety.json'),JSON.stringify(report,null,2));}
