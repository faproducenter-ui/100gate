# Actual hand–knife contact review — 2026-11-06

## Scope and acceptance

This supersedes the rejected `grip-close-study.webm`. That older study's
approximate shaft test was NOT proof of correct contact. The new deliverable
is an isolated, editable hand-contact study on the existing full MPFB actor,
not a completed escape intro or a new game. No production assets or gameplay
code were replaced. No push or deploy was performed.

**Mesh tests and artistic acceptance are separate.** Inspect the new movie,
not only the passing numbers below. Source skin, clothing and blade finish
are not claimed to be final commercial art. In particular, the existing cuff
is thin and the blade has visible faceting in close-up. Those are not hidden
with darkness, transparency or post-processing.

## Deliverables

- [Editable packed Blender source](../art/hand-knife-contact.blend).
- [Animated GLB](../art/hand-knife-contact.glb).
- [New normal-speed close-up WebM](../art/review-evidence/hand-contact/hand-contact-slow-360.webm),
  1024 × 768, approximately one minute (decoded duration 59.925 s).
- [Evidence directory](../art/review-evidence/hand-contact/): 25 checkpoint
  images, baseline, dense source audit, imported-mesh audit and video checks.

Open the source at frame **241** for the accepted static grip. The complete
skeletal study is frames **1–289**, **24 fps**, **12 seconds**. The original
full body, wardrobe, UVs, shape-key geometry, textures and 53-bone rest rig
remain present. No new human/hand mesh was synthesized.

## Root causes and repairs

1. **The previous validator excluded the palm.** Its dominant-digit selection
   missed `hand_r`, and its oval proxy was not the actual handle. The actual
   original palm entered the wood by **8.7025 mm**. The prop's grip seating was
   recalibrated against the deformed palm; the unchanged handle now rests
   inside the closed hand, not in tissue or away from the palm.
2. **Thumb contact was aimed through the index.** The new thumb is opposed to
   the fingers and contacts the index's outer proximal surface. Its tip is
   not forced onto the same cylinder surface already occupied by the index.
3. **The stock weights folded the skin inside bent knuckles and the thumb
   web.** Local weight-paint smoothing repaired **141** original base vertices
   in right-hand deform groups only. Base coordinates, topology, UVs, all
   original shape-key geometry/values and texture bytes are unchanged.
   No finger shrinking, missing faces, opacity changes or primitive proxies
   were used. Bone rest transforms and proportions are unchanged.
4. **Independent joint timing created intermediate skin folds.** Each finger
   retains its own MCP/PIP/DIP hinge control and final angles. Distal wrapping
   now follows proximal closure without the earlier tang-seam crossing.
   Thumb CMC opposition completes together with MCP/IP flexion instead of
   holding CMC rigid at its final angle while the rest of the thumb is open.
5. **Export defaults split arm and prop into different clips and shifted time
   by one frame.** The new GLB explicitly uses scene baking, no per-object
   split and a zero-based timeline. It contains one `HandContact_SlowPowerGrip`
   clip. Neutral pre-skin subdivision and linear skinning match the renderer.

The reviewed pose has four closed fingers around the unchanged handle, with
the thumb outside/opposed to the index rather than pinching with fingertips.
The wrist remains aligned with the forearm. The close-up stills and orbit do
not hide any finger. This describes the inspected study, not a claim of
medical validation or photorealism.

## Timing and hierarchy

| Seconds | Action |
|---|---|
| 0–1 | Open hand |
| 1–3.5 | Arm reach and thumb pre-shaping |
| 3.5–7 | Individually hinged finger wrapping |
| 7–8.5 | Thumb opposition and closure |
| 8.5–10 | Full grip and settling |
| 10–12 | Small wrist lift; knife follows the exact wrist socket |

The knife stays world-fixed until full grasp at 10 s, then follows the baked
wrist socket. There is no mid-animation parenting change or free prop drift.
The arm is posed forward for uncensored 360° inspection. This is a review
fixture, **not** the staging of the eventual floor pickup.

The 0/25/50/75/100% stills denote elapsed time within the 3.5–9 s closure
inspection window, not identical percentage rotation of every joint.

Movie: 0–12 s sequence at 1×; 12–30 s continuous 360° orbit of the full grip;
then 1× replays from dorsal, top, left, right and palm views. The recorder
starts AFTER numerical sampling; no fast diagnostic frame jumps are included.
The actual WebM was decoded, 26 moments were captured, and the entire encoded
movie was played back at 1× (60.026 s wall time, no decode error).

## Geometry and browser evidence

- **434 source poses:** every source frame plus half frames over contact and
  closure. Actual evaluated skin triangles vs every wood, tang, pin and blade
  component: no contained skin vertices or surface crossings in the sampled
  poses; no non-adjacent hand self-crossings, including thumb–palm and folds
  within individual digits. Configured authoring-angle bounds were checked;
  these bounds alone do not establish anatomical quality.
- **22 actual imported Three.js poses:** actual `getVertexPosition` skinning
  and actual indexed knife meshes, not a shaft profile or bounding boxes.
  No knife or hand self-crossings in those samples. Source/runtime surface
  correspondence error was at most **0.1444 mm**, including four-influence
  normalization at the wrist. UV-split adjacency is restored using identical
  bind positions AND skin weights, never proximity of moving skin surfaces.
- **289 imported hierarchy samples:** knife world transform remains fixed
  before attachment; the wrist-relative matrix stays stable after attachment.
- Chromium used the actual Three.js r180 loader/renderer on Intel UHD D3D11.
  Viewer console/page errors: **none**. Capture ran on the wall clock without
  acceleration. Its timing metrics are not a production-game FPS benchmark.
- TypeScript/Vite build passed (existing bundle-size warning retained).
  The original develop-web-game client entered the existing game; a separate
  existing-game regression passed rocking/tipping, knife pickup, release,
  standing, pause and resume. Saves were stubbed locally; no production save
  or browser profile was modified. This does NOT approve the old intro art.

## Reproduction

Use the existing checkout and its Playwright dependency. From the repo root,
with Vite serving `http://127.0.0.1:5182`:

```powershell
$blender = 'C:/Program Files/Blender Foundation/Blender 4.5/blender.exe'
$env:GATE_CONTACT_MOTION = '1'
& $blender -b art/hand-knife-contact.blend -t 2 --python-exit-code 1 --python scripts/art/export_contact_review.py
$env:TEST_HARDWARE_GL = '1'
node scripts/verify-hand-contact-motion.mjs
& $blender -b art/hand-knife-contact.blend -t 2 --python-exit-code 1 --python scripts/art/audit_runtime_hand_motion.py
& $blender -b art/hand-knife-contact.blend -t 2 --python-exit-code 1 --python scripts/art/audit_hand_contact_motion.py
node scripts/inspect-hand-contact-video.mjs
node scripts/verify-hand-review-game-regression.mjs
```

Reports and raw geometry dumps go to ignored `outputs/hand-mesh-rework/`.
The native source is the production-authoring checkpoint; optimization and
weight-repair scripts also retain failed-candidate gates for diagnosis.

## Remaining boundary

Human visual review of the new close-up is still required. Do not declare the
whole horror intro finished, or reuse its rejected rope/body choreography.
Integrating this actor and its source clips into the story scene, authoring
that complete sequence and evaluating it in first-person remain separate
work. Other chapters, weather, lighting and game architecture were not changed.
Rollback: local branch `backup/grip-penetration-start` at `b447164`; original
sources and the earlier named stash remain untouched.
