import assert from 'node:assert/strict';
import {test} from 'node:test';
import {allowedPath,parseEntry,sourceRef} from './publish-isometric-pages.mjs';

test('allowlist is only the new index, generated chunks and isometric assets',()=>{
  for(const name of ['index.html','assets/index-ABC123xy.js','assets/main-abcdefgh.css','assets/iso/alexei.glb','assets/iso/alexei-credits.txt','assets/iso/props/desk.glb']) assert(allowedPath(name),name);
  for(const name of ['release.json','CNAME','.nojekyll','story-preview/index.html','assets/story-final/x.glb','assets/iso/../../CNAME','assets\\iso\\alexei.glb','assets/iso/CON.glb','assets/iso/secrets.env','assets/index.js','assets/iso/.hidden.png','/assets/iso/alexei.glb']) assert(!allowedPath(name),name);
});

test('HTML is pinned to a relative hashed entry actually present in the package',()=>{
  const html='<html><script type="module" crossorigin src="./assets/index-ABC123xy.js"></script>';
  assert.equal(parseEntry(html,['assets/index-ABC123xy.js']),'assets/index-ABC123xy.js');
  assert.throws(()=>parseEntry(html,[]));
  assert.throws(()=>parseEntry(html.replace('./assets','/assets'),['assets/index-ABC123xy.js']));
});

test('only exact branch refs can be selected for the pushed source check',()=>{
  assert.equal(sourceRef(),'refs/heads/main');
  assert.equal(sourceRef('refs/heads/reboot/isometric'),'refs/heads/reboot/isometric');
  for(const ref of ['main','refs/tags/reboot','refs/heads/../main','refs/heads/main^','refs/heads/main.lock','refs/heads/x//y','--upload-pack=x']) assert.throws(()=>sourceRef(ref),undefined,ref);
});
