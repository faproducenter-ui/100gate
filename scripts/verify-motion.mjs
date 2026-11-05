import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const out=resolve('../../outputs/refinement-2026-11-05');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:false});
const report={checks:[],errors:[],consoleErrors:[]};
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 await page.addInitScript(()=>{
  window.__inputTrace=[];
  for(const type of ['keydown','keyup','pointerlockchange','blur','visibilitychange']){
   (type==='pointerlockchange'||type==='visibilitychange'?document:window).addEventListener(type,e=>{
    window.__inputTrace.push({type,code:e.code,time:performance.now(),mode:window.__episodeTest?.state().mode,locked:Boolean(document.pointerLockElement),focus:document.hasFocus(),hidden:document.hidden});
    if(window.__inputTrace.length>50)window.__inputTrace.shift();
   });
  }
 });
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text())});
 await page.route('**/api/save',r=>r.fulfill({status:200,json:{ok:true}}));
 await page.addInitScript(()=>{
  localStorage.setItem('100gate.settings.v1',JSON.stringify({quality:'low'}));
  localStorage.setItem('100gate.chapter1.save.v1',JSON.stringify({version:1,flags:['chairTipped','free','unlock:hatch'],items:['knife','hatchKey','studyKey'],read:[],doors:['hatch'],moved:[],position:[0,0,-19],yaw:0,pitch:0,room:1,updatedAt:new Date().toISOString()}));
 });
 await page.goto('http://127.0.0.1:3000/');await page.getByTestId('start').click({timeout:90000});
 await page.waitForFunction(()=>typeof window.advanceTime==='function');
 await page.evaluate(()=>window.advanceTime(0));
 const state=()=>page.evaluate(()=>window.__episodeTest.state());
 const advance=ms=>page.evaluate(ms=>window.advanceTime(ms),ms);
 const pose=(...args)=>page.evaluate(args=>{window.__episodeTest.pose(...args);window.advanceTime(0)},args);
 const pass=s=>{report.checks.push(s);console.log('PASS '+s)};
 const burst=async(keys,ms)=>{for(const k of keys)await page.keyboard.down(k);try{await advance(ms)}finally{for(const k of keys)await page.keyboard.up(k)}};
 const samples=[];
 for(const frames of [120,16]){
  await pose(0,0,-19,0,0);await page.keyboard.down('ControlLeft');await page.keyboard.down('KeyW');
  try{for(let i=0;i<frames;i++)await advance(2000/frames)}finally{await page.keyboard.up('KeyW');await page.keyboard.up('ControlLeft')}
  samples.push((await state()).position[2]);
 }
 report.fixedStepPositions=samples;assert(Math.abs(samples[0]-samples[1])<.035);
 pass('equal sprint distance at 60 Hz and 8 Hz frame partitions');
 await pose(0,0,-34,0,0);await burst(['ControlLeft','KeyW'],2000);
 assert((await state()).position[2]>-35.72);assert((await state()).grounded);
 pass('thin end wall blocks a sustained sprint without tunnelling');
 await pose(0,0,-15,-Math.PI/2,0);await burst(['ControlLeft','KeyW'],1000);
 assert((await state()).position[0]<1.23);
 pass('closed study door blocks the character');
 await pose(.1,0,-15,0,0);
 await page.evaluate(()=>{window.__episodeTest.aim('door3');window.advanceTime(20)});
 await page.keyboard.press('KeyE');await page.keyboard.press('KeyG');await advance(2000);
 assert((await state()).save.doors.includes('door3'));
 await pose(0,0,-15,-Math.PI/2,0);await burst(['KeyW'],1500);
 assert((await state()).position[0]>2.1);
 pass('matching key and opening animation produce a traversable doorway');
 await pose(3,3.6,-.5,0,0);await burst(['KeyW'],3700);
 assert((await state()).position[2]<-7.3);assert((await state()).position[1]<.1);
 pass('stair descent reaches the lower landing without falling below the floor');
 await pose(3,0,-7.4,Math.PI,0);await burst(['KeyW'],3300);
 assert((await state()).position[2]>-1);assert(Math.abs((await state()).position[1]-3.6)<.03);
 pass('stair ascent returns to the attic without a step-height stall');
 await pose(0,3.6,0,0,0);await page.keyboard.press('Space');await advance(250);
 assert((await state()).position[1]>3.9);await advance(1000);
 assert((await state()).grounded&&Math.abs((await state()).position[1]-3.6)<.001);
 pass('jump rises and lands on the same floor');
 const cycles=process.argv.includes('--pause-stress')?100:1;
 for(let i=0;i<cycles;i++){
  const before=(await state()).position;
  await page.keyboard.press('Escape');assert.equal((await state()).mode,'paused');
  await advance(1000);assert.deepEqual((await state()).position,before);
  await page.keyboard.press('Escape');await advance(100);
  assert.equal((await state()).mode,'playing',`resume cycle ${i}`);
 }
 report.pauseCycles=cycles;
 pass('manual stepping respects pause/resume');
 if(cycles>1){
  await page.locator('canvas').click();await page.waitForFunction(()=>Boolean(document.pointerLockElement));
  await page.evaluate(()=>document.exitPointerLock());
  await page.waitForFunction(()=>window.__episodeTest.state().mode==='paused');
  await page.keyboard.press('Escape');await advance(100);assert.equal((await state()).mode,'playing');
  pass('unexpected pointer loss still pauses, unlike an expected menu release');
  const other=await browser.newPage();await other.bringToFront();
  await page.waitForFunction(()=>window.__episodeTest.state().mode==='paused');
  await page.bringToFront();await other.close();await page.keyboard.press('Escape');await advance(100);
  assert.equal((await state()).mode,'playing');pass('real tab focus loss pauses and focused ESC resumes');
 }
 await page.screenshot({path:resolve(out,'motion-regression.png')});
 report.diagnostics=await page.evaluate(()=>window.__episodeTest.diagnostics());
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.consoleErrors,[]);
 pass('no JavaScript or console errors');
}catch(e){report.failure=String(e);report.inputTrace=await browser.contexts()[0].pages()[0].evaluate(()=>window.__inputTrace);throw e;
}finally{await browser.close();await writeFile(resolve(out,'motion-regression.json'),JSON.stringify(report,null,2));}
