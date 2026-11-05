Original prompt: Refine the existing 100gate Three.js horror game autonomously in tested local iterations; preserve story, saves and architecture. No push, deploy or production changes.

## Session 2026-11-05
- Starting revision: 524e2eb. Clean worktree. Local rollback branch: backup/refinement-2026-11-05-start.
- Blender MCP connected: Blender 4.5.15, protocol 15; no external paid generators enabled.
- QA inventory: chair -> knife -> ropes, pause/resume, held furniture LOS, walking/sprint/crouch/jump, staircase both directions, doors/keys, save reload, mobile input.
- Baselines and fixes will be recorded in docs/REFINEMENT-2026-11-05.md. Evidence belongs in ../../outputs/refinement-2026-11-05/.
- Iteration 1 validated: 120 Hz movement, furniture occlusion, dev QA hooks and skill-client wrapper. Full chapter + iPhone/Pixel + new motion regression passed. Evidence: baseline.json, after.json, motion-regression.json, skill-client/.
- Next: door leaf safety, explicit postprocess cleanup, Blender tangent repair. Do not push/deploy.
- Iteration 2 verified: swept door safety, composer/pass ownership cleanup, headed Chromium full chapter and mobile emulation. Local-only changes; no publication.
- Iteration 3 verified: live Blender PBR hand baking, MikkTSpace export, GLB validation, same-scene before/after screenshots, complete regression including weather/pack/episode/mobile. Editable source is art/character-hands.blend. Local revision chapter1-refinement-05. No publication.
- Iteration 4 verified: interaction holds use active game time; explicit cancellation and pause regression passes. All first-chapter/mobile regressions passed again. No push/deploy.
- Final: leave further shader prewarming, authored collision-proxy coverage, long memory soak, real-device performance and broader environment polish for separate measured iterations. Do not claim these are complete.
- Continuation: clean starting revision cc8d80a; local rollback branch backup/refinement-2026-11-05-headroom. Investigating actual stair headroom and crouch/stand ceiling clipping. No push/deploy.
- Iteration 5: reproduced invisible staircase ceiling and stand-up penetration. Actual overhead-solid snapshots now drive horizontal/vertical clearance and camera limits; opening/lid length corrected for standing stair ascent. Unit + headed browser headroom/motion + gear + complete chapter/save/mobile regressions passed. Original develop-web-game screenshot/text inspected. Evidence: headroom/baseline.json and regression.json. No push/deploy.
- Iteration 6 verified: real hatch leaf no longer crosses the front approach. Side hinge stops upright, capsule/leaf sweeps guard requests and animation, panel remains solid, actual angle gates stair access. Unit geometry + full browser regression including chapter, mobile, gear, pack/WebKit and High weather passed. Blender still connected; both restored hand meshes present. No push/deploy. Next case: interrupted closing/save reload.
- Iteration 7: interrupted-close autosave/reload softlock reproduced and fixed; physical closure commits the closed save state, stairs/lid remain valid from below. Build, dedicated reload/crouch/retreat test, hatch and headroom passed. Motion regression exposed a separate ESC/pointer-lock event race; preserved real event trace and investigating next. No push/deploy.
- Iteration 8 verified: expected unlocks and duplicate browser notifications no longer repause a resumed game. 100 rapid ESC cycles, unexpected pointer loss and tab focus loss, full chapter/mobile/gear/pack/weather regression, and local built-production intro smoke passed. No push/deploy.
- Intro rework from ed1b91a: Blender-authored wrist choreography, independent calibrated grip morphs, six-angle review scene, one knife with a local grip socket, intact chair tether, sustained bevel contact and measured saw travel before break, split rope and stand-up. See docs/INTRO-ANIMATION-QA.md and docs/REFERENCE-STUDY.md. No push/deploy.

## Replacement-character continuation, 2026-11-05
- User rejected the old intro and required a unified real MakeHuman/MPFB body rather than new hand approximations. Runtime edits from the interrupted iteration are preserved in the named Git stash; rollback branch backup/intro-loop-rework remains at e4635e5. Do not reapply that iteration as a shortcut.
- Downloaded pinned MPFB 2.0.18 and official CC0 skin/clothing/eye assets. Preserved original body, UV and 53-bone game rig with 30 phalange bones. Editable source: art/character-mpfb-review.blend; review GLB: art/character-mpfb-grip-review.glb. No production integration yet.
- Static sitting and power-grip views were rendered in Blender and imported/drawn by actual Three r180 in Chromium. Corrected wardrobe overlap, exposed cuff gaps and coarse trouser weight interpolation non-destructively.
- Added the isolated two-second KnifePowerGripClose skeletal study. Initial motion failed: thumb crossed hilt by 8.6 mm mid-closure. Staggered phalanges plus an authored CMC abduction arc removed that crossing. All 48 source frames rechecked; max approximate shaft penetration 0.544 mm, sampled blade penetration zero. Do not confuse diagnostics with artistic acceptance.
- Chromium static and motion checks passed; shared skeleton and real finger tracks present, zero hand/knife relative drift in samples, no console/page errors in the isolated asset viewer. Multi-view browser recording: outputs/mpfb-character/grip-close-study.webm (15.96 s); actual encoded-video frames also inspected.
- Build passed with existing chunk-size warning. Original develop-web-game smoke entered the existing game. Unisolated localhost port 5182 hit production-save CORS; repeated with an explicit local save stub and no errors. No production configuration or saved data changed.
- Reopened visible Blender via launcher, reconnected MCP, restored full actor view after a “missing character” report (it was a close-up camera). Two viewports now show the actor and hand together; the corrected closure action plays on the live rig.
- Remaining: art-review thumb-base deformation/grip pressure; author continuous restraint and BOUND → PARTIAL_RELEASE → KNIFE_PICKUP → ROPE_CUT → FULL_RELEASE → STAND_UP on this actual rig, then integrate, record full intro and run full gameplay/mobile regression. No claim that the intro is finished.
- User conditionally authorized push/deploy after the replacement is ready. This isolated study is not that milestone; no push or deploy performed.
- Additional QA correction: match Blender's modifier order to GLB (subdivision in bind space, then linear skinning). Fixed a separate browser-validator basis error (glTF knife local length +Y vs Blender +Z); its discarded 5.3 mm alert was not an observed visual defect. Refit on the runtime-equivalent surface.
- Blade containment rejected the fully extended early thumb sweep even after the shaft arc correction. The closure study now starts from a natural opposed pre-grasp; a future pickup MUST reach that pre-shape before contact. All 48 source/runtime frames rechecked: shaft profile penetration about 0.405 mm, sampled source blade containment zero, knife-relative drift zero. Still not an intro/pickup clip. See final JSONs, not superseded diagnostics above.
## Actual hand-contact rework — 2026-11-06

- User rejected the earlier `grip-close-study.webm`; its approximate shaft
  test was insufficient. Actual baseline audit found 8.7025 mm palm
  penetration excluded by dominant-digit-only selection. Do not reuse that
  video's passing statistics as artistic acceptance.
- Local rollback branch `backup/grip-penetration-start` preserves b447164.
  Recalibrated the unchanged knife against the actual palm; used the imported
  full MPFB actor, original 53-bone rig and individual native finger hinges.
  Local weight-paint repair changed 141 base vertices in right-hand groups;
  mesh, UV, shape-key geometry/values, textures and rest skeleton hashes match
  the original. No hand replacement primitives, shrinking or hidden fingers.
- New slow, baked skeletal reach/closure/hold. Fixed intermediate tang contact,
  skin folds and CMC timing. Merged source arm/knife into one zero-based GLB
  scene clip; knife stays fixed before full grasp and follows the wrist after.
- Technical gates passed: 434 actual source poses including half frames;
  22 actual imported-skin poses with all knife components and non-adjacent
  hand self-crossings; 289 hierarchy samples; six static views and 25 closure
  checkpoint images. Source/runtime hand-surface error <=0.1444 mm. No viewer
  console/page errors. These numbers are not artistic acceptance.
- New 1× close-up movie includes 18-second continuous 360° orbit and five
  closure views. Actual encoded WebM decoded, sampled and played at 1×.
  Packed source: art/hand-knife-contact.blend; GLB: art/hand-knife-contact.glb;
  evidence: art/review-evidence/hand-contact/. See docs/HAND-KNIFE-CONTACT-REVIEW.md.
- Build, original skill-client game smoke and focused existing-game intro/
  pause regression passed with local save stubbing. No src/public assets,
  story logic, production settings or original sources were replaced.
- Live Blender shows the new 12-second study on the complete original actor.
  Art review and later story-scene integration remain pending; do not claim
  the full escape intro or commercial art is finished. No push or deploy.

## Expanded video delivery — 2026-11-06

- User requested one complete WebM including every hand view and the entire
  actor from all sides, particularly behind. Recorded 173.942 s at 1280×960:
  six full hand-clip views, hand 360°, full-actor 360°, front/rear/side/overhead
  full-clip views. Normal speed; unchanged canonical GLB. All 13 sections and
  the ending decoded successfully; no browser errors.
- Delivery: art/review-evidence/hand-character-full/100gate-full-hand-character-review.webm.
  Source clip is the existing grip study, not an authored full rope escape.
  Added reproducible record/decode scripts only. No gameplay changes or deploy.
