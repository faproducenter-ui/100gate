import * as T from 'three'

// Optional MotionBricks gait clips (baked offline by tools/motionbricks, see docs/motionbricks/INTEGRATION_PLAN.md).
// Off by default: enabled only with `?gait=mb` in the URL. A missing/invalid file means null, and the game keeps its own Walk/Run.
export const MOTIONBRICKS_FILES = { walk: 'assets/iso/gait-walk-2.json', run: 'assets/iso/gait-run-2.json', crouch: 'assets/iso/gait-crouch-2.json' } as const

export const motionBricksEnabled = (search = typeof location === 'undefined' ? '' : location.search) =>
  new URLSearchParams(search).get('gait') === 'mb'

/** Parses one baked clip; returns undefined unless it is a valid looping clip that only animates bones the rig has. */
export function parseGaitClip(json: unknown, bones: ReadonlySet<string>): T.AnimationClip | undefined {
  try {
    const clip = T.AnimationClip.parse(json as never)
    if (!clip.tracks.length || !(clip.duration > .3 && clip.duration < 4) || !clip.validate()) return undefined
    for (const track of clip.tracks) if (!bones.has(T.PropertyBinding.parseTrackName(track.name).nodeName)) return undefined
    return clip
  } catch { return undefined }
}

/** How many of the game's stride cycles one baked clip spans (ground distance of the clip / game stride). */
export function cyclesIn(json: unknown, clip: T.AnimationClip, stride: number): number {
  const speed = (json as { meta?: { sourceSpeedMps?: number } }).meta?.sourceSpeedMps
  return speed && speed > 0 ? Math.max(1, Math.round(speed * clip.duration / stride)) : 1
}

export async function loadGaitClips(bones: ReadonlySet<string>, base: string, strides: { walk: number; run: number; crouch: number }, enabled = motionBricksEnabled()) {
  if (!enabled) return undefined
  const get = async (f: string) => { try { const res = await fetch(base + f); return res.ok ? await res.json() : undefined } catch { return undefined } }
  const [w, r, c] = await Promise.all([get(MOTIONBRICKS_FILES.walk), get(MOTIONBRICKS_FILES.run), get(MOTIONBRICKS_FILES.crouch)])
  const walk = parseGaitClip(w, bones), run = parseGaitClip(r, bones), crouch = parseGaitClip(c, bones)
  if (!walk || !run) return undefined                    // walk and run switch together; crouch is optional on its own
  return { walk, run, walkCycles: cyclesIn(w, walk, strides.walk), runCycles: cyclesIn(r, run, strides.run),
    crouch, crouchCycles: crouch ? cyclesIn(c, crouch, strides.crouch) : 1 }
}
