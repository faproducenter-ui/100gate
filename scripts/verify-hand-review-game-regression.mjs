/** Existing production-asset gameplay must remain untouched by the art study. */
import {testBrowser} from './browser.mjs';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await testBrowser(),out='outputs/hand-mesh-rework';
try{
 const page=await browser.newPage({viewport:{width:1024,height:768}}),errors=[],checks=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/api/save',r=>r.fulfill({status:200,json:{ok:true}}));
 await page.addInitScript(()=>localStorage.setItem('100gate.settings.v1',JSON.stringify({quality:'low'})));
 await page.goto(process.env.GAME_URL??'http://127.0.0.1:5182/');
 await page.getByTestId('start').click({timeout:80000});
 const state=()=>page.evaluate(()=>window.__episodeTest.state());
 const hold=async flag=>{await page.keyboard.down('KeyR');try{await page.waitForFunction(flag=>window.__episodeTest.state().save.flags.includes(flag),flag,{timeout:30000});}finally{await page.keyboard.up('KeyR');}};
 assert.equal((await state()).mode,'playing');checks.push('existing intro starts');
 await hold('chairTipped');checks.push('chair rocking/tipping still works');
 await page.waitForFunction(()=>window.__episodeTest.introView().slip>=.8);
 await page.keyboard.press('KeyE');
 await page.waitForFunction(()=>window.__episodeTest.state().save.items.includes('knife')&&window.__episodeTest.introView().pickup<0);
 checks.push('existing knife pickup sequence intact');
 await hold('free');await page.waitForFunction(()=>window.__episodeTest.introView().eye[1]>5.15);checks.push('existing release/standing sequence intact (not visual acceptance)');
 await page.keyboard.press('Escape');assert.equal((await state()).mode,'paused');
 const position=(await state()).position;await page.keyboard.down('KeyW');await page.waitForTimeout(300);await page.keyboard.up('KeyW');assert.deepEqual((await state()).position,position);
 await page.keyboard.press('Escape');assert.equal((await state()).mode,'playing');checks.push('pause/resume intact');
 assert.deepEqual(errors,[]);await page.screenshot({path:out+'/existing-game-regression.png'});
 await writeFile(out+'/existing-game-regression.json',JSON.stringify({checks,errors,scope:'Existing game assets/intro are not replaced by the isolated hand study.'},null,2));console.log(checks);
}finally{await browser.close();}
