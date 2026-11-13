# blender -b art/viewmodel-hold.blend --python tools/viewmodel-debug/blender/inspect_hand.py -- <tag>
# Close-up inspection of the hand on the flashlight: renders from six sides at short range, plus a view framed like the user's photo
# (hand coming in from the right, lens up-left, looking at the thumb side), and prints per-part skin/flashlight contact.
import bpy, math, os, sys
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
TAG = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'insp'
OUT = 'C:/Users/libde/100gate/docs/viewmodel-grip/inspect'; os.makedirs(OUT, exist_ok=True)
arm = bpy.data.objects['StoryHeroWalk']; fl = bpy.data.objects['Flashlight']; body = bpy.data.objects['VM_body']; sc = bpy.context.scene
arm.animation_data.action = bpy.data.actions['flashlight_idle']; sc.frame_set(1); sc.frame_set(0); bpy.context.view_layer.update()
pb = arm.pose.bones; W = arm.matrix_world
w = sc.world or bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs['Color'].default_value = (.85, .85, .86, 1); bg.inputs['Strength'].default_value = 1.0
for n, loc, rot, e in (('k1', (.6, -.6, 2.2), (.6, 0, .8), 120), ('k2', (-.6, -.2, 1.6), (1.2, 0, -1.0), 50)):
    if n not in bpy.data.objects:
        ld = bpy.data.lights.new(n, 'AREA'); ld.energy = e; ld.size = 1.5; lo = bpy.data.objects.new(n, ld); sc.collection.objects.link(lo); lo.location = loc; lo.rotation_euler = rot
try: sc.render.engine = 'BLENDER_EEVEE_NEXT'
except TypeError: sc.render.engine = 'BLENDER_WORKBENCH'
sc.render.resolution_x, sc.render.resolution_y = 900, 600
d = bpy.data.cameras.new('insp'); d.lens = 50; d.clip_start = .005
co = bpy.data.objects.new('insp', d); sc.collection.objects.link(co)
fist = W @ pb['hand_r'].head + 0.6 * (W @ pb['middle_01_r'].head - W @ pb['hand_r'].head)
dg = bpy.context.evaluated_depsgraph_get(); ev = fl.evaluated_get(dg); me = ev.to_mesh(); M = ev.matrix_world
pts = np.array([(M @ v.co)[:] for v in me.vertices]); ev.to_mesh_clear()
c = pts.mean(axis=0); ax = Vector(np.linalg.svd(pts - c, full_matrices=False)[2][0])
tgt = fist * 0.7 + Vector(c) * 0.3
views = {'right': Vector((-1, 0, .25)), 'left': Vector((1, 0, .25)), 'front': Vector((0, -1, .3)), 'back': Vector((0, 1, .3)),
         'top': Vector((0, -.1, 1)), 'below': Vector((0, -.2, -1)), 'photo': Vector((-1, -.5, .2))}
for name, v in views.items():
    co.location = tgt + v.normalized() * 0.32
    co.rotation_euler = (tgt - co.location).to_track_quat('-Z', 'Z' if name not in ('top', 'below') else 'Y').to_euler()
    sc.camera = co; sc.render.filepath = f'{OUT}/{TAG}_{name}.png'; bpy.ops.render.render(write_still=True)
names = {vg.index: vg.name for vg in body.vertex_groups}
dg = bpy.context.evaluated_depsgraph_get(); fe = fl.evaluated_get(dg); tree = BVHTree.FromObject(fe, dg); inv = fe.matrix_world.inverted(); FW = fe.matrix_world
be = body.evaluated_get(dg); me = be.to_mesh(); MB = be.matrix_world; out = {}
for v in me.vertices:
    if not v.groups: continue
    n = names[max(v.groups, key=lambda g: g.weight).group]
    k = next((p for p in ('index', 'middle', 'ring', 'pinky', 'thumb', 'hand') if n.startswith(p) and n.endswith('_r')), None)
    if not k: continue
    cpos = MB @ v.co; loc, nor, i, dd = tree.find_nearest(inv @ cpos)
    s = (cpos - FW @ loc).length * (1 if (inv @ cpos - loc).dot(nor) >= 0 else -1)
    o = out.setdefault(k, [9, 0, 0]); o[0] = min(o[0], s); o[1] += s < -0.001; o[2] += abs(s) < 0.0015
be.to_mesh_clear()
print('[contact]', {k: f'closest {v[0] * 1000:+.1f} mm, inside>1mm {v[1]}, on the surface {v[2]}' for k, v in out.items()})
