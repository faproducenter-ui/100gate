import {testBrowser} from './browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='outputs/cinematic-intro/continuous-performance';await mkdir(out,{recursive:true});
const browser=await testBrowser();
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.route('**/api/save',r=>r.fulfill({status:200,json:{ok:true}}));
 await page.addInitScript(()=>{if(!localStorage.getItem('100gate.settings.v1'))localStorage.setItem('100gate.settings.v1',JSON.stringify({quality:'low',headBob:false}));});
 await page.goto('http://127.0.0.1:5182/');await page.getByTestId('start').waitFor({timeout:90000});
 await page.getByRole('button',{name:'Настройки',exact:true}).click();
 const slider=page.getByRole('slider',{name:'Движение камеры',exact:true});
 assert.equal(await slider.inputValue(),'1','Legacy settings must retain the previous default motion');
 await slider.evaluate(el=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'0.35');el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('100gate.settings.v1')).cameraMotion===.35);
 await page.screenshot({path:out+'/camera-motion-settings.png'});
 await page.reload();await page.getByTestId('start').waitFor({timeout:90000});await page.getByRole('button',{name:'Настройки',exact:true}).click();
 assert.equal(await page.getByRole('slider',{name:'Движение камеры',exact:true}).inputValue(),'0.35');
 assert.deepEqual(errors,[]);await writeFile(out+'/camera-motion-settings.json',JSON.stringify({legacyDefault:1,persisted:.35,errors},null,2));
 console.log('PASS camera motion legacy defaults, real UI, persistence, no page errors.');
}finally{await browser.close();}
