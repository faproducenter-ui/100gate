# Character-hand source

Current contact study: `hand-knife-contact.blend` / `.glb` and the normal-speed
360° movie under `review-evidence/hand-contact/`. The older grip-close study
was rejected; see [current QA](../docs/HAND-KNIFE-CONTACT-REVIEW.md).

## Replacement character review (not integrated)

`character-mpfb-review.blend` contains the unified MakeHuman/MPFB character:
original body with hands, 53-bone stock game-engine skeleton, full finger
chains, Mindfront Aksel skin and CC0 source clothing. The two-second
`KnifePowerGripClose` action is an isolated grip study, not a completed intro.
`character-mpfb-grip-review.glb` is its working Three.js export.
`knife-prop-review.blend` contains the standalone original knife prop only.
The body is not assembled from primitives or separately generated hands.

The source body, original UV and weights remain editable. Clothing-fit shape
keys and masks are reversible. Provenance and archive hashes are in
`provenance/MPFB-SOURCES.json`. Reproduction, tests, the failed first motion
and remaining visual issues are recorded in `../docs/MPFB-INTRO-REVIEW.md`.
These files do not replace the older gameplay assets below.

`character-hands.blend` contains both editable hand poses, retained source UV layers and packed baked PBR maps. It also preserves the original default scene separately; export only the hand-production scene.

- Geometry: MakeHuman base mesh, CC0.
- Skin: Mindfront / Aksel Skin, CC0, from the official [Skins 02 catalog](https://static.makehumancommunity.org/assets/assetpacks/skins02.html).
- Bake: color and tangent-space normal at 1024; the delivered roughness map is 512.
- Export: metres, Y-up, one hand mesh per GLB, UV + normals + MikkTSpace tangents; no vertex-color multiplication.
- Production scripts: `scripts/art/bake-hand-materials.py`, `scripts/art/export-hand-repair.py`. Their workspace paths currently target this local authoring session; adjust those paths before moving authoring to another machine.
- The original character source and user scene were not deleted. No paid generator or API key was used.

Runtime proportions and held-object sockets must remain unchanged; run `npm run verify:hands` and `npm run verify:gear` after re-export.

## Escape sequence

`intro-escape.blend` contains an independent Blender 4.5 escape timeline and knife/hand preview. Open the `100gate | Escape choreography` scene and scrub frames 1–169: palm contact (38), closed grasp (41), rope tension (72), continuous working-edge draw (75–139), release and rise (139–169). `GripSocket`, `BladeEdge`, `RopeContact` and `RopeAnchor` include glTF Y-up local coordinates in extras. The game drives wrist clips via `AnimationMixer` and owns the floor-to-hand reparenting, audio and save milestones.

- The hand keeps the CC0 MakeHuman/Mindfront source above. Open/closed geometry has matching topology; the export carries independent `Thumb`, `Index`, `Middle`, `Ring`, `Little` morphs plus the palm blend. Each digit closes at a slightly different time. Wrist motion is keyed; continuous sleeves use a two-segment bend in Three.js. No individual finger bones or mocap are present.
- `knife-grip-review.blend` is a separate inspection scene with six orthographic cameras: back, palm, thumb side, little-finger side, knuckles and handle end. `scripts/art/grip-review.py` generates it and checks the evaluated skin against the triangulated handle. `scripts/art/render-grip-review.py` renders all six cameras. This test is for the closed grip; it does not certify every pose of a full skeletal animation.
- Knife geometry and motion are original. The contoured handle uses [Fine Grained Wood](https://polyhaven.com/a/fine_grained_wood) by Rob Tuytel (Poly Haven, CC0): color, OpenGL normal and roughness, resized to 256² and packed. The blade and pins use authored metallic/roughness materials. No third-party game models or sounds were imported.
- Authoring script: `scripts/art/author-intro.py`. Load `character-hands.blend` into Blender 4.5 LTS or run the script through MCP with the hand-production scene available. For a texture-identical re-export, place the official 1K JPEG color, `nor_gl`, and roughness maps from the Poly Haven asset under the workspace output folder `outputs/intro-animation/knife-material/` as `col.jpg`, `nor_gl.jpg`, `rough.jpg`. Without the maps, the script exports the base tinted material. The checked-in `.blend` has the resized maps packed and is editable without the downloads.
- `npm run verify:escape` captures each contact and the full sequence, while `verify:intro` and `verify:episode` check real input at the live frame clock.
## Actual hand-contact replacement study — 2026-11-06

`hand-knife-contact.blend` and `hand-knife-contact.glb` are the new isolated
review assets, superseding the rejected two-second grip study. They preserve
the original full MPFB actor and its native finger skeleton; only local
right-hand weights and poses were refined. Open frame 241 for the static
power grip, or play frames 1–289 at 24 fps. All textures are packed.

The new normal-speed, 360° close-up is
`review-evidence/hand-contact/hand-contact-slow-360.webm`. See
[contact QA and limitations](../docs/HAND-KNIFE-CONTACT-REVIEW.md).
This is not yet a replacement for the game's story intro. Existing sources,
production assets and licences below are preserved.
