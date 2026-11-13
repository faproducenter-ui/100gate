# blender -b art/viewmodel-hold.blend --python tools/viewmodel-debug/blender/orient_hold.py
# Turns the whole hold so the flashlight points FORWARD (lens away from the player, slightly up): the wrist rolls up, the fist stands with the
# thumb/index ring facing the player, the barrel runs along the view axis. The hand of every frame of flashlight_idle / _walk / _raise is moved
# by one rigid turn about the grip point, the arm is re-solved onto it (two-bone IK, elbow kept where it was) and baked into plain keys.
import bpy, math
import numpy as np
from mathutils import Vector, Matrix, Quaternion

OUT = r"C:\Users\libde\100gate\art\viewmodel-hold.blend"
arm = bpy.data.objects['StoryHeroWalk']; fl = bpy.data.objects['Flashlight']; cam = bpy.data.objects['VMcam']; sc = bpy.context.scene
pb = arm.pose.bones; W = arm.matrix_world
ACTS = [bpy.data.actions[n] for n in ('flashlight_idle', 'flashlight_walk', 'flashlight_raise')]
arm.animation_data.action = ACTS[0]; sc.frame_set(0)

Cw = cam.matrix_world.to_3x3(); eye = cam.location.copy()
def cs(x, y, z): return Cw @ Vector((x, y, z))              # camera-local (x right, y up, z back) -> world direction

# ---- the hold as it is now
dg = bpy.context.evaluated_depsgraph_get(); ev = fl.evaluated_get(dg); me = ev.to_mesh(); M = ev.matrix_world
pts = np.array([(M @ v.co)[:] for v in me.vertices]); ev.to_mesh_clear()
c = pts.mean(axis=0); ax = np.linalg.svd(pts - c, full_matrices=False)[2][0]
t = (pts - c) @ ax; q = pts - c; rr = np.sqrt(((q - np.outer(t, ax)) ** 2).sum(1))
head_sign = 1 if rr[t > np.percentile(t, 85)].mean() > rr[t < np.percentile(t, 15)].mean() else -1
a_old = Vector(ax * head_sign).normalized()
def hb(n): return W @ pb[n].head
palm = hb('hand_r') + 0.7 * (hb('middle_01_r') - hb('hand_r'))
P_old = Vector(c) + Vector(ax) * (palm - Vector(c)).dot(Vector(ax))
fingers_old = (hb('middle_01_r') - hb('hand_r')).normalized()

# ---- the new orientation: head forward and a little up / left (toward the centre), fingers up and to the left
a_new = cs(-0.10, 0.15, -1.0).normalized()
want_fingers = cs(-0.35, 0.93, 0.10).normalized()
base_q = a_old.rotation_difference(a_new)
best, bd = base_q, -2
for deg in range(0, 360, 2):
    qq = Quaternion(a_new, math.radians(deg)) @ base_q
    d = (qq @ fingers_old).dot(want_fingers)
    if d > bd: bd, best = d, qq
R_corr = best.to_matrix().to_4x4()
P_new = eye + cs(0.10, -0.075, -0.26)                      # where the grip point sits in the frame
M_corr = Matrix.Translation(P_new) @ R_corr @ Matrix.Translation(-P_old)
print('fingers dot', round(bd, 3), 'grip point ->', P_new)

# ---- pass A: the old hand matrix of every frame
frames = {}
for act in ACTS:
    arm.animation_data.action = act
    lo, hi = int(act.frame_range[0]), int(act.frame_range[1])
    frames[act.name] = list(range(lo, hi + 1))
H_old = {}
for act in ACTS:
    arm.animation_data.action = act
    for f in frames[act.name]:
        sc.frame_set(f); H_old[(act.name, f)] = W @ pb['hand_r'].matrix
arm.animation_data.action = ACTS[0]; sc.frame_set(0)
elbow0 = W @ pb['lowerarm_r'].head
sh = W @ pb['upperarm_r'].head

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
# the elbow hangs below and outward of the line shoulder->wrist
ikp.location = elbow0 + (elbow0 - sh).normalized() * 0.0 + Vector((-0.10, 0.20, -0.30))
def goal(H):
    p, qq, _ = H.decompose()
    ikw.location = p; ikh.matrix_world = Matrix.Translation(p) @ qq.to_matrix().to_4x4(); bpy.context.view_layer.update()
sc.frame_set(0); goal(M_corr @ H_old[('flashlight_idle', 0)])
bestp = (1e9, 0)
for ang in range(-180, 181, 10):
    ik.pole_angle = math.radians(ang); bpy.context.view_layer.update()
    d = (W @ pb['lowerarm_r'].head - ikp.location).length
    if d < bestp[0]: bestp = (d, ang)
ik.pole_angle = math.radians(bestp[1]); print('pole angle', bestp[1], 'elbow-pole', round(bestp[0], 3))

ARM = ('upperarm_r', 'lowerarm_r', 'hand_r')
rec = {}; worst = 0
for act in ACTS:
    arm.animation_data.action = act
    for f in frames[act.name]:
        sc.frame_set(f); G = M_corr @ H_old[(act.name, f)]; goal(G)
        miss = (W @ pb['hand_r'].head - G.translation).length; worst = max(worst, miss)
        if miss > .02: print('miss', act.name, f, round(miss, 3), 'reach', round((G.translation - sh).length, 3))
        rec[(act.name, f)] = {n: arm.convert_space(pose_bone=pb[n], matrix=pb[n].matrix, from_space='POSE', to_space='LOCAL').to_quaternion() for n in ARM}
print('worst wrist miss (m)', round(worst, 4))
for b in ('lowerarm_r', 'hand_r'):
    for con in list(pb[b].constraints): pb[b].constraints.remove(con)

# ---- bake: replace the arm rotation curves
for act in ACTS:
    for n in ARM:
        dp = f'pose.bones["{n}"].rotation_quaternion'
        for fc in [fc for fc in act.fcurves if fc.data_path == dp]: act.fcurves.remove(fc)
        fcs = [act.fcurves.new(dp, index=k, action_group=n) for k in range(4)]
        prev = None
        for f in frames[act.name]:
            qq = rec[(act.name, f)][n]
            if prev is not None and prev.dot(qq) < 0: qq = -qq              # keep the sign continuous
            prev = qq
            for k in range(4):
                kp = fcs[k].keyframe_points.insert(f, qq[k], options={'FAST'}); kp.interpolation = 'LINEAR'
        for fc in fcs: fc.update()
arm.animation_data.action = ACTS[0]; sc.frame_set(1); sc.frame_set(0)
print('hand now', W @ pb['hand_r'].head, 'goal', (M_corr @ H_old[('flashlight_idle', 0)]).translation)
for a in bpy.data.actions: a.use_fake_user = True
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print('oriented hold saved')
