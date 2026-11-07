"""Create a full CC0 MPFB partner on the stock 53-bone game_engine skeleton.

Use Blender --factory-startup -b --python-exit-code 1 --python this-file.
Only outputs/story-intro/partner is written inside the project. The addon,
asset archives and isolated Blender profile are outside the repository.
"""
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import struct
import sys
import importlib

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCES = ROOT.parent / "100gate-art-sources" / "story-partner"
ASSETS = SOURCES / "system"
COMMIT = "d0a32e57a7f915cb2f2b95410e2117648c7bbb7e"
MPFB = SOURCES / "mpfb-source" / ("mpfb2-" + COMMIT)
OUT = ROOT / "outputs" / "story-intro" / "partner"
OUT.mkdir(parents=True, exist_ok=True)
assert not bpy.data.filepath, "Refusing to replace an opened Blender source."
bpy.context.preferences.use_preferences_save = False
bpy.context.preferences.filepaths.save_version = 0
import addon_utils
# MPFB 2.0.18 is a Blender extension, not a legacy addon. Register a local,
# isolated extension repository rather than patching any source package.
extension_repo = SOURCES / "profile" / "extensions" / "story_local"
extension_repo.mkdir(parents=True, exist_ok=True)
package = extension_repo / "mpfb"
if not (package / "copy-complete.marker").is_file():
    # The pinned upstream has target filenames beyond Windows' legacy 260-char
    # limit under a Codex workspace. Extended paths preserve every source file.
    src = "\\\\?\\"+str(MPFB / "src" / "mpfb") if os.name == "nt" else str(MPFB / "src" / "mpfb")
    dst = "\\\\?\\"+str(package) if os.name == "nt" else str(package)
    shutil.copytree(src, dst, dirs_exist_ok=True)
    (package / "copy-complete.marker").write_text(COMMIT)
repo = bpy.context.preferences.extensions.repos.new(name="100gate isolated MPFB",
    module="story_local", custom_directory=str(extension_repo))
addon_utils.enable("bl_ext.story_local.mpfb", default_set=True, persistent=False)
HumanService = importlib.import_module("bl_ext.story_local.mpfb.services.humanservice").HumanService


def asset(relative):
    path = ASSETS / relative
    assert path.is_file(), path
    return path


def aim(obj, target):
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat("-Z", "Y").to_euler()


def point_bone(rig, name, direction):
    bone = rig.pose.bones[name]
    pivot = bone.matrix.translation
    current = (bone.tail-bone.head).normalized()
    rotate = current.rotation_difference(Vector(direction).normalized())
    bone.matrix = Matrix.Translation(pivot) @ rotate.to_matrix().to_4x4() @ Matrix.Translation(-pivot) @ bone.matrix
    bpy.context.view_layer.update()


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


scene = bpy.context.scene
scene.name = "100gate | Partner · genuine MPFB character"
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
body = HumanService.create_human(macro_detail_dict={
    "gender": 0.0, "age": .50, "muscle": .39, "weight": .45, "height": .50,
    "race": {"caucasian": 1.0, "african": 0.0, "asian": 0.0},
})
body.name = "StoryPartner_Body"
HumanService.set_character_skin(str(asset("skins/young_caucasian_female/young_caucasian_female.mhmat")), body, skin_type="GAMEENGINE")
rig = HumanService.add_builtin_rig(body, "game_engine")
rig.name = "StoryPartner_Rig"
rig["authoringForward"] = "-Y"
rig["runtimeForward"] = "+Z after glTF Y-up conversion"
rig["license"] = "CC0-1.0 / MakeHuman core assets"
rig["description"] = "Partner character, not a canonical name or story identity."
selections = [
    ("clothes/female_casualsuit01/female_casualsuit01.mhclo", "Clothes", "StoryPartner_CasualClothes"),
    ("clothes/shoes04/shoes04.mhclo", "Clothes", "StoryPartner_Shoes"),
    ("eyes/low-poly/low-poly.mhclo", "Eyes", "StoryPartner_Eyes"),
    ("hair/ponytail01/ponytail01.mhclo", "Hair", "StoryPartner_Hair"),
    ("eyebrows/eyebrow001/eyebrow001.mhclo", "Eyebrows", "StoryPartner_Brows"),
    ("eyelashes/eyelashes01/eyelashes01.mhclo", "Eyelashes", "StoryPartner_Lashes"),
]
meshes = [body]
for relative, role, name in selections:
    obj = HumanService.add_mhclo_asset(str(asset(relative)), body, asset_type=role,
        material_type="GAMEENGINE", subdiv_levels=0)
    obj.name = name
    meshes.append(obj)

# Preserve all source topology and fitted UVs. These are non-destructive
# modifiers; only the runtime copies below apply helper/clothing masks.
for obj in meshes:
    for face in obj.data.polygons:
        face.use_smooth = True
    # Helpers and cloth deletion groups from MHCLO are retained in the body.
    if obj is body:
        covered = [g for g in obj.vertex_groups if g.name.startswith("Delete.")]
        for group in covered:
            mask = obj.modifiers.new("Clothing occlusion | "+group.name, "MASK")
            mask.vertex_group = group.name
            mask.invert_vertex_group = True
    for material in obj.data.materials:
        if not material.use_nodes:
            continue
        shader = next((n for n in material.node_tree.nodes if n.type=="BSDF_PRINCIPLED"), None)
        if shader:
            shader.inputs["Roughness"].default_value = .56 if obj is body else .75
            shader.inputs["Metallic"].default_value = 0
            # The old MH viewport's SSS/emissive defaults are not physical light.
            shader.inputs["Emission Strength"].default_value = 0
            if obj.name not in ("StoryPartner_Hair", "StoryPartner_Brows", "StoryPartner_Lashes"):
                for link in list(shader.inputs["Alpha"].links):
                    material.node_tree.links.remove(link)
                shader.inputs["Alpha"].default_value = 1
            else:
                material.use_backface_culling = False
                # Standard glTF alpha-mask: a threshold node is exported as MASK.
                links = list(shader.inputs["Alpha"].links)
                if links:
                    source = links[0].from_socket
                    material.node_tree.links.remove(links[0])
                    threshold = material.node_tree.nodes.new("ShaderNodeMath")
                    threshold.operation = "GREATER_THAN"
                    threshold.inputs[1].default_value = .42
                    material.node_tree.links.new(source, threshold.inputs[0])
                    material.node_tree.links.new(threshold.outputs[0], shader.inputs["Alpha"])
        for node in material.node_tree.nodes:
            if node.type == "NORMAL_MAP":
                node.inputs["Strength"].default_value = .40

# A calm standing pose. Arms are solved in the rig's actual fitted coordinates,
# not by scaling/moving the skin, and fingers retain their original phalanges.
for side, sign in (("l", 1), ("r", -1)):
    point_bone(rig, "upperarm_"+side, (sign*.11, .025, -.92))
    point_bone(rig, "lowerarm_"+side, (-sign*.04, -.065, -.94))
    point_bone(rig, "hand_"+side, (-sign*.02, -.045, -.98))
    for digit, degrees in {
        "index": (7, 13, 7), "middle": (9, 17, 8),
        "ring": (12, 19, 10), "pinky": (15, 22, 12), "thumb": (3, 7, 6),
    }.items():
        for joint, degrees_ in enumerate(degrees, 1):
            bone = rig.pose.bones[f"{digit}_{joint:02d}_{side}"]
            bone.rotation_mode = "XYZ"
            bone.rotation_euler.x = math.radians(degrees_)
rig.data.pose_position = "POSE"
bpy.context.view_layer.update()

def evaluated_bounds(objects):
    dg = bpy.context.evaluated_depsgraph_get()
    points = [obj.evaluated_get(dg).matrix_world@v.co
              for obj in objects for v in obj.evaluated_get(dg).data.vertices]
    return [[min(v[i] for v in points) for i in range(3)],
            [max(v[i] for v in points) for i in range(3)]]

# MPFB already grounds the bare soles; ground footwear without changing the rig
# proportions. The transform is a translation and remains editable in source.
bounds = evaluated_bounds(meshes)
rig.location.z -= bounds[0][2]
bpy.context.view_layer.update()
bounds = evaluated_bounds(meshes)
assert .95 < bounds[1][2] < 2.2, bounds
assert len(rig.data.bones) == 53, len(rig.data.bones)
for side in ("l", "r"):
    for digit in ("thumb", "index", "middle", "ring", "pinky"):
        for joint in range(1, 4):
            assert f"{digit}_{joint:02d}_{side}" in rig.data.bones

scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (.085, .105, .14, 1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value = .45
for name, location, energy, color, size in [
    ("Review key", (-2.3, -3.5, 3.2), 330, (1.0, .84, .67), 3),
    ("Review fill", (2.2, -1.8, 2.3), 110, (.65, .79, 1), 2.4),
    ("Review rim", (.2, 1.9, 2.5), 190, (1, .79, .56), 2),
]:
    data = bpy.data.lights.new(name, "AREA")
    data.energy, data.color, data.size = energy, color, size
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = location
    aim(obj, (0, 0, 1.0))
data = bpy.data.cameras.new("StoryPartner_ReviewCamera")
camera = bpy.data.objects.new(data.name, data)
scene.collection.objects.link(camera)
camera.location = (2.02, -4.0, 1.78)
data.lens = 58
aim(camera, (0, 0, .93))
scene.camera = camera
scene.render.engine = "CYCLES"
scene.cycles.samples = 20
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = 720, 960
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.unit_settings.system = "METRIC"
scene.render.filepath = str(OUT / "story-partner.png")
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "story-partner.blend"))

# Bake original macro targets, helper masks and fitted garment meshes into
# runtime bind meshes. The exact original body is saved in the .blend above.
staged = []
for original in meshes:
    arm = next((m for m in original.modifiers if m.type=="ARMATURE"), None)
    if arm:
        arm.show_viewport = False
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    data = bpy.data.meshes.new_from_object(original.evaluated_get(dg), depsgraph=dg, preserve_all_data_layers=True)
    if arm:
        arm.show_viewport = True
    obj = bpy.data.objects.new(original.name+"_runtime", data)
    scene.collection.objects.link(obj)
    obj.parent, obj.matrix_world = rig, original.matrix_world.copy()
    for group in original.vertex_groups:
        obj.vertex_groups.new(name=group.name)
    skin = obj.modifiers.new("Stock MPFB skin", "ARMATURE")
    skin.object = rig
    assert any(v.groups for v in data.vertices), original.name
    staged.append(obj)
    original.hide_render = True
bpy.ops.object.select_all(action="DESELECT")
for obj in [rig, *staged]:
    obj.select_set(True)
bpy.context.view_layer.objects.active = rig
# Static standing pose is exported as skeleton pose, no arbitrary morph/animation.
# A single pose action ensures conventional animation importers show its intended pose.
rig.animation_data_create()
rig.animation_data.action = bpy.data.actions.new("StoryPartner_RelaxedStand")
scene.frame_start = 1
scene.frame_end = 2
for bone in rig.pose.bones:
    quaternion = bone.matrix_basis.to_quaternion()
    bone.rotation_mode = "QUATERNION"
    bone.rotation_quaternion = quaternion
    bone.keyframe_insert("rotation_quaternion", frame=1, group=bone.name)
    bone.keyframe_insert("location", frame=1, group=bone.name)
    bone.keyframe_insert("scale", frame=1, group=bone.name)
    bone.keyframe_insert("rotation_quaternion", frame=2, group=bone.name)
    bone.keyframe_insert("location", frame=2, group=bone.name)
    bone.keyframe_insert("scale", frame=2, group=bone.name)
for img in bpy.data.images:
    if img.name in ("Render Result", "Viewer Node"):
        continue
    w, h = img.size
    if max(w, h) > 1024:
        img.scale(round(w*1024/max(w,h)), round(h*1024/max(w,h)))
        img.pixels[0] = img.pixels[0]
bpy.ops.export_scene.gltf(filepath=str(OUT / "story-partner.glb"), export_format="GLB",
    use_selection=True, export_apply=True, export_animations=True, export_morph=False,
    export_skins=True, export_rest_position_armature=True, export_tangents=True, export_extras=True)
model = (OUT / "story-partner.glb").read_bytes()
size = struct.unpack_from("<I", model, 12)[0]
gltf = json.loads(model[20:20+size])
primitives = [p for m in gltf["meshes"] for p in m["primitives"]]
report = {
    "rig": rig.name, "body": body.name, "forwardBlender": "-Y", "units": "meters",
    "boundsBlender": bounds, "height": bounds[1][2]-bounds[0][2],
    "bones": [b.name for b in rig.data.bones], "fingers": "five digits x three phalanges x two hands",
    "sourceTopology": {o.name: {"vertices": len(o.data.vertices), "polygons": len(o.data.polygons),
                                "uvLayers": [uv.name for uv in o.data.uv_layers]} for o in meshes},
    "runtime": {"bytes": len(model), "skins": [len(s["joints"]) for s in gltf.get("skins", [])],
                "triangles": sum(gltf["accessors"][p.get("indices", p["attributes"]["POSITION"])]["count"]//3 for p in primitives)},
    "sources": [
        {"url": "https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip",
         "sha256": sha(SOURCES / "system-cc0-mirror.zip"), "license": "CC0-1.0"},
        {"url": "https://codeload.github.com/makehumancommunity/mpfb2/zip/"+COMMIT,
         "sha256": sha(SOURCES / "mpfb-2.0.18.zip"), "commit": COMMIT,
         "license": "GPL-3.0 for tool code, CC0-1.0 for core graphics data"},
    ],
    "licensePage": "https://static.makehumancommunity.org/about/license.html",
    "assetCatalog": "https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html",
    "selectedAssets": [relative for relative, _, _ in selections] + ["skins/young_caucasian_female/young_caucasian_female.mhmat"],
    "glbSha256": sha(OUT / "story-partner.glb"), "blendSha256": sha(OUT / "story-partner.blend"),
    "state": "Full rigged actor with neutral standing pose; dialogue animation is not authored here.",
}
(OUT / "story-partner.json").write_text(json.dumps(report, indent=2)+"\n", encoding="utf8")
bpy.ops.render.render(write_still=True)
print("PARTNER_READY", json.dumps(report["runtime"]), report["height"])
