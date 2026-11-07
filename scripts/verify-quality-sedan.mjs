/** Real Three.js before/after frames for the two-door vehicle study. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {testBrowser} from './browser.mjs';
const base=new URL(process.env.GAME_URL??'http://127.0.0.1:5182');
assert(['127.0.0.1','localhost','[::1]'].includes(base.hostname));
const out='outputs/quality-overhaul/vehicle';
const asset=JSON.parse(await readFile(out+'/story-sedan.json','utf8'));
assert.equal(asset.license,'CC0-1.0');
assert(asset.gltf.primitives<=100);
for(const door of Object.values(asset.doors)){
  assert.equal(door.closed.length,9);assert.equal(door.open.length,9);
  assert(door.closed.every(ray=>ray.doorHit&&!ray.shellHit));
  assert(door.open.every(ray=>!ray.doorHit&&!ray.shellHit));
}
const browser=await testBrowser(),reports=[];
try{
  for(const candidate of [false,true]){
    const page=await browser.newPage({viewport:{width:960,height:540}});
    const label=candidate?'candidate':'baseline',report={label,errors:[],sedanRequests:[],frames:[]};
    reports.push(report);
    try{
      await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
      await page.addInitScript(()=>localStorage.setItem('100gate.settings.v1',JSON.stringify({quality:'medium'})));
      page.on('pageerror',e=>report.errors.push(String(e)));
      page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
      page.on('response',r=>{
        if(r.status()>=400)report.errors.push(r.status()+' '+r.url());
        if(r.url().includes('/vehicle/story-sedan.glb')&&r.ok())report.sedanRequests.push(new URL(r.url()).pathname);
      });
      await page.goto(new URL('?story-home=1'+(candidate?'&quality-car=1':''),base).href);
      await page.waitForFunction(()=>typeof window.advanceTime==='function',undefined,{timeout:90000});
      await page.evaluate(()=>window.advanceTime(0));await page.getByTestId('start-story-home').click();
      await page.evaluate(()=>{for(const ms of [9000,10000,8000,3000,2000,2000,3000,8000])window.advanceTime(ms);});
      const advance=ms=>page.evaluate(ms=>{window.advanceTime(ms);return window.__storyHomeTest().street;},ms);
      const frame=async (name,ms)=>{
        const s=await advance(ms);
        assert.equal(s.beat,'ABDUCTION');assert.equal(!!s.sedan,candidate);
        report.frames.push({name,carX:s.carX,open:s.carOpen,sedan:s.sedan});
        await page.screenshot({path:`${out}/${label}-${name}.png`,timeout:120000});
        return s;
      };
      const approach=await frame('approach',960);
      const closed=await frame('stopped',1100);
      const opened=await frame('open',1140);
      assert(approach.carX<closed.carX);assert.equal(closed.carX,opened.carX);
      if(candidate){
        assert.notDeepEqual(approach.sedan.wheels,closed.sedan.wheels);
        assert.deepEqual(closed.sedan.wheels,opened.sedan.wheels);
        assert.deepEqual(closed.sedan.angles,[0,0]);
        assert(Math.abs(opened.sedan.angles[0]+1.08)<1e-5&&Math.abs(opened.sedan.angles[1]-1.08)<1e-5);
      }
      assert.deepEqual(report.errors,[]);
      assert.deepEqual([...new Set(report.sedanRequests)],candidate?['/outputs/quality-overhaul/vehicle/story-sedan.glb']:[]);
      report.passed=true;
    }catch(error){report.failure=String(error);throw error;}
    finally{await page.close();}
  }
  console.log('PASS: new sedan loaded, both hinges move after braking, wheel spin follows distance.');
}finally{await browser.close();await writeFile(out+'/browser-report.json',JSON.stringify(reports,null,2));}
