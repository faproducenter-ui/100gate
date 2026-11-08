import {expect,it} from 'vitest';
import {kitchenLamp} from './menu-flicker';
it('stays steady in reduced-flicker mode and varies quiet intervals otherwise',()=>{
  let r=0;
  const rand=()=>[.1,.82,.98,.37][r++%4]!;
  const a=kitchenLamp(rand),b=kitchenLamp(rand);
  expect(a.wait).toBeGreaterThan(6500);
  expect(a.wait).not.toEqual(b.wait);
  expect([...a.frames,...b.frames].every(f=>f.level>=0&&f.level<=.82)).toBe(true);
  expect(kitchenLamp(rand,true).frames).toEqual([]);
});
