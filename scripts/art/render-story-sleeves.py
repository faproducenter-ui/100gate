"""Matched, diagnostic elbow crops from the real clip and materials."""
import sys
from pathlib import Path

import bpy
from mathutils import Vector

out = Path.cwd() / "outputs/quality-overhaul/sleeves"
out.mkdir(exist_ok=True, parents=True)
mode = "after" if "--candidate" in sys.argv else "before"
s = bpy.context.scene
r = s.objects["StoryEscape_Alexei"]
eye = s.objects["StoryEscape_Eye"]
if "--dq-study" in sys.argv:
    mode = "dq-study"
    shirt = next(o for o in r.children if "sweater" in o.name.lower())
    next(m for m in shirt.modifiers if m.type == "ARMATURE").use_deform_preserve_volume = True


def aim(o, target):
    o.rotation_euler = (target-o.location).to_track_quat("-Z", "Y").to_euler()


camera_data = bpy.data.cameras.new("Proof only: matched elbow crop")
camera = bpy.data.objects.new(camera_data.name, camera_data)
s.collection.objects.link(camera)
camera_data.lens = 48
camera_data.clip_start = .012
s.camera = camera
s.render.engine = "CYCLES"
s.cycles.samples = 8
s.cycles.use_denoising = True
s.render.resolution_x = 520
s.render.resolution_y = 405
s.render.resolution_percentage = 100
s.render.image_settings.file_format = "PNG"
s.world = bpy.data.worlds.new("Proof only: neutral workshop")
s.world.use_nodes = True
s.world.node_tree.nodes["Background"].inputs["Color"].default_value = (.36,.40,.46,1)
s.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .37
key_data = bpy.data.lights.new("Proof only: inspection light", "AREA")
key = bpy.data.objects.new(key_data.name, key_data)
s.collection.objects.link(key)
key_data.energy = 20
key_data.shape = "DISK"
key_data.size = .27

for label, sec, side in (("left-reach",11.45,"l"),("right-cut",14.65,"r"),("left-knife-down",17.9,"l")):
    f = s.frame_start + sec*s.render.fps
    s.frame_set(int(f), subframe=f-int(f))
    bpy.context.view_layer.update()
    elbow = r.matrix_world @ r.pose.bones["lowerarm_"+side].head
    wrist = r.matrix_world @ r.pose.bones["hand_"+side].head
    target = elbow.lerp(wrist,.23)
    # Right insert is a true side angle because the rope holds that elbow
    # behind the torso; left uses the cinematic viewpoint's camera ray.
    sign = 1 if side == "l" else -1
    if side == "l":
        view = (eye.matrix_world.translation-target).normalized()
    else:
        view = Vector((sign*.87,-.25,.38)).normalized()
    camera.location = target+view*.405
    aim(camera,target)
    key.location = camera.location+Vector((sign*.17,-.10,.20))
    aim(key,target)
    s.render.filepath = str(out / f"{label}-{mode}.png")
    bpy.ops.render.render(write_still=True)
