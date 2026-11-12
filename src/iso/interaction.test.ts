import * as T from 'three';
import {expect,it} from 'vitest';
import {HandController,Pickup} from './interaction';
import {dropFlashlight,act,newSave} from './state';

const run=(h:HandController,seconds:number)=>{let f=h.update(0);for(let t=0;t<seconds;t+=1/60)f=h.update(1/60);return f;};

it('hands a prop over only when the reach has closed on it, and lets go only when the fingers open',()=>{
  const h=new HandController(),item=new Pickup({id:'flashlight',mass:.45,grip:'flashlight'},new T.Object3D());
  let attached=0,released=0;
  expect(h.reachFor(item,()=>attached++)).toBe(true);
  expect(h.reachFor(item,()=>attached++)).toBe(false);          // one hand, one reach at a time
  let f=run(h,.4);
  expect(attached).toBe(0);expect(item.held).toBe(false);expect(f.reach).toBeGreaterThan(.6);expect(f.grip).toBeLessThan(.3);
  f=run(h,.2);
  expect(attached).toBe(1);expect(item.held).toBe(true);expect(f.carrying).toBe(true);
  f=run(h,.6);
  expect(h.phase).toBe('holding');expect(f.grip).toBe(1);expect(f.reach).toBe(0);
  expect(h.release(()=>released++)).toBe(true);
  run(h,.2);expect(released).toBe(0);expect(item.held).toBe(true);
  run(h,.2);expect(released).toBe(1);expect(item.held).toBe(false);
  run(h,.5);expect(h.phase).toBe('idle');
  expect(h.reachFor(item,()=>attached++)).toBe(true);               // and it can be picked up again
});

it('a put-down flashlight keeps its pose and light, and picking it up restores both',()=>{
  let s={...newSave(),...act(newSave(),'flashlight').state};
  expect(s.items).toContain('flashlight');expect(s.lightOn).toBe(true);
  s=dropFlashlight(s,[1,0,2,0,0,0,1]).state;
  expect(s.items).not.toContain('flashlight');expect(s.lightOn).toBe(false);expect(s.flashlightLit).toBe(true);
  expect(s.props?.flashlight).toEqual([1,0,2,0,0,0,1]);
  s=act(s,'flashlight').state;
  expect(s.items).toContain('flashlight');expect(s.lightOn).toBe(true);expect(s.props?.flashlight).toBeUndefined();
});
