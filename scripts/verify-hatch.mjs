import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import * as T from 'three';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const out=resolve('../../outputs/refinement-2026-11-05/hatch');await mkdir(out,{recursive:true});
const baseline=process.argv.includes('--baseline'),report={errors:[],consoleErrors:[],contacts:[]};
const b=await chromium.launch({headless:false});
try{
 const p=await b.newPage({viewport:{width:1280,height:720}});
 p.on('pageerror',e=>report.errors.push(e.message));
 p.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text())});
 await p.route('**/api/save',r=>r.fulfill({status:200,json:{ok:true}}));
 await p.addInitScript(()=>{
  localStorage.setItem('100gate.settings.v1',JSON.stringify({quality:'medium'}));
  if(!localStorage.getItem('100gate.chapter1.save.v1'))localStorage.setItem('100gate.chapter1.save.v1',JSON.stringify({version:1,flags:['chairTipped','free','unlock:hatch'],items:['knife','hatchKey'],read:[],doors:[],moved:[],position:[3,3.6,-.5],yaw:0,pitch:-1,room:0,updatedAt:new Date().toISOString()}));
 });
 await p.goto('http://127.0.0.1:3000/');await p.getByTestId('start').click({timeout:90000});
 const step=ms=>p.evaluate(ms=>window.advanceTime(ms),ms);
 const state=()=>p.evaluate(()=>window.__episodeTest.state());
 const aim=async()=>{await p.evaluate(()=>window.__episodeTest.aim('hatch'));await step(20);assert.equal((await state()).target,'hatch')};
 await step(0);await aim();await p.keyboard.press('KeyG');
 assert((await state()).save.doors.includes('hatch'),'normal approach must allow opening');
 // Independent geometric witness: any body-axis sample within 18 cm of the actual leaf
 // is certainly inside the 22 cm capsule. Read rendered geometry, not a production guard.
 for(let i=0;i<100;i++){
  await step(20);const leaf=await p.evaluate(()=>window.__episodeTest.hatchView());const s=await state();
  const inverse=new T.Matrix4().fromArray(leaf.matrix).invert(),box=new T.Box3(new T.Vector3().fromArray(leaf.min),new T.Vector3().fromArray(leaf.max));
  for(let h=.22;h<=s.actorHeight-.1;h+=.12){
   const q=new T.Vector3(s.position[0],s.position[1]+h,s.position[2]).applyMatrix4(inverse);
   if(box.distanceToPoint(q)<.18){report.contacts.push({frame:i,angle:leaf.angle,height:h,position:s.position});break;}
  }
  if(report.contacts.length===1&&report.contacts[0].frame===i)await p.screenshot({path:resolve(out,baseline?'before-leaf-contact.png':'unexpected-leaf-contact.png')});
 }
 report.final=await p.evaluate(()=>window.__episodeTest.hatchView());
 await p.screenshot({path:resolve(out,baseline?'before-open.png':'after-open.png')});
 if(!baseline){
  assert.deepEqual(report.contacts,[],'the hatch lid sweeps through the player at the normal approach');
  assert(Math.abs(report.final.angle-Math.PI/2)<.002,'side hinge must stop upright, not fold through the desk');
  await aim();await p.keyboard.press('KeyG');await step(2500);
  assert(!(await state()).save.doors.includes('hatch'),'safe closure should work');
  assert((await p.evaluate(()=>window.__episodeTest.hatchView())).angle<.001);
  await p.evaluate(()=>window.__episodeTest.pose(3,3.6,-2.5));await aim();
  await p.keyboard.press('KeyG');await step(300);
  assert(!(await state()).save.doors.includes('hatch'),'opening while standing on the lid must be rejected');
  assert(Math.abs((await state()).position[1]-3.6)<.001,'rejected opening must retain the solid floor');
  await p.evaluate(()=>window.__episodeTest.pose(3,3.6,-.5));await aim();await p.keyboard.press('KeyG');await step(100);
  await p.evaluate(()=>window.__episodeTest.pose(1.74,3.6,-2.2));await step(1200);
  const stopped=await p.evaluate(()=>window.__episodeTest.hatchView());report.interception=stopped.angle;
  assert(stopped.angle>.5&&stopped.angle<Math.PI/2-.01,'moving leaf must stop when the capsule enters its remaining sweep');
  await p.keyboard.down('KeyD');await step(700);await p.keyboard.up('KeyD');
  report.blockedMovement=(await state()).position;
  assert(report.blockedMovement[0]<1.8,'walking through the upright/paused panel must be blocked');
  await p.screenshot({path:resolve(out,'after-intercepted.png')});
  await p.evaluate(()=>window.__episodeTest.pose(3,3.6,-.5));await step(2500);
  assert(Math.abs((await p.evaluate(()=>window.__episodeTest.hatchView())).angle-Math.PI/2)<.001,'opening must resume after clearance');
  await p.reload();await p.getByTestId('start').click({timeout:90000});await step(0);
  report.reload=await p.evaluate(()=>window.__episodeTest.hatchView());
  assert(Math.abs(report.reload.angle-Math.PI/2)<.001,'saved open hatch must restore the side hinge');
  console.log('PASS safe opening/closing, standing-on-lid rejection, moving-leaf interception, solid panel, resume and reload');
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.consoleErrors,[]);
 console.log(JSON.stringify({contacts:report.contacts.length,finalAngle:report.final.angle,errors:report.errors,consoleErrors:report.consoleErrors}));
}finally{await b.close();await writeFile(resolve(out,baseline?'baseline.json':'regression.json'),JSON.stringify(report,null,2));}
