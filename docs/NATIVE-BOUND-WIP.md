# Native BOUND staging checkpoint — 2026-11-06

## Status: PARTIAL ART, not a finished/playable intro

Only **BoundChairIdle (0–4 s)** and **ChairStruggle (4–12 s)** exist in this
asset. The 48-second review repeats that same 12-second fragment from front,
side, rear and an eye-space diagnostic camera. It is NOT a complete escape.
There is no new runtime intro adapter, fall, knife pickup, cutting, cuff removal,
rope drop or stand-up. The current game's older intro has not been replaced.

## Actual changes

- Native imported MPFB human, original UVs/materials/identity and 53-bone rig
  retained. No replacement procedural hands or mannequin geometry.
- Original native cages archived intact inside the new source. Derived authoring
  surfaces subdivide first, then explicitly normalize four bone influences to
  match the installed Three.js skinning contract. Existing source files stay
  untouched; the canonical hand source SHA256 is still
  `B33FF446CDA5FEAB25B5E588B6432F787875D41F8C191CA02DB2EEB20B46DEBF`.
- Restrained upper-arm axial twist reduced before garment fitting. New native
  whole-arm wrist staging removes the old across-body hand orientation: static
  metacarpal/forearm deviation is 4.386° right / 0.635° left. Native finger meshes
  remain unchanged; these are relaxed BOUND hands, not a new knife grip.
- Actual low-resolution native sweater cloth fitting baked into an editable
  corrective on the derived runtime surface. Fully pinned, skin-fitted ribbed
  cuffs replace the old drifting sleeve rims. No web cloth simulator added.
- Both intact, independent wrist-to-chair ropes use actual skin/garment
  triangle sections and a finite-radius contact envelope. Rejected open-surface
  normal projection and over-wide slab hulls are NOT the final method.
- Real native skeletal breathing/effort, torso anticipation, planted feet,
  support-edge chair movement, fixed chair-relative wrists and eye camera.
  Small pelvis unweighting prevents the pants from crossing the supporting seat.
- Existing knife receives bevelled edges, planar blade UVs, brushed-metal and
  correctly aligned walnut PBR maps. Handle/grip proportions were not enlarged
  to hide finger errors. The knife remains on the floor in this fragment.

## Evidence and reproducible tests

Durable source/export: `art/intro-bound-native-wip.blend` / `.glb`.
Evidence directory: `art/review-evidence/intro-bound-native/`.
The source contains original authoring data and is not an optimized shipping
asset; the raw review GLB is roughly 49 MB.

- Evaluated actual triangle contacts, 577 full/half-frame samples of the 12 s
  fragment: rope/body, rope/garment, rope/chair and actor/chair. Two restraint
  meshes and five native skin meshes are mandatory; empty audits fail.
- Actual imported Three.js deformed skin and rope vertices compared in BOTH
  directions with the source at six poses. Original 1 mm gate retained; measured
  maximum about **0.018 mm**. This is import correspondence, not art approval.
- Chromium screenshots include side views of each wrist, behind the chair,
  shoulders, whole actor and first-person diagnostic. No console/page errors.
- Actual WebM decoded, sought, sampled and played at normal speed. The recorder
  uses explicit canvas frames driven by real elapsed time, not accelerated
  simulation or a slideshow. Window-occluded rAF recordings were rejected.
- Headed Chromium uses Intel UHD/D3D11. Headless Chromium selected SwiftShader
  even with the hardware environment flag; do not report its capture cadence as
  game FPS. Capture metrics are review metrics, not performance of the game.
- TypeScript/Vite build and the original develop-web-game client smoke pass.
  Existing-game active-clock chair/knife/release, cancellation and pause checks
  pass with the save API stubbed. These regressions test the OLD game only.

Rebuild from the previous immutable art checkpoint (takes several minutes):

```powershell
./scripts/build-bound-art.ps1 -DenseContacts
```

Start the existing Vite app on port 5182, then review:

```powershell
$env:TEST_HARDWARE_GL='1'
$env:TEST_HEADED='1'
$env:TEST_CAPTURE='1'
node scripts/review-bound-performance.mjs --geometry --record
node scripts/inspect-bound-performance.mjs
& 'C:/Program Files/Blender Foundation/Blender 4.5/blender.exe' `
  -b outputs/cinematic-intro/bound-chair-performance-partial.blend `
  --python-exit-code 1 --python scripts/art/check_bound_motion_import.py
```

Every Blender stage uses `--python-exit-code 1`. Blender's default successful
process exit after a Python exception previously allowed later stages to run on
an incomplete scene. Contact audits and the browser importer now explicitly
reject missing restraints and extreme wrist deviation.

## Remaining issues — do not describe this as commercial-art acceptance

| Priority | Open issue |
|---|---|
| CRITICAL | Continuous fall/reach/contact/grip/cut/release/removal/drop/stand and gameplay integration are missing. |
| HIGH | First-person diagnostic shows an unwanted near-camera skin patch at the lower frame edge. Identify the affected faces and resolve head/body camera visibility while retaining shadows before integration; do not hide fingers or change body proportions. |
| HIGH | Garment hem/collar and overall skin/material art quality still need close-up refinement. No commercial-fidelity claim. |
| HIGH | Raw review asset needs a measured shipping budget and texture/unused-target optimization before web deployment. |
| MEDIUM | Rope knot art, individual fibre/self-contact and all future release/ground states are not approved by these tests. |
| MEDIUM | No new full-intro Foley or interaction sounds have been authored in this checkpoint. |
| LOW | Existing large-bundle Vite warning and material sampler export warnings remain. |

## Safety

Working branch `intro/production-rebuild`; starting rollback branch
`backup/production-intro-start-2026-11-06` at `689e561`.
All game source/public assets, save formats, original art and production remain
unchanged. No push or deploy in this checkpoint. Railway only has production;
an incomplete art fragment must not be deployed there as the requested intro.

Rejected exploratory scripts are archived under the local, ignored
`outputs/cinematic-intro/rejected-technique-scripts/`, not in the build pipeline.
