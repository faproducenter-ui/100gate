# Native fall / ground checkpoint

Continuation of `72de967`, not a new project. The user's revised priority is
continuous gameplay first; intermediate materials need not be perfect.

## New authored sequence

- 0–12 s: existing native idle/struggle keys retained.
- 12–14.5 s: anticipation, loss of balance, left-side fall, impact/settling.
- 14.5–16.5 s: head reaction and upper-leg lowering while both wrists remain
  restrained to the chair. No hand/rope disappearance.

The original 53-bone actor and meshes are retained. The chair rolls about its
wooden support edge; evaluated actor/clothing/wood/rope geometry determines
floor support. Torso, head, ankles and constrained arms react separately. This
is authored skeletal animation, not an uncontrolled ragdoll.

Editable source/export: `art/intro-fall-native-wip.blend` / `.glb`.
Evidence: `art/review-evidence/native-fall-ground/`.

## Verification

- 217 whole/half-frame fall/ground samples: tested actor/chair and rope/actor/
  garment/chair surfaces do not cross; sampled floor penetration <1 mm.
- Six actual imported poses, native skins AND ropes: bidirectional source/
  Three correspondence maximum 0.017052 mm (unchanged 1 mm gate).
- Actual Chromium views inspected, console/page errors empty.
- Normal-speed **16.506-second partial** WebM decoded, sampled and played.
  This is continuous idle-to-ground footage, NOT full escape footage.
- TypeScript/Vite and existing-game skill-client smoke pass. Those regressions
  test the unchanged old runtime, not native intro integration.

Reproduce after creating the prior BOUND checkpoint:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 4.5/blender.exe' `
  -b art/intro-bound-native-wip.blend --python-exit-code 1 `
  --python scripts/art/author_intro_fall.py `
  --python scripts/art/export_bound_performance.py `
  --python scripts/art/audit_bound_performance.py -- --fall --dense
$env:TEST_HARDWARE_GL='1'; $env:TEST_HEADED='1'; $env:TEST_CAPTURE='1'
node scripts/review-bound-performance.mjs --fall --geometry --record --single
node scripts/inspect-bound-performance.mjs --fall
```

## Still unfinished — do not deploy as a playable full intro

1. Visible right chair-hitch loosening/unwinding and limited hand movement.
2. Ergonomically reachable knife placement/recovery and native pickup.
3. Blade cutting, progressive release, sequential cuff removal, rope drop.
4. Grounded stand-up and seamless controller handoff.
5. Native runtime integration, save/pause/full-input regressions and preview
   deployment. Current game source and production are unchanged.

The present rope meshes still follow the chair. They cannot simply be left
there while a supposedly cuffed wrist moves away: implement a rope prop rig or
continuous peeling solve first. Do not return to polishing idle materials.
