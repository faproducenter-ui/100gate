import {describe,it,expect} from 'vitest';
import {seatedSeconds,BladeDraw} from './story-seated';

describe('upright escape clip contract',()=>{
  it('shares an exact checkpoint pose across the cinematic and real R control',()=>{
    expect(seatedSeconds('AWAKE_BOUND',0)).toBe(0);
    expect(seatedSeconds('KNIFE_SPOTTED',2)).toBe(seatedSeconds('REACH',0));
    expect(seatedSeconds('REACH',1.8)).toBe(seatedSeconds('GRIP',0));
    expect(seatedSeconds('RIGHT_CUT',4)).toBe(seatedSeconds('SET_KNIFE_DOWN',0));
    expect(seatedSeconds('FREE',0)).toBeCloseTo(23.2);
  });
  it('requires a continuous draw on the edge, not off-edge or stationary contact',()=>{
    const draw=new BladeDraw();
    for(let i=0;i<200;i++)draw.add(.010,.12,0);
    expect(draw.verified).toBe(false);
    for(let i=0;i<100;i++)draw.add(.01,.10+i*.001,.03);
    expect(draw.distance).toBe(0);
    draw.add(.01,.09,0);draw.add(.01,.17,0);
    expect(draw.distance).toBe(0); // a skipped frame is not a measured stroke
    for(let i=0;i<6;i++)for(let j=0;j<=12;j++)draw.add(.01,.10+(i%2?12-j:j)*.004,0);
    expect(draw.verified).toBe(true);
  });
});
