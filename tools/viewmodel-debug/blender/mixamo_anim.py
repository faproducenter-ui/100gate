# blender -b art/mixamo-hold.blend --python tools/viewmodel-debug/blender/mixamo_anim.py -- [render]
# Animation on the user's ready model: the right hand takes the flashlight off the table and holds it (24 fps).
# Everything is derived from the solved hold (art/mixamo-hold.blend): the flashlight keeps that exact grip, only the hand's place changes.
# Frames: 1-12 relaxed | 12-30 reach over the flashlight | 30-40 down to it | 38-52 fingers close | 50-84 lift to the hold | 84-200 hold with a breath.
import bpy, math, sys, json, os
import numpy as np
from mathutils import Vector, Matrix, Quaternion

RENDER = 'render' in sys.argv
OUT_BLEND = r"C:\Users\libde\100gate\art\mixamo-pickup-anim.blend"
SHOTS = r"C:\Users\libde\100gate\docs\viewmodel-grip\mixamo\anim"; os.makedirs(SHOTS, exist_ok=True)
sc = bpy.context.scene; arm = bpy.data.objects['Hero']; pb = arm.pose.bones; W = arm.matrix_world
fl = bpy.data.objects['Flashlight']; body = next(o for o in bpy.data.objects if o.name.startswith('Hero_') and o.type == 'MESH' and 'Body' in o.name) if False else None
for b in pb: b.rotation_mode = 'QUATERNION'
def B(n): return pb['mixamorig_' + n]
def H(n): return W @ B(n).head
def bone_by_prefix(p): return next(b for b in pb if b.name.startswith('mixamorig_' + p + '_'))
FING = {'Index': ('046', '047', '048', '049'), 'Middle': ('038', '039', '040', '041'), 'Ring': ('050', '051', '052', '053'), 'Pinky': ('054', '055', '056', '057'), 'Thumb': ('042', '043', '044', '045')}
def fb(f, i): return B(f'RightHand{f}{i + 1}_{FING[f][i]}')
UA, FA, HA = 'RightArm_035', 'RightForeArm_036', 'RightHand_037'
def qx(a): return Quaternion(Vector((1, 0, 0)), a)
def qz(a): return Quaternion(Vector((0, 0, 1)), a)

# ---------- what the hold solver left in the file
hold = json.load(open(r"C:\Users\libde\100gate\art\mixamo-hold.json"))
bpy.context.view_layer.update()
K = Matrix(hold['K']); G = Matrix(hold['G'])
def hand_frame():
    d = (H('RightHandMiddle1_038') - H(HA)).normalized()
    r = H('RightHandIndex1_046') - H('RightHandPinky1_054'); r = (r - d * r.dot(d)).normalized()
    return Matrix((d, r, d.cross(r))).transposed()
HF_h = hand_frame(); Hw_hold = HF_h.to_4x4(); Hw_hold.translation = H(HA)
FL_HOLD = fl.matrix_world.copy(); fl.rotation_mode = 'QUATERNION'
G = Hw_hold.inverted() @ FL_HOLD                     # flashlight local -> hand frame, measured on the solved pose (exact)
G = G @ Matrix.Translation(Vector((0.0, 0.002, -0.002)))        # measured in Blender: this offset + 5% looser fist leaves <2 mm of skin overlap
FL_HOLD = Hw_hold @ G
CLOSED = {f: (tuple(c * 0.95 for c in v['curls']), v['spread']) for f, v in hold['fist_final'].items()}
HOLD_Q = {n: pb[n].rotation_quaternion.copy() for n in ()}

# ---------- the T-pose reference: reset the right arm, spine, neck, head and fingers, then lower the right arm like the scene did
CHAIN = [b.name for b in pb if b.name.startswith('mixamorig_RightHand') or b.name in ('mixamorig_' + UA, 'mixamorig_' + FA)] + \
        [bone_by_prefix(p).name for p in ('Spine', 'Spine1', 'Spine2', 'Neck', 'Head')]
def reset():
    for n in CHAIN: pb[n].rotation_quaternion = Quaternion((1, 0, 0, 0))
    bpy.context.view_layer.update()
def parent_frame(bone): return (W @ bone.matrix @ bone.matrix_basis.inverted()).to_3x3()
def rot_world(bone, R):
    A = parent_frame(bone); bone.rotation_quaternion = (A.inverted() @ R @ A).to_quaternion() @ bone.rotation_quaternion
    bpy.context.view_layer.update()
def aim(bone, target):
    cur = (W @ bone.tail - W @ bone.head).normalized(); tgt = (target - (W @ bone.head)).normalized()
    rot_world(bone, cur.rotation_difference(tgt).to_matrix())
reset()
rot_world(B(UA), Matrix.Rotation(math.radians(-65), 3, 'Y'))
# left arm: hangs relaxed (the A-pose arm stood out), slightly bent at the elbow, hand turned to the thigh
rot_world(bone_by_prefix('LeftArm'), Matrix.Rotation(math.radians(20), 3, 'Y'))
rot_world(bone_by_prefix('LeftArm'), Matrix.Rotation(math.radians(6), 3, 'X'))               # a little behind the hip line, away from the table corner
rot_world(bone_by_prefix('LeftForeArm'), Matrix.Rotation(math.radians(-9), 3, 'X'))
LEFT_RELAX = {'Index': (0.30, 0.40, 0.25), 'Middle': (0.38, 0.45, 0.28), 'Ring': (0.46, 0.50, 0.30), 'Pinky': (0.55, 0.55, 0.32), 'Thumb': (0.12, 0.18, 0.12)}
for _f, _c in LEFT_RELAX.items():                                                            # a relaxed hand: slightly curled fingers, not the T-pose flat hand
    for _i in range(3): next(b for b in pb if b.name.startswith(f'mixamorig_LeftHand{_f}{_i + 1}_')).rotation_quaternion = Quaternion((1, 0, 0), _c[_i])
Lu = (H(FA) - H(UA)).length; Lf = (H(HA) - H(FA)).length
hold_wrist = Vector(hold['hold_arm']['wrist']); hold_elbow = Vector(hold['hold_arm']['elbow'])

# ---------- poses of the fingers
RELAX = {'Index': (0.30, 0.35, 0.20), 'Middle': (0.35, 0.40, 0.25), 'Ring': (0.42, 0.45, 0.28), 'Pinky': (0.50, 0.50, 0.30), 'Thumb': (0.10, 0.15, 0.10)}
OPEN = {'Index': (0.10, 0.12, 0.08), 'Middle': (0.12, 0.14, 0.08), 'Ring': (0.14, 0.15, 0.10), 'Pinky': (0.16, 0.16, 0.10), 'Thumb': (0.0, 0.0, 0.0)}
THUMB_OPEN = float(os.environ.get('THUMB_OPEN', '0.7'))      # the thumb stays clear of the barrel until the hand closes
def lerp(a, b, t): return tuple(x + (y - x) * t for x, y in zip(a, b))
def set_fingers(base_open, w):
    """base_open 0..1: relaxed -> open hand; w[f] 0..1: that finger's closing around the barrel"""
    for f in FING:
        c0 = lerp(RELAX[f], OPEN[f], base_open); cc, sp = CLOSED[f]
        c = lerp(c0, cc, w[f]); s = sp * w[f] + (THUMB_OPEN * (1 - w[f]) * (1 if base_open > 0 or w[f] < 1 else 0) if f == 'Thumb' else 0)
        for i in range(3): fb(f, i).rotation_quaternion = qz(s if i == 0 else 0) @ qx(c[i])

# ---------- the arm: two-bone solve with a fixed pole direction (the same elbow rule that gives the hold elbow)
sh_hold = None
def solve_arm(Hw, lean_ok=True):
    S = H(UA); P = Hw.translation
    d = (P - S); dist = min(d.length, (Lu + Lf) * 0.995); u = d.normalized()
    a = (Lu ** 2 - Lf ** 2 + dist ** 2) / (2 * dist); h = math.sqrt(max(Lu ** 2 - a ** 2, 0))
    pole = POLE - u * POLE.dot(u); pole.normalize()
    elbow = S + u * a + pole * h
    aim(B(UA), elbow); aim(B(FA), P if (P - S).length <= (Lu + Lf) else S + u * (Lu + Lf))
    Ah = parent_frame(B(HA)); R = Hw.to_3x3() @ K
    B(HA).rotation_quaternion = (Ah.inverted() @ R).to_quaternion(); bpy.context.view_layer.update()
    return (H(HA) - P).length

# pole: from the hold geometry (shoulder is where the reset pose puts it; measure with the hold wrist)
S0 = H(UA); uh = (hold_wrist - S0).normalized(); POLE = (hold_elbow - S0); POLE = (POLE - uh * POLE.dot(uh)).normalized()

# ---------- flashlight on the table
TABLE_Z = 0.90; OLD_Z = 0.78
for o in bpy.data.objects:
    if o.name.startswith('Table'):
        o.location.y += 0.11
        if o.name == 'Table_top': o.location.z += TABLE_Z - OLD_Z
        else: k = (TABLE_Z - 0.04) / (OLD_Z - 0.04); o.scale.z *= k; o.location.z *= k
dg = bpy.context.evaluated_depsgraph_get(); ev = fl.evaluated_get(dg); me = ev.to_mesh()
PL = np.array([v.co[:] for v in me.vertices]); ev.to_mesh_clear()
tl = PL[:, 0]; t_tail, t_head = float(tl.min()), float(tl.max())
mid = np.abs(tl - tl.mean()) < 0.02; axis_off = Vector((0, float(np.median(PL[mid, 1])), float(np.median(PL[mid, 2]))))
p_local = Vector((t_tail + 0.32 * (t_head - t_tail), 0, 0)) + axis_off
def table_pose(px, py, roll_deg, tilt_deg):
    a = Vector((0, -math.cos(math.radians(tilt_deg)), -math.sin(math.radians(tilt_deg))))
    v = Vector((math.sin(math.radians(roll_deg)), 0, -math.cos(math.radians(roll_deg)))); s = (v - a * v.dot(a)).normalized()
    R = Matrix((a, s, a.cross(s))).transposed()
    zs = (PL @ np.array(R)).T if False else None
    pts = np.array([(R @ (Vector(p) - p_local))[:] for p in PL[::7]])
    z0 = TABLE_Z - pts[:, 2].min()
    M = R.to_4x4(); M.translation = Vector((px, py, z0)) - R @ Vector((0, 0, 0)); M = Matrix.Translation(Vector((px, py, z0))) @ R.to_4x4() @ Matrix.Translation(-p_local)
    return M
FL_TABLE = table_pose(-0.33, -0.27, 60, 8)

def ease(t): t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)
def seg(f, a, b): return ease((f - a) / (b - a))
def mat_lerp(M0, M1, t):
    q = M0.to_quaternion().slerp(M1.to_quaternion(), t); p = M0.translation.lerp(M1.translation, t)
    M = q.to_matrix().to_4x4(); M.translation = p; return M

Hw_table = FL_TABLE @ G.inverted()                                  # the hand where it takes the flashlight
HOVER = Matrix.Translation(Vector((0.0, 0.03, 0.12))) @ Hw_table
def scene_at(f):
    """returns (hand matrix, flashlight matrix, openness, closing weights, lean degrees)"""
    # flashlight: on the table until the lift, then to the hold
    lift = seg(f, 50, 84)
    arc = Vector((0, 0, 0.05 * math.sin(math.pi * lift)))
    FL = mat_lerp(FL_TABLE, FL_HOLD, lift); FL.translation = FL.translation + arc
    sway = 0.0
    if f > 84:
        sway = math.sin(2 * math.pi * (f - 84) / 80)
    FL.translation = FL.translation + Vector((0.0, 0.0, 0.003 * sway))
    if f <= 50:
        # hand: relaxed -> over the flashlight -> down on it
        a = seg(f, 12, 30); b = seg(f, 30, 40)
        Hw = mat_lerp(REST_HAND, HOVER, a)
        Hw = mat_lerp(Hw, Hw_table, b) if f >= 30 else Hw
        if 40 <= f: Hw = Hw_table.copy(); Hw.translation = Hw.translation
        # the hand rotation should be the grasp rotation by the hover
        Hw = Hw
    else:
        Hw = FL @ G.inverted()
    op = seg(f, 14, 28) * (1 - seg(f, 38, 40))
    close = {}
    for f_, delay in (('Index', 0), ('Middle', 2), ('Ring', 4), ('Pinky', 6), ('Thumb', 8)):
        close[f_] = seg(f, 38 + delay, 48 + delay)
    lean = 16 * seg(f, 8, 36) * (1 - seg(f, 54, 90))
    return Hw, FL, op, close, lean

def lean_pose(deg):
    reset(); rot_world(B(UA), Matrix.Rotation(math.radians(-65), 3, 'Y'))
    d = math.radians(deg)
    for nm, k in (('Spine', 0.35), ('Spine1', 0.35), ('Spine2', 0.30)): rot_world(bone_by_prefix(nm), Matrix.Rotation(d * k, 3, 'X'))
    rot_world(bone_by_prefix('Neck'), Matrix.Rotation(-d * 0.35, 3, 'X')); rot_world(bone_by_prefix('Head'), Matrix.Rotation(-d * 0.25, 3, 'X'))
    rot_world(B(UA), Matrix.Rotation(math.radians(0), 3, 'Y'))

lean_pose(0); set_fingers(0, {f: 0 for f in FING}); bpy.context.view_layer.update()
HFr = hand_frame(); REST_HAND = HFr.to_4x4(); REST_HAND.translation = H(HA).lerp(H(UA), 0.05) + Vector((0.0, -0.02, 0.0))

from mathutils.bvhtree import BVHTree
BODY = bpy.data.objects['Hero_Body']
_names = {vg.index: vg.name for vg in BODY.vertex_groups}
def _grp(v): return _names[max(v.groups, key=lambda g: g.weight).group] if v.groups else ''
FV = {f: [v.index for v in BODY.data.vertices if _grp(v).startswith(f'mixamorig_RightHand{f}')] for f in FING}
def depth(fname):
    """deepest skin vertex of this finger inside the flashlight, metres (positive = inside)"""
    dgp = bpy.context.evaluated_depsgraph_get(); fe = fl.evaluated_get(dgp); tree = BVHTree.FromObject(fe, dgp); inv = fe.matrix_world.inverted()
    be = BODY.evaluated_get(dgp); me = be.to_mesh(); MB = be.matrix_world; worst = 0.0
    for i in FV[fname]:
        co = MB @ me.vertices[i].co; loc, nor, idx, d = tree.find_nearest(inv @ co)
        if loc is None: continue
        if (inv @ co - loc).dot(nor) < 0 and d < 0.025: worst = max(worst, d)
    be.to_mesh_clear(); return worst
miss = []
need = []
for f in range(1, 201):
    Hw, FL, op, close, lean = scene_at(f)
    n = 0.0
    for extra in np.arange(0, 61, 1.0):
        lean_pose(extra)
        if (Hw.translation - H(UA)).length < (Lu + Lf) * 0.985: break
    need.append(float(extra))
arr = np.array(need)
dil = np.array([arr[max(0, i - 10): i + 11].max() for i in range(200)])
sm = np.array([dil[max(0, i - 8): i + 9].mean() for i in range(200)])
for f in range(1, 201):
    sc.frame_set(f)
    Hw, FL, op, close, lean = scene_at(f)
    L = float(max(sm[f - 1], 0.0))
    lean_pose(L)
    err = solve_arm(Hw); miss.append(err)
    fl.matrix_world = FL
    set_fingers(op, close)
    bpy.context.view_layer.update()
    if 34 <= f <= 64:                       # a finger stops where it meets the barrel instead of passing through it
        for fn in FING:
            while close[fn] > 0 and depth(fn) > 0.0015:
                close[fn] = max(0.0, close[fn] - 0.04); set_fingers(op, close); bpy.context.view_layer.update()
    for n_ in CHAIN: pb[n_].keyframe_insert('rotation_quaternion', frame=f)
    fl.rotation_mode = 'QUATERNION'; fl.keyframe_insert('location', frame=f); fl.keyframe_insert('rotation_quaternion', frame=f)
    if f in (1, 12, 30, 40, 52, 60, 84, 120, 200): print(f'frame {f}: lean {L:.0f} deg, hand miss {err * 1000:.1f} mm, dist {(Hw.translation - H(UA)).length:.3f} / {Lu + Lf:.3f}')
print('max hand miss mm', round(max(miss) * 1000, 1), 'at frame', miss.index(max(miss)) + 1)
sc.frame_start, sc.frame_end = 1, 200
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
if RENDER:
    co = bpy.data.objects['shot']; sc.camera = co
    def shoot(name, loc, target, lens=40):
        co.data.lens = lens; co.location = loc; co.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = rf"{SHOTS}\{name}.png"; bpy.ops.render.render(write_still=True)
    for f in (1, 18, 30, 40, 46, 56, 70, 90, 150):
        sc.frame_set(f); bpy.context.view_layer.update()
        shoot(f'a_front_{f:03d}', (1.3, -1.9, 1.5), (-0.25, -0.3, 1.1), 35)
        shoot(f'a_side_{f:03d}', (-2.0, -0.3, 1.3), (-0.2, -0.3, 1.1), 40)
print('anim saved')
