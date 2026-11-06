/** Decode and play the actual four review WebMs, including encoded Foley. */
import {testBrowser} from './browser.mjs';
import {readFile,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const out=process.env.REVIEW_OUT??'outputs/cinematic-intro/continuous-performance',base=process.env.GAME_URL??'http://127.0.0.1:5182';
const review=JSON.parse(await readFile(out+'/review.json','utf8'));assert.equal(review.files.length,4);
await rm(out+'/encoded-reviews.json',{force:true});const browser=await testBrowser();
try{
 const page=await browser.newPage({viewport:{width:1280,height:780}}),results=[];
 await page.route(base+'/__inspect_rock__',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><head><link rel="icon" href="data:,"><style>body{margin:0;background:#343842}video{width:1280px;display:block}</style></head><body></body></html>'}));
 await page.goto(base+'/__inspect_rock__');
 for(const file of review.files){
  const sha=createHash('sha256').update(await readFile(out+'/'+file.name+'.webm')).digest('hex');assert.equal(sha,file.sha256);
  const info=await page.evaluate(async ({name,rate,out})=>{
   document.querySelector('video')?.remove();const v=document.createElement('video');v.muted=true;v.src='/'+out+'/'+name+'.webm';document.body.append(v);
   await new Promise((ok,no)=>{v.onloadeddata=ok;v.onerror=()=>no(Error(v.error?.message??'Decode failed'));});
   if(!Number.isFinite(v.duration))await new Promise(ok=>{v.onseeked=ok;v.currentTime=1e9;});
   let peak=null,rms=null;
   if(rate===1){const c=new AudioContext();const sound=await c.decodeAudioData(await(await fetch(v.src)).arrayBuffer());let energy=0;peak=0;for(let channel=0;channel<sound.numberOfChannels;channel++)for(const sample of sound.getChannelData(channel)){peak=Math.max(peak,Math.abs(sample));energy+=sample*sample;}rms=Math.sqrt(energy/(sound.length*sound.numberOfChannels));await c.close();}
   return {duration:v.duration,width:v.videoWidth,height:v.videoHeight,audioPeak:peak,audioRms:rms};
  },{name:file.name,rate:file.rate,out});
  assert.equal(info.width,1280);assert.equal(info.height,file.mode==='compare'?1440:720);
  assert(Math.abs(info.duration-file.wallSeconds)<.8);
  if(file.rate===1)assert(info.audioPeak>.005,'Recorded Foley is absent');
  const sourceMoments=[11.8,12.5,15.4].filter(t=>t<file.end);
  for(const sourceTime of sourceMoments){const t=(sourceTime-file.start)/file.rate;
   await page.evaluate(t=>new Promise(ok=>{const v=document.querySelector('video');v.onseeked=()=>setTimeout(ok,35);v.currentTime=t;}),t);
   await page.screenshot({path:out+'/encoded-'+file.name+'-'+sourceTime+'.png',fullPage:true});
  }
  const play=await page.evaluate(async()=>{
   const v=document.querySelector('video');v.currentTime=0;v.playbackRate=1;const start=performance.now();await v.play();await new Promise((ok,no)=>{v.onended=ok;v.onerror=no;});
   return {wallSeconds:(performance.now()-start)/1000,playbackRate:v.playbackRate,decodedFrames:v.getVideoPlaybackQuality().totalVideoFrames};
  });
  assert(Math.abs(play.wallSeconds-info.duration)<1);assert(play.decodedFrames>50);
  results.push({name:file.name,sourceRate:file.rate,sha256:sha,...info,play});console.log('Decoded/played',file.name,info.duration,'s; source rate',file.rate);
 }
 await writeFile(out+'/encoded-reviews.json',JSON.stringify({scope:review.scope,results},null,2));
}finally{await browser.close();}
