# Cinematic intro rebuild — static checkpoint, 2026-11-06

## Status: NOT a finished intro, NOT integrated

This checkpoint replaces the rejected staging approach in **new art sources**.
It does not replace the game's current EscapeRig, change story/save flags, or
publish anything. There is deliberately **no new full-intro WebM**: no complete
continuous escape has been animated. A movie of these constant pose holds would
misrepresent the requested result.

The existing first-person game remains unchanged. Selected diagnostic source
screenshots are genuine Three.js/Chromium renders, not Blender beauty renders.
They are technical blocking evidence, not commercial-art approval.

## Safety and provenance

- Starting revision: `47f60c0`; local rollback branch:
  `backup/cinematic-rebuild-2026-11-06`.
- Original `art/hand-knife-contact.blend` remains byte-identical to the backup:
  SHA256 `B33FF446CDA5FEAB25B5E588B6432F787875D41F8C191CA02DB2EEB20B46DEBF`.
- Original imported MPFB body, identity shape keys, source topology, UVs,
  textures, wardrobe and native 53-bone skeleton retained. No cylinder hands
  or replacement mannequin. No new third-party downloads/licence assumptions.
- Local thumb-web skin-weight repair: 44 source vertices across both hands,
  transferring erroneous lower-arm influence to the native hand bone; topology
  and appearance shape keys unchanged.
- New garment weight edits/corrective keys are confined to the new sources.
- Live Blender: prior user scenes retained. New review scene appended instead
  of clearing the user's working file. Old rejected source files preserved.
- No push, deploy, production configuration or user-save writes.

## Durable deliverables

- `art/intro-cinematic-blocking.blend`: editable native-rig contact poses at
  frames 1 / 81 / 161 / 241. **CONSTANT holds**, not transition animation.
- `art/intro-cinematic-bound.blend`: frame-1-only intact restraints study.
  Do not scrub the ropes into ground poses and call that a release.
- `art/intro-cinematic-bound-review.glb`: static skinned review export;
  not a production asset. Zero animation clips by design.
- `art/review-evidence/cinematic-blocking/`: browser images, source/rope
  contact diagnostics, model audit, import mismatch report, game smoke.

The four additional generated static GLBs and dense browser vertex dumps remain
under ignored `outputs/cinematic-intro/`; reproduce them with the scripts below.

## What was actually changed

1. Seated proportions/contact: the existing chair had a 52.75 cm seat for the
   actor's approximately 43.5 cm shin length. Uniformly scaled the **chair** to
   0.88, not the character, fingers or knife. Planted soles and supported pelvis
   against evaluated surfaces rather than guessed root offsets.
2. Behind-back native-arm IK: lower elbow poles, anatomically feasible lumbar
   wrist targets and proper humeral elbow-plane alignment. The rejected high,
   rearward elbows produced torn sleeve twists. Both wrists remain behind the
   torso; hands do not pass through the chair in the tested source pose.
3. Garments: rebound shoulder transition weights from the actual shaped bind
   skin; corrected rear hem/thigh influence. Added editable seated-waist,
   floor-contact and per-pose skin-clearance keys, with face-interior pressure
   checks, not just vertex clearance. Original sweater cage and materials stay
   editable; bind-space subdivision matches the export operation order.
4. Ground pose: a body-supported left-side/semi-prone staging, independent leg
   contacts, floor-side scapular adjustment and moderate lateral neck/head bend.
   A stray limb no longer lifts the whole actor off the floor. The right wrist
   is still restricted at recovery, rather than already reaching freely.
5. Ground grip: reuses the original finger pose/socket, exact native phalanges
   and unchanged knife. The closed-grip gate is **55 mm above the floor**;
   a floor reach/tilt/lift is NOT authored or faked by this static gate.
6. Standing endpoint: planted beside the fallen chair, not at an original spawn
   overlapping it. Actual supported stand-up transitions remain unbuilt.
7. Restraints: two continuous three-ply hemp ropes, each with wrist turns, a
   knot, tether, chair hitch and finite ends. Authored original packed fibre
   base/normal maps, high roughness. Tube clearance uses actual wrist normals
   and expanded wooden-slat planes. A radial-only offset was the actual cause
   of rope penetrating a narrow wrist/wood face at grazing angles. Excluded
   chair posts from the slat profile query and fixed UV/cap tangent export.
8. Dedicated source cameras: front/side/back/top, actual eye-space views and
   close/reverse hand views. No camera hiding of individual fingers.
9. Validation improvements: evaluated triangle/containment checks use a
   seam-welded diagnostic copy of closed chair components. Whole-composite
   ray parity had falsely reported a 107 mm pants penetration. Object lookup
   is exact so a rope with “chair” in its name cannot be mistaken for the chair.

## Story construction retained for the next stages

Both wrists initially have separate intact chair lashings behind the back.
The fall must **visibly loosen the right chair hitch**, not erase a wrist cuff.
Both cuffs remain present during the right-hand knife reach/cut. The left
chair tether stays restrictive until the blade cuts it. Then put the knife
down, peel each cuff, drop the ropes, let them settle/remain, and stand with
hand support. Nothing in this checkpoint claims those actions are animated.

## Checks actually run

- `npm run build`: PASS; existing >500 kB bundle-size warning remains.
- Original develop-web-game client via `scripts/run-game-skill.mjs`: PASS;
  entered `playing`, inspected screenshot and text. Local save API stubbed.
- Existing `scripts/verify-intro.mjs` at local port 5182: PASS for the **existing**
  chair/knife/rope flags, camera, keys and landing enclosure. This is regression
  evidence only; it does not validate the rebuilt intro.
- Actual Three r180/Chromium renders of all four static posed GLBs plus bound
  restraints: PASS loading/rendering, no page/console errors in the viewer.
- Opened and inspected browser front/back/side, ground, grip close-up/reverse,
  first-person screenshots. Visible shoulder skin-through was removed in these
  static views. Silhouette, cuffs, cloth folds and first-person framing still
  need art-direction refinement; this is not artistic acceptance.
- Evaluated Blender source: minimum actor/fabric height is 1 mm (bound/stand)
  or 2 mm (ground/grip). No source actor/chair triangle crossings or contained
  actor vertices in the tested poses. Does not establish sweep/fall safety.
- Bound-only source rope: zero evaluated surface crossings with the chair,
  body or wardrobe after the slat/normal clearance correction. Knot self-contact,
  topology during release and all moving contacts remain to be reviewed.
- Source ground-grip: actual knife component containment/crossing diagnostics
  and non-adjacent whole-hand self-crossings are zero in this **static** pose.
  Does not establish a valid floor pickup, intermediate finger motion or art
  acceptance from the player's actual camera.

### IMPORTANT FAILED gate: source → runtime skin correspondence

`scripts/art/check_cinematic_import.py` intentionally exits **1** currently.
Its default tolerance is 1 mm, using bidirectional nearest evaluated vertices.
Maximum observed mismatch: sweater **8.580 mm**, pants **5.202 mm**, visible body
**4.457 mm** across these poses; boots/eyes match at float precision.

The exporter explicitly warns about dropping influences beyond four after
bind-space subdivision. The installed Three shader/loader uses `JOINTS_0` /
`WEIGHTS_0` and four matrices. This is a concrete pipeline incompatibility to
resolve, not a new physics defect and not a passing static-art check. Source
contact numbers must NOT be described as browser contact proofs.

Do not silence this failure, loosen the tolerance just to pass, use a static
per-pose vertex compensation to conceal it, or enable JOINTS_1 without actual
renderer/CPU/shadow support. Prepare a reversible runtime-equivalent four-weight
authoring/preview mesh (preserve the original source/control cages), refine its
weight paint/correctives, and repeat geometry + visual checks before motion.

## Prioritised remaining register

| Priority | Open item | Acceptance evidence needed |
|---|---|---|
| CRITICAL | No continuous rebuild animation or runtime adapter yet | Native skeletal clips + real full-intro gameplay video; uninterrupted story/save/input sequence |
| HIGH | Up to 8.580 mm source/runtime skin mismatch | Four-weight-compatible authoring/export, <=1 mm correspondence, repeat actual browser contacts |
| HIGH | Static art not approved | Multi-angle review of shoulders, elbow folds, waist, restrained hands, cuff knots and eye-space knife orientation |
| HIGH | Missing cutting/removal/drop/support poses | Convincing static contacts first, including both cuffs and actual blade working edge |
| HIGH | No visible right-hitch payout/fall/pickup/put-down | Continuous rope and object tracking through every action; no snapping or disappearing cuffs |
| HIGH | No source sweeps or transitional collision checks | Floor/chair/body/rope sampling across actual authored motion, plus full-speed video |
| MEDIUM | Runtime size/influences/material warning/perf budget | Remove sampler warning, profile final imported actor in attic on desktop/mobile; no invented FPS target |
| MEDIUM | Source knots and winding need close art review | Geometry/self-contact and close source/browser images, not BVH counts alone |
| LOW | Diagnostic first-person ground view needs better readability | Authored restrained head motion; preserve anatomical eye anchor, no fake camera hiding |

## Reproduction (repository root, local only)

```powershell
$blender = 'C:/Program Files/Blender Foundation/Blender 4.5/blender.exe'
& $blender -b art/hand-knife-contact.blend -t 2 --python-exit-code 1 --python scripts/art/cinematic_actor_audit.py
& $blender -b art/hand-knife-contact.blend -t 2 --python-exit-code 1 --python scripts/art/cinematic_blocking.py
& $blender -b outputs/cinematic-intro/cinematic-blocking.blend -t 2 --python-exit-code 1 --python scripts/art/export_cinematic_blocking.py
& $blender -b outputs/cinematic-intro/cinematic-blocking.blend -t 2 --python-exit-code 1 --python scripts/art/author_bound_restraints.py
& $blender -b outputs/cinematic-intro/cinematic-bound-restraints.blend -t 2 --python-exit-code 1 --python scripts/art/export_cinematic_blocking.py
# Separate terminal: npm run dev -- --host 127.0.0.1 --port 5182 --strictPort
$env:TEST_HARDWARE_GL='1'
node scripts/review-cinematic-blocking.mjs
$env:CINEMATIC_VIEWS='{"restraints":["Back","Bound wrists","Side","Front","First person"]}'
node scripts/review-cinematic-blocking.mjs
Remove-Item Env:CINEMATIC_VIEWS
& $blender -b outputs/cinematic-intro/cinematic-blocking.blend -t 2 --python-exit-code 1 --python scripts/art/cinematic_contact_audit.py
& $blender -b outputs/cinematic-intro/cinematic-bound-restraints.blend -t 2 --python-exit-code 1 --python scripts/art/cinematic_contact_audit.py
& $blender -b outputs/cinematic-intro/cinematic-blocking.blend -t 2 --python-exit-code 1 --python scripts/art/check_cinematic_import.py
# Last command is an OPEN quality gate: expected failure until skin export is fixed.
```

Next work starts at the failed skin-correspondence gate, then the missing static
cut/removal/support poses. Do not record a “full intro” made from these holds or
replace the existing playable scene with this unfinished staging.
