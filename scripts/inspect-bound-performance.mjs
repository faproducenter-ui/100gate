/** Decode/play the actual partial WebM, not another render of its GLB. */
import {testBrowser} from './browser.mjs';
import {writeFile,readFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const base=process.env.GAME_URL??'http://127.0.0.1:5182',out='outputs/cinematic-intro/bound-performance';
const browser=await testBrowser();
const clock=JSON.parse(await readFile(out+'/recording-clock.json','utf8'));
await rm(out+'/encoded-review.json',{force:true});
const videoSha256=createHash('sha256').update(await readFile(out+'/bound-idle-struggle-ONLY.webm')).digest('hex');
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 await page.route(base+'/__bound_decode__',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><head><link rel="icon" href="data:,"><style>body{margin:0;background:#343842}video{display:block;width:1280px;height:720px}</style></head><body></body></html>'}));
 await page.goto(base+'/__bound_decode__');
 const info=await page.evaluate(async()=>{
  const v=document.createElement('video');v.muted=true;v.src='/outputs/cinematic-intro/bound-performance/bound-idle-struggle-ONLY.webm';document.body.appendChild(v);
  await new Promise((ok,no)=>{v.onloadeddata=ok;v.onerror=()=>no(Error(v.error?.message??'Decode failed'));});
  if(!Number.isFinite(v.duration))await new Promise(ok=>{v.onseeked=ok;v.currentTime=1e9;});
  return {duration:v.duration,width:v.videoWidth,height:v.videoHeight};
 });
 console.log('Encoded partial WebM metadata:',info);
 await writeFile(out+'/encoded-metadata.json',JSON.stringify(info,null,2));
 // Compare with the measured capture clock. GPU stalls can extend a view;
 // never speed the actor up or silently trim those frames to force 48.0 s.
 assert(Math.abs(info.duration-clock.wallSeconds)<.8);assert.equal(info.width,1280);assert.equal(info.height,720);
 const moments=[1,8,13,20,25,32,37,44,47.5];
 for(const t of moments){await page.evaluate(t=>new Promise(ok=>{const v=document.querySelector('video');v.onseeked=()=>requestAnimationFrame(()=>requestAnimationFrame(ok));v.currentTime=t;}),t);await page.screenshot({path:out+'/encoded-'+t+'.png'});}
 const playback=await page.evaluate(async()=>{
  const v=document.querySelector('video');v.currentTime=0;v.playbackRate=1;const start=performance.now();await v.play();
  await new Promise((ok,no)=>{v.onended=ok;v.onerror=()=>no(Error(v.error?.message??'Playback failed'));});
  const q=v.getVideoPlaybackQuality();return {wallSeconds:(performance.now()-start)/1000,decodedFrames:q.totalVideoFrames,droppedFrames:q.droppedVideoFrames,rate:v.playbackRate};
 });
 assert(Math.abs(playback.wallSeconds-info.duration)<1);assert(playback.decodedFrames>300);
 await writeFile(out+'/encoded-review.json',JSON.stringify({partial:true,videoSha256,scope:'Only native BoundChairIdle/ChairStruggle; no full escape or gameplay integration',...info,playback,moments,recordingClock:clock},null,2));
 console.log('Decoded and played actual partial WebM at 1x:',info,playback);
}finally{await browser.close();}
