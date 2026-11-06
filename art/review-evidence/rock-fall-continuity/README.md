# Continuous rocking → fall review — 2026-11-06

## Scope, not a completed intro

This is a newly authored replacement for the rejected rocking/fall fragment,
on the existing native MakeHuman character and 53-bone skeleton. It is staged
skeletal animation, not ragdoll. Meshes, UVs, textures and proportions remain
unchanged. No knife grip, rope-release or stand-up phase was added this iteration.
The native sequence is **not yet connected to the playable game's EscapeRig**.
Do not deploy this as the completed escape.

Durable sources: `art/intro-rock-fall-continuous.blend` and
`art/intro-rock-fall-continuous.glb`. Previous `intro-bound-native-wip` and
`intro-fall-native-wip` sources are preserved for rollback/comparison.
Live Blender contains the new appended review scene; previous user scenes remain.

## Root cause and implementation

- Old rocking decayed to neutral before a separately started fall. Replaced
  that timing with one shared quintic Hermite angle/velocity/acceleration curve,
  including the final growing swing, support loss, impact, rebound and settle.
- Persistent damped head/torso states span the whole transition. No per-phase
  secondary-motion reset. Original native rig is baked at 48 fps, 0–16.5 s.
- Forcing both soles flat during large chair lean twisted the native knees and
  pushed pants into the seat. Added opt-in anatomical knee-plane alignment,
  unloading one foot and progressively releasing floor contact during the last
  swing. Other callers retain their old IK defaults. Pelvis unweights smoothly
  by at most 8 mm; the actual human/seat surfaces are audited afterwards.
- Ground support is computed from evaluated surfaces. Segment-mass COM is
  only an authoring estimate (78 kg actor + 6 kg chair), NOT calibrated physics.
- First-person camera follows the native head/eye trajectory; smooth eye offset
  exits facial geometry. No transparent limbs, finger scaling or replacement mesh.

## Videos: actual Three.js export playback, not Blender renders

| File | Content | Encoded duration |
|---|---|---|
| before-after-1x.webm | Exact old asset above, new asset below; identical camera/lights; audio AFTER only | 12.514 s |
| first-person-1x.webm | Native first-person view, normal speed | 12.605 s |
| slow-quarter-side.webm | Actual 0.25× source clock, side view; intentionally silent | 24.038 s |
| slow-quarter-first-person.webm | Actual 0.25× source clock, eye view; intentionally silent | 24.019 s |

Normal films cover source time 4–16.5 s. Slow films cover 9.5–15.5 s at
quarter speed. The slow files play normally at playbackRate=1: slowing is already
encoded. Normal films reuse the licensed existing CC0 Foley bank. The impact
cue starts at 12.45 s, its measured waveform peak at +0.05 s aligns to 12.5 s.
This audio synchronization is in the review harness, not a new game adapter.

All four files were hash-checked, decoded, sought and actually played in a real
browser. Normal-speed encoded audio has nonzero measured RMS. Selected decoded
frames at 11.8/12.5/15.4 were inspected, not just pre-encoding screenshots.
`encoded-reviews.json` contains measured durations, hashes, decoded sizes/audio.
The capture uses Intel UHD/D3D11; frame capture timings are NOT gameplay FPS.

## Validation

- TypeScript + Vite production build: passed; existing >500 kB bundle warning.
- Actual browser review: no recorded JS/console errors (`review.json`).
- 1,201 full/half-frame native surface samples, 4–16.5 s: no tested actor/chair
  or rope/actor/chair triangle crossings; tested minimum floor > −1 mm.
  Timestamps were corrected to the actual 48 fps after the audit; frame geometry
  and contact results were unchanged. This is not an anatomical/artistic score.
- Seven actual imported poses, five native skinned meshes + both restraints:
  bidirectional surface distance from Blender ≤0.017387 mm (gate 1 mm).
- Old playable-game active-clock/pause/hold-cancel regression: passed, no JS errors.
  Original develop-web-game smoke passed and its screenshot was inspected.
  These do NOT prove native sequence integration or full intro completion.
- Actual settings UI: legacy default cameraMotion=1; changed to .35, persisted,
  reloaded, no page errors. The real game now scales secondary rocking/bob/roll.
  Main trajectory displacement/height is retained. Native review separately
  checks reduced roll at unchanged eye position.

## Reproduction (repository cwd; local server port 5182)

Use the installed Blender executable with `--background`, `--python` and this cwd:

1. Open `art/intro-bound-native-wip.blend`; run `scripts/art/author_continuous_fall.py`.
2. Open `outputs/cinematic-intro/intro-continuous-fall.blend`; run
   `scripts/art/export_bound_performance.py`.
3. Open that same blend; run `scripts/art/audit_bound_performance.py -- --continuous --dense`.
4. Start Vite with `npm run dev -- --host 127.0.0.1 --port 5182`.
5. Set TEST_HARDWARE_GL=1 and TEST_HEADED=1 in PowerShell, then run
   `node scripts/review-continuous-rock-fall.mjs --geometry` for imported mesh dumps.
6. On the same source run `scripts/art/check_bound_motion_import.py -- --continuous`.
7. Run `node scripts/review-continuous-rock-fall.mjs` and then
   `node scripts/inspect-rock-fall-reviews.mjs` for all four recordings/decoding.
8. Run `node scripts/verify-camera-motion.mjs` and `npm run build`.

Generated runtime vertex dumps stay in ignored outputs, not this evidence folder.
Old-game regression scripts default to port 3000; use the tested 5182 local copy
or pass the original skill client's --url override. Save API must remain stubbed.

## Still unfinished

Native right-hitch loosening, knife reach/pickup, blade cut, restraint removal,
rope drop, stand, native runtime adapter, full uninterrupted playable escape.
The current ropes and initial hand arrangement were intentionally NOT polished
again during this rocking/fall-only task. Final visual approval remains open;
successful geometry tests do not imply commercial-quality acting or anatomy.
No push or deploy performed.
