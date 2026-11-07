import { describe,it,expect } from 'vitest';
import { streetBlocking } from './story-street-motion';

describe('street actor blocking',()=>{
  it('keeps a continuous sole path, waits for the shop door and returns the same hero with groceries',()=>{
    const begin=streetBlocking('WALK_TO_SHOP',0),end=streetBlocking('WALK_TO_SHOP',8);
    expect(begin.hero.position).toEqual([-8,.12,-1.7]);
    expect(end.hero.position).toEqual([2,.12,-1.7]);
    expect(streetBlocking('SHOP_ENTER',0).hero.position).toEqual(end.hero.position);
    expect(streetBlocking('SHOP_ENTER',1.1).shopOpen).toBeGreaterThan(.95);
    expect(streetBlocking('SHOP_ENTER',3).hero.position).toEqual([2,.12,-4.65]);
    expect(streetBlocking('SHOP_EXIT',0).hero.position).toEqual([2,.12,-4.65]);
    expect(streetBlocking('SHOP_EXIT',3).hero.position).toEqual([2,.12,-1.7]);
    expect(streetBlocking('WALK_HOME',0).hero.position).toEqual([2,.12,-1.7]);
    expect(streetBlocking('WALK_HOME',8).hero.position).toEqual([-3.8,.12,-1.7]);
    expect(streetBlocking('SHOP_EXIT',1.8).groceries).toBe(true);
  });
  it('decelerates the car; occupants do not teleport into the hero',()=>{
    const positions=[0,.5,1,1.5,2].map(t=>streetBlocking('ABDUCTION',t).carX);
    const distances=positions.slice(1).map((p,i)=>p-positions[i]!);
    expect(distances).toEqual([...distances].sort((a,b)=>b-a));
    expect(positions[4]).toBeCloseTo(-1.4);
    expect(streetBlocking('ABDUCTION',1).carOpen).toBe(0);
    expect(streetBlocking('ABDUCTION',3).carOpen).toBe(1);
    const frame=streetBlocking('ABDUCTION',5.8);
    for(const actor of frame.unknowns)expect(Math.hypot(actor.position[0]+3.8,actor.position[2]+1.7)).toBeGreaterThan(.36);
  });
});
