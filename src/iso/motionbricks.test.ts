import { describe, expect, it } from 'vitest'
import * as T from 'three'
import { cyclesIn, motionBricksEnabled, parseGaitClip } from './motionbricks'

const clip = (name: string, duration: number) => T.AnimationClip.toJSON(new T.AnimationClip('c', duration, [new T.QuaternionKeyframeTrack(name, [0, duration], [0, 0, 0, 1, 0, 0, 0, 1])]))

describe('MotionBricks gait loader', () => {
  it('is off unless ?gait=mb', () => {
    expect(motionBricksEnabled('')).toBe(false)
    expect(motionBricksEnabled('?gait=mb')).toBe(true)
  })
  it('accepts a clip that only animates known bones', () => {
    expect(parseGaitClip(clip('pelvis.quaternion', 1.8), new Set(['pelvis']))).toBeDefined()
  })
  it('rejects unknown bones, bad durations and garbage', () => {
    expect(parseGaitClip(clip('tail.quaternion', 1.8), new Set(['pelvis']))).toBeUndefined()
    expect(parseGaitClip(clip('pelvis.quaternion', 9), new Set(['pelvis']))).toBeUndefined()
    expect(parseGaitClip({ nonsense: 1 }, new Set(['pelvis']))).toBeUndefined()
  })
  it('counts stride cycles from ground distance', () => {
    const c = new T.AnimationClip('c', 1.8, [])
    expect(cyclesIn({ meta: { sourceSpeedMps: 1.35 } }, c, 1.25)).toBe(2)
    expect(cyclesIn({}, c, 1.25)).toBe(1)
  })
})

// The baked clips are local-only until the model licence is cleared, so this runs only where they exist.
import fs from 'node:fs'
import { loadHeroRest } from '../../tools/motionbricks/hero-rest.mjs'
describe('baked gait clips (when present)', () => {
  const bones = new Set<string>(loadHeroRest('public/assets/iso/alexei-10.glb').bones.keys())
  for (const name of ['walk', 'run', 'crouch']) {
    const file = `public/assets/iso/gait-${name}-2.json`
    it.skipIf(!fs.existsSync(file))(`${name} animates only hero bones`, () => {
      const json = JSON.parse(fs.readFileSync(file, 'utf8'))
      const clip = parseGaitClip(json, bones)
      expect(clip).toBeDefined()
      expect(cyclesIn(json, clip!, name === 'run' ? 2 : name === 'crouch' ? .9 : 1.25)).toBeGreaterThanOrEqual(1)
    })
  }
})
