/** Run only on a host cleared for recording and FFmpeg. Records the real game title and its sound. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {testBrowser} from './browser.mjs';
import {installStoryRecording} from './browser-story-recording.mjs';

const origin=new URL(process.env.GAME_URL??'http://127.0.0.1:5189/');
assert(['127.0.0.1','localhost'].includes(origin.hostname));
const out='outputs/isometric/menu-record',errors=[],viewport={width:960,height:540};
await mkdir(out,{recursive:true});
const browser=await testBrowser();
try{
  const context=await browser.newContext({viewport,recordVideo:{dir:out,size:viewport}});
  const page=await context.newPage(),video=page.video();
  await installStoryRecording(page,out+'/menu.pcm');
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
  page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+': '+r.url());});
  await page.goto(origin.href,{waitUntil:'domcontentloaded'});
  await page.getByTestId('iso-title').waitFor({timeout:30000});
  // The browser requires a user gesture to unlock the actual game audio.
  await page.mouse.click(viewport.width-32,viewport.height-28);
  const audioStart=Date.now();
  await page.waitForTimeout(61500);
  assert(await page.getByTestId('iso-title').isVisible());
  const media=await page.evaluate(()=>window.__finishStoryMedia());
  assert(media.frames/media.rate>=60);
  assert.deepEqual(errors,[]);
  await context.close();
  const raw=await video.path();
  const duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration',
    '-of','default=noprint_wrappers=1:nokey=1',raw],{encoding:'utf8'}).trim());
  const seek=Math.max(0,duration-61);
  const target=out+'/100gate-menu-60s.webm';
  execFileSync('ffmpeg',['-y','-v','error','-ss',String(seek),'-i',raw,'-f','s16le','-ar',String(media.rate),
    '-ac','2','-i',out+'/menu.pcm','-map','0:v:0','-map','1:a:0','-t','60',
    '-c:v','libvpx-vp9','-deadline','good','-cpu-used','4','-threads','2','-crf','30','-b:v','0','-c:a','libopus',target]);
  execFileSync('ffmpeg',['-v','error','-i',target,'-f','null','-']);
  await writeFile(out+'/report.json',JSON.stringify({media,errors,rawDuration:duration,sourceAudioStarted:audioStart,target},null,2));
}finally{await browser.close();}
