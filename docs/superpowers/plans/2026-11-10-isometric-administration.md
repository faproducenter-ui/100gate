# 100GATE · Isometric administration

> Implement and verify as slices. Do not publish the new root until the complete chapter, visual quality, menu capture and rollback gates pass.

**Goal:** Replace the active first-person route with an original isometric investigation without erasing the prior game or its saves.

**Architecture:** Three.js environment and rig, orthographic room camera, pure shared layout/quest/puzzle simulation, React overlays, separate versioned browser save. Reuse licensed native assets only. The first chapter is a connected reception, technical room, CCTV room and archive.

- [x] Archive the previous production and all tracked/untracked FPS work independently; keep source art in place.
- [x] Add tested position/portal/obstacle rules, atomic quest transitions and strict isolated save validation.
- [ ] Review the detailed room kit and skeletal hero from every camera, including cabinet occlusion and grounded motion.
- [x] Connect power, replay transport/evidence, inventory, journal and chapter end to the actual state.
- [x] Add dynamic CRT/physical lamp title background, settings, audio and recovery.
- [ ] Test on desktop and narrow landscape, capture all four rooms and uninterrupted 60-second menu with audio.
- [ ] Verify production packaging and a rollback ref, commit/push without force, deploy only to the production root, verify live.

## Preservation and local review

- `archive/fps-working-2026-11-10` (`29ad2fd`) includes the previous branch's working changes and source code. The archive was written through a separate Git index; old local files and staging were left intact.
- `archive/fps-production-2026-11-10` (`fd4b58f`) keeps the current published source. The production Pages parent is `57597eb`. Existing ignored Blender sources remain in the original output folders; the new branch did not move or delete them.
- Run `npm run dev -- --host 127.0.0.1 --port 5189 --strictPort`. This now opens the isometric game at the root. Older saves use a different key and aren't read or overwritten.
- Run `npm run build`, `npm exec --offline -- vitest run src/iso --maxWorkers=1`, then `node scripts/verify-isometric-chapter.mjs` on a host cleared for browser QA. The chapter harness uses real keyboard/mouse inputs, a deterministic frame clock, separate browser storage, and no quest or save injection. Set `ISO_QA_SHOTS=1` for additional frames and extend `ISO_QA_BUDGET_MS` on a suitable machine.
- Production is gated on the visual pass and 60-second capture with audible menu audio. Do not run the old generic Pages script: it replaces the entire root tree, including the separate legacy preview. Stage and verify only the new static entry/its assets over the prior Pages parent, keep CNAME and unrelated legacy paths, then verify the deployed marker and game from the actual domain. No production or Railway write was made for this checkpoint.
