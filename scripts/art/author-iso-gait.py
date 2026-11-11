import bpy, math
from mathutils import Vector, Matrix

arm = bpy.data.objects['StoryHeroWalk']
PB = arm.pose.bones
for pb in PB:
    pb.rotation_mode = 'QUATERNION'
    for c in list(pb.constraints):
        pb.constraints.remove(c)

# --- neutral stance: Idle frame 0 as authored in the source rig -------------------------------
arm.animation_data_create()
arm.animation_data.action = bpy.data.actions['Idle']
bpy.context.scene.frame_set(1); bpy.context.scene.frame_set(0)
bpy.context.view_layer.update()
BASE = {pb.name: pb.matrix.copy() for pb in PB}

for o in [o for o in bpy.data.objects if o.name.startswith(('T_', 'P_'))]:
    bpy.data.objects.remove(o, do_unlink=True)

def empty(name, loc):
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    e.location = loc
    e.empty_display_size = .03
    return e

TG = {}
ANG = {'calf_l': -120, 'calf_r': -60, 'lowerarm_l': -90, 'lowerarm_r': -90}
for s, sx in (('l', 1), ('r', -1)):
    TG['T_ankle_' + s] = empty('T_ankle_' + s, BASE['calf_' + s] @ Vector((0, PB['calf_' + s].length, 0)))
    TG['T_wrist_' + s] = empty('T_wrist_' + s, BASE['lowerarm_' + s] @ Vector((0, PB['lowerarm_' + s].length, 0)))
    TG['P_knee_' + s] = empty('P_knee_' + s, BASE['calf_' + s].translation + Vector((0, -0.6, 0)))
    TG['P_elbow_' + s] = empty('P_elbow_' + s, BASE['lowerarm_' + s].translation + Vector((0, 0.6, 0)))
    for bone, t, p in (('calf_' + s, 'T_ankle_' + s, 'P_knee_' + s), ('lowerarm_' + s, 'T_wrist_' + s, 'P_elbow_' + s)):
        c = PB[bone].constraints.new('IK')
        c.target = TG[t]; c.pole_target = TG[p]; c.chain_count = 2
        c.pole_angle = math.radians(ANG[bone])

def Tr(v): return Matrix.Translation(v)
def Rz(a): return Matrix.Rotation(a, 4, 'Z')
def Rx(a): return Matrix.Rotation(a, 4, 'X')
def Ry(a): return Matrix.Rotation(a, 4, 'Y')
def about(c, R): return Tr(c) @ R @ Tr(-c)

A0 = {'l': Vector((0.139, 0.099, 0.087)), 'r': Vector((-0.139, 0.099, 0.087))}
HIP = {s: Vector(BASE['thigh_' + s].translation) for s in 'lr'}
W0 = {s: Vector(BASE['lowerarm_' + s] @ Vector((0, PB['lowerarm_' + s].length, 0))) for s in 'lr'}
SH0 = {s: Vector(BASE['upperarm_' + s].translation) for s in 'lr'}
REACH = 0.43 + 0.435
ss = lambda u: u * u * (3 - 2 * u)

def pose(p, f):
    S = p['S']; D = p['D']
    for pb in PB:
        pb.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()

    # ---- feet: heel strike -> flat -> heel lift about the ball -> toe-off -> swing back to heel strike ----
    # Foot geometry from the rest pose: ball joint is 0.127 m ahead of and 0.064 m below the ankle.
    BALL = Vector((0, -0.127, -0.064)); HEEL = Vector((0, 0.05, -0.087)); BALL_Z = 0.023
    def rot_x(y, z, a):
        return y * math.cos(a) - z * math.sin(a), y * math.sin(a) + z * math.cos(a)
    def stance_pose(u):
        """Ankle offset from the flat-foot position, foot pitch (+ = heel up) for stance progress u."""
        d = p['front'] - p['S'] * p['D'] * u
        fy, fz = A0['l'].y - d, A0['l'].z
        phi = 0.0
        if u < p['uStrike']:
            k = u / p['uStrike']
            phi = -p['strike'] * (1 - ss(k))
        elif u > p['uLift']:
            k = (u - p['uLift']) / (1 - p['uLift'])
            phi = p['off'] * ss(k)
        if phi < 0:        # rotate about the heel, toe comes down onto the floor
            hy, hz = fy + HEEL.y, fz + HEEL.z
            ry, rz = rot_x(-HEEL.y, -HEEL.z, phi)
            return Vector((0, hy + ry, hz + rz)), phi
        by, bz = fy + BALL.y, BALL_Z          # rotate about the ball, heel rises
        ry, rz = rot_x(-BALL.y, fz - BALL_Z, phi)
        return Vector((0, by + ry, bz + rz)), phi
    ank = {}; pit = {}; ballflex = {}
    for s, off in (('l', 0.0), ('r', 0.5)):
        q = (f + off) % 1.0
        ballflex[s] = 0.0
        if S == 0:
            ank[s] = Vector((A0[s].x, A0[s].y, A0[s].z)); pit[s] = 0.0; continue
        if q < D:
            pos, phi = stance_pose(q / D)
            ank[s] = Vector((A0[s].x * (1 - p['narrow']), pos.y, pos.z)); pit[s] = phi
            ballflex[s] = -max(0.0, phi)         # toes stay flat on the floor while the heel lifts
        else:
            u = (q - D) / (1 - D)
            p0, ph0 = stance_pose(1.0)            # toe-off pose
            p1, ph1 = stance_pose(0.0)            # next heel strike pose
            e = ss(u) ** 1.1
            y = p0.y + (p1.y - p0.y) * e
            z = p0.z + (p1.z - p0.z) * e + p['H'] * math.sin(math.pi * u) ** 1.1
            ank[s] = Vector((A0[s].x * (1 - p['narrow']), y, z))
            pit[s] = ph0 * (1 - ss(u)) + ph1 * ss(u)

    # ---- pelvis ----
    if S == 0:
        zoff = 0.0; sway = 0.0; tw = 0.0; roll = 0.0
    else:
        zoff = -p['crouch'] + p['bob'] * math.cos(4 * math.pi * (f - D / 2)) * (1 if p['bobsign'] > 0 else -1)
        sway = p['sway'] * math.cos(2 * math.pi * (f - D / 2))
        tw = p['twist'] * math.cos(2 * math.pi * f)
        roll = -p['hipDrop'] * math.cos(2 * math.pi * (f - D / 2))
    for s in 'lr':
        hx = HIP[s].x + sway
        dxy = math.hypot(ank[s].x - hx, ank[s].y - HIP[s].y)
        zmax = math.sqrt(max(0.0, (REACH * 0.985) ** 2 - dxy ** 2))
        zoff = min(zoff, (ank[s].z + zmax) - HIP[s].z)
    lean = p['lean']
    c = Vector(BASE['pelvis'].translation)
    PB['pelvis'].matrix = Tr(Vector((sway, 0, zoff))) @ about(c, Rz(tw) @ Rx(lean * 0.45) @ Ry(roll)) @ BASE['pelvis']
    bpy.context.view_layer.update()

    # ---- spine: counter-rotates against the pelvis, head stays level and looks forward ----
    st = -p['spineTwist'] * math.cos(2 * math.pi * f) if S else 0.0
    for b in ('spine_01', 'spine_02', 'spine_03'):
        h = Vector(PB[b].matrix.translation)
        PB[b].matrix = about(h, Rz(st) @ Rx(lean * 0.2) @ Ry(-roll * 0.35)) @ PB[b].matrix
        bpy.context.view_layer.update()
    h = Vector(PB['head'].matrix.translation)
    PB['head'].matrix = about(h, Rz(-(tw + 3 * st) * 0.9) @ Rx(-lean * 0.85) @ Ry(roll * 0.5)) @ PB['head'].matrix
    bpy.context.view_layer.update()

    # ---- IK targets ----
    for s in 'lr':
        sg = 1 if s == 'l' else -1
        TG['T_ankle_' + s].location = ank[s]
        TG['P_knee_' + s].location = Vector((HIP[s].x + sway + sg * 0.02, HIP[s].y - 0.6, 0.52))
        sh = Vector(PB['upperarm_' + s].head)           # current shoulder position
        q = (f + (0.5 if s == 'l' else 0.0)) % 1.0
        th = 2 * math.pi * q
        u = math.cos(th) if S else 0.0                  # +1 hand forward, -1 hand back
        if S:
            dy = p['ay0'] - p['ay'] * u                 # world -Y is forward
            dz = p['az0'] + p['azAmp'] * math.cos(th - p['azLead'])
            dx = sg * (p['ax0'] + p['axAmp'] * -u)
            w = sh + Vector((dx, dy, dz))
        else:
            w = W0[s].copy()
        TG['T_wrist_' + s].location = w
        elbow_est = sh + (w - sh) * 0.5 + Vector((0, 0.04, -0.03))
        TG['P_elbow_' + s].location = elbow_est + Vector((0, 0.6, 0))
    bpy.context.view_layer.update()

    for s in 'lr':
        foot = PB['foot_' + s]
        head = Vector(foot.head)
        foot.matrix = Tr(head) @ Rx(pit[s]) @ BASE['foot_' + s].to_3x3().to_4x4()
        bpy.context.view_layer.update()
        if ballflex[s]:
            ball = PB['ball_' + s]
            bh = Vector(ball.matrix.translation)
            ball.matrix = about(bh, Rx(ballflex[s])) @ ball.matrix
            bpy.context.view_layer.update()

def bake(name, p, n=24):
    act = bpy.data.actions.get(name)
    if act:
        bpy.data.actions.remove(act)
    act = bpy.data.actions.new(name)
    arm.animation_data.action = act
    for i in range(n + 1):
        pose(p, (i % n) / n)
        for pb in PB:
            m = arm.convert_space(pose_bone=pb, matrix=pb.matrix, from_space='POSE', to_space='LOCAL')
            loc, rot, _ = m.decompose()
            for k, v in (('location', loc), ('rotation_quaternion', rot)):
                setattr(pb, k, v)
                pb.keyframe_insert(k, frame=i, group=pb.name)

Z = dict(S=0, D=.6, front=.3, H=0, strike=0, off=0, uStrike=.15, uLift=.6, heel=0, toe=0, narrow=0, bob=0, bobsign=1, sway=0, twist=0, spineTwist=0,
         lean=0, crouch=0, hipDrop=0, ay0=0, ay=0, az0=0, azAmp=0, azLead=.9, ax0=0, axAmp=0)

# Walking: arms hang with a soft elbow, swing opposite to the legs.
WALK = dict(Z, S=1.25, D=.62, front=.30, H=.075, strike=.22, off=.55, uStrike=.14, uLift=.6, heel=.16, toe=.30, narrow=.12, bob=.02, bobsign=1, crouch=.035,
            sway=.02, twist=.09, spineTwist=.06, lean=.03, hipDrop=.04,
            ay0=-0.01, ay=.17, az0=-.465, azAmp=.02, azLead=.9, ax0=.058, axAmp=.012)

# Jogging/running: elbows bent ~90 degrees, hands travel between hip and chest in an oval.
RUN = dict(Z, S=2.0, D=.36, front=.24, H=.28, strike=.17, off=.62, uStrike=.16, uLift=.5, heel=.05, toe=.40, narrow=.30, bob=.04, bobsign=-1, crouch=.08,
           sway=.012, twist=.11, spineTwist=.05, lean=.17, hipDrop=.05,
           ay0=-.035, ay=.235, az0=-.27, azAmp=.13, azLead=.6, ax0=.015, axAmp=.035)

def build(do_walk=True, do_run=True):
    pose(Z, 0)
    bake('G_Idle', Z, 1)
    if do_walk:
        bake('G_Walk', WALK)
    if do_run:
        bake('G_Run', RUN)
    for pb in PB:
        for c in list(pb.constraints):
            pb.constraints.remove(c)
    for o in [o for o in bpy.data.objects if o.name.startswith(('T_', 'P_'))]:
        bpy.data.objects.remove(o, do_unlink=True)
    arm.animation_data.action = bpy.data.actions['G_Run']
    bpy.context.scene.frame_set(0)
    print('baked')

build()
