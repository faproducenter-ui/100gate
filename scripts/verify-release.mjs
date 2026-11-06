import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const base=new URL(process.argv[2]??'https://100gate.online/');
const dist=resolve('dist');
const index=await readFile(resolve(dist,'index.html'),'utf8');
const bundle=index.match(/\.\/assets\/index-[\w-]+\.js/)?.[0];
assert(bundle,'Missing Vite bundle: run npm run build first.');
const get=async(path)=>{
  const u=new URL(path,base);
  u.searchParams.set('verify',bundle.slice(2));
  const result=await fetch(u,{cache:'no-store',signal:AbortSignal.timeout(20000)});
  assert(result.ok,`${u} returned ${result.status}`);
  return result;
};
const online=await (await get('.')).text();
assert(online.includes(bundle),`${base.host} is still serving a different build than ${bundle}`);
const digest=b=>createHash('sha256').update(b).digest('hex');
for(const file of [
  'assets/coopers-barrel.glb',
  'assets/chapter1/canvas-satchel.glb',
  'assets/chapter1/gear-flashlight.glb',
  'assets/chapter1/gear-brass-key.glb',
  'assets/chapter1/player-hand-open.glb',
  'assets/chapter1/player-hand-grip.glb',
  'assets/chapter1/player-upper-shadow.glb',
  'assets/chapter1/player-boot.glb',
  'assets/chapter1/player-trouser.glb',
  'assets/chapter1/player-torso.glb',
  'assets/chapter1/foley-bank.wav',
  'assets/chapter1/intro-native-v2.glb',
]){
  const expected=digest(await readFile(resolve(dist,file)));
  const live=digest(Buffer.from(await (await get(file)).arrayBuffer()));
  assert.equal(live,expected,`${base.host} is serving an outdated copy of ${file}`);
  console.log(`PASS ${file}`);
}
console.log(`PASS ${base.origin}: ${bundle} and all checked assets match the release build`);
