"""Run in the live Blender with the two anatomical hand collections appended.

Repairs the browser asset contract, preserving editable collections and other scenes.
Does not change the game models until the separately validated GLBs are copied.
"""
import bpy
import json
import re
import struct
from pathlib import Path
from mathutils import Matrix, Vector

root = Path(r"C:/Users/libde/Documents/Codex/2026-11-02/new-chat")
out = root / "work/100gate-refinement-assets"
out.mkdir(exist_ok=True)
cols = [c for c in bpy.context.scene.collection.children
        if c.get("100gate_asset_id") in {"player-hand-open", "player-hand-grip"}]
assert len(cols) == 2, "Select the hand-production scene first"
fmt = re.search(r"export_format='([^']+)'", bpy.ops.export_scene.gltf.__doc__).group(1)
results = []
for coll in cols:
    for ob in coll.objects:
        if ob.type == "MESH":
            for mat in ob.data.materials:
                mat.use_backface_culling = True
for coll in cols:
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    copies = []
    try:
        for source in coll.objects:
            if source.type != "MESH":
                continue
            mesh = bpy.data.meshes.new_from_object(source.evaluated_get(deps),
                                                   preserve_all_data_layers=True, depsgraph=deps)
            if source.get("textured_skin"):
                for name in [layer.name for layer in mesh.uv_layers if layer.name != "GameHandUV"]:
                    mesh.uv_layers.remove(mesh.uv_layers[name])
                for name in [attribute.name for attribute in mesh.color_attributes]:
                    mesh.color_attributes.remove(mesh.color_attributes[name])
                mesh.uv_layers.active=mesh.uv_layers["GameHandUV"]
                mesh.uv_layers["GameHandUV"].active_render=True
            ob = bpy.data.objects.new(coll["100gate_asset_id"], mesh)
            bpy.context.scene.collection.objects.link(ob)
            ob.matrix_world = (Matrix.Scale(1 / coll["display_scale"], 4)
                               @ Matrix.Translation(-Vector(coll["display_origin"]))
                               @ source.matrix_world)
            copies.append(ob)
        for ob in bpy.context.view_layer.objects:
            ob.select_set(False)
        for ob in copies:
            ob.select_set(True)
        bpy.context.view_layer.objects.active = copies[0]
        path = out / (coll["100gate_asset_id"] + ".glb")
        bpy.ops.export_scene.gltf(filepath=str(path), export_format=fmt, use_selection=True,
                                  use_active_scene=True, export_yup=True,
                                  export_animations=False, export_tangents=True)
        raw = path.read_bytes()
        length = struct.unpack_from("<I", raw, 12)[0]
        manifest = json.loads(raw[20:20 + length])
        assert len(manifest["meshes"]) == 1, "Unselected scene geometry leaked into the export"
        for primitive in manifest["meshes"][0]["primitives"]:
            assert "TANGENT" in primitive["attributes"]
            assert "TEXCOORD_0" in primitive["attributes"]
        results.append({"file": str(path), "bytes": len(raw), "tangents": True})
    finally:
        for ob in copies:
            mesh = ob.data
            bpy.data.objects.remove(ob, do_unlink=True)
            bpy.data.meshes.remove(mesh)
bpy.ops.wm.save_as_mainfile(filepath=str(root / "outputs/100gate-refinement-hands.blend"),
                           copy=True, compress=True)
print(json.dumps(results))
