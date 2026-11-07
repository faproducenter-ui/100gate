import {testBrowser} from './browser.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.GAME_URL??'http://127.0.0.1:5182';
assert(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const out='outputs/story-intro/street/browser';await mkdir(out,{recursive:true});
const browser=await testBrowser(),page=await browser.newPage({viewport:{width:1280,height:720}});
const report={errors:[],requests:[],shots:[]};
page.on('pageerror',e=>report.errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
page.on('response',r=>{if(r.status()>=400)report.requests.push(r.url());});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await page.addInitScript(()=>localStorage.setItem('100gate.settings.v1',JSON.stringify({quality:'low'})));
const state=()=>page.evaluate(()=>window.__storyHomeTest());
const step=ms=>page.evaluate(ms=>window.advanceTime(ms),ms);
try{
  await page.goto(base+'/?story-home=1');await page.getByTestId('start-story-home').click({timeout:60000});
  await step(0);
  const capture=async name=>{const s=await state();report.shots.push({name,...s});await page.screenshot({path:out+'/'+name+'.png'});};
  await capture('01-dialogue');await step(9000);await step(10000);
  assert.equal((await state()).beat,'WALK_TO_SHOP');
  await step(3500);await capture('02-walk');
  await step(4500);await step(2300);await capture('03-store-enter');
  await step(2700);await capture('04-2316');
  await step(3500);await capture('05-groceries');
  await step(3500);await capture('06-return');
  for(let i=0;i<12&&(await state()).beat!=='ABDUCTION';i++)await step(500);
  assert.equal((await state()).beat,'ABDUCTION','Must reach abduction, not spin past a failed boundary');
  await step(3200);await capture('07-car-exits');
  await step(1700);await capture('08-approach');
  assert((await state()).street.unknowns.every(a=>a.visible&&a.rendered),'Both skeletons must submit actual draw calls');
  await step(3100);assert((await state()).ended);await capture('09-boundary');
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);report.passed=true;
}catch(e){report.failure=String(e);await page.screenshot({path:out+'/failure.png'});throw e;}
finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();}
