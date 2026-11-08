import {it,expect} from 'vitest';
import {canWriteGameSave} from './story-production-save';
it('leaves an existing slot untouched during a new cinematic or a failed load',()=>{
  expect(canWriteGameSave('new',false,false)).toBe(false);
  expect(canWriteGameSave('new',false,true)).toBe(false);
  expect(canWriteGameSave('new',true,true)).toBe(true);
  expect(canWriteGameSave('continue',false,false)).toBe(false);
  expect(canWriteGameSave('continue',false,true)).toBe(true);
});
