# blender -b art/mixamo-pickup.blend --python tools/viewmodel-debug/blender/mixamo_hold.py -- [render]
# Stage A of the pickup animation: the HOLD on the Mixamo-rigged model (right hand).
#  1. the hand is closed into a fist (fingers curled about their local X axis, positive = toward the palm)
#  2. the flashlight is placed INTO that fist: a search over where the barrel lies in the hand (point + direction) for the pose that touches the palm and
#     the finger pads most and passes through nothing (real skin vs the real flashlight mesh)
#  3. every finger and the thumb is refined around the barrel the same way
#  4. the arm: the lens must point forward (and 7 deg up), the wrist stays near neutral, the elbow bends ~110 deg, the upper arm hangs along the body;
#     candidate arm layouts are searched, then the bones are aimed directly (no IK)
# Writes art/mixamo-hold.json (grip matrix, finger curls, arm pose) and art/mixamo-hold.blend.
import bpy, math, json, os, sys
import numpy as np
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree

OUT_JSON = r"C:\Users\libde\100gate\art\mixamo-hold.json"
SHOTS = r"C:\Users\libde\100gate\docs\viewmodel-grip\mixamo"; os.makedirs(SHOTS, exist_ok=True)
RENDER = 'render' in sys.argv
arm = bpy.data.objects['Hero']; fl = bpy.data.objects['Flashlight']; sc = bpy.context.scene
body = bpy.data.objects['Hero_Body']; pb = arm.pose.bones; W = arm.matrix_world
def B(n): return pb['mixamorig_' + n]
def H(n): return W @ B(n).head

FING = {'Index': ('046', '047', '048', '049'), 'Middle': ('038', '039', '040', '041'), 'Ring': ('050', '051', '052', '053'), 'Pinky': ('054', '055', '056', '057'), 'Thumb': ('042', '043', '044', '045')}
def fb(f, i): return B(f'RightHand{f}{i + 1}_{FING[f][i]}')
UA, FA, HA = 'RightArm_035', 'RightForeArm_036', 'RightHand_037'
def qx(a): return Quaternion(Vector((1, 0, 0)), a)
def qz(a): return Quaternion(Vector((0, 0, 1)), a)
rest = {(f, i): fb(f, i).rotation_quaternion.copy() for f in FING for i in range(3)}
def set_finger(f, curls, spreads=(0, 0, 0)):
    for i in range(3): fb(f, i).rotation_quaternion = rest[(f, i)] @ qz(spreads[i]) @ qx(curls[i])
def hand_frame():
    """rigid hand frame from the bones: columns distal (wrist -> middle knuckle), radial (toward the index finger), d x r (back of the hand is +, the palm faces -)"""
    d = (H('RightHandMiddle1_038') - H(HA)).normalized()
    r = H('RightHandIndex1_046') - H('RightHandPinky1_054'); r = (r - d * r.dot(d)).normalized()
    return Matrix((d, r, d.cross(r))).transposed()
def hand_origin(): return H(HA)
bpy.context.view_layer.update()
HF0 = hand_frame(); Rb0 = (W @ B(HA).matrix).to_3x3().normalized()
K = HF0.inverted() @ Rb0                                           # hand bone world rotation = hand frame @ K
HAND_LEN = (H('RightHandMiddle1_038') - H(HA)).length

# ---- the flashlight in its own frame (mesh +X is the lens axis)
fl.rotation_mode = 'QUATERNION'
F0 = fl.matrix_world.copy()
dg = bpy.context.evaluated_depsgraph_get(); ev = fl.evaluated_get(dg); me = ev.to_mesh()
Pl = np.array([(F0.inverted() @ (ev.matrix_world @ v.co))[:] for v in me.vertices]); ev.to_mesh_clear()
tl = Pl[:, 0]; rr = np.sqrt(Pl[:, 1] ** 2 + Pl[:, 2] ** 2)
assert rr[tl > np.percentile(tl, 85)].mean() > rr[tl < np.percentile(tl, 15)].mean(), 'lens end must be +X'
t_tail, t_head = float(tl.min()), float(tl.max())
mid = np.abs(tl - tl.mean()) < 0.02
axis_off = Vector((0, float(np.median(Pl[mid, 1])), float(np.median(Pl[mid, 2]))))
R_BODY = float(np.percentile(rr[(tl > t_tail + 0.02) & (tl < t_tail + 0.07)], 90))
GRIP_FRACTION = 0.32
XG = t_tail + GRIP_FRACTION * (t_head - t_tail)
print(f'flashlight: length {t_head - t_tail:.3f}, barrel radius {R_BODY * 1000:.1f} mm; hand length {HAND_LEN:.3f}')

# ---- skin vertex groups
names = {vg.index: vg.name for vg in body.vertex_groups}
def gname(v): return names[max(v.groups, key=lambda g: g.weight).group] if v.groups else ''
fv = {f: [v.index for v in body.data.vertices if gname(v).startswith(f'mixamorig_RightHand{f}')] for f in FING}
fv['Palm'] = [v.index for v in body.data.vertices if gname(v) == 'mixamorig_RightHand_037']
FIST_KEYS = ('Index', 'Middle', 'Ring', 'Pinky', 'Thumb', 'Palm')
def to_world(G):
    M = hand_frame().to_4x4(); M.translation = hand_origin(); return M @ G
def grip_matrix(cx, cy, cz, ang, tilt):
    """flashlight local -> hand frame. The barrel axis passes through (cx, cy, cz) in the hand frame (x distal, y radial, z back of the hand)
    with the direction at `ang` from the distal axis toward radial (in the palm plane), then tilted `tilt` out of the plane."""
    a = Vector((math.cos(ang), math.sin(ang), 0))
    a = (a * math.cos(tilt) + Vector((0, 0, -1)) * math.sin(tilt)).normalized()
    s = (Vector((0, 0, -1)) - a * Vector((0, 0, -1)).dot(a)).normalized()          # push button toward the palm first
    Rg = Matrix((a, s, a.cross(s))).transposed()
    T = Vector((cx, cy, cz)) - Rg @ (Vector((XG, 0, 0)) + axis_off)
    G = Rg.to_4x4(); G.translation = T
    return G
def stats(keys):
    dg = bpy.context.evaluated_depsgraph_get(); fe = fl.evaluated_get(dg); tree = BVHTree.FromObject(fe, dg); inv = fe.matrix_world.inverted(); FW = fe.matrix_world
    be = body.evaluated_get(dg); me = be.to_mesh(); MB = be.matrix_world; out = {}
    for k in keys:
        touch = deep = 0; mn = 9
        for i in fv[k]:
            co = MB @ me.vertices[i].co; loc, nor, idx, d = tree.find_nearest(inv @ co)
            if loc is None: continue
            s = (co - FW @ loc).length * (1 if (inv @ co - loc).dot(nor) >= 0 else -1)
            touch += s < 0.0025; deep += s < -0.0012; mn = min(mn, s)
        out[k] = (touch, deep, mn)
    be.to_mesh_clear(); return out

# ---- 1. the fist
FIST = {'Index': (1.25, 1.6, 1.0), 'Middle': (1.4, 1.7, 1.0), 'Ring': (1.5, 1.7, 1.0), 'Pinky': (1.55, 1.7, 1.0)}
for f, c in FIST.items(): set_finger(f, c)
bpy.context.view_layer.update()
# ---- 2. the barrel into the fist
def hfp(p): return hand_frame().inverted() @ (p - hand_origin())
def circle_fit(P):
    A = np.array([[2 * x, 2 * z, 1] for x, z in P]); b = np.array([x * x + z * z for x, z in P])
    sol = np.linalg.lstsq(A, b, rcond=None)[0]; return sol[0], sol[1], math.sqrt(max(sol[2] + sol[0] ** 2 + sol[1] ** 2, 1e-9))
FIST0 = dict(FIST); bestS = (1e9, 1.0, None)
for s in np.arange(0.6, 1.16, 0.05):
    for f in FIST: FIST[f] = tuple(min(1.9, v * s) for v in FIST0[f])
    for f, c in FIST.items(): set_finger(f, c)
    bpy.context.view_layer.update()
    pts = []
    for f in ('Index', 'Middle', 'Ring'):
        for i in (0, 1, 2, 3):
            p = hfp(H(f'RightHand{f}{i + 1}_{FING[f][i]}')); pts.append((p.x, p.z))
    cxf, czf, Rf = circle_fit(pts)
    err = abs(Rf - 0.010 - R_BODY)
    print(f'fist scale {s:.2f}: circle R {Rf * 1000:.1f} mm centre ({cxf:.3f},{czf:.3f}) -> hole {1000 * (Rf - 0.010):.1f} mm vs barrel {R_BODY * 1000:.1f}')
    if err < bestS[0]: bestS = (err, s, (cxf, czf))
S_FIT = bestS[1]
for f in FIST: FIST[f] = tuple(min(1.9, v * S_FIT) for v in FIST0[f])
for f, c in FIST.items(): set_finger(f, c)
bpy.context.view_layer.update()
CX0, CZ0 = bestS[2]
CY0 = float(np.mean([hfp(H(f'RightHand{f}1_{FING[f][0]}')).y for f in ('Index', 'Middle', 'Ring', 'Pinky')]))
print('fist scale chosen', round(S_FIT, 2), 'barrel axis near hand-frame', round(CX0, 3), round(CY0, 3), round(CZ0, 3))
best = (-1e9, None)
for cx in CX0 + np.array((-0.024, -0.012, 0.0, 0.012)):
    for cy in CY0 + np.array((-0.024, -0.012, 0.0, 0.012, 0.024)):
        for cz in CZ0 + np.array((-0.014, -0.007, 0.0, 0.007)):
            for ang in np.radians((58, 65, 72)):
                for tilt in np.radians((-20, -10, 0, 10, 20)):
                    fl.matrix_world = to_world(grip_matrix(cx, cy, cz, ang, tilt)); bpy.context.view_layer.update()
                    st = stats(('Index', 'Middle', 'Ring', 'Pinky', 'Palm'))
                    touch = sum(st[k][0] for k in st); deep = sum(st[k][1] for k in st); mn = min(st[k][2] for k in st)
                    score = touch - 30 * deep - 3 * max(0, -mn * 1000 - 1.5)
                    if score > best[0]: best = (score, (cx, cy, cz, ang, tilt), (touch, deep, mn))
cx, cy, cz, ang, tilt = best[1]
print(f'barrel in the fist: at ({cx:.3f}, {cy:.3f}, {cz:.3f}), {math.degrees(ang):.0f} deg from distal toward radial, tilt {math.degrees(tilt):.0f}; touching {best[2][0]}, inside {best[2][1]}, deepest {best[2][2] * 1000:.1f} mm')
G = grip_matrix(cx, cy, cz, ang, tilt)
fl.matrix_world = to_world(G); bpy.context.view_layer.update()

# ---- 3. alternate: fingers + thumb around the barrel, then the barrel around the fingers, twice
def axis_geo():
    Fw = fl.matrix_world
    return Fw @ (Vector((XG, 0, 0)) + axis_off), (Fw.to_3x3() @ Vector((1, 0, 0))).normalized()
def far_side(f):
    """how far the finger has come round the barrel: -1 = tip on the far side from its knuckle, +1 = still on the knuckle side"""
    C, A = axis_geo()
    t = H(f'RightHand{f}4_{FING[f][3]}') - C; t = t - A * t.dot(A)
    k = H(f'RightHand{f}1_{FING[f][0]}') - C; k = k - A * k.dot(A)
    return t.normalized().dot(k.normalized()) if t.length > 1e-4 and k.length > 1e-4 else 1.0
def fit_fingers(fine):
    out = {}
    for f in ('Index', 'Middle', 'Ring', 'Pinky'):
        best = (-1e9, None)
        base = FINAL_C.get(f, FIST[f])
        for d1 in np.radians((-15, 0, 15) if not fine else (-6, 0, 6)):
            for d2 in np.radians((-20, -10, 0, 10, 20) if not fine else (-6, 0, 6)):
                for d3 in np.radians((-20, -10, 0, 10, 20) if not fine else (-6, 0, 6)):
                    for sp in np.radians((-8, 0, 8)):
                        c = (max(0.0, base[0] + d1), max(0.0, base[1] + d2), max(0.0, base[2] + d3))
                        if max(c) > 1.9: continue
                        set_finger(f, c, (sp, 0, 0)); bpy.context.view_layer.update()
                        touch, deep, mn = stats([f])[f]
                        score = touch - 30 * deep - 3 * max(0, -mn * 1000 - 1.5) - 14 * max(0.0, far_side(f) + 0.1) - 0.0 * abs(mn)
                        if score > best[0]: best = (score, (c, sp), (touch, deep, mn))
        (c, sp) = best[1]; set_finger(f, c, (sp, 0, 0)); bpy.context.view_layer.update()
        FINAL_C[f] = c
        out[f] = {'curls': [float(x) for x in c], 'spread': float(sp)}
        print(f'{f}: curl deg', [round(math.degrees(x)) for x in c], 'spread', round(math.degrees(sp)), '| touching', best[2][0], 'inside', best[2][1], 'closest mm', round(best[2][2] * 1000, 1), '| wrapped', round(-far_side(f), 2))
    return out
def fit_thumb():
    best = (-1e9, None)
    for y1 in np.radians((-40, 0, 40)):
      for a1 in np.radians((0, 20, 40, 60)):
        for z1 in np.radians((-50, -30, -10, 10, 30, 50)):
            for a2 in np.radians((0, 25, 50, 70)):
                for a3 in np.radians((0, 25, 50, 70)):
                    for i, (a, z) in enumerate(((a1, z1), (a2, 0), (a3, 0))):
                        fb('Thumb', i).rotation_quaternion = rest[('Thumb', i)] @ qz(z) @ qx(a) @ (Quaternion((0, 1, 0), y1) if i == 0 else Quaternion())
                    bpy.context.view_layer.update()
                    touch, deep, mn = stats(['Thumb'])['Thumb']
                    Cb, Ab = axis_geo()
                    td = (H(f'RightHandThumb4_{FING["Thumb"][3]}') - H(f'RightHandThumb2_{FING["Thumb"][1]}')).normalized()
                    across = 1 - abs(td.dot(Ab))                                  # 1 = thumb lies across the barrel, 0 = along it
                    tip = H(f'RightHandThumb4_{FING["Thumb"][3]}') - Cb; tip = tip - Ab * tip.dot(Ab)
                    score = touch - 30 * deep - 3 * max(0, -mn * 1000 - 1.5) + 40 * across - 0.5 * abs(tip.length - R_BODY - 0.008) * 1000
                    if score > best[0]: best = (score, (a1, a2, a3, z1, y1), (touch, deep, mn))
    a1, a2, a3, z1, y1 = best[1]
    for i, (a, z) in enumerate(((a1, z1), (a2, 0), (a3, 0))): fb('Thumb', i).rotation_quaternion = rest[('Thumb', i)] @ qz(z) @ qx(a) @ (Quaternion((0, 1, 0), y1) if i == 0 else Quaternion())
    bpy.context.view_layer.update()
    print('Thumb: curl deg', [round(math.degrees(x)) for x in (a1, a2, a3)], 'swing', round(math.degrees(z1)), '| touching', best[2][0], 'inside', best[2][1], 'closest mm', round(best[2][2] * 1000, 1))
    return {'curls': [float(a1), float(a2), float(a3)], 'spread': float(z1)}
FINAL_C = {}
final = fit_fingers(False)
for rnd in range(2):
    best = (-1e9, G)
    for dx in (-0.008, 0, 0.008):
        for dy in (-0.008, 0, 0.008):
            for dz in (-0.006, 0, 0.006):
                for da in np.radians((-8, 0, 8)):
                    for dt in np.radians((-8, 0, 8)):
                        Gc = grip_matrix(cx + dx, cy + dy, cz + dz, ang + da, tilt + dt)
                        fl.matrix_world = to_world(Gc); bpy.context.view_layer.update()
                        st = stats(('Index', 'Middle', 'Ring', 'Pinky', 'Palm'))
                        touch = sum(st[k][0] for k in st); deep = sum(st[k][1] for k in st); mn = min(st[k][2] for k in st)
                        score = touch - 30 * deep - 3 * max(0, -mn * 1000 - 1.5)
                        if score > best[0]: best = (score, (cx + dx, cy + dy, cz + dz, ang + da, tilt + dt))
    cx, cy, cz, ang, tilt = best[1]; G = grip_matrix(cx, cy, cz, ang, tilt)
    fl.matrix_world = to_world(G); bpy.context.view_layer.update()
    print(f'round {rnd}: barrel moved to ({cx:.3f}, {cy:.3f}, {cz:.3f}), {math.degrees(ang):.0f} deg, tilt {math.degrees(tilt):.0f}')
    final = fit_fingers(True)
final['Thumb'] = fit_thumb()
print('all parts now:', {k: (v[0], v[1], round(v[2] * 1000, 1)) for k, v in stats(FIST_KEYS).items()})

# ---- 4. the arm: lens forward, natural layout
L = Vector((math.sin(math.radians(8)) * math.cos(math.radians(55)), -math.cos(math.radians(8)) * math.cos(math.radians(55)), math.sin(math.radians(55)))).normalized()   # torch: the head up and forward, like carrying a torch
up = Vector((0, 0, 1)); inward = Vector((1, 0, 0)); fwd = Vector((0, -1, 0)); outward = Vector((-1, 0, 0))
Lu = (H('RightForeArm_036') - H('RightArm_035')).length; Lf = (H(HA) - H('RightForeArm_036')).length
sh = H('RightArm_035')
a_h = (G.to_3x3() @ Vector((1, 0, 0))).normalized()
def layout(th, ul, fa, out, fl=0):
    side = (up * math.cos(math.radians(th)) + inward * math.sin(math.radians(th))).normalized()
    e2 = (side - L * side.dot(L)).normalized()
    r_h = (Vector((0, 1, 0)) - a_h * Vector((0, 1, 0)).dot(a_h)).normalized()
    src = Matrix((a_h, r_h, a_h.cross(r_h))).transposed(); dst = Matrix((L, e2, L.cross(e2))).transposed()
    HFw = dst @ src.inverted(); D_w, R_w = HFw.col[0], HFw.col[1]
    N_w = HFw.col[2]
    fore = ((D_w * math.cos(math.radians(ul)) - R_w * math.sin(math.radians(ul))) * math.cos(math.radians(fl)) - N_w * math.sin(math.radians(fl))).normalized()   # fl > 0: the wrist is extended (hand bent back)
    u = (-up * math.cos(math.radians(fa)) + fwd * math.sin(math.radians(fa)) + outward * math.sin(math.radians(out))).normalized()
    elbow = sh + u * Lu; wrist = elbow + fore * Lf
    return dict(HFw=HFw, fore=fore, elbow=elbow, wrist=wrist, elb=math.degrees((sh - elbow).angle(wrist - elbow)), pitch=math.degrees(math.asin(max(-1, min(1, fore.z)))), th=th, ul=ul, fa=fa, out=out, fl=fl,
                barrel_vs_fore=math.degrees((HFw @ a_h).angle(fore)))
cands = []
for th in range(-30, 91, 10):
    for ul in (-25, -20, -15, -10, -5, 0, 5):
        for fa in (20, 30, 40, 50, 60, 70):
            for out in (5, 12, 20, 28):
                for fx in (0, 10, 20, 30, 40):
                    c = layout(th, ul, fa, out, fx)
                    cost = abs(c['elb'] - 105) * 0.7 + abs(c['pitch'] + 5) * 0.5 + (c['wrist'] - Vector((-0.28, -0.30, 1.22))).length * 300 + abs(c['ul']) * 2.0 + abs(c['fl']) * 1.5 + max(0, c['elbow'].x + 0.27) * 400
                    cands.append((cost, c))
cands.sort(key=lambda t: t[0])
for cost, c in cands[:4]:
    print(f"arm candidate {cost:.1f}: thumb-side {c['th']} ulnar {c['ul']} extension {c['fl']} upper arm fwd {c['fa']} out {c['out']} -> elbow {c['elb']:.0f}, forearm pitch {c['pitch']:+.0f}, barrel vs forearm {c['barrel_vs_fore']:.0f}, wrist {tuple(round(v, 2) for v in c['wrist'])}")
C = cands[0][1]
def basis_frame(bone): return (W @ bone.matrix @ bone.matrix_basis.inverted()).to_3x3()
def aim(bone, target_pos):
    cur = (W @ bone.tail - W @ bone.head).normalized(); tgt = (target_pos - (W @ bone.head)).normalized()
    A = basis_frame(bone); bone.rotation_quaternion = (A.inverted() @ cur.rotation_difference(tgt).to_matrix() @ A).to_quaternion() @ bone.rotation_quaternion
    bpy.context.view_layer.update()
aim(B(UA), C['elbow']); aim(B(FA), C['wrist'])
Rtarget = C['HFw'] @ K
Ah = basis_frame(B(HA)); B(HA).rotation_quaternion = (Ah.inverted() @ Rtarget).to_quaternion(); bpy.context.view_layer.update()
fl.matrix_world = to_world(G); bpy.context.view_layer.update()
ax_now = (fl.matrix_world.to_3x3() @ Vector((1, 0, 0))).normalized()
print(f'arm placed: wrist miss {(H(HA) - C["wrist"]).length * 1000:.1f} mm; lens axis {tuple(round(v, 2) for v in ax_now)} (wanted {tuple(round(v, 2) for v in L)})')

data = {'G': [list(r) for r in G], 'fist_final': final, 'arm_q': {n: list(B(n).rotation_quaternion) for n in (UA, FA, HA)},
        'hold_arm': {'elbow': list(C['elbow']), 'wrist': list(C['wrist']), 'th': C['th'], 'ul': C['ul'], 'fa': C['fa'], 'out': C['out'], 'elb': C['elb'], 'pitch': C['pitch']},
        'flashlight_local': {'t_tail': t_tail, 't_head': t_head, 'axis_off': list(axis_off), 'radius': R_BODY, 'xg': XG}, 'K': [list(r) for r in K], 'HF_hold': [list(r) for r in C['HFw']]}
json.dump(data, open(OUT_JSON, 'w'), indent=1)
if RENDER:
    co = bpy.data.objects['shot']; sc.camera = co
    def shoot(name, loc, target, lens=40):
        co.data.lens = lens; co.location = loc; co.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = rf"{SHOTS}\{name}.png"; bpy.ops.render.render(write_still=True)
    fc = fl.matrix_world.translation
    shoot('hold_full_front', (0.3, -2.4, 1.4), (-0.15, -0.3, 1.0)); shoot('hold_full_side', (-2.4, -0.4, 1.3), (-0.2, -0.3, 1.0))
    for nm, off in (('right', (-0.5, 0.05, 0.1)), ('above', (0.0, 0.05, 0.5)), ('front', (0.0, -0.5, 0.12)), ('left', (0.5, 0.0, 0.1)), ('below', (0.0, 0.1, -0.45)), ('back', (0.0, 0.5, 0.1))):
        shoot(f'hold_hand_{nm}', fc + Vector(off), fc, 50)
bpy.ops.wm.save_as_mainfile(filepath=r"C:\Users\libde\100gate\art\mixamo-hold.blend")
print('hold saved')
