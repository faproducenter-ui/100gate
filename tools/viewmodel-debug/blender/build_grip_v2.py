# blender -b --factory-startup --python tools/viewmodel-debug/blender/build_grip_v2.py -- <stage>
# A plain realistic fist grip, built from the shipped viewmodel-5.glb:
#   stage 1: arm (elbow ~100 deg, upper arm down along the body, forearm forward), neutral wrist, flashlight axis 15 deg off the forearm,
#            lens straight ahead and 7 deg up in the game camera, the fist on the rear third of the body (lens end 2/3 out in front)
#   stage 2: fingers and thumb posed joint by joint around the body (fit_fingers.py does the solve)
# Every stage prints its measurements and renders side / top / front / game-camera views into docs/viewmodel-grip/v2/.
# The result of stage 1 is saved to art/viewmodel-hold.blend; stage 2 is fit_fingers.py run on that file.
import bpy, math, os, sys
import numpy as np
from mathutils import Vector, Matrix, Quaternion

GLB = r"C:\Users\libde\100gate\public\assets\iso\viewmodel-5.glb"
OUT_BLEND = r"C:\Users\libde\100gate\art\viewmodel-hold.blend"
SHOTS = r"C:\Users\libde\100gate\docs\viewmodel-grip\v2"; os.makedirs(SHOTS, exist_ok=True)
LENS_UP = math.radians(7)        # in the body's own frame the torch points a little down, ahead along the floor (the game pitches the view)
VIEW_PITCH = math.radians(0)       # the viewmodel turns this much up about the camera: lens ends 7 deg above level on screen
FORE_DOWN = math.radians(-8)       # forearm pitch -> the barrel is 15 deg off the forearm
WRIST_CAM = (0.17, -0.17, -0.23)   # wrist in camera space (x right, y up, z back): lower right of the frame, elbow ~100 deg
GRIP_FRACTION = 0.30               # where the palm sits along the body, from the tail end

bpy.ops.import_scene.gltf(filepath=GLB)
arm = bpy.data.objects['StoryHeroWalk']; fl = bpy.data.objects['Flashlight']; body = bpy.data.objects['VM_body']; sc = bpy.context.scene
arm.animation_data.action = bpy.data.actions['flashlight_idle']; sc.frame_set(1); sc.frame_set(0)
for pb_ in arm.pose.bones: pb_.custom_shape = None
arm.data.display_type = 'STICK'
ico = bpy.data.objects.get('Icosphere')
if ico: bpy.data.objects.remove(ico, do_unlink=True)
m = bpy.data.materials['VM_hide']; m.use_nodes = True; nt = m.node_tree
for n in list(nt.nodes): nt.nodes.remove(n)
o_ = nt.nodes.new('ShaderNodeOutputMaterial'); tr = nt.nodes.new('ShaderNodeBsdfTransparent'); nt.links.new(tr.outputs[0], o_.inputs[0])
pb = arm.pose.bones; W = arm.matrix_world
eye = W @ pb['head'].head + Vector((0, 0, 0.05))
cd = bpy.data.cameras.new('VMcam'); cam = bpy.data.objects.new('VMcam', cd); sc.collection.objects.link(cam)
cam.location = eye; cam.rotation_euler = (math.radians(90), 0, math.radians(180))
cd.sensor_fit = 'VERTICAL'; cd.angle_y = math.radians(55.4); cd.clip_start = .01
sc.camera = cam
bpy.context.view_layer.update()                                # the camera matrix is stale until the scene updates
Cw = cam.matrix_world.to_3x3()
def cs(x, y, z): return Cw @ Vector((x, y, z))
def cp(x, y, z): return eye + cs(x, y, z)
def tocam(p): return cam.matrix_world.inverted() @ p

# ---- the authored hold: where the fist's hollow is, in the hand's own frame
def hb(n): return W @ pb[n].head
def hand_frame():
    d = (hb('middle_01_r') - hb('hand_r')).normalized()
    r = hb('index_01_r') - hb('pinky_01_r'); r = (r - d * r.dot(d)).normalized()
    return Matrix((d, r, d.cross(r))).transposed()           # columns: distal, radial (toward the index), d x r
def flash_geo():
    dg = bpy.context.evaluated_depsgraph_get(); ev = fl.evaluated_get(dg); me = ev.to_mesh(); M = ev.matrix_world
    pts = np.array([(M @ v.co)[:] for v in me.vertices]); ev.to_mesh_clear()
    c = pts.mean(axis=0); ax = np.linalg.svd(pts - c, full_matrices=False)[2][0]
    t = (pts - c) @ ax; q = pts - c; rr = np.sqrt(((q - np.outer(t, ax)) ** 2).sum(1))
    sgn = 1 if rr[t > np.percentile(t, 85)].mean() > rr[t < np.percentile(t, 15)].mean() else -1
    ax = ax * sgn; t = t * sgn
    return Vector(c), Vector(ax).normalized(), float(t.min()), float(t.max())
H0 = W @ pb['hand_r'].matrix
c0, a0, tmin0, tmax0 = flash_geo()
palm0 = hb('hand_r') + 0.7 * (hb('middle_01_r') - hb('hand_r'))
# palm side: the way the authored fingers curl (knuckle -> fingertip, minus the finger-base direction)
d0 = (hb('middle_01_r') - hb('hand_r')).normalized()
curl0 = hb('middle_03_r') - hb('middle_01_r'); palmn0 = (curl0 - d0 * curl0.dot(d0)).normalized()
palm_c0 = hb('hand_r') + 0.62 * (hb('middle_01_r') - hb('hand_r'))
cup_w = palm_c0 + palmn0 * (0.019 + 0.021)                    # the barrel axis: pressed against the middle of the palm
cup_local = H0.inverted() @ cup_w

# ---- targets in the game camera. Order: lens axis -> how the barrel lies in the fist -> wrist -> forearm -> where the elbow must be
BARREL_IN_HAND = math.radians(55)   # the barrel crosses the palm 30 deg off the finger-base line, lens end past the index/thumb
up = cs(0, 1, 0)
L = cs(0, math.sin(LENS_UP), -math.cos(LENS_UP)).normalized()                  # lens direction: straight ahead, 7 deg up
Lu = (hb('lowerarm_r') - hb('upperarm_r')).length; Lf = (hb('hand_r') - hb('lowerarm_r')).length
sh0 = hb('upperarm_r')
def layout(thumb_deg, ulnar_deg, wx, wy):
    side = cs(-math.sin(math.radians(thumb_deg)), math.cos(math.radians(thumb_deg)), 0)   # thumb side: 0 = up, 90 = toward the middle
    e2 = (side - L * side.dot(L)).normalized()
    Dd = (L * math.cos(BARREL_IN_HAND) - e2 * math.sin(BARREL_IN_HAND)).normalized()
    Rr = (L * math.sin(BARREL_IN_HAND) + e2 * math.cos(BARREL_IN_HAND)).normalized()
    ff = (Dd * math.cos(math.radians(ulnar_deg)) + Rr * math.sin(math.radians(ulnar_deg))).normalized()
    best = None
    for zz in np.linspace(-0.12, -0.5, 77):
        w_ = cp(wx, wy, zz); e_ = w_ - ff * Lf
        err = abs((e_ - sh0).length - Lu)
        if best is None or err < best[0]: best = (err, w_, e_)
    err, w_, e_ = best
    elbow = math.degrees((sh0 - e_).angle(w_ - e_)); upper = math.degrees((e_ - sh0).angle(-up))
    return err, elbow, upper, Dd, Rr, ff, w_, e_
# A natural arm, as a person really carries a torch: upper arm hanging along the body (a little forward and out), elbow bent,
# the fist in front of the hip, the lens straight ahead. The game shows this arm lower-right by moving the whole viewmodel
# relative to its camera (VIEW_SHIFT, applied in src/iso/fps.ts), so the pose itself never has to be bent to fit the screen.
TH, UL = 30, 26
side = cs(-math.sin(math.radians(TH)), math.cos(math.radians(TH)), 0)
# the authored fist: barrel axis and thumb side in the hand's own frame (the fingers already close round the barrel there)
Fh0 = hand_frame()
G0 = H0.inverted() @ fl.matrix_world.copy()                 # flashlight relative to the hand, authored
a_h = Fh0.inverted() @ a0                                   # authored lens axis in the hand frame (distal, radial, normal)
r_h = Vector((0, 1, 0)); r_h = (r_h - a_h * r_h.dot(a_h)).normalized()
src = Matrix((a_h, r_h, a_h.cross(r_h))).transposed()
e2 = (side - L * side.dot(L)).normalized()
dst = Matrix((L, e2, L.cross(e2))).transposed()
Rh = dst @ src.inverted()                                   # hand frame (columns distal, radial, normal) in the world
D = (Rh @ Vector((1, 0, 0))).normalized(); Rad = (Rh @ Vector((0, 1, 0))).normalized()
fore = (D * math.cos(math.radians(UL)) + Rad * math.sin(math.radians(UL))).normalized()
print(f'authored barrel is {math.degrees(a_h.angle(Vector((1, 0, 0)))):.0f} deg off the finger-base line')
u = cs(0.36, -1.0, -0.55).normalized()                                       # upper arm: down along the body, ~22 deg forward, a little out
elbow_goal = sh0 + u * Lu
wrist = elbow_goal + fore * Lf
print(f'natural arm: upper arm {math.degrees(u.angle(-up)):.0f} deg from vertical, elbow {math.degrees((sh0 - elbow_goal).angle(wrist - elbow_goal)):.0f} deg, wrist in camera space {tuple(round(x, 3) for x in (cam.matrix_world.inverted() @ wrist))}')
F_now = hand_frame(); F_tgt = Matrix((D, Rad, D.cross(Rad))).transposed()
R_hand = (F_tgt @ F_now.inverted()).to_quaternion()
H_rot = (R_hand @ H0.to_quaternion())
H_goal = Matrix.Translation(wrist) @ H_rot.to_matrix().to_4x4()

# ---- IK onto the goal
def mk(name):
    o = bpy.data.objects.get(name)
    if not o: o = bpy.data.objects.new(name, None); sc.collection.objects.link(o)
    return o
ikw, ikh, ikp = mk('IK_wrist'), mk('IK_hand'), mk('IK_pole')
ik = pb['lowerarm_r'].constraints.new('IK'); ik.target = ikw; ik.chain_count = 2; ik.use_tail = True; ik.pole_target = ikp
cr = pb['hand_r'].constraints.new('COPY_ROTATION'); cr.target = ikh; cr.target_space = 'WORLD'; cr.owner_space = 'WORLD'
sh = hb('upperarm_r')
ikp.location = elbow_goal + (elbow_goal - (sh0 + wrist) / 2).normalized() * 0.3      # pole beyond the elbow it should have
def goal(H):
    p, qq, _ = H.decompose(); ikw.location = p; ikh.matrix_world = Matrix.Translation(p) @ qq.to_matrix().to_4x4(); bpy.context.view_layer.update()
goal(H_goal)
best = (1e9, 0)
for a in range(-180, 181, 10):
    ik.pole_angle = math.radians(a); bpy.context.view_layer.update()
    d = (hb('lowerarm_r') - ikp.location).length
    if d < best[0]: best = (d, a)
ik.pole_angle = math.radians(best[1]); bpy.context.view_layer.update()

# ---- the flashlight stays in the authored fist
H1 = W @ pb['hand_r'].matrix
fl.matrix_world = H1 @ G0; bpy.context.view_layer.update()
cup_now = H1 @ cup_local
# ---- view placement for the game: pitch the whole viewmodel up by VIEW_PITCH about the camera, then shift it so the fist sits lower right
Rp = Matrix.Rotation(VIEW_PITCH, 3, 'X')
fist_cam = Rp @ (cam.matrix_world.inverted() @ cup_now)
VIEW_SHIFT = Vector((0.13, -0.13, -0.34)) - fist_cam
lens_cam = Rp @ (cam.matrix_world.inverted().to_3x3() @ L)
arm['view_shift'] = list(VIEW_SHIFT); arm['view_pitch'] = VIEW_PITCH
print(f'VIEW: pitch {math.degrees(VIEW_PITCH):.0f} deg, shift ({VIEW_SHIFT.x:.3f}, {VIEW_SHIFT.y:.3f}, {VIEW_SHIFT.z:.3f}); lens on screen {math.degrees(math.asin(lens_cam.y)):+.0f} deg up, {math.degrees(math.atan2(lens_cam.x, -lens_cam.z)):+.0f} deg sideways')
# ---- measurements
def deg(v): return math.degrees(v)
def report(tag):
    bpy.context.view_layer.update()
    S, E, Wr = hb('upperarm_r'), hb('lowerarm_r'), hb('hand_r')
    fore = (Wr - E).normalized(); fr = hand_frame(); dist = fr.col[0]; rad = fr.col[1]; nrm = fr.col[2]
    flex = deg(math.asin(max(-1, min(1, dist.dot((W @ pb['lowerarm_r'].matrix).to_3x3() @ Vector((0, 0, 1)))))))
    # wrist: split the hand-vs-forearm angle into flexion (toward the palm normal) and side bend (toward the thumb)
    v = dist - fore * dist.dot(fore)
    flexion = deg(math.atan2(v.dot(nrm), dist.dot(fore))); side = deg(math.atan2(v.dot(rad), dist.dot(fore)))
    c, a, tn, tx = flash_geo()
    lens_cam = (cam.matrix_world.inverted().to_3x3() @ a).normalized()
    t_palm = ((hb('hand_r') + 0.7 * (hb('middle_01_r') - hb('hand_r'))) - c).dot(a)
    print(f'[{tag}] elbow {deg((S - E).angle(Wr - E)):.0f} deg | upper arm from vertical {deg((E - S).angle(Vector((0, 0, -1)))):.0f} deg | '
          f'wrist flexion {flexion:+.0f} side {side:+.0f} | barrel vs forearm {deg(a.angle(fore)):.0f} deg | '
          f'lens in camera ({lens_cam.x:+.2f}, {lens_cam.y:+.2f}, {lens_cam.z:+.2f}) = {deg(math.atan2(lens_cam.x, -lens_cam.z)):+.0f} deg sideways, {deg(math.asin(lens_cam.y)):+.0f} deg up | '
          f'palm at {(t_palm - tn) / (tx - tn) * 100:.0f}% of the body from the tail | wrist on screen {tuple(round(x, 2) for x in tocam(Wr))}')
def shots(tag):
    w = sc.world or bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs['Color'].default_value = (.12, .13, .15, 1); bg.inputs['Strength'].default_value = 1.2
    if 'key' not in bpy.data.objects:
        ld = bpy.data.lights.new('key', 'AREA'); ld.energy = 90; ld.size = 2; lo = bpy.data.objects.new('key', ld); sc.collection.objects.link(lo); lo.location = (.3, .2, 2.1); lo.rotation_euler = (.35, 0, 0)
    try: sc.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError: sc.render.engine = 'BLENDER_WORKBENCH'
    sc.render.resolution_x, sc.render.resolution_y = 960, 540
    d = bpy.data.cameras.get('shot') or bpy.data.cameras.new('shot'); d.angle_y = math.radians(40); d.clip_start = .01
    co = bpy.data.objects.get('shot') or bpy.data.objects.new('shot', d)
    if co.name not in sc.collection.objects: sc.collection.objects.link(co)
    tgt = hb('hand_r') + (L * 0.06)
    right = cs(1, 0, 0)
    for name, off in (('side', right * 0.55 + cs(0, 0.05, 0)), ('top', cs(0, 0.6, 0.05)), ('front', L * 0.6 + cs(0, 0.05, 0))):
        co.location = tgt + off; co.rotation_euler = (tgt - co.location).to_track_quat('-Z', 'Y').to_euler()
        sc.camera = co; sc.render.filepath = rf"{SHOTS}\{tag}_{name}.png"; bpy.ops.render.render(write_still=True)
    sc.camera = cam; sc.render.filepath = rf"{SHOTS}\{tag}_game.png"; bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(co, do_unlink=True)

report('stage 1')
shots('stage1')
# ---- bake idle / walk / raise: each frame keeps the authored motion of the hand (bob, sway, the raise) relative to frame 0,
#      applied on top of the new hold, and the arm is solved onto it
ACTS = [bpy.data.actions[n] for n in ('flashlight_idle', 'flashlight_walk', 'flashlight_raise')]
frames = {x.name: list(range(int(x.frame_range[0]), int(x.frame_range[1]) + 1)) for x in ACTS}
ik.influence = 0; cr.influence = 0; bpy.context.view_layer.update()
H_old = {}
for act in ACTS:
    arm.animation_data.action = act
    for f in frames[act.name]:
        sc.frame_set(f); H_old[(act.name, f)] = W @ pb['hand_r'].matrix
ref = H_old[('flashlight_idle', 0)]
ik.influence = 1; cr.influence = 1
ARM = ('upperarm_r', 'lowerarm_r', 'hand_r'); rec = {}
for act in ACTS:
    arm.animation_data.action = act
    for f in frames[act.name]:
        sc.frame_set(f)
        Ho = H_old[(act.name, f)]
        dp = Ho.translation - ref.translation
        dq = Ho.to_quaternion() @ ref.to_quaternion().inverted()
        G = Matrix.Translation(H_goal.translation + dp) @ (dq @ H_goal.to_quaternion()).to_matrix().to_4x4()
        goal(G)
        rec[(act.name, f)] = {n: arm.convert_space(pose_bone=pb[n], matrix=pb[n].matrix, from_space='POSE', to_space='LOCAL').to_quaternion() for n in ARM}
for bn in ('lowerarm_r', 'hand_r'):
    for con in list(pb[bn].constraints): pb[bn].constraints.remove(con)
for act in ACTS:
    for n in ARM:
        dpth = f'pose.bones["{n}"].rotation_quaternion'
        for fc in [fc for fc in act.fcurves if fc.data_path == dpth]: act.fcurves.remove(fc)
        fcs = [act.fcurves.new(dpth, index=k, action_group=n) for k in range(4)]; prev = None
        for f in frames[act.name]:
            qq = rec[(act.name, f)][n]
            if prev is not None and prev.dot(qq) < 0: qq = -qq
            prev = qq
            for k in range(4):
                kp = fcs[k].keyframe_points.insert(f, qq[k], options={'FAST'}); kp.interpolation = 'LINEAR'
        for fc in fcs: fc.update()
arm.animation_data.action = ACTS[0]; sc.frame_set(1); sc.frame_set(0)
report('stage 1, baked frame 0')
for a in bpy.data.actions: a.use_fake_user = True
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print('stage 1 saved')
# ---- anatomy check of the right arm (printed for review)
S_, E_, W_ = hb('upperarm_r'), hb('lowerarm_r'), hb('hand_r')
ua = (E_ - S_).normalized(); fa = (W_ - E_).normalized()
fwd = cs(0, 0, -1); rgt = cs(1, 0, 0); upv = cs(0, 1, 0)
print(f'[anatomy] upper arm: forward {math.degrees(math.atan2(ua.dot(fwd), -ua.dot(upv))):.0f} deg, out to the side {math.degrees(math.atan2(ua.dot(rgt), -ua.dot(upv))):.0f} deg | '
      f'elbow {math.degrees((S_ - E_).angle(W_ - E_)):.0f} deg | forearm: points {math.degrees(math.atan2(fa.dot(rgt), fa.dot(fwd))):+.0f} deg outward (+) / inward (-), '
      f'{math.degrees(math.asin(max(-1, min(1, fa.dot(upv))))):+.0f} deg up | wrist x of the body side: {(W_ - S_).dot(rgt):+.3f} m')
# ---- does the right arm go into the torso? (skin of the upper arm / forearm vs the chest and belly, same mesh)
from mathutils.kdtree import KDTree
dg_ = bpy.context.evaluated_depsgraph_get(); be_ = body.evaluated_get(dg_); me_ = be_.to_mesh(); MB_ = be_.matrix_world
nm_ = {vg.index: vg.name for vg in body.vertex_groups}
def grp(v): return nm_[max(v.groups, key=lambda g: g.weight).group] if v.groups else ''
torso = [MB_ @ v.co for v in me_.vertices if grp(v) in ('spine_01', 'spine_02', 'spine_03', 'pelvis')]
armv = [MB_ @ v.co for v in me_.vertices if grp(v) in ('upperarm_r', 'lowerarm_r')]
kd = KDTree(len(torso))
for i, p in enumerate(torso): kd.insert(p, i)
kd.balance()
close = sorted(kd.find(p)[2] for p in armv)
be_.to_mesh_clear()
print(f'[arm vs torso] closest {close[0] * 100:.1f} cm; arm skin within 1 cm of the torso: {sum(c < 0.01 for c in close)} vertices')
