# blender -b art/mixamo-hold.blend --python tools/viewmodel-debug/blender/torch_game.py [-- preview]
# Authors the first-person clips for the torch / lighter story on the user's ready model and exports public/assets/iso/viewmodel-8.glb.
#   torch_idle (60f loop) torch_walk (24f) torch_raise (12f)  - the lit or unlit torch carried in the right hand
#   torch_pickup (48f)   - the right hand takes the torch leaning against the wall (it is hidden in the hand until frame 16)
#   lighter_take (40f)   - the right hand takes the lighter out of the drawer, looks at it, puts it away
#   torch_ignite (120f)  - the left hand opens the lighter, strikes it and lights the torch held in the right hand
# Every moving thing is a bone of the one armature (arms, fingers and helper bones prop_*, lid_*, flame_*), so each clip is a single action.
exec(open(r"C:\Users\libde\100gate\tools\viewmodel-debug\blender\torch_rig.py", encoding='utf-8').read())
PREVIEW = 'preview' in sys.argv
OUT = r"C:\Users\libde\100gate\public\assets\iso\viewmodel-8.glb"
OUTD = r"C:\Users\libde\100gate\docs\viewmodel-grip\torch"; os.makedirs(OUTD, exist_ok=True)
EPS = 1e-4

# ------------------------------------------------------------------ left arm (same two-bone solve as the right one, mirrored)
UAL, FAL, HAL = 'LeftArm_011', 'LeftForeArm_012', 'LeftHand_013'
FING_L = {'Index': ('022', '023', '024', '025'), 'Middle': ('014', '015', '016', '017'), 'Ring': ('026', '027', '028', '029'), 'Pinky': ('030', '031', '032', '033'), 'Thumb': ('018', '019', '020', '021')}
def fbl(f, i): return B(f'LeftHand{f}{i + 1}_{FING_L[f][i]}')
def hand_frame_L():
    d = (H('LeftHandMiddle1_014') - H(HAL)).normalized(); r = H('LeftHandIndex1_022') - H('LeftHandPinky1_030'); r = (r - d * r.dot(d)).normalized()
    return Matrix((d, r, d.cross(r))).transposed()
_HF0L = hand_frame_L(); _Rb0L = (W @ B(HAL).matrix).to_3x3().normalized(); K_L = _HF0L.inverted() @ _Rb0L
REST_L = _HF0L.to_4x4(); REST_L.translation = H(HAL)                    # the left hand as the scene leaves it: relaxed beside the hip
LuL = (H(FAL) - H(UAL)).length; LfL = (H(HAL) - H(FAL)).length
POLE_L = Vector((-POLE.x, POLE.y, POLE.z))
def solve_arm_L(Hw):
    for n in [b.name for b in pb if b.name.startswith('mixamorig_LeftHand') or b.name in ('mixamorig_' + UAL, 'mixamorig_' + FAL)]:
        if '_0' in n[-3:] and n.count('_') > 2: continue
        pb[n].rotation_quaternion = Quaternion((1, 0, 0, 0))
    bpy.context.view_layer.update()
    rot_world(B(UAL), Matrix.Rotation(math.radians(65), 3, 'Y'))
    S = H(UAL); P = Hw.translation
    d = P - S; dist = min(d.length, (LuL + LfL) * 0.995); u = d.normalized()
    a = (LuL ** 2 - LfL ** 2 + dist ** 2) / (2 * dist); h = math.sqrt(max(LuL ** 2 - a ** 2, 0))
    pole = POLE_L - u * POLE_L.dot(u); pole.normalize()
    elbow = S + u * a + pole * h
    aim(B(UAL), elbow); aim(B(FAL), P if (P - S).length <= (LuL + LfL) else S + u * (LuL + LfL))
    Ah = parent_frame(B(HAL)); R = Hw.to_3x3() @ K_L
    B(HAL).rotation_quaternion = (Ah.inverted() @ R).to_quaternion(); bpy.context.view_layer.update()
    return (H(HAL) - P).length

# ------------------------------------------------------------------ finger states
def lerpc(a, b, t): return tuple(x + (y - x) * t for x, y in zip(a, b))
def fs(curls, spread=0.0): return (tuple(curls), spread)
RELAXS = {f: fs(RELAX[f]) for f in FING}
OPENS = {f: fs(OPEN[f], (0.7 if f == 'Thumb' else 0.0)) for f in FING}
TORCH_G = {f: fs(tuple(c * 0.93 for c in CLOSED[f][0]), CLOSED[f][1]) for f in FING}
_lg = json.load(open(r"C:\Users\libde\100gate\art\torch\lighter_grip.json"))
LIGHT_G = {f: fs(_lg['curls'][f]) for f in FING}
def mix(a, b, w):
    """a, b: finger state dicts; w: float or dict per finger"""
    out = {}
    for f in FING:
        t = w[f] if isinstance(w, dict) else w
        out[f] = (lerpc(a[f][0], b[f][0], t), a[f][1] + (b[f][1] - a[f][1]) * t)
    return out
def stagger(f0, dur=10, gap=2, order=('Index', 'Middle', 'Ring', 'Pinky', 'Thumb')):
    return lambda f: {n: seg(f, f0 + i * gap, f0 + i * gap + dur) for i, n in enumerate(order)}
def put_fingers(state, side):
    for f in FING:
        c, sp = state[f]
        for i in range(3):
            b = fb(f, i) if side == 'R' else fbl(f, i)
            s = sp if side == 'R' else -sp
            b.rotation_quaternion = qz(s if i == 0 else 0) @ qx(c[i])

# ------------------------------------------------------------------ relations (hand frame <-> prop frame)
Hw_hold = FL_HOLD @ G.inverted()                                      # right hand frame of the solved hold
G_TR = G @ Matrix.Translation(p_local)                                # torch frame in the right hand frame
_gj = Matrix(_lg['G'])
G_LGR = _gj                                                           # lighter frame in the right hand frame
_S = Matrix.Diagonal((1, 1, -1, 1)); G_LGL = _S @ _gj @ _S           # ... mirrored for the left hand
def torch_at(Hw): return Hw @ G_TR
def hand_for_torch(T): return T @ G_TR.inverted()

# ------------------------------------------------------------------ time helpers
def ease(t): t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)
def seg(f, a, b): return ease((f - a) / (b - a))
def mat_lerp(M0, M1, t):
    q = M0.to_quaternion().slerp(M1.to_quaternion(), t); p = M0.translation.lerp(M1.translation, t)
    M = q.to_matrix().to_4x4(); M.translation = p; return M
def sway(g, n, amp=1.0):
    p = 2 * math.pi * g / n
    return Matrix.Translation(Vector((0.002 * math.sin(p + 1.0), 0.0, 0.0045 * math.sin(p))) * amp) @ Matrix.Rotation(math.radians(0.8) * math.sin(p + 0.6) * amp, 4, 'Y')

# ------------------------------------------------------------------ helper bones
bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='EDIT')
eb = arm.data.edit_bones
def helper(name, parent, head):
    b = eb.new(name); b.head = head; b.tail = head + Vector((0, 0.02, 0)); b.roll = 0; b.parent = eb[parent] if parent else None; b.use_deform = False; b.use_connect = False; return b
_hr = eb['mixamorig_' + HA].head.copy(); _hl = eb['mixamorig_' + HAL].head.copy()
helper('prop_torch', 'mixamorig_' + HA, _hr); helper('prop_lighter_r', 'mixamorig_' + HA, _hr); helper('prop_lighter_l', 'mixamorig_' + HAL, _hl)
helper('lid_r', 'prop_lighter_r', _hr); helper('lid_l', 'prop_lighter_l', _hl)
helper('flame_torch', 'prop_torch', _hr); helper('flame_lighter_r', 'prop_lighter_r', _hr); helper('flame_lighter_l', 'prop_lighter_l', _hl)
bpy.ops.object.mode_set(mode='POSE')
for n in ('prop_torch', 'prop_lighter_r', 'prop_lighter_l', 'lid_r', 'lid_l', 'flame_torch', 'flame_lighter_r', 'flame_lighter_l'): pb[n].rotation_mode = 'QUATERNION'
bpy.ops.object.mode_set(mode='OBJECT')

# the lid mesh gets its origin at the hinge (its bone frame), and a second set of lighter objects serves the right hand
l_lid.data.transform(Matrix.Translation(-LID_PIVOT))
def link_dup(o, name):
    d = bpy.data.objects.new(name, o.data); sc.collection.objects.link(d); return d       # shares the mesh data: one glTF mesh
# the small metal details (rings, screws, pins) are 80 thousand vertices: decimate them, they are a few millimetres each
_mod = l_det.modifiers.new('dec', 'DECIMATE'); _mod.ratio = 0.05
_dg = bpy.context.evaluated_depsgraph_get(); _new = bpy.data.meshes.new_from_object(l_det.evaluated_get(_dg)); l_det.modifiers.remove(_mod); l_det.data = _new
print('details vertices after decimation', len(l_det.data.vertices))
LIGHT_R = [l_body, l_ins, l_det]; LID_R = l_lid
LIGHT_L = [link_dup(o, o.name + '_L') for o in LIGHT_R]; LID_L = link_dup(l_lid, 'LighterLid_L')
l_body.name = 'LighterBody_R'; l_ins.name = 'LighterInsert_R'; l_det.name = 'LighterDetails_R'; l_lid.name = 'LighterLid_R'

# ------------------------------------------------------------------ the scene state of one frame
HIDE = Matrix.Scale(EPS, 4)
def solve_frame(F):
    """F: dict(R=(Hw, fingers), L=(Hw, fingers), torch=(world, scale), lr=(world, scale), ll=(world, scale), lid_r, lid_l (angle rad), flame_t, flame_r, flame_l (scale)) -> posed rig + recorded data"""
    lean_pose(0)
    err = solve_arm(F['R'][0]); put_fingers(F['R'][1], 'R')
    errL = solve_arm_L(F['L'][0]); put_fingers(F['L'][1], 'L')
    bpy.context.view_layer.update()
    Wi = W.inverted()
    def setb(name, world, scale=1.0):
        s = Matrix.Scale(max(scale, EPS), 4)
        pb[name].matrix = Wi @ world @ s; bpy.context.view_layer.update()
    setb('prop_torch', F['torch'][0], F['torch'][1])
    setb('prop_lighter_r', F['lr'][0], F['lr'][1]); setb('prop_lighter_l', F['ll'][0], F['ll'][1])
    tw = F['torch'][0]
    setb('flame_torch', tw @ Matrix.Translation(TIP), F['flame_t'])
    lw_r, lw_l = F['lr'][0], F['ll'][0]
    setb('lid_r', lw_r @ Matrix.Translation(LID_PIVOT) @ Matrix.Rotation(F['lid_r'], 4, 'X'), F['lr'][1])
    setb('lid_l', lw_l @ Matrix.Translation(LID_PIVOT) @ Matrix.Rotation(F['lid_l'], 4, 'X'), F['ll'][1])
    setb('flame_lighter_r', lw_r @ Matrix.Translation(WICK), F['flame_r']); setb('flame_lighter_l', lw_l @ Matrix.Translation(WICK), F['flame_l'])
    names = [b.name for b in pb if b.name in GAME_BONES]
    rec = {n: (pb[n].location.copy(), pb[n].rotation_quaternion.copy(), pb[n].scale.copy()) for n in names}
    return rec, max(err, errL)

GAME_BONES = set(['mixamorig_' + UA, 'mixamorig_' + FA, 'mixamorig_' + HA, 'mixamorig_' + UAL, 'mixamorig_' + FAL, 'mixamorig_' + HAL] +
                 [fb(f, i).name for f in FING for i in range(3)] + [fbl(f, i).name for f in FING for i in range(3)] +
                 ['prop_torch', 'prop_lighter_r', 'prop_lighter_l', 'lid_r', 'lid_l', 'flame_torch', 'flame_lighter_r', 'flame_lighter_l'])

def frame(**kw):
    base = dict(R=(REST_HAND, RELAXS), L=(REST_L, RELAXS), torch=(Matrix.Identity(4), EPS), lr=(Matrix.Identity(4), EPS), ll=(Matrix.Identity(4), EPS), lid_r=0.0, lid_l=0.0, flame_t=EPS, flame_r=EPS, flame_l=EPS)
    base.update(kw); return base

# ------------------------------------------------------------------ the clips
CLIPS = {}
def torch_carry(Hw, fingers=None):
    return dict(R=(Hw, fingers or TORCH_G), torch=(torch_at(Hw), 1.0))
# idle / walk: the torch in the hold
def idle(g):
    T = sway(g, 60) @ TORCH_HOLD; Hw = hand_for_torch(T); return frame(**torch_carry(Hw))
def walk(g):
    p = 2 * math.pi * g / 24
    T = Matrix.Translation(Vector((0.010 * math.sin(p), 0.006 * math.sin(2 * p + 1.2), 0.013 * -math.cos(2 * p)))) @ Matrix.Rotation(math.radians(2.2) * math.sin(p), 4, 'Y') @ TORCH_HOLD
    return frame(**torch_carry(hand_for_torch(T)))
def raise_(g):
    t = seg(g, 0, 12); Hw = mat_lerp(REST_HAND, Hw_hold, t); Hw.translation = Hw.translation + Vector((0, 0, 0.03 * math.sin(math.pi * t)))
    return frame(**torch_carry(hand_for_torch(torch_at(Hw) @ torch_at(Hw).inverted() @ torch_at(Hw)) if False else Hw))
CLIPS['torch_idle'] = [idle(g) for g in range(61)]
CLIPS['torch_walk'] = [walk(g) for g in range(25)]
CLIPS['torch_raise'] = [raise_(g) for g in range(13)]

# --- torch pickup: leaning against the wall, grip point about knee-to-hip height in front of the right shoulder (the game lowers the eye to meet it)
_a_hold = (TORCH_HOLD.to_3x3() @ Vector((1, 0, 0))).normalized()
_a0 = Vector((0.03, -0.30, 0.95)).normalized()
T0 = Matrix.Rotation(_a_hold.angle(_a0), 4, _a_hold.cross(_a0).normalized()) @ TORCH_HOLD; T0.translation = Vector((-0.25, -0.30, 1.02))
ATT = 16                                                          # the frame the torch becomes part of the hand
def pickup(g):
    Hg = hand_for_torch(T0)                                       # the hand on the leaning torch
    pre = Matrix.Translation(Vector((0.04, 0.10, 0.07))) @ Hg    # open hand a little nearer to the body
    arc = Vector((0, 0, 0.06 * math.sin(math.pi * seg(g, 4, 14))))     # the hand travels in an arc, over and down onto the shaft
    if g < 4:
        Hw = REST_HAND.copy(); Hw.translation = Hw.translation + Vector((0, 0.015 * seg(g, 0, 4), 0.025 * math.sin(math.pi * seg(g, 0, 4))))   # the weight shifts before the reach
    elif g < 14: Hw = mat_lerp(REST_HAND, pre, seg(g, 4, 14)); Hw.translation = Hw.translation + arc
    elif g < 18: Hw = mat_lerp(pre, Hg, seg(g, 14, 18))
    elif g < 23: Hw = Hg                                          # the grip tightens
    else:
        up = seg(g, 23, 31)                                       # straight up off the floor first
        T = Matrix.Translation(Vector((0, 0, 0.14 * up))) @ T0
        T = mat_lerp(T, TORCH_HOLD, seg(g, 29, 41))               # then swung round into the carrying pose
        if g > 30: T = T @ Matrix.Rotation(0.13 * math.exp(-0.28 * (g - 30)) * math.cos(0.95 * (g - 30)), 4, 'Y')   # the heavy head lags, overshoots and settles
        Hw = hand_for_torch(T)
    squeeze = 1.0 + 0.06 * math.sin(math.pi * seg(g, 18, 26))
    fingers = mix(mix(RELAXS, OPENS, seg(g, 6, 14) * (1 - seg(g, 15, 16))), TORCH_G, stagger(15, 9, 1)(g))
    for f_ in FING: fingers[f_] = (tuple(c * (squeeze if f_ != 'Thumb' else 1.0) for c in fingers[f_][0]), fingers[f_][1])
    return frame(R=(Hw, fingers), torch=(T0 if g < ATT else torch_at(Hw), 1.0 if g >= ATT else EPS))
CLIPS['torch_pickup'] = [pickup(g) for g in range(49)]

# --- lighter out of the drawer
LAT = 12
L0 = Matrix.Translation(Vector((-0.20, -0.26, 1.08))) @ Matrix.Rotation(math.radians(90), 4, 'Z')     # lying in the open drawer
L1 = Matrix.Translation(Vector((-0.10, -0.30, 1.22))) @ Matrix.Rotation(math.radians(55), 4, 'Z') @ Matrix.Rotation(math.radians(-25), 4, 'X')   # held up to look at
def lt_take(g):
    Hg = L0 @ G_LGR.inverted() if False else (L0 @ G_LGR.inverted())
    pre = Matrix.Translation(Vector((0, 0.06, 0.09))) @ Hg
    H1 = L1 @ G_LGR.inverted(); H2 = Matrix.Translation(Vector((0.02, 0.10, -0.10))) @ H1
    if g < 3: Hw = REST_HAND
    elif g < 9: Hw = mat_lerp(REST_HAND, pre, seg(g, 3, 9))
    elif g < 12: Hw = mat_lerp(pre, Hg, seg(g, 9, 12))
    elif g < 14: Hw = Hg
    elif g < 24: Hw = mat_lerp(Hg, H1, seg(g, 14, 24))
    elif g < 30: Hw = mat_lerp(H1, Matrix.Rotation(math.radians(18), 4, 'Z') @ H1 if False else H1, 0)
    else: Hw = mat_lerp(H1, H2, seg(g, 30, 40))
    fingers = mix(mix(RELAXS, OPENS, seg(g, 3, 9) * (1 - seg(g, 10, 11))), LIGHT_G, stagger(10, 6, 1)(g))
    vis = 1.0 if (LAT <= g < 38) else EPS
    return frame(R=(Hw, fingers), lr=(Hw @ G_LGR, vis))
CLIPS['lighter_take'] = [lt_take(g) for g in range(41)]

# --- ignite: the torch is held across the body with its head near the chest; the left hand with the lighter comes up to it
def search_ignite_pose():
    best = None
    SR, SL = H(UA), H(UAL)
    for gx in (-0.30, -0.25, -0.20, -0.15):
        for gz in (1.00, 1.08, 1.16):
            for gy in (-0.22, -0.30):
                for el in (40, 50, 60):
                    for tilt in (0.25, 0.40, 0.55):
                        a = Vector((tilt, -(1 - tilt) * 0.8, math.tan(math.radians(el)))).normalized()
                        T = Matrix.Rotation(_a_hold.angle(a), 4, _a_hold.cross(a).normalized()) @ TORCH_HOLD; T.translation = Vector((gx, gy, gz))
                        Hw = hand_for_torch(T); tip = T @ TIP
                        wr = (Hw.translation - SR).length / (Lu + Lf); tl = (tip + Vector((0.03, 0, -0.04)) - SL).length / (LuL + LfL)
                        score = max(0, wr - 0.92) * 30 + max(0, tl - 0.80) * 30 + abs(el - 45) * 0.02 + max(0, tip.z - 1.48) * 40
                        if best is None or score < best[0]: best = (score, T, round(wr, 2), round(tl, 2), el, tilt)
    return best
_ig = search_ignite_pose(); print('ignite torch pose', _ig[2:], 'score', round(_ig[0], 2))
T_IGN = _ig[1]
def tip_of(T): return T @ TIP
def lighter_at_torch(T, k=0.0):
    """lighter frame so that its wick sits beside the torch head's lower part, flame up"""
    tip = T @ TIP; ax = (T.to_3x3() @ Vector((1, 0, 0))).normalized()
    p = tip - ax * 0.075 + Vector((float(os.environ.get('LDX', '0.05')), float(os.environ.get('LDY', '0.0')), -0.01))                    # left of the head, a little below its end
    R = Matrix.Rotation(math.radians(float(os.environ.get('LTILT', '0'))), 3, 'X') @ Matrix.Rotation(math.radians(-15), 3, 'Y') @ Matrix.Rotation(math.radians(90), 3, 'Z')
    M = R.to_4x4(); M.translation = p - R @ WICK; return M
def ignite(g):
    # right arm: from the carry pose across the body (g 0-24), held there, back to the carry pose (g 96-120)
    t_in = seg(g, 0, 22); t_out = seg(g, 96, 118)
    T = mat_lerp(mat_lerp(TORCH_HOLD, T_IGN, t_in), TORCH_HOLD, t_out)
    # small tremble of the held torch
    T = T @ Matrix.Rotation(math.radians(0.6) * math.sin(g * 0.6), 4, 'Y')
    T = Matrix.Translation(Vector((0, 0, -0.025 * math.sin(math.pi * seg(g, 50, 66))))) @ T        # the head dips toward the flame as it takes
    HwR = hand_for_torch(T)
    # left arm and lighter: raised from the hip (g 6-22), opened (g 24-30), struck (g 34-37), to the torch (g 38-54), lit (g 56-78), away (g 80-100), closed
    Lw_up = Matrix.Translation(Vector((0.14, -0.30, 1.08))) @ Matrix.Rotation(math.radians(20), 4, 'Z')
    Lw_lit = lighter_at_torch(T)
    if g < 6: Lw = None
    # the lighter frame path
    rest_light = REST_L @ G_LGL
    if g < 6: Lw = rest_light
    elif g < 22: Lw = mat_lerp(rest_light, Lw_up, seg(g, 6, 22))
    elif g < 38: Lw = Lw_up
    elif g < 56:
        Lw = mat_lerp(Lw_up, Lw_lit, seg(g, 38, 56)); Lw.translation = Lw.translation + Vector((0, 0, 0.035 * math.sin(math.pi * seg(g, 38, 56))))   # in a small arc, not a straight line
    elif g < 80: Lw = Lw_lit
    elif g < 100: Lw = mat_lerp(Lw_lit, rest_light if False else Lw_up, seg(g, 80, 92))
    else: Lw = mat_lerp(Lw_up, rest_light, seg(g, 100, 118))
    HwL = Lw @ G_LGL.inverted()
    # lid: closed -> open snap at g 24-28 (overshoot), closes at g 84-87
    open_a = math.radians(133)
    lid = 0.0
    if 24 <= g < 84: u = seg(g, 24, 28); lid = open_a * (u + 0.06 * math.sin(math.pi * u) - (0.04 * math.sin(2 * math.pi * seg(g, 28, 33)) if g >= 28 else 0))
    elif g >= 84: lid = open_a * (1 - seg(g, 84, 87))
    flame_l = 0.0
    if g >= 36: flame_l = seg(g, 35, 38) * (0.9 + 0.1 * math.sin(g * 1.7)) + 0.55 * max(0.0, 1 - abs(g - 36.5) / 3.0)     # the strike flares first
    if g >= 84: flame_l = max(0.0, flame_l * (1 - seg(g, 84, 86)))
    u = seg(g, 56, 80)
    flame_t = (ease(u) * (1 + 0.30 * math.sin(math.pi * u) * (1 - u)) if g < 100 else 1.0)       # it catches with a whoomph: a flare that settles
    # fingers: left hand holds the lighter; the thumb flicks the lid (g 22-27) and strikes (g 33-37)
    left = dict(LIGHT_G)
    th = LIGHT_G['Thumb']; ext = fs((0.0, 0.0, 0.0), 0.35)
    thumb_w = max(seg(g, 20, 24) * (1 - seg(g, 27, 30)), seg(g, 32, 34) * (1 - seg(g, 36, 39)), seg(g, 84, 86) * (1 - seg(g, 88, 92)))
    left['Thumb'] = (lerpc(th[0], ext[0], thumb_w), th[1] + (ext[1] - th[1]) * thumb_w)
    left_fingers = mix(RELAXS, left, seg(g, 4, 12)) if g < 100 else mix(left, RELAXS, seg(g, 100, 112))
    hold_t = 1.0 if g < 120 else 1.0
    vis_l = 1.0 if g < 112 else EPS
    return frame(R=(HwR, TORCH_G), torch=(T, 1.0), L=(HwL, left_fingers), ll=(Lw, vis_l), lid_l=lid, flame_l=max(flame_l, EPS) if g >= 35 else EPS, flame_t=max(flame_t, EPS))
CLIPS['torch_ignite'] = [ignite(g) for g in range(121)]

# ------------------------------------------------------------------ solve every frame once
REC = {}; WORST = {}
for name, frames in CLIPS.items():
    REC[name] = []; worst = 0
    for g, F in enumerate(frames):
        rec, err = solve_frame(F); REC[name].append(rec); worst = max(worst, err)
    WORST[name] = round(worst * 1000, 1); print('clip', name, len(frames), 'frames, worst hand miss', WORST[name], 'mm')
json.dump({'torch_tip': list(TIP), 'wick': list(WICK), 'lid_pivot': list(LID_PIVOT), 'attach': {'torch_pickup': ATT, 'lighter_take': LAT}}, open(r"C:\Users\libde\100gate\art\torch\clip_meta.json", 'w'), indent=1)

# ------------------------------------------------------------------ preview renders of chosen frames (props follow the bones)
def show_props():
    """put the prop objects where their helper bones are (for renders; the exporter parents them to the bones instead)"""
    bpy.context.view_layer.update()
    def put(objs, bone):
        for o in objs: o.matrix_world = W @ pb[bone].matrix
    put([torch], 'prop_torch'); put(LIGHT_R, 'prop_lighter_r'); put([LID_R], 'lid_r'); put(LIGHT_L, 'prop_lighter_l'); put([LID_L], 'lid_l')
    for o in [torch] + LIGHT_R + [LID_R] + LIGHT_L + [LID_L]:
        b = {torch: 'prop_torch', LID_R: 'lid_r', LID_L: 'lid_l'}.get(o)
def pose_from(rec):
    for n, (loc, q, s) in rec.items():
        pb[n].location = loc; pb[n].rotation_quaternion = q; pb[n].scale = s
    bpy.context.view_layer.update()
if PREVIEW:
    co = bpy.data.objects['shot']; sc.camera = co; sc.render.resolution_x, sc.render.resolution_y = 800, 700
    for o in (l_det, ): pass
    for name, gs in (('torch_ignite', (46, 60, 72)),):
        for g in gs:
            pose_from(REC[name][g]); show_props()
            c = Vector((-0.12, -0.35, 1.2)) if name != 'torch_pickup' else Vector((-0.2, -0.35, 1.0))
            for vn, off in (('f', (0.1, -1.4, 0.2)), ('s', (-1.3, -0.2, 0.2)), ('e', None)):
                if off is None:
                    hd = W @ B('Head_06').head if False else (W @ pb['mixamorig_Head_06'].head); l = hd + Vector((0, 0, 0.05)); co.data.lens = 28; co.location = l; co.rotation_euler = (Vector((0, -1, -0.12))).to_track_quat('-Z', 'Y').to_euler()
                    sc.render.filepath = rf"{OUTD}\{name}_{g:03d}_{vn}.png"; bpy.ops.render.render(write_still=True); continue
                l = c + Vector(off); co.data.lens = 40; co.location = l; co.rotation_euler = (c - l).to_track_quat('-Z', 'Y').to_euler()
                sc.render.filepath = rf"{OUTD}\{name}_{g:03d}_{vn}.png"; bpy.ops.render.render(write_still=True)
    print('preview done'); sys.exit(0)

# ------------------------------------------------------------------ export
import bmesh, struct
R_PREFIX = ('mixamorig_RightArm', 'mixamorig_RightForeArm', 'mixamorig_RightHand', 'mixamorig_RightShoulder', 'mixamorig_LeftArm', 'mixamorig_LeftForeArm', 'mixamorig_LeftHand', 'mixamorig_LeftShoulder')
for nm in ('Hero_Body', 'Hero_Sweatshirt'):
    ob = bpy.data.objects[nm]; gn = {vg.index: vg.name for vg in ob.vertex_groups}
    bm = bmesh.new(); bm.from_mesh(ob.data); dl = bm.verts.layers.deform.active
    def dom(v):
        w = v[dl]; return gn[max(w.keys(), key=lambda k: w[k])] if len(w) else ''
    inR = {v.index: dom(v).startswith(R_PREFIX) for v in bm.verts}
    bad = [f for f in bm.faces if not all(inR[v.index] for v in f.verts)]
    bmesh.ops.delete(bm, geom=bad, context='FACES')
    loose = [v for v in bm.verts if not v.link_faces]; bmesh.ops.delete(bm, geom=loose, context='VERTS')
    for sgn in (1, -1):         # keep x beyond +-0.20 m (rest pose): a straight rim across the upper arm instead of a ragged shoulder edge
        geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(sgn * 0.31, 0, 0), plane_no=(sgn, 0, 0), clear_outer=False, clear_inner=False)
    inner = [v for v in bm.verts if abs(v.co.x) < 0.3105]
    bmesh.ops.delete(bm, geom=inner, context='VERTS')
    loose = [v for v in bm.verts if not v.link_faces]; bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.to_mesh(ob.data); bm.free(); ob.data.update(); print(nm, 'faces kept', len(ob.data.polygons))
GN = {'mixamorig_RightShoulder_034': 'clavicle_r', 'mixamorig_LeftShoulder_010': 'clavicle_l', 'mixamorig_' + UA: 'upperarm_r', 'mixamorig_' + FA: 'lowerarm_r', 'mixamorig_' + HA: 'hand_r',
      'mixamorig_' + UAL: 'upperarm_l', 'mixamorig_' + FAL: 'lowerarm_l', 'mixamorig_' + HAL: 'hand_l', 'mixamorig_Head_06': 'head'}
for f, short in (('Index', 'index'), ('Middle', 'middle'), ('Ring', 'ring'), ('Pinky', 'pinky'), ('Thumb', 'thumb')):
    for i in range(4):
        GN[f'mixamorig_RightHand{f}{i + 1}_{FING[f][i]}'] = f'{short}_0{i + 1}_r'
        GN[f'mixamorig_LeftHand{f}{i + 1}_{FING_L[f][i]}'] = f'{short}_0{i + 1}_l'
NEWNAME = {n: GN.get(n, n) for n in GAME_BONES}
for old, new in GN.items():
    if old in arm.data.bones: arm.data.bones[old].name = new
    else: print('missing bone', old)
for o in [torch] + LIGHT_R + [LID_R] + LIGHT_L + [LID_L]: o.hide_set(False); o.hide_render = False
torch.name = 'Torch'
for o, bone in [(torch, 'prop_torch')] + [(o, 'prop_lighter_r') for o in LIGHT_R] + [(LID_R, 'lid_r')] + [(o, 'prop_lighter_l') for o in LIGHT_L] + [(LID_L, 'lid_l')]:
    o.parent = arm; o.parent_type = 'BONE'; o.parent_bone = bone; o.matrix_parent_inverse = Matrix.Identity(4)
for o in (fl, bpy.data.objects['Flashlight_switch'], torch_tip, l_piv, l_wick):
    if o.name in bpy.data.objects: bpy.data.objects.remove(o, do_unlink=True)
if arm.animation_data is None: arm.animation_data_create()
for name, frames in REC.items():
    act = bpy.data.actions.new(name); act.use_fake_user = True; arm.animation_data.action = act
    for gi, rec in enumerate(frames):
        for old, (loc, q, scl) in rec.items():
            b = pb[NEWNAME[old]]; b.rotation_mode = 'QUATERNION'
            b.rotation_quaternion = q; b.keyframe_insert('rotation_quaternion', frame=gi + 1)
            if old.startswith(('prop_', 'lid_', 'flame_')):
                b.location = loc; b.keyframe_insert('location', frame=gi + 1); b.scale = scl; b.keyframe_insert('scale', frame=gi + 1)
for act in bpy.data.actions:
    for fc in act.fcurves:
        for kp in fc.keyframe_points: kp.interpolation = 'LINEAR'
arm.animation_data.action = bpy.data.actions['torch_idle']; sc.frame_set(1)
for o in bpy.data.objects: o.select_set(False)
for o in [arm, torch] + LIGHT_R + [LID_R] + LIGHT_L + [LID_L] + [bpy.data.objects['Hero_Body'], bpy.data.objects['Hero_Sweatshirt']]: o.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=False, export_frame_range=False,
    export_skins=True, export_yup=True, export_apply=False, export_cameras=False, export_lights=False, export_image_format='JPEG', export_jpeg_quality=88, export_optimize_animation_size=True)
# the exporter writes the prop nodes' local transforms in its own convention: the prop frame is the helper bone's frame, so only the Z-up -> Y-up mesh conversion has to be undone
Cm = Matrix(((1, 0, 0), (0, 0, 1), (0, -1, 0))); qc = Cm.inverted().to_quaternion()
data = open(OUT, 'rb').read(); jl = struct.unpack('<I', data[12:16])[0]; js = json.loads(data[20:20 + jl].decode('utf-8')); bo = 20 + jl; bl = struct.unpack('<I', data[bo:bo + 4])[0]; binb = data[bo + 8:bo + 8 + bl]
PROPS_N = {'Torch', 'LighterBody_R', 'LighterInsert_R', 'LighterDetails_R', 'LighterLid_R', 'LighterBody_L', 'LighterInsert_L', 'LighterDetails_L', 'LighterLid_L'}
patched = 0
for n in js['nodes']:
    if n.get('name', '') in PROPS_N:
        n['translation'] = [0, 0, 0]; n['rotation'] = [qc.x, qc.y, qc.z, qc.w]; n['scale'] = [1, 1, 1]; patched += 1
jb = json.dumps(js, separators=(',', ':')).encode('utf-8'); jb += b' ' * (-len(jb) % 4)
open(OUT, 'wb').write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(jb) + 8 + len(binb)) + struct.pack('<II', len(jb), 0x4E4F534A) + jb + struct.pack('<II', len(binb), 0x004E4942) + bytes(binb))
print('exported', OUT, os.path.getsize(OUT), 'patched prop nodes', patched, 'animations', [a['name'] for a in js['animations']])
bpy.ops.wm.save_as_mainfile(filepath=r"C:\Users\libde\100gate\art\torch\torch-game.blend")
