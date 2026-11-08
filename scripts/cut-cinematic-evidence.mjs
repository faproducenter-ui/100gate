/** Extract the egress and knife views from the real combined browser run. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';

const dir='outputs/quality-overhaul/final-browser';
const video=dir+'/100gate-cinematic.webm';
const r=JSON.parse(await readFile(dir+'/report.json','utf8'));
assert(r.passed&&r.errors.length===0&&r.badRequests.length===0);
const probe=file=>JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries',
  'stream=codec_name,codec_type,width,height:format=duration','-of','json',file],{encoding:'utf8'}));
const meta=probe(video);
assert(meta.streams.some(s=>s.codec_type==='audio'&&s.codec_name==='opus'));
const pos=beat=>{
  const entry=r.timeline.find(e=>e.beat===beat);
  assert(entry,beat);
  return entry.wallSeconds+r.videoClickOffsetSeconds;
};
const items=[
  ['100gate-exit-sedan.webm',pos('ABDUCTION')-.45,pos('BLACKOUT')+.2],
  ['100gate-sleeves-and-knife.webm',pos('REACH')-.55,pos('STAND')],
];
const clips=[];
for(const [name,start,end] of items){
  const target=dir+'/'+name;
  execFileSync('ffmpeg',['-y','-v','error','-ss',String(Math.max(0,start)),'-i',video,'-t',String(end-start),
    '-c:v','libvpx-vp9','-deadline','realtime','-cpu-used','5','-crf','31','-b:v','0','-c:a','libopus',target]);
  clips.push({name,start,end,...probe(target)});
}
await writeFile(dir+'/video-evidence.json',JSON.stringify({main:meta,clips},null,2)+'\n');
console.log(JSON.stringify({main:meta,clips},null,2));
