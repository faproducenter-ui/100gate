import assert from 'node:assert/strict';
import {disposeComposer} from '../src/episode/lifetime.ts';
const calls=[];
disposeComposer({
  passes:[{dispose(){calls.push('bloom render targets')}},{dispose(){calls.push('output shader')}}],
  dispose(){calls.push('composer buffers')},
});
assert.deepEqual(calls,['bloom render targets','output shader','composer buffers']);
console.log('PASS composer passes release their resources before composer buffers');
