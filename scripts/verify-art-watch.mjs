/** Blender authoring must not crash Windows Vite's source watcher. */
import {createServer} from 'vite';
import {open,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const server=await createServer({server:{host:'127.0.0.1',port:0}});
const probes=['blend','glb'].map(ext=>resolve('art/.codex-watch-check.'+ext)),events=[],created=[];
try{
 await server.listen();
 server.watcher.on('all',(kind,path)=>{if(probes.includes(resolve(path)))events.push(kind);});
 for(const probe of probes){const handle=await open(probe,'wx');created.push(probe);
 await handle.writeFile('100gate isolated watcher probe');await handle.close();}
 await new Promise(ok=>setTimeout(ok,600));
 assert.deepEqual(events,[],'Blender sources must not enter the source watcher');
 const address=server.httpServer.address();
 for(const ext of ['blend','glb']){const response=await fetch(`http://127.0.0.1:${address.port}/art/.codex-watch-check.${ext}`);
 assert.equal(response.status,200);assert.equal(await response.text(),'100gate isolated watcher probe');
 }
 assert((await server.transformRequest('/src/episode/data.ts'))?.code);
 assert(!Object.values(server.watcher.getWatched()).flat().some(n=>/\.blend\d*$/.test(n)));
 console.log('PASS: Blender files excluded from watching, still served; TS transforms work.');
}finally{for(const probe of created)await unlink(probe);await server.close();}
