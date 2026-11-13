# blender -b --factory-startup --python tools/viewmodel-debug/blender/mixamo_scene.py
# Scene for the "take the flashlight off the table and hold it" animation, on the user's ready model
# (Mike Alger, "Rigged T-Pose Human Male w 50 Face Blendshapes", CC-BY 4.0, Mixamo skeleton).
# Builds: the character with arms brought down from the T-pose, a table, the game's flashlight lying on it, a camera. Saves art/mixamo-pickup.blend
import bpy, math, os, sys
from mathutils import Vector, Matrix, Quaternion

GLB = r"C:\Users\libde\Downloads\rigged_t-pose_human_male_w_50_face_blendshapes.glb"
FLASH_SRC = r"C:\Users\libde\100gate\art\viewmodel-hold.blend"
OUT = r"C:\Users\libde\100gate\art\mixamo-pickup.blend"
SHOTS = r"C:\Users\libde\100gate\docs\viewmodel-grip\mixamo"; os.makedirs(SHOTS, exist_ok=True)

for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)      # the factory startup cube, light and camera
bpy.ops.import_scene.gltf(filepath=GLB)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE'); arm.name = 'Hero'
for o in bpy.data.objects:                                      # tidy the importer's empties' names
    if o.type == 'MESH' and o.parent == arm: o.name = 'Hero_' + o.data.name.split('_')[0].replace('0', 'Body')
sc = bpy.context.scene
sc.render.fps = 24; sc.frame_start = 1; sc.frame_end = 200
pb = arm.pose.bones
for b in pb: b.rotation_mode = 'QUATERNION'
def bone(n): return pb['mixamorig_' + n]
W = arm.matrix_world

# ---- arms down: bring each arm from the T-pose to a relaxed hang (a rotation about the shoulder, in the armature's frame)
def swing(side):
    sgn = -1 if side == 'Right' else 1
    b = bone(f'{side}Arm_{"035" if side == "Right" else "011"}')
    # lower the arm by 65 deg: rotate about the world Y axis (front-back), through the shoulder
    R = Matrix.Rotation(math.radians(sgn * 65), 3, 'Y')
    A = (W @ b.matrix @ b.matrix_basis.inverted()).to_3x3()
    b.rotation_quaternion = (A.inverted() @ R @ A).to_quaternion() @ b.rotation_quaternion
    bpy.context.view_layer.update()
swing('Right'); swing('Left')

# ---- table and flashlight
def mat(name, rgba, rough=.6):
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); p.inputs['Base Color'].default_value = rgba; p.inputs['Roughness'].default_value = rough
    return m
TABLE_Z = 0.78
bpy.ops.mesh.primitive_cube_add(size=1, location=(-0.10, -0.62, TABLE_Z - 0.02)); top = bpy.context.object; top.name = 'Table_top'; top.scale = (1.1, 0.6, 0.04)
top.data.materials.append(mat('wood', (.28, .16, .08, 1), .5))
for i, (x, y) in enumerate(((-0.58, -0.88), (0.38, -0.88), (-0.58, -0.36), (0.38, -0.36))):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, (TABLE_Z - 0.04) / 2)); l = bpy.context.object; l.name = f'Table_leg{i}'; l.scale = (0.05, 0.05, TABLE_Z - 0.04); l.data.materials.append(top.data.materials[0])
before = set(bpy.data.objects.keys())
with bpy.data.libraries.load(FLASH_SRC, link=False) as (src, dst):
    dst.objects = [n for n in ('Flashlight', 'Flashlight_switch') if n in src.objects]
for o in dst.objects:
    sc.collection.objects.link(o)
fl = bpy.data.objects['Flashlight']; sw = bpy.data.objects['Flashlight_switch']
for o in (fl, sw):
    o.parent = None
fl.animation_data_clear()
fl.rotation_mode = 'QUATERNION'
fl.matrix_world = Matrix.Identity(4)
sw.parent = fl; sw.matrix_parent_inverse = Matrix.Identity(4)
fl['mesh_axis_note'] = 'beam / lens end along the mesh +X (long axis) after load; see build'
bpy.context.view_layer.update()
import numpy as np
def geo():
    dg = bpy.context.evaluated_depsgraph_get(); ev = fl.evaluated_get(dg); me = ev.to_mesh(); M = ev.matrix_world
    pts = np.array([(M @ v.co)[:] for v in me.vertices]); ev.to_mesh_clear()
    c = pts.mean(axis=0); ax = np.linalg.svd(pts - c, full_matrices=False)[2][0]
    t = (pts - c) @ ax; q = pts - c; rr = np.sqrt(((q - np.outer(t, ax)) ** 2).sum(1))
    s = 1 if rr[t > np.percentile(t, 85)].mean() > rr[t < np.percentile(t, 15)].mean() else -1
    return Vector(c), Vector(ax * s).normalized(), float(t.min() * s if s > 0 else -t.max()), float(rr.max())
c, a, tmin, rmax = geo()
print('flashlight (standalone): centre', tuple(round(v, 3) for v in c), 'lens axis', tuple(round(v, 2) for v in a), 'max radius', round(rmax, 3))
# lay it on the table, lens pointing away from the player (-Y), push button up, centre at x=-0.20 (in front of the right hand)
Rl = a.rotation_difference(Vector((0, -1, 0))).to_matrix().to_4x4()
fl.matrix_world = Matrix.Translation(Vector((-0.20, -0.56, TABLE_Z + 0.02))) @ Rl @ Matrix.Translation(-c) @ fl.matrix_world
bpy.context.view_layer.update()
# the flashlight's thickest part (the head) is wider than the barrel: rest it so its lowest point touches the table
dg = bpy.context.evaluated_depsgraph_get(); ev = fl.evaluated_get(dg); me = ev.to_mesh(); M = ev.matrix_world
zmin = min((M @ v.co).z for v in me.vertices); ev.to_mesh_clear()
fl.location.z += (TABLE_Z) - zmin
bpy.context.view_layer.update()
print('flashlight on the table: lens axis', tuple(round(v, 2) for v in geo()[1]), 'centre', tuple(round(v, 3) for v in geo()[0]))

# ---- camera and light for checking renders
w = sc.world or bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs['Color'].default_value = (.55, .57, .6, 1); bg.inputs['Strength'].default_value = 1.0
for n, loc, rot, e in (('key', (1.2, -1.6, 2.4), (.9, 0, .5), 90), ('fill', (-1.5, -1.0, 1.6), (1.2, 0, -.9), 35)):
    ld = bpy.data.lights.new(n, 'AREA'); ld.energy = e; ld.size = 2; lo = bpy.data.objects.new(n, ld); sc.collection.objects.link(lo); lo.location = loc; lo.rotation_euler = rot
try: sc.render.engine = 'BLENDER_EEVEE_NEXT'
except TypeError: sc.render.engine = 'BLENDER_WORKBENCH'
sc.render.resolution_x, sc.render.resolution_y = 960, 540
cd = bpy.data.cameras.new('shot'); co = bpy.data.objects.new('shot', cd); sc.collection.objects.link(co); sc.camera = co; cd.lens = 40; cd.clip_start = .02
def shoot(name, loc, target):
    co.location = loc; co.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = rf"{SHOTS}\{name}.png"; bpy.ops.render.render(write_still=True)
if __name__ == '__main__':
    shoot('scene_front', (0.4, -2.3, 1.9), (-0.1, -0.4, 0.95))
    shoot('scene_side', (-2.4, -0.5, 1.5), (-0.1, -0.45, 0.95))
    bpy.ops.wm.save_as_mainfile(filepath=OUT)
    print('scene saved')
