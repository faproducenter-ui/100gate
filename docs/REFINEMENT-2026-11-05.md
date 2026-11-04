# Local refinement — 2026-11-05

## Safety and scope
- Baseline: 524e2eb, preserved by local branch backup/refinement-2026-11-05-start.
- No remote push, deployment, production access changes, save-schema replacement, engine change, or asset deletion.
- Actual stack: imperative Three.js 0.180, React DOM shell, TypeScript, Vite; existing analytic character collisions. Rapier dependency present, but not integrated into the current episode. Replacing it is not justified by this iteration.
- Blender 4.5.15 / MCP protocol 15 connected; paid services disabled.

## Issue register
| ID | Priority | Evidence / root cause | State |
|---|---|---|---|
| Q01 | HIGH | Furniture hold survives a move behind a wall. Baseline browser test starts R in storeroom and stages player in bedroom; storeCabinet still reaches saved.moved. Hold retention checks distance only. | Fix implemented; regression pending |
| Q02 | HIGH | Sprint covers 8.668 m vs 5.675 m over ~2.22 s under 129 ms rendering frames. tick clamps elapsed time to 85 ms and physics uses variable timestep. | 120 Hz movement substeps implemented; regression pending |
| Q03 | HIGH | EffectComposer.dispose does not dispose its passes; UnrealBloomPass owns additional targets and OutputPass owns a shader. Source-confirmed resource-lifetime defect, not a measured long-term leak magnitude. | Pending |
| Q04 | MEDIUM | Diagnostic game client cannot import project Playwright from the skill folder; lacks native render_game_to_text / advanceTime, and explicit 5 s start-click timeout is shorter than actual cold loading. | Game hooks added; wrapper pending |
| Q05 | MEDIUM | Hand GLB lacks tangents despite normal map. glTF validator warns about runtime-generated tangent space. | Blender repair pending |
| Q06 | MEDIUM | Open doors can rotate a leaf into the player; current close guard only measures distance to door root. | Source finding; reproducer and fix pending |
| Q07 | MEDIUM | Current crouch/ceiling model is analytic and supports the current house, not arbitrary terrain/rigid-body interaction. No claim of full rigid-body physics. | Deferred; protect current traversal |
| Q08 | LOW | Some installed skill shared reference documents are absent; not a runtime defect. game-studio is not installed. | Not changed |

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
