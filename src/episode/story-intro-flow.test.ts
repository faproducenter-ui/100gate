import { describe, expect, it } from 'vitest';
import { STORY_BEATS, STORY_SECONDS, StoryIntroFlow } from './story-intro-flow';

const through = (beat: keyof typeof STORY_SECONDS) => {
  const index = STORY_BEATS.indexOf(beat);
  return STORY_BEATS.slice(0, index + 1).reduce((sum, b) => sum + STORY_SECONDS[b], 0);
};

describe('new seated story introduction', () => {
  it('follows every story beat and arrives at the same reach pose as skipping', () => {
    const natural = new StoryIntroFlow();
    for (const beat of STORY_BEATS.slice(0, STORY_BEATS.indexOf('REACH'))) {
      expect(natural.snapshot().beat).toBe(beat);
      natural.advance(STORY_SECONDS[beat]);
    }
    const skipped = new StoryIntroFlow();
    skipped.skip(false);
    expect(natural.snapshot()).toEqual(skipped.snapshot());
    expect(natural.snapshot()).toMatchObject({
      beat: 'REACH', seconds: 0, leftAnchored: false, rightAnchored: true,
      cuffsVisible: true, knife: 'floor', control: 'hold',
    });
    expect(STORY_BEATS.join(' ')).not.toMatch(/ROCK|FALL|LEFT_CUT/);
  });

  it('requires a fresh R press on natural entry, skip, and cut entry', () => {
    for (const skip of [true, false]) {
      const flow = new StoryIntroFlow();
      if (skip) flow.skip(true);
      else flow.advance(through('KNIFE_SPOTTED') + 10, { hold: true });
      flow.advance(10, { hold: true });
      expect(flow.checkpoint()).toEqual({ version: 3, beat: 'REACH', seconds: 0 });
      flow.advance(0, { hold: false });
      flow.advance(20, { hold: true, cutVerified: true });
      expect(flow.snapshot()).toMatchObject({ beat: 'RIGHT_CUT', seconds: 0, knife: 'hand' });
      flow.advance(10, { hold: true, cutVerified: true });
      expect(flow.snapshot().seconds).toBe(0);
    }
  });

  it('freezes on release and pause; preserves the exact sampled reach pose', () => {
    const flow = new StoryIntroFlow();
    flow.skip(false);
    flow.advance(.3, { hold: true });
    flow.advance(10, { hold: false });
    flow.advance(10, { hold: true, paused: true });
    expect(flow.snapshot()).toMatchObject({ beat: 'REACH', seconds: .3, knife: 'floor' });
    flow.advance(STORY_SECONDS.REACH - .3, { hold: true });
    expect(flow.snapshot()).toMatchObject({ beat: 'GRIP', knife: 'floor' });
    flow.advance(STORY_SECONDS.GRIP);
    expect(flow.snapshot()).toMatchObject({ beat: 'RIGHT_CUT', knife: 'hand', rightAnchored: true });
  });

  it('cannot release the right restraint without both completed travel and verified cut', () => {
    const flow = new StoryIntroFlow();
    flow.restore({ version: 3, beat: 'RIGHT_CUT', seconds: 0 });
    flow.advance(.25, { hold: true, cutVerified: true });
    expect(flow.snapshot().rightAnchored).toBe(true);
    flow.advance(20, { hold: true });
    expect(flow.snapshot()).toMatchObject({ beat: 'RIGHT_CUT', seconds: STORY_SECONDS.RIGHT_CUT, rightAnchored: true });
    flow.advance(.1, { cutVerified: true });
    expect(flow.snapshot().rightAnchored).toBe(true);
    flow.advance(.1, { hold: true, cutVerified: true });
    expect(flow.snapshot()).toMatchObject({ beat: 'SET_KNIFE_DOWN', rightAnchored: false, knife: 'hand' });
    flow.advance(STORY_SECONDS.SET_KNIFE_DOWN);
    expect(flow.snapshot()).toMatchObject({ beat: 'UNWRAP', cuffsVisible: true, knife: 'set-down' });
    flow.advance(STORY_SECONDS.UNWRAP);
    expect(flow.snapshot()).toMatchObject({ beat: 'STAND', cuffsVisible: false });
    flow.advance(STORY_SECONDS.STAND);
    expect(flow.snapshot()).toMatchObject({ beat: 'FREE', control: 'gameplay' });
    flow.skip(false);
    expect(flow.snapshot().beat).toBe('FREE');
  });

  it('is independent of frame partition within automatic and held beats', () => {
    const a = new StoryIntroFlow(), b = new StoryIntroFlow();
    a.advance(through('ABDUCTION') + .75);
    for (let t = 0; t < through('ABDUCTION') + .75 - 1e-7; t += .05) b.advance(.05);
    expect(a.snapshot().beat).toBe(b.snapshot().beat);
    expect(a.snapshot().seconds).toBeCloseTo(b.snapshot().seconds, 8);
    a.skip(false); b.skip(false);
    a.advance(.65, { hold: true });
    for (let i = 0; i < 13; i++) b.advance(.05, { hold: true });
    expect(a.snapshot().seconds).toBeCloseTo(b.snapshot().seconds, 8);
    expect(() => a.advance(Number.NaN)).toThrow(RangeError);
  });

  it('restores typed progress and safely migrates existing checkpoint markers', () => {
    const flow = new StoryIntroFlow();
    flow.restore({ version: 3, beat: 'REACH', seconds: .6 }, { held: true });
    flow.advance(.4, { hold: true });
    expect(flow.snapshot().seconds).toBe(.6);
    flow.restore({ version: 3, beat: 'RIGHT_CUT', seconds: Infinity }, { legacy: 'mid-intro' });
    expect(flow.snapshot()).toMatchObject({ beat: 'REACH', seconds: 0 });
    flow.restore(undefined, { legacy: 'knife-held' });
    expect(flow.snapshot()).toMatchObject({ beat: 'RIGHT_CUT', knife: 'hand', rightAnchored: true });
    flow.restore(undefined, { legacy: 'right-cut' });
    expect(flow.snapshot()).toMatchObject({ beat: 'UNWRAP', knife: 'set-down', rightAnchored: false });
    flow.restore({ version: 3, beat: 'REACH', seconds: 0 }, { legacy: 'free' });
    expect(flow.snapshot().beat).toBe('FREE');
    flow.restore({ version: 3, beat: 'FALL', seconds: 0 });
    expect(flow.snapshot().beat).toBe('DIALOGUE');
  });
});
