# Character-hand source

`character-hands.blend` contains both editable hand poses, retained source UV layers and packed baked PBR maps. It also preserves the original default scene separately; export only the hand-production scene.

- Geometry: MakeHuman base mesh, CC0.
- Skin: Mindfront / Aksel Skin, CC0, from the official [Skins 02 catalog](https://static.makehumancommunity.org/assets/assetpacks/skins02.html).
- Bake: color and tangent-space normal at 1024; the delivered roughness map is 512.
- Export: metres, Y-up, one hand mesh per GLB, UV + normals + MikkTSpace tangents; no vertex-color multiplication.
- Production scripts: `scripts/art/bake-hand-materials.py`, `scripts/art/export-hand-repair.py`. Their workspace paths currently target this local authoring session; adjust those paths before moving authoring to another machine.
- The original character source and user scene were not deleted. No paid generator or API key was used.

Runtime proportions and held-object sockets must remain unchanged; run `npm run verify:hands` and `npm run verify:gear` after re-export.
