/** Verify the corrected native sweater in the actual Three.js attic route. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {testBrowser} from '../browser.mjs';

const base=new URL(process.env.GAME_URL??'http://127.0.0.1:5182');
assert(['127.0.0.1','localhost'].includes(base.hostname));
const out='outputs/quality-overhaul/sleeves';
await mkdir(out,{recursive:true});
const browser=await testBrowser();
const result=[];
try {
  for(const candidate of [false,true]){
    const page=await browser.newPage({viewport:{width:1280,height:720}});
    const variant=candidate?'corrected':'original';
    const report={variant,errors:[],requests:[],pose:[]};
    result.push(report);
    page.on('pageerror',e=>report.errors.push(String(e)));
    page.on('console',e=>{if(e.type()==='error')report.errors.push(e.text());});
    page.on('response',r=>{
      if(r.status()>=400)report.errors.push(r.status()+' '+r.url());
      if(r.ok()&&r.url().includes('story-upright-escape.glb'))report.requests.push(new URL(r.url()).pathname);
    });
    await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
    await page.addInitScript(()=>localStorage.setItem('100gate.settings.v1',JSON.stringify({quality:'low',cameraMotion:.55})));
    const state=()=>page.evaluate(()=>window.__storyHomeTest());
    const step=ms=>page.evaluate(ms=>window.advanceTime(ms),ms);
    try{
      await page.goto(new URL('?story-intro=1'+(candidate?'&quality-sleeves=1':''),base).href);
      await page.waitForFunction(()=>typeof window.advanceTime==='function',undefined,{timeout:90000});
      await step(0);
      await page.getByTestId('start-story-home').click();
      await page.getByTestId('story-skip').click();
      for(let i=0;i<120&&!(await state()).escape;i++){
        await step(0);await page.waitForTimeout(200);
      }
      assert.equal((await state()).beat,'REACH');
      const shot=async label=>{
        const s=await state();report.pose.push({label,...s.escape,beat:s.beat,free:s.free});
        await page.screenshot({path:`${out}/browser-${label}-${variant}.png`,timeout:90000});
      };
      await page.keyboard.down('KeyR');
      await step(1450);await shot('left-elbow');
      await step(2000);await page.keyboard.up('KeyR');
      assert.equal((await state()).beat,'RIGHT_CUT');
      await page.keyboard.down('KeyR');await step(1650);await shot('right-elbow-cut');
      await step(2600);await page.keyboard.up('KeyR');
      assert.equal((await state()).escape.cutVerified,true);
      await step(900);await shot('left-elbow-set-down');
      await step(8000);
      const end=await state();
      assert.equal(end.beat,'FREE');assert.equal(end.free,true);
      const expected=candidate?'/outputs/quality-overhaul/sleeves/':'/outputs/story-intro/escape/';
      assert.deepEqual(report.requests,[expected+'story-upright-escape.glb']);
      assert.deepEqual(report.errors,[]);
      report.passed=true;
    }catch(e){
      report.failure=String(e);
      throw e;
    }finally{await page.close();}
  }
  for(let i=0;i<3;i++){
    assert.deepEqual(result[0].pose[i].eye,result[1].pose[i].eye);
    assert.deepEqual(result[0].pose[i].knife,result[1].pose[i].knife);
  }
  console.log('PASS: both wardrobe variants load; matched views, no errors, same eye and knife, real R reaches FREE.');
}finally{
  await browser.close();
  await writeFile(out+'/browser-sleeve-report.json',JSON.stringify(result,null,2)+'\n');
}
