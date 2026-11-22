import {describe,expect,it} from 'vitest';
import {SAFE_CODE,aimSpot,newStationSave,readStation,trySafe,useSpot} from './state';

describe('station state',()=>{
  it('the shop door stays locked until the safe gives the key card',()=>{
    let s=newStationSave(0,0,0);
    expect(useSpot(s,'door:shop').door).toBeUndefined();
    expect(trySafe(s,'1234').save.safe).toBe(false);
    s=trySafe(s,SAFE_CODE).save;
    expect(s.items).toContain('keycard');
    const o=useSpot(s,'door:shop');
    expect(o.door).toBe('shop');expect(o.save.doors.shop).toBe(true);
    expect(useSpot(o.save,'door:shop').save.doors.shop).toBe(false);
  });
  it('the safe asks for a code first, then shows the note',()=>{
    const s=newStationSave(0,0,0);
    expect(useSpot(s,'safe').panel).toBe('safe');
    expect(useSpot(trySafe(s,SAFE_CODE).save,'safe').doc?.title).toBe('Записка сменщика');
  });
  it('aims at what is in front and within reach',()=>{
    const p={x:-3.4,y:9.8};
    expect(aimSpot(p,{x:0,y:1})?.id).toBe('safe');
    expect(aimSpot(p,{x:0,y:-1})).toBeUndefined();
  });
  it('a damaged save is rejected, a good one keeps its fields',()=>{
    expect(readStation('{')).toBeUndefined();
    expect(readStation('{"x":"a"}')).toBeUndefined();
    const s=readStation(JSON.stringify({...newStationSave(1,2,.5),items:['keycard',3]}));
    expect(s?.items).toEqual(['keycard']);expect(s?.yaw).toBe(.5);
  });
});
