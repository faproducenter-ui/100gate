// Authoring windows in seconds. The renderer samples the current beat, rather
// than allowing AnimationMixer or wall time to drive gameplay progression.
export const STORY_SECONDS = {
  DIALOGUE: 9, HOME_EXIT: 10, WALK_TO_SHOP: 8, SHOP_ENTER: 3,
  STORE_TRANSIT: 2, RETURN_2316: 2, SHOP_EXIT: 3, WALK_HOME: 8,
  ABDUCTION: 6, BLACKOUT: 2, AWAKE_BOUND: 3, STRAIN: 3,
  LEFT_HITCH_RELEASE: 2, KNIFE_SPOTTED: 2, REACH: 1.8, GRIP: 1.2,
  RIGHT_CUT: 4, SET_KNIFE_DOWN: 1.2, UNWRAP: 3, STAND: 2, FREE: 0,
} as const;
export type StoryBeat = keyof typeof STORY_SECONDS;
export const STORY_BEATS: readonly StoryBeat[] = Object.freeze(Object.keys(STORY_SECONDS) as StoryBeat[]);
export type StoryCheckpoint = { version: 3; beat: StoryBeat; seconds: number };
export type LegacyIntro = 'mid-intro' | 'knife-held' | 'right-cut' | 'free';
type Input = { hold?: boolean; paused?: boolean; cutVerified?: boolean };
const isHeldBeat = (beat: StoryBeat) => beat === 'REACH' || beat === 'RIGHT_CUT';
const epsilon = 1e-9;

function isCheckpoint(value: unknown,abductionDuration:number): value is StoryCheckpoint {
  if (!value || typeof value !== 'object') return false;
  const { version, beat, seconds } = value as Partial<StoryCheckpoint>;
  return version === 3 && typeof beat === 'string' && STORY_BEATS.includes(beat)
    && typeof seconds === 'number' && Number.isFinite(seconds)
    && seconds >= 0 && seconds <= (beat==='ABDUCTION'?abductionDuration:STORY_SECONDS[beat]);
}

export class StoryIntroFlow {
  private beat: StoryBeat = 'DIALOGUE';
  private seconds = 0;
  private needsRelease = false;
  constructor(private readonly abductionDuration:number=STORY_SECONDS.ABDUCTION){}
  duration(beat:StoryBeat){return beat==='ABDUCTION'?this.abductionDuration:STORY_SECONDS[beat];}

  private enter(beat: StoryBeat, held: boolean, seconds = 0) {
    this.beat = beat;
    this.seconds = seconds;
    this.needsRelease = isHeldBeat(beat) && held;
  }

  skip(held: boolean) {
    // This is Skip Cinematic, not a way to rewind the playable escape.
    if (STORY_BEATS.indexOf(this.beat) < STORY_BEATS.indexOf('REACH')) this.enter('REACH', held);
  }

  restore(checkpoint: unknown, { legacy, held = false }: { legacy?: LegacyIntro; held?: boolean } = {}) {
    // An existing completed escape is authoritative even if an intro snapshot
    // was saved out of order. No inventory or quest mutations in this clock.
    if (legacy === 'free') this.enter('FREE', false);
    else if (isCheckpoint(checkpoint,this.abductionDuration)) this.enter(checkpoint.beat, held, checkpoint.seconds);
    else this.enter(
      legacy === 'right-cut' ? 'UNWRAP' : legacy === 'knife-held' ? 'RIGHT_CUT'
        : legacy === 'mid-intro' ? 'REACH' : 'DIALOGUE',
      held,
    );
  }

  advance(dt: number, { hold = false, paused = false, cutVerified = false }: Input = {}) {
    if (!Number.isFinite(dt) || dt < 0) throw new RangeError('Invalid story introduction timestep');
    if (paused) return;
    if (!hold) this.needsRelease = false;
    let remaining = dt;
    while (remaining > 0 && this.beat !== 'FREE') {
      if (isHeldBeat(this.beat) && (!hold || this.needsRelease)) return;
      const duration = this.duration(this.beat);
      const step = Math.min(remaining, duration - this.seconds);
      this.seconds += step;
      remaining -= step;
      if (this.seconds < duration - epsilon) return;
      this.seconds = duration;
      // Contact is supplied by the scene's measured cutting edge, not by the
      // fact that an R animation reached the end. Stay bound if contact failed.
      if (this.beat === 'RIGHT_CUT' && !cutVerified) return;
      this.enter(STORY_BEATS[STORY_BEATS.indexOf(this.beat) + 1]!, hold);
    }
  }

  checkpoint(): StoryCheckpoint {
    return { version: 3, beat: this.beat, seconds: this.seconds };
  }

  snapshot() {
    const beatIndex = STORY_BEATS.indexOf(this.beat);
    const before = (beat: StoryBeat) => beatIndex < STORY_BEATS.indexOf(beat);
    const seated = !before('AWAKE_BOUND');
    const control = this.beat === 'FREE' ? 'gameplay' : isHeldBeat(this.beat) ? 'hold' : 'cinematic';
    const knife = !seated ? 'offscreen' : before('RIGHT_CUT') ? 'floor'
      : before('UNWRAP') ? 'hand' : 'set-down';
    return {
      ...this.checkpoint(), control, knife, awaitingRelease: this.needsRelease,
      leftAnchored: seated && before('KNIFE_SPOTTED'),
      rightAnchored: seated && before('SET_KNIFE_DOWN'),
      cuffsVisible: seated && before('STAND'),
    } as const;
  }
}
