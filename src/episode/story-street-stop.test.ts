import { describe, expect, it } from 'vitest';
import { streetBlocking } from './story-street-motion';
import type { StoryBeat } from './story-intro-flow';

const examples = [
  ['WALK_TO_SHOP', 8, 'SHOP_ENTER', 10, 'stop-0'],
  ['SHOP_ENTER', 3, 'STORE_TRANSIT', 2.95, 'stop-95'],
  ['SHOP_EXIT', 2.6, 'SHOP_EXIT', 2.95, 'stop-95'],
  ['WALK_HOME', 8, 'ABDUCTION', 5.8, 'stop-80'],
] as const satisfies readonly (readonly [StoryBeat,number,StoryBeat,number,string])[];

describe('cinematic gait braking', () => {
  for (const [beat, end, after, meters, key] of examples) it(beat+' completes the final step before idle', () => {
    const f=(t:number)=>streetBlocking(beat,t,true).hero;
    const early=f(end-.95), later=f(end-.67), landed=f(end-.52), mid=f(end-.25), last=f(end);
    expect(early.distance).toBeLessThan(later.distance);
    expect(landed.distance).toBeCloseTo(meters);
    expect(mid.position).toEqual(landed.position);
    expect(mid.stop).toMatchObject({key});
    expect(mid.stop!.time).toBeGreaterThan(landed.stop!.time);
    expect(last.stop!.time).toBeCloseTo(.55);
    const next=streetBlocking(after,after===beat?end+.1:0,true).hero;
    expect(next.position).toEqual(last.position);
    expect(next.stop).toEqual(last.stop);
    expect(next.moving).toBe(false);
  });
});
