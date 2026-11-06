/** Decode and play the actual uninterrupted game recording, not another GLB render. */
import {testBrowser} from './browser.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const out='outputs/complete-intro/game-test',b=await testBrowser();
try{
 const bytes=await readFile(out+'/intro-real-controls.webm'),sha256=createHash('sha256').update(bytes).digest('hex');
 const p=await b.newPage({viewport:{width:1280,height:720}});
 await p.route('http://127.0.0.1:5182/__intro_video__',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><head><link rel="icon" href="data:,"><style>body{margin:0;background:black}video{width:1280px;height:720px;display:block}</style></head><body></body></html>'}));
 await p.goto('http://127.0.0.1:5182/__intro_video__');
 const info=await p.evaluate(async()=>{
  const v=document.createElement('video');v.muted=true;v.src='/outputs/complete-intro/game-test/intro-real-controls.webm';document.body.append(v);
  await new Promise((ok,no)=>{v.onloadeddata=ok;v.onerror=()=>no(Error(v.error?.message??'WebM decode failed'));});
  if(!Number.isFinite(v.duration))await new Promise(ok=>{v.onseeked=ok;v.currentTime=1e9;});
  return {duration:v.duration,width:v.videoWidth,height:v.videoHeight};
 });
 assert.equal(info.width,1280);assert.equal(info.height,720);assert(info.duration>42);
 const start=Math.max(0,info.duration-44),moments=[0,10,16,19.5,23.8,25.8,27.8,29,30.6,32.8,35,38,41.5].map(t=>Math.min(info.duration-.2,start+t));
 for(let i=0;i<moments.length;i++){
  await p.evaluate(t=>new Promise(ok=>{const v=document.querySelector('video');v.onseeked=()=>requestAnimationFrame(()=>requestAnimationFrame(ok));v.currentTime=t;}),moments[i]);
  await p.screenshot({path:out+'/encoded-'+String(i).padStart(2,'0')+'.png'});
 }
 const playback=await p.evaluate(async()=>{
  const v=document.querySelector('video');await new Promise(ok=>{v.onseeked=ok;v.currentTime=0;});v.playbackRate=1;const start=performance.now();await v.play();
  await new Promise((ok,no)=>{v.onended=ok;v.onerror=()=>no(Error(v.error?.message??'Playback failed'));});
  return {wallSeconds:(performance.now()-start)/1000,playbackRate:v.playbackRate,...{decodedFrames:v.getVideoPlaybackQuality().totalVideoFrames,droppedFrames:v.getVideoPlaybackQuality().droppedVideoFrames}};
 });
 const result={sha256,bytes:bytes.length,...info,playback,moments,audioRecorded:false,note:'Actual Playwright page capture; silent. Sound-event assertions are in report.json. Visual acceptance is separate from geometry tests.'};
 await writeFile(out+'/encoded-inspection.json',JSON.stringify(result,null,2));console.log(result);
 assert(Math.abs(playback.wallSeconds-info.duration)<1);assert(playback.decodedFrames>100);
}finally{await b.close();}
