# blender -b --factory-startup --python tools/viewmodel-debug/blender/torch_props.py -> art/torch/props.blend
# The two ready models the user supplied (Torch stick by DJMaesen, Zippo Lighter by MH446, both CC-BY 4.0), cleaned for the game:
#   Torch:   one mesh, axis +X (burnt head toward +X), real size 0.95 m, origin at the grip point 0.28 m from the foot. Empty 'TorchTip' = where the flame sits.
#   Lighter: real size (body 40 mm tall), origin at the body centre, parts: LighterBody, LighterLid (hinge 'LighterLidPivot', closed = rotation -133 deg about X), LighterInsert, LighterDetails. Empty 'LighterWick' = flame spot.
import bpy, math, os
import numpy as np
from mathutils import Vector, Matrix, Euler

TORCH_GLB = r"C:\Users\libde\Downloads\torch_stick.glb"
LIGHT_GLB = r"C:\Users\libde\Downloads\zippo_lighter.glb"
OUT = r"C:\Users\libde\100gate\art\torch\props.blend"
TEX = r"C:\Users\libde\100gate\art\torch\tex"; os.makedirs(TEX, exist_ok=True)

def clear():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
clear()
sc = bpy.context.scene

def flatten(o):
    """bake the object's world transform into its mesh (the Sketchfab importer leaves rotated/scaled parents)"""
    m = o.matrix_world.copy(); o.parent = None; o.data.transform(m); o.matrix_world = Matrix.Identity(4)

def shrink_images(max_px, names=None):
    for im in bpy.data.images:
        if im.size[0] > max_px and im.source in ('FILE', 'GENERATED'):
            im.scale(max_px, max_px)

# ------------------------------------------------------------------ torch
bpy.ops.import_scene.gltf(filepath=TORCH_GLB)
tm = next(o for o in bpy.data.objects if o.type == 'MESH')
flatten(tm)
for o in list(bpy.data.objects):
    if o is not tm: bpy.data.objects.remove(o, do_unlink=True)
tm.name = 'Torch'; tm.data.name = 'Torch'
# keep only the textured material
mats = [m for m in tm.data.materials]
keep = next(m for m in mats if m and m.name == 'torchstick')
tm.data.materials.clear(); tm.data.materials.append(keep); keep.name = 'Torch_wood'
for p in tm.data.polygons: p.material_index = 0
V = np.array([v.co[:] for v in tm.data.vertices]); lo, hi = V.min(0), V.max(0)
print('torch raw size', (hi - lo).round(3), 'axis', int(np.argmax(hi - lo)))
# axis -> +X with the head (the thicker, darker end) at +X; the head is the wider end
ax = int(np.argmax(hi - lo))
Rm = {0: Matrix.Identity(3), 1: Matrix.Rotation(math.radians(-90), 3, 'Z'), 2: Matrix.Rotation(math.radians(90), 3, 'Y')}[ax]     # Y->X via -90 about Z ... Z->X via +90 about Y
tm.data.transform(Rm.to_4x4())
V = np.array([v.co[:] for v in tm.data.vertices]); xs = V[:, 0]
w_lo = np.ptp(V[xs < np.percentile(xs, 15)][:, 1:], axis=0).mean(); w_hi = np.ptp(V[xs > np.percentile(xs, 85)][:, 1:], axis=0).mean()
if w_lo > w_hi: tm.data.transform(Matrix.Rotation(math.pi, 4, 'Z'))          # head must be the wider end, at +X
V = np.array([v.co[:] for v in tm.data.vertices]); lo, hi = V.min(0), V.max(0)
LEN = 0.95; s = LEN / (hi[0] - lo[0]); GRIP = 0.28
tm.data.transform(Matrix.Scale(s, 4))
V = np.array([v.co[:] for v in tm.data.vertices]); lo, hi = V.min(0), V.max(0)
cy, cz = (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2
# centre the shaft on the axis at the grip point (use the median shaft section near the grip, not the bent bounding box)
sec = V[np.abs(V[:, 0] - (lo[0] + GRIP)) < 0.03]; cy, cz = sec[:, 1].mean(), sec[:, 2].mean()
tm.data.transform(Matrix.Translation(Vector((-(lo[0] + GRIP), -cy, -cz))))
V = np.array([v.co[:] for v in tm.data.vertices]); print('torch size', np.ptp(V, axis=0).round(3), 'x range', V[:, 0].min().round(3), V[:, 0].max().round(3), 'grip radius', (np.hypot(sec[:, 1] - cy, sec[:, 2] - cz).max()).round(3))
tip = bpy.data.objects.new('TorchTip', None); sc.collection.objects.link(tip)
head = V[V[:, 0] > V[:, 0].max() - 0.12]; tip.location = (V[:, 0].max() - 0.02, head[:, 1].mean(), head[:, 2].mean())
tip.parent = tm
# the wrapped head gets its own material (same textures) so the game can tint it dark when the torch is out and let it glow when lit
head_mat = keep.copy(); head_mat.name = 'Torch_head'; tm.data.materials.append(head_mat)
HEAD_X0 = V[:, 0].max() - 0.17
for p in tm.data.polygons:
    cx = sum(tm.data.vertices[i].co.x for i in p.vertices) / len(p.vertices)
    p.material_index = 1 if cx > HEAD_X0 else 0
print('head polys', sum(1 for p in tm.data.polygons if p.material_index == 1), 'of', len(tm.data.polygons))
tm.data.update()
sc.collection.objects.link(tm) if tm.name not in sc.collection.objects else None

# ------------------------------------------------------------------ lighter
before = set(bpy.data.objects.keys())
bpy.ops.import_scene.gltf(filepath=LIGHT_GLB)
new = [o for o in bpy.data.objects if o.name not in before]
meshes = [o for o in new if o.type == 'MESH']
for o in meshes: flatten(o)
for o in new:
    if o.type != 'MESH': bpy.data.objects.remove(o, do_unlink=True)
by = {o.name: o for o in meshes}
body, lid, chim = by['Object_4'], by['Object_6'], by['Object_42']
# the rest: details (rings, screws, pins, wheel, spring) are joined into one mesh with one material
rest = [o for o in meshes if o not in (body, lid, chim)]
for o in rest: o.select_set(False)
bpy.ops.object.select_all(action='DESELECT')
for o in rest: o.select_set(True)
bpy.context.view_layer.objects.active = rest[0]
bpy.ops.object.join()
details = bpy.context.view_layer.objects.active
body.name, lid.name, chim.name, details.name = 'LighterBody', 'LighterLid', 'LighterInsert', 'LighterDetails'
# one shared material for the small metal parts: the brushed-metal one the body uses
metal = body.data.materials[0]
details.data.materials.clear(); details.data.materials.append(metal)
for p in details.data.polygons: p.material_index = 0
# real size: the body is 40 mm tall (z extent of the body)
bz = np.array([v.co.z for v in body.data.vertices]); sc_l = 0.040 / (bz.max() - bz.min())
cx = np.mean([v.co.x for v in body.data.vertices]); cy_ = np.mean([v.co.y for v in body.data.vertices]); cz_ = (bz.max() + bz.min()) / 2
T = Matrix.Scale(sc_l, 4) @ Matrix.Translation(Vector((-cx, -cy_, -cz_)))
parts = [body, lid, chim, details]
for o in parts: o.data.transform(T)
# hinge pivot (the hinge pins sit at the lid's two corner vertices next to the body, found numerically): axis X through y=-1.014, z=2.525 (model units)
piv_local = T @ Vector((0, -1.014, 2.525))
piv = bpy.data.objects.new('LighterLidPivot', None); sc.collection.objects.link(piv); piv.location = piv_local
bpy.context.view_layer.update()
lid.parent = piv; lid.matrix_parent_inverse = Matrix.Translation(-piv.location)
piv.rotation_euler = (math.radians(-133), 0, 0)          # closed
for o in (body, chim, details): o.parent = None
wick = bpy.data.objects.new('LighterWick', None); sc.collection.objects.link(wick)
cv = np.array([v.co[:] for v in chim.data.vertices]); wick.location = (cv[:, 0].mean(), cv[:, 1].mean(), cv[:, 2].max() + 0.001)
for o in parts + [piv, wick]:
    if o.name not in sc.collection.objects: sc.collection.objects.link(o)
print('lighter size (m)', np.ptp(np.array([v.co[:] for v in body.data.vertices]), axis=0).round(4), 'pivot', tuple(round(v, 4) for v in piv.location), 'wick', tuple(round(v, 4) for v in wick.location))

shrink_images(1024)
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print('saved', OUT, 'lighter materials', len({m.name for o in parts for m in o.data.materials}))
