import {describe,expect,it,vi} from 'vitest';
import {LoadingController,byteFraction} from './loading';

const plan=()=>{const c=new LoadingController();c.plan([
  {id:'a',label:'Загрузка персонажа',weight:3},
  {id:'b',label:'Подготовка физики',weight:1,optional:true},
  {id:'c',label:'Первый кадр',weight:1},
]);return c;};

describe('loading controller',()=>{
  it('weights real progress and never reports 100% before every task is done',()=>{
    const c=plan();
    expect(c.value).toBe(0);
    c.progress('a',.5);expect(c.value).toBeCloseTo(.3);
    c.progress('a',.2);expect(c.value).toBeCloseTo(.3); // never backwards
    c.done('a');c.done('b');expect(c.value).toBeCloseTo(.8);
    c.progress('c',1);expect(c.value).toBeLessThan(1);expect(c.complete).toBe(false);
    c.done('c');expect(c.value).toBe(1);expect(c.complete).toBe(true);
  });
  it('names the stage actually running',()=>{
    const c=plan();
    expect(c.stage).toBe('Загрузка персонажа');
    c.done('a');c.start('c');expect(c.stage).toBe('Первый кадр');
  });
  it('lets an optional step fail and stops on a required one, without claiming completion',async()=>{
    const warn=vi.spyOn(console,'warn').mockImplementation(()=>{}),error=vi.spyOn(console,'error').mockImplementation(()=>{});
    const c=plan();const seen:string[]=[];c.subscribe(s=>{if(s.error)seen.push(s.error);});
    await expect(c.track('b',Promise.reject(Error('no wasm')))).rejects.toThrow();
    expect(c.snapshot().error).toBeUndefined();
    await expect(c.track('a',Promise.reject(Error('404')))).rejects.toThrow();
    expect(c.snapshot().error).toBe('Загрузка персонажа');expect(c.value).toBeLessThan(1);
    expect(seen).toEqual(['Загрузка персонажа']);
    warn.mockRestore();error.mockRestore();
  });
  it('reads bytes only when the server reports a size',()=>{
    expect(byteFraction({lengthComputable:true,loaded:50,total:200} as ProgressEvent)).toBe(.25);
    expect(byteFraction({lengthComputable:false,loaded:50,total:0} as ProgressEvent)).toBe(0);
  });
});
