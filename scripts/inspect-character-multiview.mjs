/** Decode every section of the actual combined WebM before delivering it. */
import {testBrowser} from './browser.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='outputs/hand-character-review',base=process.env.GAME_URL??'http://127.0.0.1:5182';
const recording=JSON.parse(await readFile(out+'/recording.json','utf8'));
const browser=await testBrowser();
try{
 const page=await browser.newPage({viewport:{width:1280,height:960}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.route(base+'/__full_review_decode__',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><head><link rel="icon" href="data:,"><style>body{margin:0;background:#343842}video{display:block;width:1280px;height:960px}</style></head><body></body></html>'}));
 await page.goto(base+'/__full_review_decode__');
 const info=await page.evaluate(async()=>{
  const v=document.createElement('video');v.src='/outputs/hand-character-review/100gate-full-hand-character-review.webm';v.muted=true;document.body.appendChild(v);
  await new Promise((ok,no)=>{v.onloadeddata=ok;v.onerror=()=>no(Error(v.error?.message??'Video load failed'));});
  if(!Number.isFinite(v.duration))await new Promise(ok=>{v.onseeked=ok;v.currentTime=1e9;});
  return {duration:v.duration,width:v.videoWidth,height:v.videoHeight};
 });
 const expected=recording.segments.at(-1).end;assert(Math.abs(info.duration-expected)<.4);
 assert.equal(info.width,1280);assert.equal(info.height,960);
 const samples=recording.segments.map((segment,i)=>({name:`segment-${String(i).padStart(2,'0')}`,time:segment.start+segment.seconds/2,label:segment.label}));
 samples.push({name:'last-frame',time:info.duration-.15,label:'Encoded final view'});
 for(const sample of samples){
  await page.evaluate(t=>new Promise(ok=>{const v=document.querySelector('video');v.onseeked=()=>requestAnimationFrame(()=>requestAnimationFrame(ok));v.currentTime=t;}),sample.time);
  await page.screenshot({path:out+'/encoded-'+sample.name+'.png'});
 }
 assert.deepEqual(errors,[]);const report={...info,samples,errors,recordingClockSeconds:recording.timing.wallSeconds,
  scope:'Actual encoded file decoded at every section midpoint and the final section; complete current grip study, not an escape intro.'};
 await writeFile(out+'/decoded-review.json',JSON.stringify(report,null,2));console.log('Combined WebM verified:',info,'sections',recording.segments.length);
}finally{await browser.close();}
