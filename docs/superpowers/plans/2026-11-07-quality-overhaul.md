# 100gate review deployment and cinematic quality overhaul

> Execute in small verified slices. Separate authorized publication of the old review from the new local overhaul.

**Spec:** `docs/specs/2026-11-07-quality-overhaul.md`.

**Release boundary:** Put the already verified 294c425 opening at
`https://100gate.online/story-preview/`. Add a subtree to existing GitHub
Pages and do not replace root assets, domain configuration, production saves,
or the default source branch. This is a separately labelled review build.
No newly authored quality-overhaul content is approved for publication.

## Tasks

1. Add a dedicated Vite build mode, tracked GLBs and audio, hash validation,
   and a production-like browser smoke. No dev probes or save API.
2. Push the source preview branch. Publish only the story-preview subtree in
   gh-pages. Verify the Pages build commit and fetch live index/assets against
   the actual build. Smoke the public URL.
3. Branch `intro/quality-overhaul` off the published source checkpoint. First
   quantify foot-contact error, stance and torso coordination against real
   Blender and Three.js meshes. Author and compare a new gait and two
   non-identical performance variants without replacing the human.
4. Compare the three requested vehicle assets and free authorized sources.
   Require actual download, real cabin, doors and wheels before committing to
   an asset. Preserve attribution and test steering/brake path and clearances.
5. Capture apartment expressions and geometry wireframes; refine fabrics,
   window depth and practical lighting, then street/shop details and staging.
   Finish the egress and seat contact before treating the overhaul as ready.

Steps 3–5 remain local. Each slice ends with inspected Blender and game images,
build/test evidence, and a record of unresolved art gates.
