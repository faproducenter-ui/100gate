import {expect,it} from 'vitest';
import {storyFoleyEvents} from './story-foley-timing';

it('aligns braking and left/right door sounds to distinct event times at 24 and 120 Hz',()=>{
  for(const fps of [24,120]){
    const events:string[]=[];
    for(let i=1;i<=5*fps;i++)events.push(...storyFoleyEvents('ABDUCTION',(i-1)/fps,i/fps,true).map(e=>e.kind));
    expect(events.filter(e=>e==='brake')).toHaveLength(1);
    expect(events.filter(e=>e==='carDoor')).toHaveLength(2);
    expect(events.filter(e=>e==='boot')).toHaveLength(4);
  }
});
