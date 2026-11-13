# blender -b art/viewmodel-hold.blend --python tools/viewmodel-debug/blender/build_pickup.py
# Adds the action `flashlight_pickup` (24 fps, 40 frames): the hand comes in from the lower right, hovers over the flashlight lying on the
# table, the fingers close one after another (thumb last), the flashlight is lifted and turned into the hold pose of `flashlight_idle`.
# The arm is solved with a two-bone IK onto the wrist/hand goals of each frame and baked into plain bone keys.
import bpy, math
import numpy as np
from mathutils import Vector, Matrix, Quaternion

OUT = r"C:\Users\libde\100gate\art\viewmodel-hold.blend"
arm = bpy.data.objects['StoryHeroWalk']; fl = bpy.data.objects['Flashlight']; cam = bpy.data.objects['VMcam']; sc = bpy.context.scene
body = bpy.data.objects['VM_body']
pb = arm.pose.bones; W = arm.matrix_world
idle = bpy.data.actions['flashlight_idle']
for a in [a for a in bpy.data.actions if a.name.startswith('flashlight_pickup')]: bpy.data.actions.remove(a)
arm.animation_data.action = idle; sc.frame_set(1); sc.frame_set(0)
fl.rotation_mode = 'QUATERNION'
HOLD_BASIS = fl.matrix_basis.copy()          # flashlight relative to the hand bone while held (restored at the end)
N_FR = 40
FPS = sc.render.fps

# ---- hold geometry
base = {b.name: (b.location.copy(), b.rotation_quaternion.copy(), b.scale.copy()) for b in pb}
FING = [f'{f}_0{i}_r' for f in ('index', 'middle', 'ring', 'pinky', 'thumb') for i in (1, 2, 3)]
closed = {n: base[n][1].copy() for n in FING}
F_hold = fl.matrix_world.copy(); H_hold = W @ pb['hand_r'].matrix
G = H_hold.inverted() @ F_hold                              # flashlight relative to the hand, constant while held
dg = bpy.context.evaluated_depsgraph_get(); ev = fl.evaluated_get(dg); me = ev.to_mesh(); M = ev.matrix_world
pts = np.array([(M @ v.co)[:] for v in me.vertices]); ev.to_mesh_clear()
c = pts.mean(axis=0); ax = np.linalg.svd(pts - c, full_matrices=False)[2][0]
t = (pts - c) @ ax; q = pts - c; rr = np.sqrt(((q - np.outer(t, ax)) ** 2).sum(1))
head_sign = 1 if rr[t > np.percentile(t, 85)].mean() > rr[t < np.percentile(t, 15)].mean() else -1
a_head = Vector(ax * head_sign).normalized()
def hb(n): return W @ pb[n].head
fingers = (hb('middle_01_r') - hb('hand_r')).normalized(); knuckle = (hb('index_01_r') - hb('pinky_01_r')).normalized()
palmn = knuckle.cross(fingers); palm = hb('hand_r') + 0.7 * (hb('middle_01_r') - hb('hand_r'))
if (Vector(c) - palm).dot(palmn) < 0: palmn = -palmn

# ---- the table: camera space (x right, y up, z back); the player looks 40 degrees down at it
Cw = cam.matrix_world.to_3x3(); eye = cam.location.copy()
def cs(x, y, z): return Cw @ Vector((x, y, z))
phi = math.radians(40)
Nt = cs(0, math.cos(phi), math.sin(phi)).normalized()
fw = cs(0, 0, -1); a_t = (fw - Nt * fw.dot(Nt)).normalized()   # lying with the lens end pointing away from the player
def frame(a, n):
    n = (n - a * n.dot(a)).normalized(); return Matrix((a, n, a.cross(n))).transposed()
Rt = (frame(a_t, -Nt) @ frame(a_head, palmn).inverted()).to_4x4()
P_t = eye + cs(0.05, -0.12, -0.30)
F_table = Matrix.Translation(P_t) @ Rt @ Matrix.Translation(-F_hold.translation) @ F_hold
H_grasp = F_table @ F_hold.inverted() @ H_hold
R_g, R_h = H_grasp.to_quaternion(), H_hold.to_quaternion()
Tg, Th = H_grasp.translation.copy(), H_hold.translation.copy()
sh = W @ pb['upperarm_r'].head
print('wrist distance to shoulder', round((Tg - sh).length, 3), 'arm length', round(pb['upperarm_r'].length + pb['lowerarm_r'].length, 3))

def ease(s): s = max(0., min(1., s)); return s * s * (3 - 2 * s)
def seg(f, f0, f1): return ease((f - f0) / (f1 - f0))
def hand_goal(f):
    """wrist position + hand orientation for frame f"""
    start = Tg + cs(0.30, -0.30, 0.24); pre = Tg + Nt * 0.11 + cs(0.04, 0, 0.02); lift = Tg + Nt * 0.045
    if f <= 9: s = seg(f, 0, 9); p = start.lerp(pre, s); q = R_g.slerp(R_g, 0)
    elif f <= 14: s = seg(f, 9, 14); p = pre.lerp(Tg, s); q = R_g
    elif f <= 18: p = Tg; q = R_g
    elif f <= 22: p = Tg.lerp(lift, seg(f, 18, 22)); q = R_g
    elif f <= 34: s = seg(f, 22, 34); p = lift.lerp(Th, s) + Nt * 0.05 * math.sin(math.pi * s); q = R_g.slerp(R_h, s)
    else: p = Th; q = R_h
    return p, q
def closure(name, f):
    open_amt = 0.18 + 0.17 * seg(f, 0, 10)
    t0 = {'index': 13.0, 'middle': 13.5, 'ring': 14.0, 'pinky': 14.5, 'thumb': 15.0}[name.split('_')[0]]
    return open_amt + (1 - open_amt) * seg(f, t0, t0 + 5.0)

# ---- IK rig
def mk(name):
    o = bpy.data.objects.get(name)
    if not o:
        o = bpy.data.objects.new(name, None); sc.collection.objects.link(o)
    return o
ikw, ikh, ikp = mk('IK_wrist'), mk('IK_hand'), mk('IK_pole')
for b in ('lowerarm_r', 'hand_r'):
    for con in list(pb[b].constraints): pb[b].constraints.remove(con)
ik = pb['lowerarm_r'].constraints.new('IK'); ik.target = ikw; ik.chain_count = 2; ik.use_tail = True; ik.pole_target = ikp
cr = pb['hand_r'].constraints.new('COPY_ROTATION'); cr.target = ikh; cr.target_space = 'WORLD'; cr.owner_space = 'WORLD'
ikp.location = sh + Vector((-0.25, 0.25, -0.35))
def pose_goal(f):
    p, q = hand_goal(f)
    ikw.location = p; ikh.matrix_world = Matrix.Translation(p) @ q.to_matrix().to_4x4()
    bpy.context.view_layer.update()
# pole angle: the elbow should hang outward and down
pose_goal(14)
best = (1e9, 0)
for ang in range(-180, 181, 15):
    ik.pole_angle = math.radians(ang); bpy.context.view_layer.update()
    e = W @ pb['lowerarm_r'].head; d = (e - ikp.location).length
    if d < best[0]: best = (d, ang)
ik.pole_angle = math.radians(best[1]); print('pole angle', best[1], 'elbow-pole', round(best[0], 3))

ARM = ['clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r']
rec = {}
for f in range(N_FR + 1):
    for n, (l, qq, s) in base.items():
        pb[n].location = l; pb[n].rotation_quaternion = qq; pb[n].scale = s
    for n in FING:
        ident = Quaternion((1, 0, 0, 0)); pb[n].rotation_quaternion = ident.slerp(closed[n], closure(n, f))
    pose_goal(f)
    # visual local rotation of the arm chain
    r = {}
    for n in ARM:
        m = arm.convert_space(pose_bone=pb[n], matrix=pb[n].matrix, from_space='POSE', to_space='LOCAL')
        r[n] = m.to_quaternion()
    r.update({n: pb[n].rotation_quaternion.copy() for n in FING})
    rec[f] = r
for b in ('lowerarm_r', 'hand_r'):
    for con in list(pb[b].constraints): pb[b].constraints.remove(con)

# blend the last frames onto the idle pose so the clip ends exactly on the hold
for f in range(34, N_FR + 1):
    w = seg(f, 34, N_FR)
    for n in ARM: rec[f][n] = rec[f][n].slerp(base[n][1], w)

# ---- write the action
act = bpy.data.actions.new('flashlight_pickup'); arm.animation_data.action = act
for f in range(N_FR + 1):
    sc.frame_set(f)
    for n, (l, qq, s) in base.items():
        pb[n].location = l; pb[n].rotation_quaternion = qq; pb[n].scale = s
    for n, qq in rec[f].items(): pb[n].rotation_quaternion = qq
    for b in pb:
        varying = b.name in rec[f]
        if varying or f in (0, N_FR):
            b.keyframe_insert('location', frame=f); b.keyframe_insert('rotation_quaternion', frame=f); b.keyframe_insert('scale', frame=f)

# ---- the flashlight: on the table until the fingers have closed, then in the hand
fa = bpy.data.actions.new('flashlight_pickup_fl'); fl.animation_data_create(); fl.animation_data.action = fa
ATTACH = 16
for f in range(N_FR + 1):
    sc.frame_set(f); bpy.context.view_layer.update()
    H = W @ pb['hand_r'].matrix
    fl.matrix_world = F_table if f < ATTACH else H @ G
    bpy.context.view_layer.update()
    fl.keyframe_insert('location', frame=f); fl.keyframe_insert('rotation_quaternion', frame=f); fl.keyframe_insert('scale', frame=f)
# after the clip the hold values must come back for the other actions
fl.animation_data.action = None
fl.matrix_basis = HOLD_BASIS
arm.animation_data.action = idle; sc.frame_set(1); sc.frame_set(0)
print('flashlight local at hold', fl.matrix_basis.translation)
for a in bpy.data.actions: a.use_fake_user = True
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print('pickup saved')
