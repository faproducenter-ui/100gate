# Actual integrated-game intro evidence

`intro-real-controls.webm` is the uninterrupted1280×720 Playwright **page**
recording, including loading, HUD, all11 states, normal walking and pause.
It is not a separately rendered Blender/Three.js diagnostic stage. It is silent.
`encoded-inspection.json` records its SHA256, dimensions, full1× playback and
decoded-frame count. The recorded file itself was sought, played and inspected.

`report.json`: actual R/E/W/Escape controls, no advanceTime/pose shortcuts;
no JavaScript errors or failed HTTP responses; saved intro time42 and full-release
flags. `moment-*.png` are actual game captures through the new cinematic camera.
The first-person bookends use motivated close-ups for the otherwise occluded
rear restraints. No character/finger geometry is hidden for this coverage.

`checkpoints.json`: isolated desktop and landscape touch tests, interrupted
hold, pause, exact mid-cut draw/time restoration, completed intro, floor knife
pickup without duplication and no respawn after reload. Actual update steps,
not zero-time render-only calls, are required after the test harness aims.

`chapter-regression.log`: complete house progression, inventory/keys/documents,
cabinet, hatch/stairs, power/alarm/exit, save reload, iPhone13/Pixel7 touch
emulation (not real Safari/Android hardware).

`built-smoke.json`: production Vite build, real UI/keys, no development probes,
full intro/pause/save reload; no unexpected API requests, HTTP or console errors.
The original develop-web-game client also ran; `shot-0.png` and `state-0.json`
are its canvas capture and text state.

`geometry-audit.json`:157 evaluated poses and79 hand/knife samples, actual
deformed surfaces/containment, floor and body/chair/fragment checks. Its input
source precedes the camera-only pass. `camera-staging.json` links that source
hash to the final Blender file and verifies unchanged non-camera geometry and
actions. These numerical gates are NOT an artistic-realism certificate.

See `docs/COMPLETE-INTRO-2026-11-07.md` for remaining clothing/face/weight-transfer,
loose-cord and cold-start/frame-time limitations. This is a playable preview,
not a claim of finished commercial graphics or universal60FPS.
