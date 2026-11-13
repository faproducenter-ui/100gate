# blender -b art/viewmodel-hold.blend --python tools/viewmodel-debug/blender/fit_fingers.py
# Poses every finger joint of the right hand around the flashlight as it lies in the hand now.
# Each finger is a chain of three joints; each joint gets a free rotation (a small rotation vector on top of its current pose).
# The search wants the middle joint, the end joint and the finger pad on the barrel surface (bone centre = barrel radius + flesh),
# going AROUND the barrel (over the top and back toward the palm), with little twist about the bone and little sideways spread.
# The thumb wants its pad and end joint on the barrel. Afterwards the real skin is checked against the flashlight mesh.
import bpy, math
import numpy as np
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree

arm = bpy.data.objects['StoryHeroWalk']; fl = bpy.data.objects['Flashlight']; body = bpy.data.objects['VM_body']; sc = bpy.context.scene
pb = arm.pose.bones; W = arm.matrix_world; Wi = W.inverted()
ACTS = [a for a in bpy.data.actions if not a.name.startswith('flashlight_pickup')]
arm.animation_data.action = bpy.data.actions['flashlight_idle']; sc.frame_set(1); sc.frame_set(0)

# ---- the barrel in armature space: axis, and its radius where the palm holds it
dg = bpy.context.evaluated_depsgraph_get(); ev = fl.evaluated_get(dg); me = ev.to_mesh(); M = ev.matrix_world
pts = np.array([(Wi @ (M @ v.co))[:] for v in me.vertices]); ev.to_mesh_clear()
c = pts.mean(axis=0); ax = np.linalg.svd(pts - c, full_matrices=False)[2][0]
palm = Wi @ (W @ pb['hand_r'].head + 0.7 * (W @ pb['middle_01_r'].head - W @ pb['hand_r'].head))
t = (pts - c) @ ax; tp = (np.array(palm[:]) - c) @ ax
q = pts - c; rr = np.sqrt(((q - np.outer(t, ax)) ** 2).sum(1))
R = float(np.percentile(rr[np.abs(t - tp) < 0.03], 90))
C = Vector(c); A = Vector(ax).normalized()
_q = pts - c; _t = _q @ ax; _r = np.sqrt(((_q - np.outer(_t, ax)) ** 2).sum(1))
if _r[_t > np.percentile(_t, 85)].mean() < _r[_t < np.percentile(_t, 15)].mean(): A = -A   # A points to the lens end
print(f'barrel radius at the grip {R * 1000:.1f} mm')
def axis_dist(p): v = p - C; return (v - A * v.dot(A)).length
pn = (pb['hand_r'].matrix.to_3x3() @ Vector((0, 0, 1)))                   # some hand axis; the palm side is found below
mid = pb['middle_01_r'].head; hand_c = pb['hand_r'].head + 0.6 * (mid - pb['hand_r'].head)
to_barrel = C + A * (hand_c - C).dot(A) - hand_c
palm_dir = to_barrel.normalized()                                          # from the palm toward the barrel axis

def chain(name): return [pb[f'{name}_0{i}_r'] for i in (1, 2, 3)]
def rest_rel(b): return b.parent.bone.matrix_local.inverted() @ b.bone.matrix_local
def fk(bones, quats):
    """armature-space heads of the three joints + the finger pad, for the given local rotations"""
    Mp = bones[0].parent.matrix.copy(); out = []
    for b, qq in zip(bones, quats):
        Mp = Mp @ rest_rel(b) @ (Matrix.Translation(b.location) @ qq.to_matrix().to_4x4())
        out.append(Mp.translation.copy())
    out.append((Mp @ Vector((0, bones[-1].bone.length * 0.75, 0))))
    return out
def rot(v): a = v.length; return Quaternion() if a < 1e-9 else Quaternion(v / a, a)

def solve(bones, score, max_angle=1.6, twist_w=0.004):
    base = [b.rotation_quaternion.copy() for b in bones]
    rv = [Vector((0, 0, 0)) for _ in bones]
    def cost():
        qs = [b0 @ rot(v) for b0, v in zip(base, rv)]
        cst = score(fk(bones, qs))
        for v in rv: cst += twist_w * v.y ** 2 + 0.0015 * v.z ** 2 + max(0, v.length - max_angle) ** 2   # Blender bones run along local Y
        return cst
    best = cost()
    for step in (.3, .15, .07, .03, .012):
        for _ in range(10):
            improved = False
            for v in rv:
                for comp in range(3):
                    for sg in (1, -1):
                        old = v[comp]; v[comp] = old + sg * step; cs = cost()
                        if cs < best - 1e-12: best = cs; improved = True
                        else: v[comp] = old
            if not improved: break
    return [b0 @ rot(v) for b0, v in zip(base, rv)], best

result = {}
SGN = {}
# grid search from the open hand: curl of each joint about its own X axis (+ a little spread at the knuckle), then a fine polish
def qx(a): return Quaternion(Vector((1, 0, 0)), a)
def qz(a): return Quaternion(Vector((0, 0, 1)), a)
for f in ('index', 'middle', 'ring', 'pinky'):
    bones = chain(f)
    w0 = bones[0].head - C; w0 = (w0 - A * w0.dot(A)).normalized()
    flesh = (0.0105, 0.0095, 0.0075)
    # which way is "curl": the sign that brings the fingertip toward the barrel axis
    ident = [Quaternion() for _ in bones]
    sgn = 1 if axis_dist(fk(bones, [qx(.6)] * 3)[3]) < axis_dist(fk(bones, [qx(-.6)] * 3)[3]) else -1
    SGN[f] = sgn
    def score(P):
        e = 0
        mids = [(P[0] + P[1]) / 2, (P[1] + P[2]) / 2, (P[2] + P[3]) / 2]
        for j, p in enumerate(P[1:4]):
            d = axis_dist(p); e += (d - (R + flesh[j])) ** 2 * (20 if d < R + 0.003 else 1)
        for j, p in enumerate(mids):
            d = axis_dist(p); target = R + (0.0115, 0.010, 0.0085)[j]
            e += (d - target) ** 2 * (20 if d < target - 0.003 else 0.6)        # every phalanx lies on the body, none through it
        tip = P[3] - C; tip = tip - A * tip.dot(A)
        e += max(0.0, tip.normalized().dot(w0) + 0.2) ** 2 * R * R * 4          # the pad ends on the far side of the barrel
        return e
    best = (1e9, None)
    for a1 in range(0, 101, 10):
        for a2 in range(0, 111, 10):
            for a3 in range(0, 81, 10):
                for s1 in (-5, 0, 5):
                    qs = [qz(math.radians(s1)) @ qx(sgn * math.radians(a1)), qx(sgn * math.radians(a2)), qx(sgn * math.radians(a3))]
                    e = score(fk(bones, qs))
                    # a real fist bends every joint: middle joint about as much as the knuckle, end joint ~0.7 of the middle one
                    r1, r2, r3 = math.radians(a1), math.radians(a2), math.radians(a3)
                    e += 4e-5 * ((r2 - 1.0 * r1) ** 2 + (r3 - 0.7 * r2) ** 2)
                    if e < best[0]: best = (e, (a1, a2, a3, s1))
    a1, a2, a3, s1 = best[1]
    for b, qq in zip(bones, [qz(math.radians(s1)) @ qx(sgn * math.radians(a1)), qx(sgn * math.radians(a2)), qx(sgn * math.radians(a3))]):
        b.rotation_quaternion = qq
    qs, err = solve(bones, score)                                               # polish with free joint rotations
    for b, qq in zip(bones, qs): b.rotation_quaternion = qq
    result[f] = qs
    print(f'{f}: curl {a1}/{a2}/{a3} spread {s1}, rms {math.sqrt(err / 6) * 1000:.1f} mm')
# thumb: over the top of the barrel, its pad resting by the middle joint of the index finger (as in a real fist round a torch)
bones = chain('thumb')
def tscore(P):
    # thumb on the side of the barrel, opposite the fingers: end joint and pad on the surface, no segment through it
    e = 0
    for j, p in enumerate(P[2:4]):
        d = axis_dist(p); t_ = R + (0.0105, 0.0075)[j]; e += (d - t_) ** 2 * (20 if d < t_ - 0.002 else 1)
    for p in ((P[1] + P[2]) / 2, (P[2] + P[3]) / 2):
        d = axis_dist(p); e += min(0.0, d - (R + 0.009)) ** 2 * 30
    return e
base_t = [b.rotation_quaternion.copy() for b in bones]
best_t = solve(bones, tscore, max_angle=2.2, twist_w=0.001)
for b, q0 in zip(bones, base_t): b.rotation_quaternion = q0
qs, err = best_t
for b, qq in zip(bones, qs): b.rotation_quaternion = qq
result['thumb'] = qs
print(f'thumb: rms {math.sqrt(err / 2) * 1000:.1f} mm')
bpy.context.view_layer.update()

# ---- real skin vs the flashlight
names = {vg.index: vg.name for vg in body.vertex_groups}
def contact():
    dg = bpy.context.evaluated_depsgraph_get(); fe = fl.evaluated_get(dg); tree = BVHTree.FromObject(fe, dg); inv = fe.matrix_world.inverted(); FW = fe.matrix_world
    be = body.evaluated_get(dg); me = be.to_mesh(); MB = be.matrix_world; out = {}
    for v in me.vertices:
        if not v.groups: continue
        n = names[max(v.groups, key=lambda g: g.weight).group]
        k = next((p for p in ('index', 'middle', 'ring', 'pinky', 'thumb', 'hand') if n.startswith(p) and n.endswith('_r')), None)
        if not k: continue
        co = MB @ v.co; loc, nor, i, d = tree.find_nearest(inv @ co)
        s = (co - FW @ loc).length * (1 if (inv @ co - loc).dot(nor) >= 0 else -1)
        o = out.setdefault(k, [0, 0, 9]); o[0] += s < 0.003; o[1] += s < -0.002; o[2] = min(o[2], s)
    be.to_mesh_clear(); return {k: (v[0], v[1], round(v[2] * 1000, 1)) for k, v in out.items()}
# ---- last pass on the real skin: open a finger joint by joint, 1.5 deg at a time, until no skin vertex is inside the flashlight
def deep_count(prefix):
    dg = bpy.context.evaluated_depsgraph_get(); fe = fl.evaluated_get(dg); tree = BVHTree.FromObject(fe, dg); inv = fe.matrix_world.inverted(); FW = fe.matrix_world
    be = body.evaluated_get(dg); me = be.to_mesh(); MB = be.matrix_world; n_ = 0
    for v in me.vertices:
        if not v.groups: continue
        nm = names[max(v.groups, key=lambda g: g.weight).group]
        if not (nm.startswith(prefix) and nm.endswith('_r')): continue
        co = MB @ v.co; loc, nor, i, d = tree.find_nearest(inv @ co)
        n_ += ((co - FW @ loc).length > 0.001) and (inv @ co - loc).dot(nor) < 0
    be.to_mesh_clear(); return n_
names = {vg.index: vg.name for vg in body.vertex_groups}
for f in ('index', 'middle', 'ring', 'pinky'):
    bones = chain(f)
    for it in range(4):
        n_ = deep_count(f)
        if n_ == 0: break
        for b in bones[1:]: b.rotation_quaternion = b.rotation_quaternion @ qx(-SGN[f] * math.radians(1.5))
        bpy.context.view_layer.update()
    result[f] = [b.rotation_quaternion.copy() for b in bones]
    print(f'{f}: opened {it} steps, skin vertices inside now {deep_count(f)}')
bones = chain('thumb'); qt = [b.rotation_quaternion.copy() for b in bones]
for it in range(20):
    n_ = deep_count('thumb')
    if n_ == 0: break
    for b, q0 in zip(bones, base_t): b.rotation_quaternion = b.rotation_quaternion.slerp(q0, 0.06)
    bpy.context.view_layer.update()
result['thumb'] = [b.rotation_quaternion.copy() for b in bones]
print(f'thumb: eased {it} steps, skin vertices inside now {deep_count("thumb")}')
print('CONTACT (touching <3mm, inside >2mm, deepest mm):', contact())

# ---- write the pose into every key of the hold clips
for act in ACTS:
    for f, qs in result.items():
        for i, qq in zip((1, 2, 3), qs):
            dp = f'pose.bones["{f}_0{i}_r"].rotation_quaternion'
            for k in range(4):
                fc = next((fc for fc in act.fcurves if fc.data_path == dp and fc.array_index == k), None)
                if not fc: continue
                for kp in fc.keyframe_points: kp.co[1] = qq[k]; kp.handle_left[1] = qq[k]; kp.handle_right[1] = qq[k]
                fc.update()
sc.frame_set(1); sc.frame_set(0)
for a in bpy.data.actions: a.use_fake_user = True
bpy.ops.wm.save_as_mainfile(filepath=r"C:\Users\libde\100gate\art\viewmodel-hold.blend")
print('fingers saved')
