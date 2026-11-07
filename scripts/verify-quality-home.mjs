/** Matched Three.js review frames and apartment continuity checks, local only. */
import assert from 'node:assert/strict';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { testBrowser } from './browser.mjs';

const base=new URL(process.env.GAME_URL??'http://127.0.0.1:5182');
assert(['127.0.0.1','localhost','[::1]'].includes(base.hostname));
const out='outputs/quality-overhaul/home';
await mkdir(out,{recursive:true});
const old=JSON.parse(await readFile('outputs/story-intro/home/story-home.json','utf8'));
const next=JSON.parse(await readFile(out+'/story-home.json','utf8'));
for(const id of Object.keys(old.markers)){
  for(const field of ['translation','rotation','scale','blenderMeters','extras']){
    assert.deepEqual(next.markers[id][field],old.markers[id][field],id+' '+field);
  }
}
assert.deepEqual(next.exitPathBlenderMeters,old.exitPathBlenderMeters);
assert(next.city.nearFacadeY.every(y=>y-next.city.windowWallY>6));
assert(next.city.farFacadeY.every(y=>y>Math.max(...next.city.nearFacadeY)));
assert(next.gltf.primitives<65&&next.gltf.triangles<46000&&next.gltf.bytes<7_600_000,
  'Environment pass exceeded the local preview budget');

const browser=await testBrowser(),reports=[];
try{
  for(const quality of [false,true]){
    const page=await browser.newPage({viewport:{width:1120,height:700}});
    const name=quality?'candidate':'baseline',report={name,errors:[],missing:[],assets:[]};
    reports.push(report);
    try{
      await page.route('**/*',route=>{
        const url=new URL(route.request().url());
        if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
        if(url.origin===base.origin&&!url.pathname.startsWith('/api/'))return route.continue();
        report.errors.push('Unexpected request '+url.origin+url.pathname);
        return route.abort();
      });
      page.on('pageerror',e=>report.errors.push(String(e)));
      page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
      page.on('response',r=>{
        if(r.status()>=400)report.missing.push(r.url());
        if(r.url().includes('story-home.glb')&&r.ok())report.assets.push(new URL(r.url()).pathname);
      });
      await page.addInitScript(()=>localStorage.setItem('100gate.settings.v1',JSON.stringify({quality:'medium'})));
      await page.goto(new URL('?story-home=1'+(quality?'&quality-pass=1':''),base).href);
      await page.waitForFunction(()=>typeof window.advanceTime==='function',undefined,{timeout:90000});
      await page.evaluate(()=>window.advanceTime(0));
      await page.getByTestId('start-story-home').click();
      await page.evaluate(()=>window.advanceTime(3200));
      await page.screenshot({path:out+'/'+name+'-dialogue.png'});
      await page.evaluate(()=>{window.advanceTime(10000);window.advanceTime(3900);});
      const state=await page.evaluate(()=>window.__storyHomeTest());
      assert.equal(state.beat,'HOME_EXIT');assert(state.door>1.3);
      report.exit={seconds:state.seconds,door:state.door,actors:state.actors.length};
      await page.screenshot({path:out+'/'+name+'-exit.png'});
      assert.deepEqual([...new Set(report.assets)],[quality?
        '/outputs/quality-overhaul/home/story-home.glb':'/outputs/story-intro/home/story-home.glb']);
      assert.deepEqual(report.errors,[]);assert.deepEqual(report.missing,[]);
      report.passed=true;
    }catch(error){
      report.failure=String(error);
      await page.screenshot({path:out+'/'+name+'-failure.png'}).catch(()=>{});
      throw error;
    }finally{await page.close();}
  }
  console.log('PASS: matched apartment shots, unchanged camera/door/exit contract, real GLB requests and no console errors.');
}finally{
  await browser.close();
  await writeFile(out+'/browser-report.json',JSON.stringify({reports,old:old.gltf,candidate:next.gltf,city:next.city},null,2));
}
