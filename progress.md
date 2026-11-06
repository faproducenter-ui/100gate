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

## Complete cinematic rebuild request — 2026-11-06, static checkpoint only

- Full pasted request read. New rollback branch backup/cinematic-rebuild-2026-11-06
  at 47f60c0. Original hand-knife-contact.blend SHA256 matches its safe backup.
- Authored new native-MPFB-rig seated/left-side ground/ground-grip/standing contact
  holds, not replacement primitive people. Chair uniformly .88 to match shin/seat
  contact; body proportions/mesh/UV/materials retained. Local thumb-web weights,
  sleeve shoulder binding, editable cloth-corrective keys and bind subdivision.
- New intact independent wrist-to-chair hemp lashings on BOUND-only source.
  Fixed actual radial-vs-normal tube-clearance bug and wrong slat profile scope;
  final source body/garment/chair/rope cross-checks zero at these static gates.
  This does NOT prove motion or knot art quality. Minimum actor/fabric floor
  distance 1 mm bound/stand, 2 mm ground/grip. Closed grip static self-crossings0.
- Actual Three/Chromium first-person/full-body/hand close-ups rendered/inspected.
  Viewer page/console errors empty. Existing-game intro regression and original
  develop-web-game smoke passed with local save stubs; build passed, old bundle
  warning remains. No gameplay/public assets changed.
- IMPORTANT OPEN HIGH gate: new bidirectional actual source/Three mesh comparison
  FAILS <=1 mm tolerance (max sweater8.580mm/pants5.202mm/body4.457mm). Exporter
  truncates subdivided >4 weights; installed Three uses four. Do not claim source
  contact checks prove browser contacts. Resolve runtime-equivalent skin authoring
  before any full animation. Test deliberately exits1; do not weaken it to pass.
- Durable sources art/intro-cinematic-blocking.blend, intro-cinematic-bound.blend
  and static bound review GLB. Report docs/CINEMATIC-INTRO-REBUILD.md; evidence in
  art/review-evidence/cinematic-blocking. Original assets/rejected scene preserved.
- NOT DONE: no continuous struggle/fall/reach/cut/peel/drop/stand clips, no new
  intro integration, no full-intro WebM. Timeline holds must not be sold as a movie.
  Next: solve skin export mismatch, then missing cutting/removal/support static
  contacts and art review before animation. No push/deploy.

## Production rebuild continuation — 2026-11-06 (work in progress)

- Current branch: intro/production-rebuild; rollback branch
  backup/production-intro-start-2026-11-06 at 689e561. No source/public gameplay
  changes or push/deploy in this continuation. Production has not been changed.
- Reversible four-weight authoring now matches actual Three.js deformed meshes
  within 0.0171 mm in the previous BOUND motion source. Original native cages,
  UV/materials, 53-bone rig and canonical hand source preserved (SHA256 unchanged).
  Re-run this test for the NEW neutral-wrist source before claiming equivalence.
- Humeral twist root cause corrected in the new authoring copy. Physical native
  sweater fitting, detailed bevelled/UV/PBR knife and two native skeletal phases
  (BoundChairIdle 0-4 s / ChairStruggle 4-12 s) authored. NOT a complete intro.
- IMPORTANT: initial rope mesh audit found real crossings. Rejected independent
  nearest-normal projection on open cloth, over-wide convex slab envelopes and
  a weak sleeve-rim pin: numerical passes could still look loose in close-up.
- Found old BOUND hand direction roughly across the body rather than aligned
  with the forearm. New native whole-arm static solve aligns wrists to 4.386 /
  0.635 degrees of deviation, retains real fingers, and has zero body/chair
  surface crossings. Physical sweater fitting is being re-run for this pose.
- Empty restraint audits could falsely appear clean after Blender Python errors:
  added mandatory two-rope/five-skin assertions, failing surface gates, and a
  safe reproducible PowerShell pipeline with --python-exit-code 1 at every stage.
- Exact triangle/plane section envelope now replaces the loose slab approach;
  latest contacts + browser closeups MUST be checked after new pose/cloth build.
- Headless Chromium still selected SwiftShader even with TEST_HARDWARE_GL=1.
  Headed mode uses actual Intel UHD Direct3D11. Use TEST_HEADED=1,
  TEST_HARDWARE_GL=1, TEST_CAPTURE=1 for motion review; old low-cadence movies
  are rejected as visual acceptance. Added recorder-first-frame priming and
  a bounded capture timeout; do not leave hung test browsers behind.
- Existing-game active-clock intro/pause/cancel regression passed in Chromium
  with save API stubbed; original develop-web-game client smoke also passed
  with save stubbing and its scene screenshot/state inspected. This tests the
  OLD gameplay, not integration of the new native actor. TypeScript/Vite build
  passed; existing >500 kB bundle warning remains.
- Blender reopened on request; service console hidden, NOT process closed.
  Previous scenes retained; live window now shows neutral-wrist STATIC WIP.
- Still CRITICAL: continuous fall/reach/cut/peel/drop/stand, consistent rope
  release, gameplay integration and full intro video are NOT implemented.
  Do not publish partial art as a playable finished intro.

## Durable native BOUND checkpoint — continuation result

- Saved art/intro-bound-native-wip.blend and .glb; original art unchanged.
- Neutral wrists + fully pinned original cuff fitting + finite-radius native
  triangle-section rope envelope now pass 577 evaluated full/half-frame contact
  samples. Both actual ropes are present; source hash matches the durable file.
- Actual bidirectional imported-surface comparison includes all five actor skins
  AND both ropes, six poses: max 0.0179704 mm with the unchanged 1 mm gate.
- Actual headed Intel UHD browser screenshots reviewed; max imported wrist
  deviation 5.412 degrees, no console/page errors. Residual near-camera skin
  patch in POV and garment hem/material art are still NOT visually accepted.
- New 48.006-second 1x WebM decoded, sought, inspected and played to completion.
  Four views of ONLY the same two native phases. Report SHA256 matches the
  delivered movie. Post-capture encoding time is measured separately, not
  incorrectly counted as video duration. Old stale pass markers removed first.
- Durable evidence: art/review-evidence/intro-bound-native/; full scope and open
  priorities: docs/NATIVE-BOUND-WIP.md. Build and existing game regressions pass.
- Blender reopened using blender-launcher.exe on the durable .blend, MCP
  connected, service console hidden. Left it available for the user's inspection.
- No src/public changes, no push/deploy. Full fall/pickup/cut/removal/drop/stand,
  native gameplay integration, shipping optimization and final art remain open.

## Continue playable intro request — fall and ground checkpoint

- New request read: prioritize continuous playable sequence over intermediate
  material perfection. Do NOT re-audit/re-polish BOUND unless a critical issue.
- Starting rollback branch backup/intro-continuation-72de967. Original first
  12-second performance retained; new native animation extends to 16.5 seconds:
  balance loss/fall 12..14.5, ground reaction 14.5..16.5. Native torso/head/ankle
  reactions, actual evaluated support surfaces, both chair-relative restraints
  retained. Upper leg settles toward the lower leg after landing.
- Durable new sources art/intro-fall-native-wip.blend/.glb. Source objects/UV/
  native skeleton preserved; previous BOUND source untouched. Blender shows
  an appended fall scene; earlier user scenes retained.
- Fall/ground actual contact audit: 217 full/half-frame samples, zero tested
  actor/wood/rope surface crossings, floor min >-1 mm. Six actual imported poses
  match source in both directions to max 0.017052 mm. Browser errors empty.
- New continuous 16.506 s 1x WebM includes idle, struggle, fall and ground,
  NOT the complete escape. Decoded/sought/played real encoded file; hashes
  and screenshots in art/review-evidence/native-fall-ground/.
- TypeScript/Vite build passes; original develop-web-game client smoke with
  save API stubbing passes; screenshot inspected. OLD game regression only,
  NOT proof of native gameplay integration. Large-bundle warning remains.
- NEXT UNFINISHED: right chair-hitch must visibly loosen/unwind before the
  native right hand reaches the floor knife. Both wrist wraps remain. Then
  pickup with the original tested finger clip/socket, blade cut, cuff removal,
  rope drop, stand, native runtime adapter, full playtest, safe preview deploy.
- Do not simply let the right hand detach from the existing chair-parented
  rope mesh. A rope prop rig/peeling solve is needed for this next phase.
- Ground source right shoulder ~[1.232,-.008,.446], arm length .515 m; current
  knife floor [1.18,-.47,.0125] may be out of reach. Solve placement/recovery
  ergonomically before reach, do not stretch/scale the human arm or teleport.
- No src/public change or native intro integration yet. No push/deploy: user's
  condition is to publish only AFTER the ENTIRE sequence is playable.

## 2026-11-06 — Continuous rocking-to-fall replacement
- Latest request read from eac7d13b attachment. Rejected old neutral reset before
  fall; retained old source and rollback branch backup/rock-fall-rework-51d32a1.
- Authored ONE C2 curve from growing rocking through support loss, impact,
  rebound and settle, 48 fps native skeleton. No ragdoll/new model/mesh edits.
- Corrected both-feet-planted knee twist/seat clipping via opt-in knee hinge
  alignment, unilateral foot unloading/toe-off and <=8 mm pelvis unweighting.
- Durable art/intro-rock-fall-continuous.blend/.glb. 1201 actual surface samples
  4..16.5 s pass actor/chair/rope/floor gates. Audit timestamp labels fixed from
  hardcoded 24 fps to actual 48 fps without changing sampled geometry.
- Seven actual Three.js imports match native source <=0.017387 mm. This is NOT
  final anatomical/visual acceptance. Viewed decoded comparison/impact/FP frames.
- Four real encoded WebMs in art/review-evidence/rock-fall-continuity/: 1x same-
  angle before/after, 1x FP, actual 0.25x side + FP. All hash checked/decoded/
  played. Normal movies include measured waveform-aligned CC0 impact Foley;
  slowed videos silent intentionally. Not a full escape video.
- Actual game cameraMotion slider/default migration/persistence tested. Existing
  game active-clock/hold cancellation/pause and original skill smoke passed.
  npm run build passed; existing large-bundle warning remains.
- Native film runs in Three.js diagnostic scene, NOT gameplay EscapeRig yet.
  New native sequence has no pickup/cut/remove/drop/stand. Those phases and
  native runtime adapter remain next. Do not present partial scene as playable
  full intro or deploy it. Main game only gained reduced-camera-motion setting.
- Live Blender: left user's WALK mode using Escape, appended new scene without
  replacing prior scenes or saving over the user's mixed open file. Camera shows
  new transition at frame561; old scenes retained.
- No push/deploy. Full technical report, proofs and reproduction steps in
  art/review-evidence/rock-fall-continuity/README.md.

## 2026-11-06 — Torso/wardrobe and LEFT rail escape rework (in progress)
- Latest ed1b70bc attachment read in full. NEW story overrides old right-hand
  escape: left rail fails on impact, left stays wrapped and picks up the knife;
  left cuff first, right restraint second. No push/deploy.
- Safe rollback: backup/body-postfall-start-538a106. Existing art/game sources
  preserved; current candidates live in ignored outputs/body-postfall.
- Native actor already male (MPFB gender=1), not a generated new human. Root
  garment problem: previous Bound corrective moved lower hem up to 142 mm and
  carried extra thoracic volume. New editable Tailored seated wool key retains
  original topology/UV/materials/cuffs; fitted against evaluated complete skin,
  local thoracic clavicle-to-spine weight correction on 3906 vertices. Skinning
  remains <=4 influences. New hem no longer has the first rejected central flap.
- outputs/body-postfall/intro-tailored-fall.blend + exported
  outputs/cinematic-intro/intro-tailored-fall.glb: coarse + dense1201 native
  actor/chair/rope/floor gates passed. Exact-source dense report copied to
  outputs/body-postfall/tailored-contact-dense.json. Three before/after closeups
  inspected (side/front). Main game source not changed this turn.
- scripts/art/author_left_chair_break.py is a WIP: original lower rear rail
  split locally, original surfaces/UVs retained + fresh end cap. Left full rope
  retained, prop skin links forearm cuff and detached wood hitch. Right unchanged.
- REJECTED trajectories: hand directly forward went through torso; straight
  backward crossed middle back rail. Native wrist/forearm relation fixed so the
  cuff follows forearm rather than a twisted palm. Hand target reach limited
  without scaling bones. Last unvalidated candidate adds independent 16-degree
  torso recovery roll while right wrist stays on the chair. Verify its actual
  audit/hash before promoting; previous partial candidates FAILED and must NOT
  be mistaken for final. See left-break.log / partial-contact.log.
- Use Blender --python-exit-code 1 and stop on nonzero: default Blender reports
  Python exceptions but can still exit0! This previously allowed an OLD failed
  candidate audit after an authoring exception; no such candidate was promoted.
- New partial audit checks actor/chair/fragment/ropes/floor, plus right wrist
  anchor drift. Next: get this gate and visual pose correct, then left knife
  grip/reach, sequential left/right cuts/removal/drop/stand. None authored yet.
- Review harness now accepts BEFORE_ASSET, AFTER_ASSET, REVIEW_OUT and --postfall
  for actual native torso/waist/rear closeups; old defaults preserved.
- npm run build passed (existing bundle warning). Original skill smoke rerun
  with save API stub at5182; inspect latest outputs/body-postfall/existing-game-smoke.
- FINAL THIS ITERATION: partial source passes409 dense samples12.25..16.5 s,
  zero tested actor/chair/fragment/rope crossings and floor>-1mm. Right wrist
  anchor max drift0.093780mm. Native torso recovery is independent of chair;
  right wrap now has rotating-forearm/fixed-hitch skinning. Local right-sleeve
  pressure key (2722 vertices) removes garment/cord crossing without inflating
  the cord. Source/runtime nine-mesh correspondence max0.017251mm.
- Durable verified sources: art/intro-tailored-native-fall.blend/.glb and
  art/intro-left-rail-partial.blend/.glb. NOT full escape. Rejected old partial
  trajectories are NOT the promoted source. Knife/grip/cuts/drop/stand/runtime
  adapter remain unfinished; first-person movie is a diagnostic stage, not house.
- Four actual WebMs recorded, decoded/sought/played and hash checked, with torso/
  waist/rear/overall screenshots inspected and decoded FP frame inspected. See
  art/review-evidence/body-postfall/README.md. Capture has occasional frame gaps
  (max175ms), not claimed to be game FPS. Fracture edge remains simplified.
- Live Blender appended new scene "100gate | Tailored LEFT rail · partial review"
  but preserved user's current active WALK mode and old scene; no forced switch.
- Found two real EBUSY Vite crashes during large art-copy operations (.blend,
  then.glb). Fixed authoring/evidence directory watcher scope; HTTP serving and
  TS transforms remain available. Dedicated verify-art-watch.mjs passes for both
  file types. Encoder files were valid; initial decode fetch failed because
  devserver crashed. After fix all four actual WebMs decoded/played successfully.
- This iteration changed no gameplay FSM/player save, no push/deploy. Continue
  with actual LEFT knife static grip/ergonomic reach, then left cuff first and
  right restraint second. Do NOT reuse the older right-hand escape instructions.

## 2026-11-07 — COMPLETE INTRO implementation in progress (not deployable yet)
- Latest 64ea8ec8 request is to FINISH ALL stages and integrate into the game,
  not polish sweater/fracture. User explicitly permits preview push/deploy ONLY
  after complete playable/validated scene; no production changes/force push.
- Rollback branch backup/complete-intro-start-ec9e83d. src/episode/native-intro.ts
  now provides real 42-second NativeIntro AnimationMixer + independent IntroFlow:
  R rocking, automatic fall/break, E pickup, R left/right cuts, auto removal/drop/
  stand, normal controls. World loads public/assets/chapter1/intro-native-v2.glb.
  Runtime uses native eye camera, dynamic chair/fragment collision boxes, same
  save API, legacy save migration and version2 active-clock checkpoint. Old
  EscapeRig remains hidden for inventory-knife compatibility, not played.
- First real-control browser prototype completed ALL11 stages through walking,
  pause and final save; actual uninterrupted page WebM in outputs/complete-intro/
  game-test. Not final visual acceptance: subsequent strict tests found issues.
- scripts/art/author_complete_intro.py extends original native body/53-bone rig,
  mirrors repaired native right-hand FK/weights to LEFT (no new human mesh),
  adds actual duplicated/capped rope cut seams and exported contact markers.
  External left load-bearing tail is the cut target, not the knife wrist itself.
- Actual floor/hand audit exposed thumb mid-close penetration, floor crossings
  of sleeve/rope, and leg/chair contact in supported rise. Source fixes in progress:
  staged thumb opposition, raised blade-supported floor pose, free-wood Hitch
  floor support, open fingers only AFTER putting knife down, push chair away with
  heel before kneeling. No geometry gate was disabled; no publication performed.
- Strict runtime draw gate initially stalled: Blender knife-local Z is glTF-local
  Y (not Z). Corrected contact measurement axis using actual debug marker coords.
  Requires >=10cm working-edge draw before either cut event; saved draw progress.
- Current author/audit running: inspect outputs/complete-intro/author.log and
  geometry.log; FIRST UNFINISHED requirement is those actual geometry gates and
  final full real-control regression. Public GLB may still be previous candidate;
  compare/re-export exact successful source before any acceptance/deploy.
- Use --python-exit-code1 and stop on failure; never audit an old file after a
  failed author. Runtime sources currently pass npm run check. Do not deploy yet.
- Blender GUI opened via blender-launcher.exe on art/intro-left-rail-partial.blend,
  MCP running localhost9876, user can see source. Append complete draft safely,
  preserving user scenes; no overwrite of the old source.

## 2026-11-07 — Complete playable native intro / preview candidate
- Finished the actual42s sequence: R rocking, fall/left fracture, LEFT reach and
  native five-finger grip, external left tail cut, upright right standing-part
  cut, knife putdown, sequential wrap removal/drop, supported rise and existing
  FPS control. Runtime requires measured blade-edge draw before cut events.
- Corrected own-forearm/handle and right-thumb path penetration using evaluated
  native meshes; staged an outboard way point and floor-putdown elbow recovery.
  Corrected thigh/chair crossings by retracting the heel before the rise.
  Loose wraps now settle on the floor rather than rotating through it.
- Dense Blender source gates pass157 poses and79 actual hand/knife samples.
  Runtime exported contact axes are Y-up; both cuts require>=10cm edge draw.
- Literal eye coverage of rear wrists exposed own face/collar. Removed a failed
  head-hiding experiment; retain the complete human mesh. Final camera uses
  explicit cinematic close-ups with35deg FOV and smooth eye-view bookends.
  Camera-only pass preserves non-camera geometry/action signatures.
- Real-control, uninterrupted game video passes all11 states and normal walking,
  pause and completed save. Desktop/mobile checkpoints restore time/draw, cannot
  duplicate the knife, and allow pickup of the knife left on the floor. Test
  aim needs advanceTime(17), not advanceTime(0), which only renders old transforms.
- Complete house progression and iPhone13/Pixel7 Chromium touch checks pass.
  Original develop-web-game client rerun and actual screenshot inspected.
  Production Vite build and UI-only R/E/full intro/pause/reload test pass with no
  development probes, no JS/HTTP errors or remote save calls. Release hashes,
  including native GLB, match local served production build at5183.
- Added async native render prewarming under loading. Cold first-game-frame
  spikes still measured (~1.77s on this instrumented Intel UHD capture): do NOT
  claim stable60FPS or that prewarming removed all stalls. Later frame times
  and draw-call counts are recorded per stage, including camera-orbit spikes.
- Durable source: art/intro-complete-native.blend; actual runtime GLB is in
  public/assets/chapter1/intro-native-v2.glb. Actual full silent page WebM and
  reports/screenshots are in art/review-evidence/complete-intro/. Decoded actual
  WebM played1x with zero dropped frames in the inspection run; this is NOT an
  FPS claim or proof of an audio mix. Foley bank/event checks are separate.
- Blender GUI now opens the complete editable art source at29s, first pane
  cinematic camera and another overview where available. Previous unsaved GUI
  state preserved as outputs/complete-intro/ui-review-before-final-source.blend.
- Known remaining: sweater body poke-through, facial performance, supported-rise
  weight transfer, cord dynamics and cinematic timing; not artistic final.
- User's latest attached request explicitly permits push/preview AFTER full
  playable validation. Production Railway game watches main (verified read-only);
  feature branch push will not modify it. Use a NEW isolated preview project,
  no production domain/backend/Postgres changes. Publication pending below.
