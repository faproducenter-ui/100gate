import {describe,expect,it} from 'vitest';
import {LOCKS,SAFE_CODE,aimSpot,newStationSave,readStation,trySafe,tryCode,useSpot,type StationSave} from './state';

const outside={x:-1.9,y:-2.5};
describe('station state',()=>{
  it('the shop door is locked from outside until the glove box gives the key; from inside it opens',()=>{
    let s=newStationSave(0,0,0);
    expect(useSpot(s,'door:shop',outside).door).toBeUndefined();
    expect(useSpot(s,'door:shop',{x:-1.9,y:1.4}).door).toBe('shop');
    s=useSpot(s,'glovebox').save;expect(s.items).toContain('shopKey');
    const o=useSpot(s,'door:shop',outside);
    expect(o.door).toBe('shop');expect(o.save.doors.shop).toBe(true);
    expect(useSpot(o.save,'door:shop',outside).save.doors.shop).toBe(false);
  });
  it('the whole chain: safe → shed key, register → car key, trunk, shed, motel code → gate key → gate',()=>{
    let s:StationSave=newStationSave(0,0,0);
    const use=(id:string)=>{const o=useSpot(s,id,outside);s=o.save;return o;};
    expect(use('safe').panel).toBe('safe');
    expect(trySafe(s,'1234').save.safe).toBe(false);
    s=tryCode(s,'safe',SAFE_CODE).save;expect(s.items).toEqual(expect.arrayContaining(['shedKey','note']));
    expect(use('safe').doc?.title).toBe('Записка сменщика');
    expect(use('map').doc).toBeUndefined();
    expect(use('register').panel).toBe('register');
    s=tryCode(s,'register',LOCKS.register.code).save;expect(s.items).toContain('carKey');
    expect(use('map').doc?.title).toBe('Карта из багажника');
    expect(use('bench').got).toBeUndefined();
    expect(use('door:shed').door).toBe('shed');
    expect(use('bench').got).toBe(true);expect(s.items).toContain('hexKey');
    expect(use('door:gate').door).toBeUndefined();
    expect(use('door:motel2').panel).toBe('motel2');
    expect(tryCode(s,'motel2','000').door).toBeUndefined();
    const m=tryCode(s,'motel2',LOCKS.motel2.code);s=m.save;expect(m.door).toBe('motel2');expect(s.doors.motel2).toBe(true);
    expect(use('gatekey').got).toBe(true);
    const g=use('door:gate');expect(g.door).toBe('gate');expect(g.doc?.title).toBe('Дорога');
  });
  it('aims at what is in front and within reach',()=>{
    const p={x:-3.4,y:9.8};
    expect(aimSpot(p,{x:0,y:1})?.id).toBe('safe');
    expect(aimSpot(p,{x:0,y:-1})).toBeUndefined();
  });
  it('a damaged save is rejected, a good one keeps its fields; an old opened safe counts as opened',()=>{
    expect(readStation('{')).toBeUndefined();
    expect(readStation('{"x":"a"}')).toBeUndefined();
    const s=readStation(JSON.stringify({...newStationSave(1,2,.5),items:['keycard',3],safe:true,open:undefined}));
    expect(s?.items).toEqual(['keycard']);expect(s?.yaw).toBe(.5);expect(s?.open).toEqual(['safe']);
  });
});
