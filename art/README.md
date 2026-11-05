# Character-hand source

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
