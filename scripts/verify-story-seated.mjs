import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {testBrowser} from './browser.mjs';
const base=new URL(process.env.GAME_URL??'http://127.0.0.1:5182');
assert(['127.0.0.1','localhost'].includes(base.hostname));
const out='outputs/story-intro/escape/browser';
await mkdir(out,{recursive:true});
const b=await testBrowser();
const report=[];
try{
for(const mobile of process.env.TEST_DESKTOP_ONLY==='1'?[false]:[false,true]){
  const ctx=await b.newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:720},hasTouch:mobile,isMobile:mobile});
  const page=await ctx.newPage(),r={mobile,errors:[],badRequests:[],shots:[]};
  report.push(r);
  page.on('pageerror',e=>r.errors.push(String(e)));
  page.on('console',e=>{if(e.type()==='error')r.errors.push(e.text());});
  page.on('response',res=>{if(res.status()>=400)r.badRequests.push(res.url());});
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({status:200,contentType:'text/css',body:''}));
  await page.route('**/api/save',route=>{r.badRequests.push(route.request().url());return route.abort();});
  await page.addInitScript(()=>{localStorage.setItem('100gate.chapter1.save.v1','do-not-touch');localStorage.setItem('100gate.settings.v1',JSON.stringify({quality:'low',cameraMotion:.35}));});
  const state=()=>page.evaluate(()=>window.__storyHomeTest());
  const step=ms=>page.evaluate(ms=>window.advanceTime(ms),ms);
  const shot=async(name)=>{r.shots.push({name,...await state()});await page.screenshot({path:out+'/'+(mobile?'touch-':'')+name+'.png'});};
  const hold=async on=>{
    if(!mobile)return on?page.keyboard.down('KeyR'):page.keyboard.up('KeyR');
    if(!on)return page.mouse.up();
    const button=await page.getByTestId('story-hold').locator('button').boundingBox();
    assert(button);await page.mouse.move(button.x+button.width/2,button.y+button.height/2);await page.mouse.down();
  };
  try{
    await page.goto(new URL('?story-intro=1',base).href);
    await page.getByTestId('start-story-home').click({timeout:60000});
    if(mobile)await page.getByTestId('story-skip').click();
    else for(let i=0;i<6;i++)await step(10000);
    for(let i=0;i<45&&!(await state()).escape;i++){await step(0);await page.waitForTimeout(250);}
    assert((await state()).escape,'Upright clip must load in the actual attic');
    if(!mobile){await step(1700);await shot('01-bound');await step(3200);await shot('01b-rear-hitches');await step(10000);}
    const start=await state();assert.equal(start.beat,'REACH');
    assert.equal(start.flow.seconds,0);assert.equal(start.flow.rightAnchored,true);
    await shot('02-knife-floor');
    await page.keyboard.press('KeyE');await step(600);
    assert.equal((await state()).seconds,0,'E must not take the knife');
    await hold(true);await step(850);await hold(false);await shot('03-reaching');
    const paused=await state();await step(1000);assert.deepEqual(await state(),paused);
    if(!mobile)await page.keyboard.down('KeyR');
    await page.getByTestId('story-home-pause').click();await step(1000);
    assert.equal((await state()).seconds,paused.seconds);
    await page.getByTestId('story-home-pause').click();
    if(!mobile){
      await page.keyboard.down('KeyR'); // autorepeat of the already-held key
      await step(150);
      assert.equal((await state()).seconds,paused.seconds,'Autorepeat after pause must not reactivate R');
      await page.keyboard.up('KeyR');
    }
    await hold(true);await step(3000);await hold(false);
    assert.equal((await state()).beat,'RIGHT_CUT');
    assert.equal((await state()).seconds,0);await shot('04-grip');
    await hold(true);await step(2500);await shot('05-working-edge');
    const middle=await state();assert(middle.escape.cutDraw>0&&middle.flow.rightAnchored);
    await step(1700);await hold(false);await shot('06-cut-release');
    assert.equal((await state()).flow.rightAnchored,false);
    await step(6900);await shot('07-free');
    assert.equal((await state()).free,true);
    const feet=(await state()).position;
    if(mobile){
      const rect=await page.getByTestId('joystick').boundingBox();
      await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);
      await page.mouse.down();await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2-38);await step(480);await page.mouse.up();
    }else {await page.keyboard.down('KeyW');await step(480);await page.keyboard.up('KeyW');}
    const moved=(await state()).position;
    assert(Math.hypot(moved[0]-feet[0],moved[2]-feet[2])>.15,'Original controller must actually move the player');
    assert.equal(await page.evaluate(()=>localStorage.getItem('100gate.chapter1.save.v1')),'do-not-touch');
    assert.deepEqual(r.errors,[]);assert.deepEqual(r.badRequests,[]);
    r.passed=true;
  }catch(e){r.error=String(e);r.last=await state().catch(()=>null);await page.screenshot({path:out+'/failure.png'}).catch(()=>{});throw e;}
  finally{await ctx.close();}
}
}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await b.close();}
