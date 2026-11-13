# blender -b art/viewmodel-hold.blend --python tools/viewmodel-debug/blender/regrip_diagonal.py -- [deg]
# With the wrist straight, lays the flashlight along the other diagonal of the palm: lens end out past the base of the little
# finger and forward, tail at the thumb. The barrel turns about its grip point (it stays in the palm), then every finger is curled
# again until it rests on the barrel. Prints the angle between the lens axis and the forearm (wanted: 20-35 deg).
import bpy, math, sys
import numpy as np
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
DIAG = math.radians(float(argv[0]) if argv else 45.0)        # barrel angle from the finger-base direction toward the little finger
arm = bpy.data.objects['StoryHeroWalk']; fl = bpy.data.objects['Flashlight']; body = bpy.data.objects['VM_body']; sc = bpy.context.scene
pb = arm.pose.bones; W = arm.matrix_world
ACTS = [bpy.data.actions[n] for n in ('flashlight_idle', 'flashlight_walk', 'flashlight_raise')]
arm.animation_data.action = ACTS[0]; sc.frame_set(1); sc.frame_set(0)
def hb(n): return W @ pb[n].head
def barrel():
    dg = bpy.context.evaluated_depsgraph_get(); ev = fl.evaluated_get(dg); me = ev.to_mesh(); M = ev.matrix_world
    pts = np.array([(M @ v.co)[:] for v in me.vertices]); ev.to_mesh_clear()
    c = pts.mean(axis=0); ax = np.linalg.svd(pts - c, full_matrices=False)[2][0]
    t = (pts - c) @ ax; q = pts - c; rr = np.sqrt(((q - np.outer(t, ax)) ** 2).sum(1))
    s = 1 if rr[t > np.percentile(t, 85)].mean() > rr[t < np.percentile(t, 15)].mean() else -1
    return Vector(c), Vector(ax * s).normalized()
c, a_old = barrel()
fore = (W @ pb['lowerarm_r'].tail - W @ pb['lowerarm_r'].head).normalized()
dist = (hb('middle_01_r') - hb('hand_r')).normalized()                      # wrist -> knuckles
ulnar = (hb('pinky_01_r') - hb('index_01_r')).normalized()
palmn = ulnar.cross(dist).normalized()
palm = hb('hand_r') + 0.7 * (hb('middle_01_r') - hb('hand_r'))
if (c - palm).dot(palmn) < 0: palmn = -palmn
P = c + a_old * (palm - c).dot(a_old)
ul = (ulnar - dist * ulnar.dot(dist)).normalized()
a_new = (dist * math.cos(DIAG) + ul * math.sin(DIAG)); a_new = (a_new - palmn * a_new.dot(palmn)).normalized()
R = a_old.rotation_difference(a_new).to_matrix().to_4x4()
fl.matrix_world = Matrix.Translation(P) @ R @ Matrix.Translation(-P) @ fl.matrix_world
bpy.context.view_layer.update()
# slide the flashlight along its axis until the fist sits on the narrow body, not on the wide head (fewest skin vertices inside it)
names0 = {vg.index: vg.name for vg in body.vertex_groups}
hand_vs = [v.index for v in body.data.vertices if v.groups and names0[max(v.groups, key=lambda g: g.weight).group].endswith('_r') and any(names0[max(v.groups, key=lambda g: g.weight).group].startswith(p) for p in ('index', 'middle', 'ring', 'pinky', 'thumb', 'hand'))]
def inside():
    dg = bpy.context.evaluated_depsgraph_get(); fe = fl.evaluated_get(dg); tree = BVHTree.FromObject(fe, dg); inv = fe.matrix_world.inverted(); FW = fe.matrix_world
    be = body.evaluated_get(dg); me = be.to_mesh(); MB = be.matrix_world; deep = 0
    for i in hand_vs:
        co = MB @ me.vertices[i].co; loc, nor, idx, d = tree.find_nearest(inv @ co)
        deep += ((co - FW @ loc).length > 0.0015) and (inv @ co - loc).dot(nor) < 0
    be.to_mesh_clear(); return deep
# put the palm over the middle of the narrow body (1.5 cm behind the mesh centre; the head flares from +6 cm)
cc, aa = barrel(); t_palm = (palm - cc).dot(aa); sft = t_palm - (-0.015)
fl.matrix_world = Matrix.Translation(aa * sft) @ fl.matrix_world; bpy.context.view_layer.update()
print(f'slide {sft * 100:+.1f} cm along the lens axis; skin vertices inside the flashlight: {inside()}')
c2, a2 = barrel()
print(f'lens axis vs forearm {math.degrees(a2.angle(fore)):.1f} deg, lens axis world {tuple(round(v, 2) for v in a2)}')

# re-curl the fingers onto the barrel (scan about the knuckle axis; most skin within 2 mm, at most 3 vertices deeper than 1.5 mm)
names = {vg.index: vg.name for vg in body.vertex_groups}
fv = {f: [v.index for v in body.data.vertices if v.groups and names[max(v.groups, key=lambda g: g.weight).group].startswith(f) and names[max(v.groups, key=lambda g: g.weight).group].endswith('_r')] for f in ('index', 'middle', 'ring', 'pinky', 'thumb')}
def counts(f):
    dg = bpy.context.evaluated_depsgraph_get(); fe = fl.evaluated_get(dg); tree = BVHTree.FromObject(fe, dg); inv = fe.matrix_world.inverted(); FW = fe.matrix_world
    be = body.evaluated_get(dg); me = be.to_mesh(); MB = be.matrix_world; touch = deep = 0
    for i in fv[f]:
        co = MB @ me.vertices[i].co; loc, nor, idx, d = tree.find_nearest(inv @ co)
        s = (co - FW @ loc).length * (1 if (inv @ co - loc).dot(nor) >= 0 else -1)
        touch += s < 0.002; deep += s < -0.0015
    be.to_mesh_clear(); return touch, deep
deltas = {}
for f in ('index', 'middle', 'ring', 'pinky', 'thumb'):
    base = [pb[f'{f}_0{i}_r'].rotation_quaternion.copy() for i in (1, 2, 3)]
    best = (-1, 0.0)
    for k in range(-25, 26):
        th = k * 0.025
        for i, q0 in zip((1, 2, 3), base): pb[f'{f}_0{i}_r'].rotation_quaternion = q0 @ Quaternion(Vector((1, 0, 0)), th)
        bpy.context.view_layer.update(); touch, deep = counts(f)
        if deep <= 3 and touch > best[0]: best = (touch, th)
    for i, q0 in zip((1, 2, 3), base): pb[f'{f}_0{i}_r'].rotation_quaternion = q0
    deltas[f] = best[1]; print(f'finger {f}: curl {math.degrees(best[1]):+.1f} deg, touching vertices {best[0]}')
for act in bpy.data.actions:
    if act.name.startswith('flashlight_pickup'): continue
    for f, th in deltas.items():
        for i in (1, 2, 3):
            dp = f'pose.bones["{f}_0{i}_r"].rotation_quaternion'
            fcs = [next((fc for fc in act.fcurves if fc.data_path == dp and fc.array_index == k), None) for k in range(4)]
            if None in fcs: continue
            for ki in range(len(fcs[0].keyframe_points)):
                q = Quaternion([fcs[k].keyframe_points[ki].co[1] for k in range(4)]) @ Quaternion(Vector((1, 0, 0)), th)
                for k in range(4):
                    kp = fcs[k].keyframe_points[ki]; kp.co[1] = q[k]; kp.handle_left[1] = q[k]; kp.handle_right[1] = q[k]
            for fc in fcs: fc.update()
sc.frame_set(1); sc.frame_set(0)
for a in bpy.data.actions: a.use_fake_user = True
bpy.ops.wm.save_as_mainfile(filepath=r"C:\Users\libde\100gate\art\viewmodel-hold.blend")
print('regrip saved')
