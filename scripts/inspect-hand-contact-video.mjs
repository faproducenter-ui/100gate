/** Decode the actual delivered WebM, not another render of the GLB. */
import {testBrowser} from './browser.mjs';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='outputs/hand-mesh-rework',base=process.env.GAME_URL??'http://127.0.0.1:5182';
const browser=await testBrowser();
try{
 const page=await browser.newPage({viewport:{width:1024,height:768}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.route(base+'/__encoded_hand_contact__',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><head><link rel="icon" href="data:,"><style>body{margin:0;background:#343842}video{display:block;width:1024px;height:768px}</style></head><body></body></html>'}));
 await page.goto(base+'/__encoded_hand_contact__');
 const info=await page.evaluate(async()=>{
  const v=document.createElement('video');v.muted=true;v.src='/outputs/hand-mesh-rework/hand-contact-slow-360.webm';document.body.appendChild(v);
  await new Promise((ok,no)=>{v.onloadeddata=ok;v.onerror=()=>no(Error('WebM decode failed'));});
  if(!Number.isFinite(v.duration)){await new Promise(ok=>{v.onseeked=ok;v.currentTime=1e9;});}
  await new Promise(ok=>{v.onseeked=ok;v.currentTime=0;});
  return {duration:v.duration,width:v.videoWidth,height:v.videoHeight};
 });
 assert(info.duration>59.8&&info.duration<60.3);
 const moments=[.2,2,3.5,4.875,6.25,7.625,8.5,10,11.5,12.5,15,18,21,24,27,29.5,32,35,38,41,44,47,50,53,56,59];
 for(let i=0;i<moments.length;i++){
  await page.evaluate(t=>new Promise(ok=>{const v=document.querySelector('video');v.onseeked=()=>requestAnimationFrame(()=>requestAnimationFrame(ok));v.currentTime=t;}),moments[i]);
  await page.screenshot({path:out+`/encoded-${String(i).padStart(2,'0')}.png`});
 }
 const playback=await page.evaluate(async()=>{
  const v=document.querySelector('video');v.currentTime=0;v.playbackRate=1;
  const start=performance.now();await v.play();
  await new Promise((ok,no)=>{v.onended=ok;v.onerror=()=>no(Error('Playback decode failed'));});
  const q=v.getVideoPlaybackQuality();return {wallSeconds:(performance.now()-start)/1000,playbackRate:v.playbackRate,
   decodedFrames:q.totalVideoFrames,droppedFrames:q.droppedVideoFrames,error:v.error?.message??null};
 });
 assert(Math.abs(playback.wallSeconds-info.duration)<1,'Encoded movie did not play at 1x');assert.deepEqual(errors,[]);
 const report={...info,playback,moments,errors,qualification:'Decoded stills plus full 1x playback. Artistic acceptance is separate from mesh-test results.'};
 await writeFile(out+'/encoded-video-inspection.json',JSON.stringify(report,null,2));console.log(report);
}finally{await browser.close();}
