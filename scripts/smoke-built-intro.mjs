/** Actual production bundle: UI/keys only, no development pose/clock hooks. */
import {testBrowser} from './browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.argv[2]??'http://127.0.0.1:5183',out=process.env.SMOKE_OUT??'outputs/complete-intro/built-smoke';
await mkdir(out,{recursive:true});const b=await testBrowser(),report={base,errors:[],http:[],checks:[]};
try{
 const p=await b.newPage({viewport:{width:1280,height:720}});
 p.on('pageerror',e=>report.errors.push(String(e)));p.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 p.on('response',r=>{if(r.status()>=400)report.http.push({url:r.url(),status:r.status()});});
 await p.route('**/api/save',r=>{report.errors.push('Unexpected remote save call in isolated preview');return r.abort();});
 await p.addInitScript(()=>{if(!localStorage.getItem('preview-smoke-init')){localStorage.removeItem('100gate.chapter1.save.v1');localStorage.setItem('preview-smoke-init','1');}localStorage.setItem('100gate.settings.v1',JSON.stringify({quality:'low'}));});
 await p.goto(base);await p.getByTestId('start').waitFor({timeout:180000});await p.bringToFront();await p.getByTestId('start').click();
 assert(await p.evaluate(()=>!window.__episodeTest&&!window.advanceTime),'Production bundle must not expose pose/clock shortcuts');report.checks.push('Production guard: no development shortcuts');
 await p.screenshot({path:out+'/bound.png'});
 await p.keyboard.down('KeyR');await p.waitForFunction(()=>document.querySelector('.ep-prompt')?.textContent.includes('Взять нож левой рукой'),null,{timeout:50000});await p.keyboard.up('KeyR');
 await p.keyboard.press('KeyE');await p.waitForFunction(()=>document.querySelector('.ep-prompt')?.textContent.includes('Резать натянутую верёвку'),null,{timeout:18000});
 await p.keyboard.down('KeyR');await p.waitForFunction(()=>document.querySelector('.ep-objective')?.textContent.includes('Найди фонарь и ключ'),null,{timeout:40000});await p.keyboard.up('KeyR');
 report.checks.push('Full native intro with real R/E input');await p.screenshot({path:out+'/free.png'});
 await p.keyboard.down('KeyW');await p.waitForTimeout(450);await p.keyboard.up('KeyW');
 await p.keyboard.press('Escape');assert(await p.getByText('Перевести дух.',{exact:true}).isVisible());await p.keyboard.press('Escape');report.checks.push('Pause/resume');
 report.save=await p.evaluate(()=>JSON.parse(localStorage.getItem('100gate.chapter1.save.v1')));assert(report.save.flags.includes('free'));assert.equal(report.save.intro.time,42);
 await p.reload();await p.getByTestId('start').click({timeout:180000});await p.waitForFunction(()=>document.querySelector('.ep-objective')?.textContent.includes('Найди фонарь и ключ'));report.checks.push('Completed intro survives reload');
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.http,[]);report.passed=true;
}catch(e){report.failure=String(e);throw e;}
finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await b.close();}
