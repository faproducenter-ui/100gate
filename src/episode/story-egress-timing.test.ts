import { expect,it } from 'vitest';
import { StoryIntroFlow } from './story-intro-flow';
import { streetBlocking } from './story-street-motion';

it('preserves the existing cut but gives the local egress enough time to finish',()=>{
  const old=new StoryIntroFlow(),cut=new StoryIntroFlow(8.8);
  for(const f of [old,cut])f.restore({version:3,beat:'ABDUCTION',seconds:0});
  old.advance(6.01);cut.advance(6.01);
  expect(old.checkpoint().beat).toBe('BLACKOUT');
  expect(cut.checkpoint().beat).toBe('ABDUCTION');
  expect(streetBlocking('ABDUCTION',6.01,true,true).black).toBe(0);
  cut.advance(2.8);
  expect(cut.checkpoint().beat).toBe('BLACKOUT');
  expect(streetBlocking('BLACKOUT',0,true,true).black).toBe(1);
});
