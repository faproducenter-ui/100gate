# Local refinement — 2026-11-05

## Краткий итог
Четыре проверенные локальные итерации: стабильный шаг движения 120 Гц, запрет удержания мебели через стены, безопасная траектория дверей, освобождение ресурсов постобработки, PBR-материалы кистей из Blender и единое игровое время для удержаний R.
Сюжет, движок и формат сохранения не заменены. Есть локальная точка отката; push/deploy не выполнялись. Полная глава и мобильная эмуляция проверены повторно. Реальные мобильные устройства и длительный тест памяти не сертифицированы.


## Safety and scope
- Baseline: 524e2eb, preserved by local branch backup/refinement-2026-11-05-start.
- No remote push, deployment, production access changes, save-schema replacement, engine change, or asset deletion.
- Actual stack: imperative Three.js 0.180, React DOM shell, TypeScript, Vite; existing analytic character collisions. Rapier dependency present, but not integrated into the current episode. Replacing it is not justified by this iteration.
- Blender 4.5.15 / MCP protocol 15 connected; paid services disabled.

## Issue register
| ID | Priority | Evidence / root cause | State |
|---|---|---|---|
| Q01 | HIGH | Furniture hold survives a move behind a wall. Baseline browser test starts R in storeroom and stages player in bedroom; storeCabinet still reaches saved.moved. Hold retention checks distance only. | Verified in iteration 1 |
| Q02 | HIGH | Sprint covers 8.668 m vs 5.675 m over ~2.22 s under 129 ms rendering frames. tick clamps elapsed time to 85 ms and physics uses variable timestep. | Verified in iteration 1 |
| Q03 | HIGH | EffectComposer.dispose does not dispose its passes; UnrealBloomPass owns additional targets and OutputPass owns a shader. Source-confirmed resource-lifetime defect, not a measured long-term leak magnitude. | Ownership fix verified in iteration 2 |
| Q04 | MEDIUM | Diagnostic game client cannot import project Playwright from the skill folder; lacks native render_game_to_text / advanceTime, and explicit 5 s start-click timeout is shorter than actual cold loading. | Verified game hooks + project wrapper in iteration 1 |
| Q05 | MEDIUM | Hand GLB lacks tangents despite normal map. glTF validator warns about runtime-generated tangent space. | Verified Blender bake/export and browser import in iteration 3 |
| Q06 | MEDIUM | Open doors can rotate a leaf into the player; current close guard only measures distance to door root. | Reproduced and verified fixed in iteration 2 |
| Q07 | MEDIUM | Ground support remains analytic and supports the current house, not arbitrary terrain/rigid-body interaction. No claim of full rigid-body physics. | Overhead geometry improved in iteration 5; general support deferred |
| Q08 | LOW | Some installed skill shared reference documents are absent; not a runtime defect. game-studio is not installed. | Not changed |
| Q09 | MEDIUM | R-hold uses performance.now while gameplay/test stepping uses simulation time; manual clock cannot advance the intro. | Reproduced and verified fixed in iteration 4 |
| Q10 | HIGH | Height-based ceiling threshold prevents jumping in the open staircase. Releasing crouch under the attic-floor lip puts the eye through solid boards. | Reproduced; real solid headroom verified in iteration 5 |
| Q11 | HIGH | Hatch rotates around its front edge through the normal interaction position. Ordinary door sweep guards explicitly exclude it. | Reproduced; side hinge and capsule/leaf guard verified in iteration 6 |
| Q12 | HIGH | Interrupted hatch closing persists closed before reaching rest; reload strands a valid saved player on stairs whose support is conditional on the open lid. | Reproduced; targeted fix verified in iteration 7 |
| Q13 | HIGH | Delayed/repeated pointerlockchange notifications re-pause a newly resumed game. The window remains focused and visible. | Reproduced with event trace; targeted fix verified in iteration 8 |

No CRITICAL issue has been reproduced in this session. This is not a certification that none exists.

## Evidence
- ../../outputs/refinement-2026-11-05/baseline.json
- ../../outputs/refinement-2026-11-05/before-furniture-wall.png
- Baseline loadToPlayableMs also includes the ~1.8 s frame sampling period; do not quote it as pure loading time.
- Baseline profile: real headed Chromium, 1280x720, Low. Rendering frame p50 7.1 ms, p95 20.9 ms; throttled mean 129.4 ms. Not representative of mobile hardware or a guaranteed production FPS.

### Iteration 1 — verified
- Character integration now runs in 1/120 s steps, with a bounded 250 ms catch-up budget; no physics-engine replacement.
- Held furniture retains grip only while a fresh geometry ray reaches that same object. Walls stop the hold.
- Added dev-only text-state and explicit time-stepping hooks; added a project-side launcher for the unmodified develop-web-game client (project Playwright resolution and a real loading timeout).
- PASS TypeScript + Vite build, intro sequence, complete chapter, save reload, iPhone 13 and Pixel 7 touch emulation.
- PASS deterministic movement at 60/8 Hz partitions, thin wall, closed/open doorway, stair ascent/descent, jump/landing, pause/resume; no JS/console errors.
- Real-frame follow-up: normal 8.864 m / 2.275 s, throttled 8.014 m / 2.227 s. Short samples still include input/frame-boundary effects; not a hardware FPS target.
- The wall exploit no longer completes or persists movement. The wardrobe stops at its legitimate partial position.
- Spector's earlier capture timings are NOT used as a performance baseline.

### Iteration 2 — verified
- Reproduced a door-sweep defect: the open study door could close through the player at (2.2, 0, -15.05). Before/after evidence: door-baseline.json / door-safety.json.
- Shared the same oriented-leaf shape between movement collision and swept-angle safety. Unsafe requests are rejected; an already moving leaf stops if the player enters its arc and resumes after clearance.
- Added explicit pass disposal before composer buffer disposal, plus an idempotent episode disposal guard. Unit verifies ownership order; browser regression verifies scene lifecycle does not introduce runtime errors. No claim of a measured long-term heap reduction.
- PASS build, door safety (blocked close, clear close, interception, resumed opening), motion regression, and full episode + iPhone/Pixel touch emulation in a headed Chromium run.
- Test-environment finding: this machine's headless hardware-GL attempt renders at roughly 0.9–2.2 seconds/frame. Transient jump checks time out there even though key input is accepted. A real headed browser passes; deterministic stepping also passes. This is not used to claim production FPS.
- Registered jump observers before input and made interaction waits tolerate software-rendering latency. Added opt-in TEST_HARDWARE_GL / TEST_HEADED test flags; portable software mode remains default.
- Next art pass: a licensed CC0 skin atlas has been baked in Blender. Not yet copied into the runtime at this checkpoint.

### Iteration 3 — verified
- In the connected live Blender, retained both editable anatomical hand meshes and original/default scene. Baked color, normal and roughness from Mindfront's Aksel skin (official MakeHuman Skins 02, CC0) onto a dedicated hand UV atlas.
- Exported evaluated GLBs with UV and MikkTSpace tangents. The export guard rejects accidental extra scene geometry. Removed unused vertex colors from export to avoid multiplying the skin texture.
- glTF validator: zero errors and zero warnings for both optimized hands. Final sizes: 689556 / 689604 bytes. Color/normal 1024, roughness 512; exact wrist/object calibration bounds preserved.
- Editable source committed at art/character-hands.blend (1.59 MB); authoring scripts and provenance are alongside the code. Original external character board remains untouched.
- Updated local asset revision to chapter1-refinement-05. No deployment.
- Visually inspected before/after screenshots from the same flashlight scene and key interaction. New color variation and hand details are visible; this is an asset-material refinement, not a claim of a photogrammetric/AAA character.
- PASS build, hand contract, gear (flashlight/key/stride/full silhouette), intro, inventory and consumption/reload, WebKit landscape inventory, High weather/rain/snow/reflections with no shader errors, full chapter and iPhone/Pixel emulation.
- Before/after screenshots: before-skin-flashlight.png / after-skin-flashlight.png and before-skin-key.png / after-skin-key.png in the session evidence folder.

## Remaining scope
- This session validates the implemented first chapter and selected critical paths, not all 100 planned rooms.
- Chapter progression automation uses development poses between interaction points; movement/collision/stair probes exercise real control input. It is not an exhaustive manual walk through every furnished area.
- Arbitrary slopes/dynamic rigid-body props, exhaustive mesh collision coverage, longer heap/GPU-resource soak tests, real mobile hardware profiling and the earlier Spector-instrumentation warnings remain outside the verified results.
- The headless hardware-GL run is not a usable performance benchmark on this host. Use headed hardware-backed Chromium for live interaction checks, or explicit deterministic stepping for repeatable physics tests.
- Art script workspace paths are local; portability of the authoring pipeline is a remaining LOW-priority task.

### Iteration 4 — verified
- Reproduced the clock mismatch before fixing it: advancing 2400 ms of game time while holding R left the chair untipped (progress ~0.0027) because hold progression read performance.now rather than active game time.
- Holds now accumulate the same active timestep as gameplay. Pause does not advance them; release/cancel resets the next attempt.
- New intro-clock test covers chair -> knife -> cut, cancellation partway through cutting, pause mid-hold, and a fresh resumed attempt. No skip of required story flags.
- PASS build, intro-clock, motion regression, original develop-web-game client with text-state evidence, live-clock intro, complete chapter, save reload, iPhone and Pixel emulation; no JavaScript errors.
- Framed the editable hands in the live Blender viewport. Kept Blender's numbered backup files on disk and excluded those generated backups from Git.

### Iteration 5 — verified
- Local rollback branch: backup/refinement-2026-11-05-headroom at cc8d80a; original rollback branch retained.
- Reproduced two failures in a real browser before editing: jumping at (3, 2.34, -3.1) leaves the feet at 2.34 m despite an open shaft; releasing crouch under the attic-floor lip raises the eye to 3.868 m through the 3.42 m underside.
- Replaced the artificial height threshold with CPU-only snapshots of actual slab, lintel, beam and sloped-roof boxes. Capsule-footprint samples respect rotated geometry and remain valid after render batching/disposal. No new draw calls or physics-library replacement.
- Horizontal movement checks destination headroom; upward collisions use actual overhead solids. Standing remains crouched while there is no head clearance, then restores automatically. Camera smoothing is capped by the same solid clearance.
- Extended the actual stair opening and matching lid by 0.65 m so the existing standing capsule can ascend without striking the floor lip. The dev-only aiming helper targets the hatch handle without bypassing the production interaction ray or distance checks.
- After: the open-shaft jump reaches 3.01 m at 200 ms (+0.67 m); releasing crouch keeps actor height 1.04 m and eye at 3.257 m below the slab. Standing restores after the obstruction clears.
- PASS TypeScript/Vite build; solid-query unit tests (slab, capsule edge, slope, rotated parent, batching independence); real browser headroom and motion regression including stair ascent/descent; gear; complete chapter, save reload, iPhone 13 and Pixel 7 touch emulation. No JS/console errors in headroom/motion probes.
- Inspected after-open-shaft.png, after-crouch-clearance.png and the original develop-web-game client's latest scene screenshot and text state. Evidence: ../../outputs/refinement-2026-11-05/headroom/ and skill-client/.
- This is clearance/traversal work, not a visual-fidelity or FPS claim. Dynamic lid sweep safety is the next collision case to investigate separately.

### Iteration 6 — verified
- Reproduced the original hatch crossing the standing player's capsule: first geometric witness at angle 1.839 rad, at chest height +1.06 m. Independent browser probe reads the actual leaf geometry and transform, rather than trusting the collision implementation. Baseline: hatch/baseline.json and before-leaf-contact.png.
- Moved the hinge to the side and stopped it upright at 90 degrees. Folding it 180 degrees would sweep the nearby desk; the upright leaf clears that furniture, the roof and the approach. No scene/story/engine replacement.
- Added exact line-segment/AABB distance for a capsule against the oriented leaf; fixed-angle sweep sampling prevents a moving lid from entering the player. It stops/resumes on interception. Walking and vertical movement also respect the panel; crouch/camera clearance include it.
- Stair support now follows the actual lid angle instead of its requested open flag, preserving the floor when an opening is obstructed before it begins.
- PASS 500 seeded independent dense-sampling comparisons for the distance query, hinge/capsule unit cases, real browser safe open/close, rejection while standing on the lid, late interception, blocked movement into the stopped panel, resume after clearance and save/reload of the open side hinge. Zero geometric witnesses at the normal approach after the fix; no JS/console errors in this probe.
- Fixed a test-fixture error, not a game save error: the initial reload assertion used an init script that overwrote its own save on every navigation. Fixture now seeds only a fresh isolated context; reload tests retain the actual game-written save.
- Inspected after-open.png and after-intercepted.png; independent evidence in ../../outputs/refinement-2026-11-05/hatch/.
- PASS fresh build and complete regression: headroom, fixed-step motion, intro-clock, original develop-web-game client, live intro, ordinary doors, full chapter/save reload, iPhone/Pixel touch emulation, gear/body/hand import, desktop/WebKit inventory and consumption, High rain/snow/puddle reflection. No runtime/shader errors reported by those checks. Inspected the latest skill-client scene screenshot and text state again.
- A CPU-only synthetic distant-capsule query measured 1.23–1.62 microseconds/query in five warmed Node samples. This is not a browser frame-time/FPS result; no speculative renderer optimization was made from it.
- Interrupted closing/save reload was subsequently reproduced and addressed separately in iteration 7.

### Iteration 7 — verified; separate input race found during regression
- Reproduced an actual reload softlock: begin closing, place the capsule in a valid position on the open stair (3, 2.1, -3.5), let the closing leaf stop before contact, then allow normal autosave. The saved door was marked closed despite the leaf remaining at 0.358 rad. After reload, a 1 s W input moved 0 m because stair support was unavailable.
- Closing now persists the hatch as closed only after the leaf actually reaches rest. Reloading an obstructed transition safely restores it open; fully completed closure still persists/reloads closed. Existing save schema, unlock flag and key requirements are unchanged.
- Stairs continue to support a character underneath a shut hatch. The closed lid is solid from below, while it still supports walking above. Crouch/stand clearance respects the same panel, preventing a shortcut through it.
- PASS fresh TypeScript/Vite build and real browser interrupted-close/autosave/reload, completed-close reload, ascent against the closed lid, crouch clearance and safe retreat. After reload, the same 1 s W input travels 2.221 m down the staircase; no teleport, JS or console error.
- Standing ascent stops at feet 1.750 m, crouched ascent at 2.391 m; release remains crouched under the lid, retreat reaches ground level and restores standing. These are fixture-specific measured positions, not general movement/FPS guarantees.
- Inspected before-reload-stuck.png and after-reload-traversable.png. Evidence: ../../outputs/refinement-2026-11-05/hatch-save/baseline.json and regression.json.
- Hatch safety and static headroom regressions passed again. Movement, stair ascent/descent and jump passed, but rapid ESC pause/resume intermittently re-paused the scene. A 30-cycle input stress reproduced this at cycle 22; event trace proves focus/visibility remained valid while a delayed unlock event arrived after resume. This is a separate pre-existing input lifecycle bug, not dismissed as test flakiness; next iteration addresses it.

### Iteration 8 — verified
- Input event baseline reproduced failure at resume cycle 22. The browser remained focused/visible: an old unlock notification observed mode=playing, locked=false after resume; the subsequent acquisition notification observed mode=paused, locked=true. Evidence: pause-race-baseline.json.
- A simple expected-unlock flag alone was tested and proved insufficient: several queued notifications can all report the same unlocked current DOM state. The final fix tracks actual observed ownership edges as well as app-requested release intent, not arbitrary timeout/debounce windows.
- Pausing, documents, bag, title and ending use one owned-canvas release path. A delayed acquisition arriving after a menu opens is released, rather than locking the pointer over paused UI. Real unexpected lock loss and real focus loss still pause the game.
- PASS fresh TypeScript/Vite build, 30 rapid ESC pause/resume cycles, ordinary motion/collision/stair/jump regression, unexpected pointer release, and actual tab focus loss with focused ESC resume. No JavaScript/console errors.
- PASS expanded 100-cycle ESC stress, unexpected pointer loss, and actual tab focus loss. Test captures recent keyboard/pointer-lock/focus/visibility events on failure instead of silently retrying or weakening assertions.
- PASS follow-up browser regression: hatch save/reload, headroom, intro-clock, live intro, ordinary doors, full chapter/save reload, iPhone/Pixel touch emulation, body/hand/gear, desktop and WebKit pack, High rain/snow/puddle reflection. Original develop-web-game client screenshot and state inspected.
- PASS built production bundle served locally: intro, ESC pause/resume, and chair → knife → ropes with normal keyboard input and no dev hooks, page/console errors or HTTP failures. Screenshots and logs: ../../outputs/refinement-2026-11-05/production-smoke/. No production deployment.

## Final local result
- Eight completed local refinement iterations. Remote repository and production site were not updated.
- Baseline rollback branch remains backup/refinement-2026-11-05-start.
- The validated runtime is chapter1-refinement-05. This is a verified refinement increment, not certification of AAA fidelity or a complete commercial release.
- Current known open scope and limits are listed above; no unmeasured FPS guarantee is made.
