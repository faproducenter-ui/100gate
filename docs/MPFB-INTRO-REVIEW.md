# 100gate — replacement character, static gate

## Scope and rollback

The original intro/runtime assets are untouched. Local rollback ref:
`backup/intro-loop-rework` at `e4635e5`. The abandoned runtime iteration is kept
in the Git stash entry named “100gate: stopped superseded intro-loop iteration at
user request”. Review exports go to `outputs/mpfb-character`, not to `public`.
Only the existing chair and a knife prop are used as staging references; no hand
from the previous iteration enters this character.

## Provenance

| Source | Decision |
| --- | --- |
| [MPFB 2.0.18](https://github.com/makehumancommunity/mpfb2/tree/v2.0.18) | Downloaded source at `d0a32e57a7f915cb2f2b95410e2117648c7bbb7e`, ran in an isolated Blender profile. Used stock human topology, UV and game-engine skeleton/weights. [Bundled assets are CC0; tool code GPLv3](https://github.com/makehumancommunity/mpfb2/blob/v2.0.18/LICENSE.md), no tool code goes into the game. |
| [Skins 02](https://static.makehumancommunity.org/assets/assetpacks/skins02.html) | Downloaded pack; Mindfront Aksel skin and its color/normal maps, CC0. |
| [Shirts 01](https://static.makehumancommunity.org/assets/assetpacks/shirts01.html), [Pants 01](https://static.makehumancommunity.org/assets/assetpacks/pants01.html), [Shoes 01](https://static.makehumancommunity.org/assets/assetpacks/shoes01.html) | Downloaded packs; Margaret Toigo Fisherman Sweater and Ankle Boots Male, Cortu Cargo Pants, CC0. Used the original garment meshes and MPFB fitting to transfer weights. |
| [MakeHuman core](https://github.com/makehumancommunity/makehuman/tree/a8bc2d54ff0ac92e78ff71431b1023eda42bf482/makehuman/data/eyes) | Downloaded low-poly eye meshes, MHCLO and brown-eye material/texture from this revision, CC0. |
| [Ara 3D Gen](https://github.com/olatunde85/3d-gen) | MIT tool, also based on MakeHuman; not used because direct MPFB gives an editable source without a second pipeline. Individual wardrobe and mocap would need separate checks. |
| [Einar](https://studio.blender.org/characters/einar/v1/) | Blender Studio's CC BY character rig; reference only. No meshes or animations imported. |
| [para’s FPS Arms](https://lpc.opengameart.org/content/fps-arms-rigged-only) | Author lists CC0, Blender/FBX and an example motion. No import: separate arms would undo the unified rig. |
| [Drillimpact PSX FPS Arms](https://drillimpact.itch.io/psx-first-person-arms-free) | Author lists CC0, Blender/FBX/GLB and knife_draw/knife_idle. Candidate for grip timing/pose reference, not body geometry. Not yet retargeted. |
| [Sketchfab FPS Hands](https://sketchfab.com/3d-models/first-person-hands-rigged-547a45535f0c4fe787948f7a7a6a88db) | Could not verify archive/licence from the accessible page; not imported. |
| [Fab Knife FPS Animations](https://www.fab.com/listings/ccff0d84-8219-4daf-9859-348b393b3d83) | Listing advertises Unity/Unreal and notes placeholder SFX. No verified archive/redistribution terms for a public asset build; not imported. |
| [Hempen Rope Model](https://sketchfab.com/3d-models/hempen-rope-model-cfe6e2cfc95240d29c490513abf48a17) | Listing identifies RandyP_3D and CC BY; binary not acquired. If used later, verify archive, include attribution and adaptation notice, and author intact/tensioned/released geometry before integration. |

## Reproduction

Use Blender 4.5, enable MPFB 2.0.18 and set `GATE_MPFB_ASSETS` to a local
directory containing the extracted packs and core eye files with their relative
paths preserved. By default the script uses the preserved sibling directory
`../100gate-art-sources/makehuman-cc0`. The isolated prop source is
`art/knife-prop-review.blend` (override with `GATE_KNIFE_SOURCE`).
Run `scripts/art/mpfb-character-review.py`
from the repository root in a fresh Blender file. Do not run it in a file
containing a scene you want to keep. It writes the editable scene, a neutral
GLB and inspection stills. Set `GATE_AUTHOR_GRIP=1` only after inspecting the
static study to author the skeletal hand-close action. `GATE_REVIEW_RENDER=0`
skips image rendering on a repeat export. The GLB is not yet a production asset.

With local Vite on port 3000, run `node scripts/verify-mpfb-review.mjs`. It loads
and draws the GLB via the game's installed Three.js and checks the 5 skinned
meshes, shared skeleton, 53 bones and 30 phalange bones.
For a different port, set `GAME_URL` (this session used localhost:5182).

## Visual release gate

First-person cinematic remains the plan; the complete rig serves posture,
continuity and side/front QA, not an external camera in the playable intro.
Do not keyframe or integrate the scene until the stills show a grounded,
seated posture and all five fingers in natural contact. After that: stage both
hands behind the chair, visibly ease the right wrist out of a slipped loop,
hold the left wrist to the chair anchor until the cut, then separate the rope
only on the cutting-edge contact event, and transition into standing. Test
that sequence and its controls in the game and record from three views before
push or deploy.

## Continuation results — 2026-11-05

- Canonical editable source: `art/character-mpfb-review.blend`. Working
  skeletal GLB: `art/character-mpfb-grip-review.glb`. These files are separate
  from the old production intro; no file under `src/` or `public/` changed.
- The character is an original MPFB body with original UVs and weights. Both
  arms/hands are part of that body. Garment corrections are a reversible
  `WardrobeFit` shape key; occlusion is a non-destructive mask. Simple
  subdivision interpolates coarse trouser weights around the knees. One level
  of subdivision smooths the exposed original body mesh for close inspection.
- New `KnifePowerGripClose` is a two-second skeletal closure study, 159
  transform tracks across the unified 53-bone rig. Separate timing is used for
  the phalanges. The prop is attached to the right-hand bone without replacing
  its calibrated world transform. It is a diagnostic fixture, not an authored
  pickup: the knife is deliberately supported in the open hand in the study.
- First motion attempt failed: the thumb crossed the hilt by about 8.6 mm
  mid-closure. Staggering alone was insufficient. An authored CMC abduction
  arc removed the shaft crossing, but a blade containment check then rejected
  the early, fully extended thumb sweep. The reviewed study now starts from
  an opposed pre-grasp outside the blade. In the eventual pickup, that
  preparatory pose must be reached BEFORE contact, not teleported into it.
  This is not a replacement for the missing pickup choreography.
- Blender initially subdivided the deformed skin; GLB/Three skin an already
  subdivided bind mesh. The source modifier order and fitting surface now
  match the runtime. A separate browser diagnostic initially used the wrong
  prop-local coordinate basis and produced a false 5.3 mm shaft alert. It
  now explicitly converts glTF local Y-up to the Blender profile basis.
  Do not treat that discarded diagnostic value as an observed visual defect.
- All 48 evaluated Blender frames were checked again. Maximum signed
  penetration of the approximate shaft profile was 0.405 mm (pad/contact
  tolerance); sampled blade penetration was zero. These are geometric
  diagnostics, not proof of anatomy or animation quality.
- Real Chromium / Three r180: neutral export has 5 skinned draw calls, one
  shared skeleton, 30 finger bones, 9 loaded textures, 85,496 rendered triangles.
  Posed Blender/Three world bounds are compared against source metadata
  (including 4-influence normalization); inspect the stills as well.
  No target FPS was established.
- `verify-mpfb-review.mjs` passed and captured seven diagnostic views.
  `verify-mpfb-grip-motion.mjs` passed: all 15 right-finger joints have
  animation tracks; hand/knife relative matrix drift was zero in its samples;
  actual runtime surfaces were checked over 48 frames as well, with maximum
  approximate shaft penetration 0.405 mm; console/page errors were empty.
- Video: `outputs/mpfb-character/grip-close-study.webm`, a recording of
  the closure study replayed from multiple views. Actual encoded video frames
  were decoded in Chromium and checked separately. This is NOT a video of a
  finished escape intro.
- The final recording is also preserved in
  `art/review-evidence/grip-close-study.webm` (20.76 seconds, including QA
  sampling and multi-view replays), together with the final stills and reports.
- TypeScript/Vite build passed, retaining the existing bundle-size warning.
  The original develop-web-game client entered the existing playable scene.
  Unisolated localhost:5182 produced a production-save CORS error; the repeated
  local smoke used `GAME_TEST_SAVE_STUB=1` and made no external save writes.
  CORS was not changed on the production service.
- Blender was reopened through its GUI launcher, MCP reconnected, and full
  character framing restored after the user's report of a missing character.
  Two viewports show the full seated actor and the hand close-up simultaneously.

## Still pending — do not publish as completed

- Further art review of thumb-base skinning, pressure on the grip, and sleeve
  fit throughout the movement; the automatic diagnostics are not acceptance.
- No new BOUND/PARTIAL_RELEASE/KNIFE_PICKUP/ROPE_CUT/FULL_RELEASE/STAND_UP
  choreography, continuous binding mesh or chair-rock animation is delivered
  by this study. Do not reuse the rejected old rope system as a shortcut.
- Real scene integration, a full intro recording and the full gameplay/mobile
  regression remain pending. Only after those pass should the user's conditional
  push/deploy authorization be used.
