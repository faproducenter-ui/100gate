import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const out=resolve('../../outputs/refinement-2026-11-05');await mkdir(out,{recursive:true});
const baseline=process.argv.includes('--baseline'),report={errors:[],checks:[]};
const b=await chromium.launch({headless:false});
try{
 const p=await b.newPage({viewport:{width:1280,height:720}});
 p.on('pageerror',e=>report.errors.push(e.message));
 await p.route('**/api/save',r=>r.fulfill({status:200,json:{ok:true}}));
 await p.addInitScript(()=>localStorage.setItem('100gate.settings.v1',JSON.stringify({quality:'low'})));
 await p.goto('http://127.0.0.1:3000/');await p.getByTestId('start').click({timeout:90000});
 await p.waitForFunction(()=>typeof window.advanceTime==='function');
 await p.evaluate(()=>window.advanceTime(0));
 const state=()=>p.evaluate(()=>window.__episodeTest.state());
 const step=ms=>p.evaluate(ms=>window.advanceTime(ms),ms);
 const pass=s=>{report.checks.push(s);console.log('PASS '+s)};
 await p.keyboard.down('KeyR');await step(2400);
 report.afterTipTime=await state();
 if(!baseline){
  assert(report.afterTipTime.save.flags.includes('chairTipped'),'hold must use active game time');
  await p.keyboard.up('KeyR');await p.keyboard.press('KeyE');assert((await state()).save.items.includes('knife'));
  await p.keyboard.down('KeyR');await step(800);await p.keyboard.up('KeyR');await step(50);
  assert(!(await state()).save.flags.includes('free'));
  await p.keyboard.down('KeyR');await step(1000);await p.keyboard.press('Escape');await step(5000);
  assert.equal((await state()).mode,'paused');assert(!(await state()).save.flags.includes('free'));
  await p.keyboard.up('KeyR');await p.keyboard.press('Escape');
  await p.keyboard.down('KeyR');await step(2600);
  assert(!(await state()).save.flags.includes('free'),'cancelled/paused hold must not leak progress');
  await step(250);await p.keyboard.up('KeyR');
  assert((await state()).save.flags.includes('free'));
  pass('chair/knife/ropes run on the active game clock; early release and pause reset progress');
  assert.deepEqual(report.errors,[]);pass('no JavaScript errors');
 }
 console.log(JSON.stringify({baseline,tip:report.afterTipTime.save.flags,progress:report.afterTipTime.hold}));
}finally{await b.close();await writeFile(resolve(out,baseline?'intro-clock-baseline.json':'intro-clock.json'),JSON.stringify(report,null,2));}
