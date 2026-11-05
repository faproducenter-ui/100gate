# Combined hand and full-character WebM

`100gate-full-hand-character-review.webm`: **173.942 seconds**, 1280 × 960,
normal-speed capture, one file. This shows the ENTIRE CURRENT 12-second
hand-grasp study repeatedly from different cameras, **not a completed escape
intro**. No character, hand, knife, gameplay or production source was changed.

- 0–12 s: full actor from the front, complete clip at 1×.
- 12–84 s: complete clip from palm, dorsal, left, right, top and handle-base
  close-up views, 12 s per view.
- 84–102 s: continuous 360° hand orbit in the final grip.
- 102–126 s: continuous 360° orbit around the whole seated actor.
- 126–174 s: whole actor from rear, left, right and overhead, complete 1× clip
  from each view.

`recording.json` records the source GLB hash, timeline and real capture clock.
`decoded-review.json` validates the actual encoded file at all 13 section
midpoints and near its end. Included front/back images are decoded from that
file, not replacement renders. No browser console/page errors were recorded.
`video.sha256` hashes the delivered movie bytes. The original actor, chair
and all wardrobe meshes remain visible; camera distance fits the whole actor.

Reproduce using the existing Vite server on port 5182:

```powershell
$env:TEST_HARDWARE_GL = '1'
node scripts/record-character-multiview.mjs
node scripts/inspect-character-multiview.mjs
```

Output goes to `outputs/hand-character-review/`. No FFmpeg installation,
paid API, asset regeneration, push or deployment is needed.
