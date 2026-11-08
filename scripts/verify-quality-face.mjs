import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {testBrowser} from './browser.mjs';
const base=new URL(process.env.GAME_URL??'http://127.0.0.1:5182');
assert(['127.0.0.1','localhost'].includes(base.hostname));
const out='outputs/quality-overhaul/dialogue/browser';
await mkdir(out,{recursive:true});
const browser=await testBrowser(),report={checks:[],errors:[]};
try{
  for(const face of [false,true]){
    const page=await browser.newPage({viewport:{width:800,height:450}});
    try{
      page.on('pageerror',e=>report.errors.push(String(e)));
      page.on('console',e=>{if(e.type()==='error')report.errors.push(e.text());});
      page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
      await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
      await page.goto(new URL('?story-home=1&quality-face-camera=1'+(face?'&quality-face=1':''),base).href);
      await page.waitForFunction(()=>typeof window.advanceTime==='function',undefined,{timeout:90000});
      await page.evaluate(()=>window.advanceTime(0));
      await page.getByTestId('start-story-home').click();
      let elapsed=0;
      for(const [label,t,role,shape,min] of [
        ['alexei-blink',450,0,'eyeBlinkLeft',.85],
        ['alexei-speech',1120,0,'jawOpen',.12],
        ['partner-speech',4370,1,'jawOpen',.12],
        ['partner-blink',5160,1,'eyeBlinkLeft',.85],
      ]){
        const s=await page.evaluate(dt=>{window.advanceTime(dt);return window.__storyHomeTest();},t-elapsed);
        elapsed=t;
        const a=s.actors[role],other=s.actors[1-role];
        assert.equal(s.beat,'DIALOGUE');assert.equal(a.bones,53);
        if(face){
          assert(a.face[shape]>min);
          if(shape==='jawOpen')assert.equal(other.face.jawOpen,0);
          const before=report.checks.find(x=>!x.face&&x.label===label);
          assert(a.pose.every((v,i)=>Math.abs(v-before.pose[i])<.0005));
        }else assert(!a.face);
        report.checks.push({face,label,pose:a.pose,shapes:a.face});
        await page.screenshot({path:`${out}/${label}-${face?'face':'baseline'}.png`,timeout:120000});
      }
    }finally{await page.close();}
  }
  assert.deepEqual(report.errors,[]);report.passed=true;
  console.log('PASS: both existing home actors use native facial targets at the intended cues.');
}catch(error){report.failure=String(error);throw error;}
finally{await browser.close();await writeFile(out+'/report.json',JSON.stringify(report,null,2));}
