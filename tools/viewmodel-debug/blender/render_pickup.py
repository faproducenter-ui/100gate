# blender -b art/viewmodel-hold.blend --python tools/viewmodel-debug/blender/render_pickup.py -> docs/viewmodel-grip/pickup/*.png
import bpy, math, os
from mathutils import Vector, Matrix
OUT = r"C:\Users\libde\100gate\docs\viewmodel-grip\pickup"; os.makedirs(OUT, exist_ok=True)
arm = bpy.data.objects['StoryHeroWalk']; fl = bpy.data.objects['Flashlight']; sc = bpy.context.scene
arm.animation_data.action = bpy.data.actions['flashlight_pickup']
fl.animation_data_create(); fl.animation_data.action = bpy.data.actions['flashlight_pickup']
w = sc.world or bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs['Color'].default_value = (.12, .13, .15, 1); bg.inputs['Strength'].default_value = 1.2
if 'key' not in bpy.data.objects:
    ld = bpy.data.lights.new('key', 'AREA'); ld.energy = 90; ld.size = 2; lo = bpy.data.objects.new('key', ld); sc.collection.objects.link(lo); lo.location = (.3, .2, 2.1); lo.rotation_euler = (.35, 0, 0)
try: sc.render.engine = 'BLENDER_EEVEE_NEXT'
except TypeError: sc.render.engine = 'BLENDER_WORKBENCH'
sc.render.resolution_x, sc.render.resolution_y = 960, 540
# the table: a plane under the flashlight at frame 0
sc.frame_set(0); bpy.context.view_layer.update()
cam = bpy.data.objects['VMcam']; Cw = cam.matrix_world.to_3x3()
N = (Cw @ Vector((0, math.cos(math.radians(40)), math.sin(math.radians(40))))).normalized()
under = fl.matrix_world.translation - N * 0.018
bpy.ops.mesh.primitive_plane_add(size=1.4, location=under)
tb = bpy.context.object; tb.name = 'TableRef'
tb.rotation_euler = N.to_track_quat('Z', 'Y').to_euler()
m = bpy.data.materials.new('tbl'); m.use_nodes = True; next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value = (.25, .15, .08, 1); tb.data.materials.append(m)
d = bpy.data.cameras.new('side'); so = bpy.data.objects.new('side', d); sc.collection.objects.link(so); d.angle_y = math.radians(45); d.clip_start = .01
so.location = Vector((0.75, -0.05, 1.45)); so.rotation_euler = (Vector((-.1, -.35, 1.35)) - so.location).to_track_quat('-Z', 'Y').to_euler()
for f in (0, 6, 10, 14, 17, 21, 27, 34, 40):
    sc.frame_set(f)
    for name, cobj in (('fp', cam), ('side', so)):
        sc.camera = cobj; sc.render.filepath = rf"{OUT}\{name}_{f:02d}.png"; bpy.ops.render.render(write_still=True)
