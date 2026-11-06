# Native wardrobe + left rail partial-release review — 2026-11-06

**Partial production step, NOT the completed escape and NOT gameplay integration.**

## Delivered this iteration

- Original male MakeHuman actor retained (gender=1, existing 53-bone skeleton).
  No new procedural human, limb, UV, texture or replacement wardrobe.
- The old physical-fit sweater corrective displaced portions of the hem upward
  by up to 142 mm. Added an independently editable tailored seated-wool key,
  preserving the original old keys/cages. Central thoracic clavicle weights
  corrected on 3,906 garment vertices, preserving shoulder/cuff boundaries and
  at most four effective skinning influences. Wool follows the evaluated native
  male chest rather than extra inflated garment volume. This is a wardrobe fit
  improvement, NOT a claim that the entire character's anatomy is now finished.
- First rejected fit produced a hanging central flap; it was NOT promoted.
  Current hem is seated above the waistband. Original UV/material contract is
  recorded in `tailoring.json`. Original knit textures remain in use.
- Only the left end of the lowest back rail detaches on impact. Actual original
  rail surfaces and UVs are split, with closed complementary fracture caps;
  other chair sections remain intact. The fracture edge is still a simplified
  oblique split, not final splinter/endgrain detailing.
- Left cuff, knot, tether and timber hitch remain visible after impact. The
  hitch stays on the detached wood; the wrist does not become magically bare.
  A separate four-bone prop rig deforms the existing ropes, not the human mesh.
- Native torso recovery rolls independently from the chair (up to 16 degrees).
  Right wrist stays on its chair anchor. Left wrap follows the native forearm,
  not a separately twisted palm. Original bone lengths/scales are preserved;
  IK targets are reach-limited, never solved by stretching the arm.
- The old seated-only right sleeve correction bulged into the fixed wrap during
  recovery. Added a local native-skin-based cuff-pressure corrective (2,722
  vertices), timed with recovery. Cord is not inflated, hidden or made transparent.

## Sources and state

- `art/intro-tailored-native-fall.blend/.glb`: independently tested wardrobe stage.
- `art/intro-left-rail-partial.blend/.glb`: wardrobe + rail/partial-release stage.
- Old sources and rollback branch `backup/body-postfall-start-538a106` preserved.
- Live Blender has appended scene `100gate | Tailored LEFT rail · partial review`.
  User's active WALK viewport and earlier scenes were deliberately not replaced.
- No push, deploy or production save writes.

## Actual tests

- Wardrobe: 1,201 evaluated full/half-frame samples over 4–16.5 s; tested
  actor/chair/rope contacts clear and tested floor >−1 mm.
- New partial release: 409 samples over 12.25–16.5 s; actual native actor,
  chair, detached wood, both ropes tested. No tested triangle crossings;
  tested floor >−1 mm. Right wrist anchor drift max 0.093780 mm.
- Seven real Three.js imported poses, all five native skins, both ropes,
  chair and detached fragment: bidirectional Blender/import vertex-surface
  closest-vertex discrepancy max 0.017251 mm (1 mm gate). This is not visual acceptance.
- Real browser screenshots inspected: seated side/front/waist, post-fall
  overall and rear closeups, including decoded first-person/rear movie frames.
  No recorded page/console errors in the final recording harness.
- All four delivered WebMs hash-checked, decoded, sought and actually played
  in Chromium. Audio is present in normal-speed recordings; slow films are
  intentionally silent. `encoded-reviews.json` contains durations and audio data.
- TypeScript/Vite build and original develop-web-game smoke passed, latest
  smoke screenshot inspected. This regression covers the OLD playable intro,
  NOT a claim that the new native animation is already gameplay-driven.

## Videos

| File | Content | Duration |
|---|---|---|
| before-after-1x.webm | Old above/new below, identical overall camera; normal speed | 12.566 s |
| first-person-1x.webm | New native eye view, normal speed | 12.515 s |
| slow-quarter-side.webm | NEW rear closeup of break/ropes/recovery, actual 0.25× source clock | 24.036 s |
| slow-quarter-first-person.webm | New eye view, actual 0.25× source clock | 23.967 s |

Normal movies cover source time 4–16.5 s, slow movies 9.5–15.5 s. These are
Three.js diagnostic-stage recordings, NOT a playable-house or complete-escape
video. Capture is approximately 19–22 rendered frames/s on the local Intel UHD;
largest observed capture gap 175 ms. This is capture timing, not measured game
FPS or a claim of zero stutter. Underlying source animation is baked at 48 fps.

## Rejected intermediate solutions

Moving the freed hand directly forward crossed the torso. Pulling backward
alone crossed the middle chair rail. Twisting a cuff by the palm rather than
the forearm produced rope/sleeve contact errors. These variants were rejected;
geometry assertions were not disabled. Body recovery + proper cuff frames and
local cloth pressure replaced those failures.

Blender normally can return exit0 after a Python exception. All final authoring,
export and audits use `--python-exit-code 1` with stop-on-failure so an old file
cannot silently pass as a newly authored candidate.

## Development stability fix

Windows Vite crashed with EBUSY when the authoring pipeline copied locked large
`.blend` and `.glb` files under `art`. Authoring/evidence directories are now
excluded from source watching, but remain served over HTTP. Normal TypeScript
transforms remain enabled. `node scripts/verify-art-watch.mjs` verifies both
file types are ignored, both are still HTTP-accessible, and TS transforms work.
Asset-review pages must be refreshed manually after export. No runtime renderer
or game architecture was replaced.

## Reproduction (repository cwd)

Use installed Blender with `--background SOURCE --python-exit-code 1 --python SCRIPT`:

1. `art/intro-rock-fall-continuous.blend` + `scripts/art/tailor_seated_sweater.py`.
2. `outputs/body-postfall/intro-tailored-fall.blend` + `scripts/art/author_left_chair_break.py`.
3. Result `outputs/body-postfall/intro-left-rail-partial.blend` +
   `scripts/art/audit_left_rail_release.py -- --dense` and
   `scripts/art/export_bound_performance.py`.
4. Start local Vite on port5182. Set PowerShell environment variables:
   `TEST_HARDWARE_GL=1`, `TEST_HEADED=1`, `TEST_CAPTURE=1`,
   `BEFORE_ASSET=/art/intro-rock-fall-continuous.glb`,
   `AFTER_ASSET=/outputs/cinematic-intro/intro-left-rail-partial.glb`,
   `REVIEW_OUT=outputs/body-postfall/partial-review`.
5. `node scripts/review-continuous-rock-fall.mjs --postfall --screens-only --geometry`.
6. Same result blend + `scripts/art/check_bound_motion_import.py -- --left-release`.
7. `node scripts/review-continuous-rock-fall.mjs --postfall`, then
   `node scripts/inspect-rock-fall-reviews.mjs`.
8. `node scripts/verify-art-watch.mjs`, `npm run build`; original skill-client
   smoke on5182 with GAME_TEST_SAVE_STUB=1. Generated vertex dumps stay ignored.

## Still NOT implemented

Left-hand knife reach/power grip, blade contact and left-cuff release, subsequent
right-restraint cut, removal/drop of ropes, stand and native runtime adapter.
The old playable game still uses its previous intro; do not deploy this art
fragment as the new story. Further visual polish of chest/underarm folds and
fracture details remains open; numeric surface gates do not establish realism.
