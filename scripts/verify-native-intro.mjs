/** Real controls, real game, uninterrupted page video. No pose/clock shortcuts. */
import {testBrowser} from './browser.mjs';
import {mkdir,writeFile,copyFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const out='outputs/complete-intro/game-test',base=process.env.GAME_URL??'http://127.0.0.1:3000';
await mkdir(out,{recursive:true});const browser=await testBrowser();
const context=await browser.newContext({viewport:{width:1280,height:720},recordVideo:{dir:out,size:{width:1280,height:720}}});
const page=await context.newPage(),errors=[],requests=[],stages=[],report={errors,requests,stages,assetSha256:createHash('sha256').update(await readFile('public/assets/chapter1/intro-native-v2.glb')).digest('hex')};
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('response',r=>{if(r.status()>=400)requests.push({url:r.url(),status:r.status()});});
await page.route('**/api/save',r=>r.fulfill({status:200,json:{ok:true}}));
await page.addInitScript(()=>{localStorage.removeItem('100gate.chapter1.save.v1');localStorage.setItem('100gate.settings.v1',JSON.stringify({quality:'medium',cameraMotion:.6}));});
await page.addInitScript(()=>{window.__introInputTrace=[];for(const type of ['blur','focus','visibilitychange','pointerlockchange','keydown','keyup'])(type==='visibilitychange'||type==='pointerlockchange'?document:window).addEventListener(type,e=>window.__introInputTrace.push({type,code:e.code,at:performance.now(),mode:window.__episodeTest?.state().mode,locked:!!document.pointerLockElement,hidden:document.hidden}));});
const state=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
let monitoring=true,monitor;
try{
 await page.goto(base);await page.getByTestId('start').waitFor({timeout:180000});
 report.environment=await page.evaluate(()=>{const c=document.querySelector('canvas'),g=c.getContext('webgl2'),d=g.getExtension('WEBGL_debug_renderer_info');return {gpu:d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),viewport:[innerWidth,innerHeight],loadMs:performance.now()};});
 await page.getByTestId('start').click();
 monitor=(async()=>{let last='';const moments=new Set([19.5,23.8,25.8,29,30.6,32.8,34.8,39]);while(monitoring){const s=await state();if(s.intro?.stage!==last){last=s.intro?.stage;const d=await page.evaluate(()=>window.__episodeTest.diagnostics());stages.push({...s.intro,wall:Date.now(),render:d.render,memory:d.memory,frameTimes:d.frameTimes});await page.screenshot({path:out+'/'+last+'.png'});}for(const t of moments)if(s.intro.time>=t){await page.screenshot({path:out+'/moment-'+t+'.png'});moments.delete(t);}await page.waitForTimeout(100);}})();
 await page.keyboard.press('KeyE');assert(!(await state()).items.includes('knife'),'Cannot take knife while bound');
 await page.keyboard.down('KeyR');await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).intro.waitingForKnife,{},{timeout:35000});await page.keyboard.up('KeyR');
 assert(!(await state()).flags.includes('free'));
 await page.keyboard.press('KeyE');await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).intro.time>=22,{},{timeout:12000});
 await page.screenshot({path:out+'/left-grip.png'});assert((await state()).items.includes('knife'));
 await page.keyboard.down('KeyR');await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).intro.time>=31,{},{timeout:15000});await page.keyboard.up('KeyR');
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).flags.includes('free'),{},{timeout:20000});
 const free=await state();report.free=free;report.freePose=await page.evaluate(()=>window.__episodeTest.state());
 assert.equal(free.intro.stage,'NORMAL_GAMEPLAY');assert(free.flags.includes('intro:leftCut'));assert(free.flags.includes('intro:rightCut'));assert(free.flags.includes('intro:ropeDrop'));
 const before=free.position;await page.keyboard.down('KeyW');await page.waitForTimeout(650);await page.keyboard.up('KeyW');
 const after=await state();report.afterWalk=after;report.inputTrace=await page.evaluate(()=>window.__introInputTrace);assert(Math.hypot(after.position[0]-before[0],after.position[2]-before[2])>.15,'Normal WASD must resume');report.walk=after.position;
 await page.keyboard.press('Escape');await page.waitForTimeout(300);assert.equal((await state()).mode,'paused');
 report.diagnostics=await page.evaluate(()=>window.__episodeTest.diagnostics());report.audio=await page.evaluate(()=>window.__episodeTest.foley());
 report.saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('100gate.chapter1.save.v1')));
 assert.equal(report.saved.intro.time,42);assert(report.saved.flags.includes('free'));
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);report.passed=true;
}catch(e){report.failure=String(e);report.failedState=await state().catch(()=>null);report.inputTrace=await page.evaluate(()=>window.__introInputTrace).catch(()=>null);report.diagnostics=await page.evaluate(()=>window.__episodeTest.diagnostics()).catch(()=>null);await page.screenshot({path:out+'/FAILURE.png'}).catch(()=>{});throw e;}
finally{
 monitoring=false;if(monitor)await monitor.catch(e=>errors.push(String(e)));
 const video=page.video();await context.close();if(video)await copyFile(await video.path(),out+'/intro-real-controls.webm');
 await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();
}
