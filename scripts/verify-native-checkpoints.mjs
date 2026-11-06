import {testBrowser} from './browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='outputs/complete-intro/regression',base=process.env.GAME_URL??'http://127.0.0.1:3000';await mkdir(out,{recursive:true});const b=await testBrowser(),report={};
try{
 for(const mobile of [false,true]){
  const c=await b.newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:720},hasTouch:mobile,isMobile:mobile});
  const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(String(e)));
  await p.addInitScript(()=>{if(!localStorage.getItem('native-test-init')){localStorage.removeItem('100gate.chapter1.save.v1');localStorage.setItem('native-test-init','1');}localStorage.setItem('100gate.settings.v1',JSON.stringify({quality:'low'}));});
  await p.route('**/api/save',r=>r.fulfill({status:200,json:{ok:true}}));
  await p.goto(base);await p.getByTestId('start').click({timeout:180000});
  const state=()=>p.evaluate(()=>JSON.parse(window.render_game_to_text()));
  const step=ms=>p.evaluate(ms=>window.advanceTime(ms),ms);
  const hold=async down=>{if(!mobile)return down?p.keyboard.down('KeyR'):p.keyboard.up('KeyR');if(down){const r=await p.getByRole('button',{name:'Удерживать',exact:true}).boundingBox();await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down();}else await p.mouse.up();};
  await hold(true);await step(10000);await step(7000);await hold(false);assert.equal((await state()).intro.time,16.5);
  assert(!(await p.evaluate(()=>window.__episodeTest.diagnostics().keys)).includes('KeyR'));
  await p.keyboard.press('Escape');const paused=(await state()).intro.time;await step(5000);assert.equal((await state()).intro.time,paused);await p.keyboard.press('Escape');
  if(mobile)await p.getByRole('button',{name:'Действие',exact:true}).click();else await p.keyboard.press('KeyE');await step(6500);
  assert.equal((await state()).intro.time,22);assert.equal((await state()).items.filter(x=>x==='knife').length,1);
  await hold(true);await step(2000);await hold(false);const checkpoint=(await state()).intro;assert(checkpoint.leftDraw>.1);
  await p.keyboard.press('Escape');await p.reload();await p.getByTestId('start').click({timeout:180000});
  const restored=(await state()).intro;assert(Math.abs(restored.time-checkpoint.time)<.1);assert(restored.leftDraw>=checkpoint.leftDraw-.001);
  await hold(true);await step(10000);await hold(false);await step(10000);await step(10000);
  const final=await state();assert(final.flags.includes('free'));assert.equal(final.intro.stage,'NORMAL_GAMEPLAY');assert.equal(final.items.filter(x=>x==='knife').length,0,'Knife is on the floor after rope removal');
  await p.evaluate(()=>window.__episodeTest.aim('knife'));await step(17);
  assert.equal((await state()).target,'knife','The native floor knife must be reachable: '+JSON.stringify(await p.evaluate(()=>({state:window.__episodeTest.state(),diagnostics:window.__episodeTest.diagnostics()}))));
  await p.keyboard.press('KeyE');await p.keyboard.press('KeyE');
  assert.equal((await state()).items.filter(x=>x==='knife').length,1);
  await p.keyboard.press('Escape');await p.reload();await p.getByTestId('start').click({timeout:180000});
  await p.evaluate(()=>window.__episodeTest.aim('knife'));await step(17);
  assert.notEqual((await state()).target,'knife','Reload must not respawn the taken native knife');
  assert.deepEqual(errors,[]);await p.screenshot({path:out+'/'+(mobile?'mobile':'desktop')+'-complete.png'});
  report[mobile?'mobile':'desktop']={checkpoint,restored,final,errors};await c.close();
 }
 await writeFile(out+'/checkpoints.json',JSON.stringify(report,null,2));console.log('PASS desktop/mobile input, pause, exact checkpoint and draw restore, no duplicate knife, full release.');
}finally{await b.close();}
