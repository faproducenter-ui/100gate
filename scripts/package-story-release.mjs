// The source branch carries exactly the tested runtime bytes, not Blender
// sources or videos. Refuse to mix a different export into the review build.
import { createHash } from 'node:crypto';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { dirname,resolve } from 'node:path';
const out=resolve('.pages-publish/story-preview-build');
const manifest=JSON.parse(await readFile('art/provenance/STORY-OPENING.json','utf8'));
const prefix='outputs/story-intro/';
for(const entry of manifest.assets.filter(a=>/\.(glb|mp3)$/.test(a.path))){
  if(!entry.path.startsWith(prefix))throw Error('Unexpected story source path');
  const path=entry.path.slice(prefix.length);
  if(!/^[a-z-]+\/[a-z0-9-]+\.(glb|mp3)$/.test(path))throw Error('Unsafe story asset path: '+path);
  const data=await readFile(resolve('release/story-assets',path));
  if(data.length!==entry.bytes||createHash('sha256').update(data).digest('hex')!==entry.sha256)throw Error('Story asset revision mismatch: '+path);
  const target=resolve(out,'assets/story-intro',path);
  await mkdir(dirname(target),{recursive:true});
  await writeFile(target,data);
}
await mkdir(resolve(out,'credits'),{recursive:true});
for(const name of ['STORY-OPENING.json','STORY-CITY-AUDIO.json','MPFB-SOURCES.json']){
  await writeFile(resolve(out,'credits',name),await readFile(resolve('art/provenance',name)));
}
