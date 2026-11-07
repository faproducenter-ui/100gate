# 100gate Cinematic Story Intro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the chair-fall opening with an authored story prologue and a seated, player-controlled escape inside the existing game.

**Architecture:** Keep the existing Episode renderer, input, save envelope and chapter progression. A new `StoryIntroFlow` owns version3 beats and active time; lazy-loaded GLB scene adapters own visual performance, sound cue bindings and disposal. The previous intro, Blender source and verified recording are rollback material, not clips in the new timeline.

**Tech Stack:** Three.js, TypeScript, Vite, Blender4.5 LTS, Playwright, FFmpeg.

**Spec:** `docs/specs/2026-11-07-complete-opening.md` (supersedes the earlier camera-set scope).

## Global Constraints

- Existing game only. No push/deploy of this version without separate authorization.
- No chair fall, rocking-to-tip, E knife pickup, procedural humans, or invented relationship canon.
- Story time labels are exactly **22:42** and **23:16**. The knife is on the floor; legs remain free; left cuff remains after the left hitch opens, right remains bound until a real cut.
- Existing free/room/quest saves stay valid; skipping lands at the same initial R-reach pose as natural completion.
- Browser play and whole-sequence video are acceptance requirements, not optional polish.
- Rollback: `backup/story-intro-start-5ab3fd1`; branch `intro/story-cinematic`. No checkout rewrite.

## Review Focus

- R held during a skip cannot trigger an unintentional pickup; test release-to-arm.
- Blur, ESC and resume do not consume progress or restart a cinematic beat.
- Legacy free and mid-intro saves preserve quest data and do not replay the story.
- Scene load failure stays behind the loading/fade boundary, not the old fall.
- Local preview builds must not reach the production save API; use an explicit non-empty disable setting and verify no request.

## File boundaries and delivery

### Task 1 — Storyboard and active-clock contract

**Files:** `docs/specs/story-intro-storyboard.md`, `scripts/art/author-trailer-animatic.py`, `src/episode/story-intro-flow.ts`, `src/episode/story-intro-flow.test.ts`.

**Produces:** `StoryIntroFlow.advance(dt, {hold,paused})`, `skip(hold)`, `checkpoint()`, `restore(checkpoint, legacy)` and read-only beat/progress/attachment state. Durations are authored clip windows; R gates only REACH and RIGHT_CUT. No FALL/ROCK beat exists in this timeline.

- [x] Build the clearly labelled montage storyboard and open the editable VSE timeline in Blender.
- [x] Test natural path, skip equivalence, release/rehold, low-FPS partitioning, pause, safe restore and legacy migration before writing the new clock.
- [x] Run `npx vitest run src/episode/story-intro-flow.test.ts` (RED for missing behavior, then GREEN).
- [x] `npm run check`, focused review, and local checkpoint on `intro/story-cinematic`.

### Task 2 — Apartment dialogue and exit

**Files:** `scripts/art/author-story-apartment.py`, editable `.blend`, optimized `story-apartment.glb`; then `story-home-performance.glb`, `src/episode/story-intro-view.ts`, `src/episode/story-subtitles.ts`.

**Produces:** Meter-scale evening apartment, actor/door markers, licensed original MPFB/compatible female actor, head/gesture/foot-contact clips and neutral replaceable subtitles. `StoryIntroView.load(beat)` resolves a validated GLB or returns an explicit asset error. Actor blocking and door hinge named in the asset manifest; no furniture/lighting baked into the character.

- [x] Verify the static set's GLB names, texture budget, door pivot and actual 3D shots in Blender and Three.js.
- [ ] Finish and verify the subtitled 22:42 dialogue with rigged cast, hand-to-handle contact and animated exit.
- [x] Verify the development-only **set** preview via Episode, separate from New Game: camera path, pause/resume, no save or chapter asset requests, and desktop/touch landscape screenshots.
- [ ] Integrate through the existing Episode entry point in an explicit local development preview, never substitute a standalone demo for the game.
- [ ] Run real browser checks of title → dialogue → door, subtitle fit on landscape mobile, pause, cleanup and no network/console errors.

### Task 3 — Street, elapsed time and blackout

**Files:** licensed sedan and street/performer `.blend` and GLB sources, cue mapping in the new StoryIntro adapter.

**Consumes:** StoryFlow automatic beats and StoryIntroView load/dispose contract.

- [ ] Verify actual source/download/licence, four pivots and night-silhouette readability before importing a car.
- [ ] Author restrained shop/time cut, 23:16 return, braking, two distinct rigged exits, abduction implied by blocked eyeline and blackout. No teleport or crude body-contact close-up.
- [ ] Validate world/body/car contacts and ambience ducking; test reduced camera motion, skip during asset load and unload of the home set.

### Task 4 — Seated escape

**Files:** new `art/intro-story-seated.blend`, `public/assets/chapter1/story-escape.glb`, authored contact audit and StoryIntroView adapter.

**Consumes:** seated original MPFB pose, original chair, verified grip contract; never the old fall motion.

- [ ] Use foot-planted torso/shoulder strain, small non-tipping chair response, left hitch opening and intact wrist cuff; lay knife by reachable left boot.
- [ ] Author reach/grip/right blade draw/unwrap/standing as real Blender skeletal motion. Check actual surface contact/penetration and camera sightlines with front/side/rear/hand/face views.
- [ ] Wire R to normalized clip time and require authored right-edge contact before rope release. Pause/release freeze motion; no inventory duplication; no cutting of the already-free left hitch.
- [ ] Return to the existing controller after supported rise; confirm normal chapter, inventory, save and camera unchanged.

### Task 5 — End-to-end acceptance

- [ ] Activate the new entry route only when all required story/escape assets pass their gates; old scene remains available only via rollback, never as a silent missing-asset fallback.
- [ ] Verify desktop + landscape touch: new game, natural cinematic, skip, hold/release, low FPS, pause/blur/reload, get up, first normal input and chapter regression.
- [ ] Typecheck, production build, local served build, no debug probes, no production save calls; inspect actual frames and frame-time, draw-call, texture/heap and mixer budgets.
- [ ] Record and decode the entire live game sequence and a separate R-to-FPS WebM. Preserve editables, sources, asset provenance and review notes. No push/deploy.
