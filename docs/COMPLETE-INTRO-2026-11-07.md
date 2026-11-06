# Native playable intro — 2026-11-07

## Scope

Continue the existing Three.js/TypeScript/Vite game. No engine, story, room,
inventory, backend or save-schema replacement. Editable full MakeHuman/MPFB
character and native per-phalanx skeleton are retained, not rebuilt from primitives.
This is a **playable iteration**, not final commercial/artistic acceptance.

## Production files

- `art/intro-complete-native.blend`: complete editable 42-second performance.
- `public/assets/chapter1/intro-native-v2.glb`: the actual runtime scene clip.
- `src/episode/native-intro.ts`: render adapter and independent active-game clock.
- `art/provenance/native-left-grip-contract.json`: original accepted skeletal
  grip read directly from `art/hand-knife-contact.blend`, frame241; mirrored onto
  the native left-hand topology/weights, without scaling fingers or the knife.
- Existing MakeHuman/MPFB/wardrobe licence records remain in `art/provenance/`.

## Sequence and controls

Idle → hold **R** to rock → fall/fracture → partial LEFT rail release (wrap
remains) → press **E** to reach/grasp with LEFT hand → hold **R** to saw the
external left load-bearing tail → right standing part → put knife down →
sequential wrap removal/drop → supported rise → normal existing WASD gameplay.
The right cut uses an upright working edge, not the point. A real exposed rope
ring is exported for each cut. The runtime requires at least10cm of measured
working-edge travel before each cut event. R release pauses the stroke; it does
not make the cord break. Mobile actions feed the same existing input path.

Version2 intro checkpoints live inside the existing version1 save envelope.
Time/draw progress is retained across pause and reload. Older chair/knife saves
migrate to safe interaction boundaries; already-free saves stay free.
The knife returns to the floor after cutting and is a normal pickup again.

## Camera decision

Literal eye coverage looking at wrists behind the back exposed the character's
own face/collar and obstructed the action. A rejected head-hiding experiment
was removed. **No head/finger/body geometry is hidden to conceal the defect.**
The current source uses first-person bookends with explicit cinematic close-ups
for the rear restraints, connected by an overhead camera arc and a continuous
return to the actual eye before normal control. This is intentionally not
claimed to be an eye-mounted POV during the close-ups. The runtime uses a35°
close-up FOV with smooth return to the original gameplay FOV.

## Reproduction

Use Blender4.5 LTS from this repository root, always with
`--python-exit-code 1` and stop if a command fails:

1. `art/hand-knife-contact.blend` + `scripts/art/export_grip_contract.py`.
2. `art/intro-left-rail-partial.blend` + `scripts/art/author_complete_intro.py`.
3. Preserve the generated `outputs/complete-intro/intro-native-v2.blend` as
   `outputs/complete-intro/intro-native-v2-base.blend`.
4. Load that base + `scripts/art/finish_complete_contact.py`.
5. Audit `outputs/complete-intro/intro-native-v2.blend` with
   `scripts/art/audit_complete_intro.py -- --dense`.
6. Apply `scripts/art/stage_complete_camera.py` to that full source. It checks
   non-camera mesh/action signatures before/after and records the hash chain.
7. Export with `scripts/art/export_bound_performance.py`, copy the generated
   `outputs/cinematic-intro/intro-native-v2.glb` into the runtime asset path.

The dense mesh gate samples157 poses and79 actual deformed hand/knife states,
including intermediate approach/putdown, all original fingers/palm, other body,
all knife components, clothing/chair/fragment surfaces and floor clearances.
These checks do **not** establish artistic realism, cloth fit or every possible
intermediate collision. Browser screenshots and the actual full recording are
separate acceptance evidence.

## Known remaining quality work

- Original sweater skinning still exposes body patches at extreme shoulder and
  elbow poses; do not describe it as finished clothing. User explicitly deferred
  sweater/splinter polishing until the full sequence is playable.
- Face/eye expression, supported-rise weight transfer, loose-cord dynamics and
  camera orbit timing still need artistic refinement. No ragdoll was added.
- Initial cold-start/frame-time spikes remain measurable; the native render
  variants are prewarmed under the loading overlay, but this is not a claim of
  stable60FPS. Report the instrumented Intel UHD frame-time distribution, not a
  fabricated universal FPS target.
- The full Playwright page WebM is silent. Recorded Foley events are verified
  separately; the capture is not proof of an audio mix or mastering quality.
- Mobile checks are Chromium touch emulation, not physical iOS Safari/Android.
- Weather, other chapters, lighting redesign and asset replacement are outside
  this iteration.

## Safety

Starting local rollback branch: `backup/complete-intro-start-ec9e83d`.
Previous Blender files and development history are preserved. All local browser
tests stub `/api/save` and use isolated localStorage. Publication, if successful,
must use the feature branch and a separate preview project/service; do not
replace the current production project, domain, database or backend.
