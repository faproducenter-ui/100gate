/** Compare the original walk and retarget on the same timed stage in WebGL. */
import assert from 'node:assert/strict';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { testBrowser } from './browser.mjs';
const base=new URL(process.env.GAME_URL??'http://127.0.0.1:5182');
assert(['127.0.0.1','localhost','[::1]'].includes(base.hostname));
const out='outputs/quality-overhaul/gait';
await mkdir(out,{recursive:true});
const metadata=JSON.parse(await readFile(out+'/story-hero-walk-mocap.json','utf8'));
assert.equal(metadata.asset.metersPerCycle,1);
const browser=await testBrowser(),reports=[];
try{
  for(const retarget of [false,true]){
    const page=await browser.newPage({viewport:{width:960,height:540}});
    const name=retarget?'retarget':'original',report={name,frames:[],errors:[],gaits:[]};
    reports.push(report);
    try{
      await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
      await page.addInitScript(()=>localStorage.setItem('100gate.settings.v1',JSON.stringify({quality:'medium'})));
      page.on('pageerror',e=>report.errors.push(String(e)));
      page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
      page.on('response',r=>{
        if(r.status()>=400)report.errors.push(r.status()+' '+r.url());
        if(/story-hero-walk(?:-mocap)?\.glb/.test(r.url())&&r.ok())report.gaits.push(new URL(r.url()).pathname);
      });
      const url=new URL('?story-home=1'+(retarget?'&quality-motion=1':''),base);
      await page.goto(url.href);
      await page.waitForFunction(()=>typeof window.advanceTime==='function',undefined,{timeout:90000});
      await page.evaluate(()=>window.advanceTime(0));
      await page.getByTestId('start-story-home').click();
      await page.evaluate(()=>{window.advanceTime(9000);window.advanceTime(10000);window.advanceTime(2070);});
      const capture=async frame=>{
        const state=await page.evaluate(()=>window.__storyHomeTest());
        assert.equal(state.beat,'WALK_TO_SHOP');assert.equal(state.street.motion,retarget?'cmu-91-02':'original');
        assert(state.street.hero.bones>=53&&state.street.hero.skins>=2);
        report.frames.push({time:state.seconds,pose:state.street.hero.pose,feet:state.street.hero.feet,
          position:state.street.heroPosition});
        await page.screenshot({path:out+'/'+name+'-'+frame+'.png',timeout:120000});
      };
      await capture('passing');
      await page.evaluate(()=>window.advanceTime(400));
      await capture('transfer');
      assert.deepEqual(report.errors,[]);
      assert.equal(new Set(report.gaits).size,retarget?2:1);
    }finally{await page.close();}
  }
  for(let i=0;i<2;i++){
    const a=reports[0].frames[i],b=reports[1].frames[i];
    assert.deepEqual(a.position,b.position,'Root path changed');
    assert.notDeepEqual(a.pose,b.pose,'Captured poses are the same');
  }
  console.log('PASS: new gait sampled by real Three.js mixer on unchanged hero path.');
}finally{await browser.close();await writeFile(out+'/browser-report.json',JSON.stringify(reports,null,2));}
