import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const out=resolve(process.argv[2]??'.pages-publish/story-preview-build');
const files=await readdir(resolve(out,'assets'));
const js=(await Promise.all(files.filter(f=>f.endsWith('.js')).map(f=>readFile(resolve(out,'assets',f),'utf8')))).join('\n');
assert(js.includes('start-story-home'),'Deployable build must include the real story start UI');
assert(js.includes('story-upright-escape.glb'),'Deployable build must include the upright escape loader');
assert(!js.includes('__storyHomeTest')&&!js.includes('render_game_to_text'),'Preview must not expose test hooks');
assert(!js.includes('outputs/story-intro/'),'Preview must not depend on ignored development files');
const manifest=JSON.parse(await readFile('art/provenance/STORY-OPENING.json','utf8'));
const packaged=manifest.assets.filter(a=>/\.(glb|mp3)$/.test(a.path));
assert.equal(packaged.length,8);
for(const entry of packaged){
  const path=entry.path.slice('outputs/story-intro/'.length);
  const actual=await readFile(resolve(out,'assets/story-intro',path));
  assert.equal(actual.length,entry.bytes,path+' length');
  assert.equal(createHash('sha256').update(actual).digest('hex'),entry.sha256,path+' SHA256');
}
console.log('PASS: production story bootstrap and 8 exact runtime assets; no dev API');
