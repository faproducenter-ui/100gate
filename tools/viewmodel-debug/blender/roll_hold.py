# blender -b art/viewmodel-hold.blend --python tools/viewmodel-debug/blender/roll_hold.py
# Run after orient_hold.py. The flashlight stays exactly where it is; the fist turns about the flashlight's own axis (so the fingers
# keep wrapping the barrel the same way) until the arm, re-solved with two-bone IK, comes into the hand with a nearly straight wrist.
# The roll is searched at frame 0 (smallest wrist bend, elbow below the shoulder line), then every frame of idle / walk / raise is baked.
import bpy, math
import numpy as np
from mathutils import Vector, Matrix, Quaternion

arm = bpy.data.objects['StoryHeroWalk']; fl = bpy.data.objects['Flashlight']; sc = bpy.context.scene
pb = arm.pose.bones; W = arm.matrix_world
ACTS = [bpy.data.actions[n] for n in ('flashlight_idle', 'flashlight_walk', 'flashlight_raise')]
arm.animation_data.action = ACTS[0]; sc.frame_set(1); sc.frame_set(0)

# barrel axis in the hand's frame (constant while held)
dg = bpy.context.evaluated_depsgraph_get(); ev = fl.evaluated_get(dg); me = ev.to_mesh(); M = ev.matrix_world
pts = np.array([(M @ v.co)[:] for v in me.vertices]); ev.to_mesh_clear()
c = pts.mean(axis=0); ax = np.linalg.svd(pts - c, full_matrices=False)[2][0]
H0 = W @ pb['hand_r'].matrix
palm = W @ pb['hand_r'].head + 0.7 * (W @ pb['middle_01_r'].head - W @ pb['hand_r'].head)
P = Vector(c) + Vector(ax) * (palm - Vector(c)).dot(Vector(ax))           # grip point on the axis
P_h = H0.inverted() @ P; A_h = (H0.inverted().to_3x3() @ Vector(ax)).normalized()

frames = {a.name: list(range(int(a.frame_range[0]), int(a.frame_range[1]) + 1)) for a in ACTS}
H_old = {}
for act in ACTS:
    arm.animation_data.action = act
    for f in frames[act.name]:
        sc.frame_set(f); H_old[(act.name, f)] = W @ pb['hand_r'].matrix
arm.animation_data.action = ACTS[0]; sc.frame_set(0)
sh = W @ pb['upperarm_r'].head; elbow0 = W @ pb['lowerarm_r'].head

def rolled(H, ang):
    p = H @ P_h; a = (H.to_3x3() @ A_h).normalized()
    return Matrix.Translation(p) @ Matrix.Rotation(ang, 4, a) @ Matrix.Translation(-p) @ H

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
ikp.location = sh + Vector((-0.30, 0.10, -0.45))                         # elbow hangs low and outward
def goal(H):
    p, qq, _ = H.decompose(); ikw.location = p; ikh.matrix_world = Matrix.Translation(p) @ qq.to_matrix().to_4x4(); bpy.context.view_layer.update()
def wrist_bend():
    f = (W @ pb['lowerarm_r'].tail - W @ pb['lowerarm_r'].head).normalized()
    h = (W @ pb['middle_01_r'].head - W @ pb['hand_r'].head).normalized()
    return math.degrees(math.acos(max(-1, min(1, f.dot(h)))))
def calib_pole():
    best = (1e9, 0)
    for a in range(-180, 181, 15):
        ik.pole_angle = math.radians(a); bpy.context.view_layer.update()
        d = (W @ pb['lowerarm_r'].head - ikp.location).length
        if d < best[0]: best = (d, a)
    ik.pole_angle = math.radians(best[1])
goal(H_old[('flashlight_idle', 0)]); calib_pole()
print(f'before: wrist bend {wrist_bend():.1f} deg')
cands = []
for deg in range(-150, 151, 5):
    G = rolled(H_old[('flashlight_idle', 0)], math.radians(deg)); goal(G)
    miss = (W @ pb['hand_r'].head - G.translation).length
    e = W @ pb['lowerarm_r'].head
    cands.append((wrist_bend() + (100 if miss > 0.01 else 0) + (50 if e.z > sh.z else 0), deg, round(miss, 3), round(wrist_bend(), 1)))
cands.sort()
print('best rolls (score, deg, wrist miss m, wrist bend deg):', cands[:5])
ROLL = math.radians(cands[0][1])

ARM = ('upperarm_r', 'lowerarm_r', 'hand_r'); rec = {}; worst = 0
for act in ACTS:
    arm.animation_data.action = act
    for f in frames[act.name]:
        sc.frame_set(f); G = rolled(H_old[(act.name, f)], ROLL); goal(G)
        worst = max(worst, (W @ pb['hand_r'].head - G.translation).length) if act.name != 'flashlight_raise' else worst
        rec[(act.name, f)] = {n: arm.convert_space(pose_bone=pb[n], matrix=pb[n].matrix, from_space='POSE', to_space='LOCAL').to_quaternion() for n in ARM}
print('worst wrist miss idle/walk (m)', round(worst, 4))
for b in ('lowerarm_r', 'hand_r'):
    for con in list(pb[b].constraints): pb[b].constraints.remove(con)
for act in ACTS:
    for n in ARM:
        dp = f'pose.bones["{n}"].rotation_quaternion'
        for fc in [fc for fc in act.fcurves if fc.data_path == dp]: act.fcurves.remove(fc)
        fcs = [act.fcurves.new(dp, index=k, action_group=n) for k in range(4)]; prev = None
        for f in frames[act.name]:
            qq = rec[(act.name, f)][n]
            if prev is not None and prev.dot(qq) < 0: qq = -qq
            prev = qq
            for k in range(4):
                kp = fcs[k].keyframe_points.insert(f, qq[k], options={'FAST'}); kp.interpolation = 'LINEAR'
        for fc in fcs: fc.update()
arm.animation_data.action = ACTS[0]; sc.frame_set(1); sc.frame_set(0)
print(f'after: roll {math.degrees(ROLL):.0f} deg, wrist bend {wrist_bend():.1f} deg, lens axis', tuple(round(v, 2) for v in (fl.matrix_world.to_3x3() @ Vector((1, 0, 0))).normalized()))
for a in bpy.data.actions: a.use_fake_user = True
bpy.ops.wm.save_as_mainfile(filepath=r"C:\Users\libde\100gate\art\viewmodel-hold.blend")
print('rolled hold saved')
