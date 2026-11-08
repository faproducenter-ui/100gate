# 100gate root releases and kitchen menu

**Order:** publish the tested cinematic rooted at 65b2953 first, then make a separate kitchen release. Preserve `100gate.online`, its Pages history and existing save storage.

1. Activate the final asset set only in root production. Start a fresh cinematic only after New Game; load old progress through Continue. Keep the previous slot until the player completes the new escape. Verify packaged assets, actual Web Audio, R/R/W, pause, and an existing save in Playwright.
2. Commit, verify the source/build digest, fast-forward `main`, and append a Pages commit. Preserve CNAME, prior hashed assets and the preview subtree. Check the live root's release marker and real input before the menu work.
3. Build one editable Blender kitchen and physically render steady and dipped-lamp plates with a locked camera. Use the plates for the menu rather than making players load a second Three.js world. Preserve responsive crop and readability; reduce motion/flicker on request; suspend idle activity in the background.
4. Implement a lean menu shell, asset readiness/error/retry, functional preferences and credits. Keep root start/continue selectors and don't fetch the cinematic before a game action. Test existing saves, return, sound lifecycle, both viewports and persisted settings; inspect real footage before publishing.
5. Repeat the verified production deploy. Then continue visible character/environment corrections independently of the deployed release.
