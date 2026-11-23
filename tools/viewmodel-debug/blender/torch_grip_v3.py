# exec()'d after torch_rig.py / the torch_game.py prefix (shares their globals: g dict when run live, globals() in torch_game.py).
# A real power grip on the torch shaft, built from the hand's own geometry instead of the old flashlight proxy:
#   1. the shaft (r = 20 mm) lies diagonally across the palm, from the base of the index finger toward the heel of the hand on the pinky side,
#      pressed onto the palm skin (1 mm clearance, no penetration);
#   2. each finger closes joint by joint (proximal, middle, distal phalanx), every joint bending until its phalanx touches the shaft;
#   3. the thumb flexes across the front of the shaft and closes the ring over the index/middle fingers.
# Result: GRIP_G (torch frame in the hand frame) and GRIP_FINGERS (finger state); torch_game.py uses them for every torch clip.
import math, bmesh
import numpy as np
from mathutils import Vector, Matrix, Quaternion

R_SHAFT = 0.020          # measured on the torch mesh around the grip point (mean 19.8 mm, max 22 mm)
CLEAR = 0.0012           # skin clearance kept from the shaft surface
OBLIQUE = 0.60           # tan of the diagonal across the palm (about 31 deg): index end toward the fingers, pinky end toward the heel; this brings the thenar onto the shaft so the thumb can press it
BASE_FWD = -0.010         # the shaft lies on the distal palmar crease, a little short of the knuckle line

_BODY = bpy.data.objects['Hero_Body']
_gnames = {vg.index: vg.name for vg in _BODY.vertex_groups}
def _dom(v): return _gnames[max(v.groups, key=lambda q: q.weight).group] if v.groups else ''
_DOM = [_dom(v) for v in _BODY.data.vertices]
def _verts_of(bone_name): return np.array([i for i, n in enumerate(_DOM) if n == bone_name], dtype=np.int64)
PHAL = {f: [_verts_of(fb(f, i).name) for i in range(3)] for f in FING}          # vertex sets of each phalanx (dominant bone)
PALM = _verts_of('mixamorig_' + HA)

def _world_verts(idx):
    dg_ = bpy.context.evaluated_depsgraph_get(); ev = _BODY.evaluated_get(dg_); me = ev.to_mesh()
    co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', co); ev.to_mesh_clear()
    co = co.reshape(-1, 3)[idx]
    M = np.array(_BODY.matrix_world); return co @ M[:3, :3].T + M[:3, 3]

def shaft_gap(P, Tw, half=0.13):
    """signed distance (m) of points to the shaft surface; only points within +-half of the grip point along the axis count"""
    Ti = np.array(Tw.inverted()); L = P @ Ti[:3, :3].T + Ti[:3, 3]
    m = np.abs(L[:, 0]) < half
    d = np.sqrt(L[:, 1] ** 2 + L[:, 2] ** 2) - R_SHAFT
    return np.where(m, d, 1.0)

def place_shaft(Hw):
    """torch frame (world) for the hand frame Hw: X along the shaft toward the head, through the fist channel, on the palm skin"""
    R3 = Hw.to_3x3(); d, r, n = R3.col[0], R3.col[1], R3.col[2]; palm = -n                      # fingers curl toward -n: the palm faces -n
    a = (r + d * OBLIQUE).normalized()                                                          # toward the index side = up out of the fist
    kn = (H('RightHandIndex1_046') + H('RightHandPinky1_054')) * 0.5 + d * BASE_FWD
    y0 = TORCH_HOLD.to_3x3().col[1]; y = (y0 - a * y0.dot(a)).normalized(); z = a.cross(y)
    def at(off):
        M = Matrix((a, y, z)).transposed().to_4x4(); M.translation = kn + palm * off; return M
    # open hand, thumb out of the way: then slide the shaft along the palm normal until the palm skin clears it by CLEAR
    for f in FING:
        for i in range(3): fb(f, i).rotation_quaternion = (qz(0.75) if (f == 'Thumb' and i == 0) else qx(0))
    bpy.context.view_layer.update()
    P = _world_verts(PALM)
    lo, hi = 0.0, 0.08
    for _ in range(24):
        mid = (lo + hi) / 2
        if shaft_gap(P, at(mid)).min() < CLEAR: lo = mid
        else: hi = mid
    return at(hi), hi

def close_fingers(Tw, spreads, order=('Index', 'Middle', 'Ring', 'Pinky'), limits=((1.50, 1.85, 1.30),) * 4, rates=(1.0, 1.15, 0.8), step=math.radians(1.5)):
    """a grasp closing like a real hand: all three joints of a finger bend together (rates), and each joint stops the moment its own
    phalanx touches the shaft; the joints beyond it keep curling around. A joint also stops if moving it would push any phalanx into the shaft."""
    curls = {}
    for f, lim in zip(order, limits):
        c = [0.0, 0.0, 0.0]; active = [True, True, True]
        idx = np.concatenate(PHAL[f]); cuts = np.cumsum([0] + [len(p) for p in PHAL[f]])
        def pose():
            fb(f, 0).rotation_quaternion = qz(spreads[f]) @ qx(c[0]); fb(f, 1).rotation_quaternion = qx(c[1]); fb(f, 2).rotation_quaternion = qx(c[2])
            bpy.context.view_layer.update()
            g_ = shaft_gap(_world_verts(idx), Tw)
            return [float(g_[cuts[k]:cuts[k + 1]].min()) if cuts[k + 1] > cuts[k] else 1.0 for k in range(3)]
        gaps = pose()
        for _ in range(400):
            if not any(active): break
            prev = list(c)
            for j in range(3):
                if active[j]: c[j] = min(lim[j], c[j] + step * rates[j])
            gaps_new = pose()
            for j in range(3):
                if not active[j]: continue
                touched = gaps_new[j] < CLEAR
                pushed = any(gaps_new[k] < 0 and gaps_new[k] < gaps[k] for k in range(j, 3))
                if touched or pushed or c[j] >= lim[j]:
                    if touched or pushed: c[j] = prev[j]
                    active[j] = False
            gaps = pose()
        curls[f] = tuple(round(v, 4) for v in c)
    return curls

def qy(a): return Quaternion((0, 1, 0), a)

def _seg_dist(p0, p1, q0, q1, n=6):
    return min(((p0.lerp(p1, i / n)) - (q0.lerp(q1, j / n))).length for i in range(n + 1) for j in range(n + 1))

def close_thumb(Tw):
    """the thumb wraps the outside of the shaft: search the base joint (flexion about X, swing about Z) so the thumb clears the shaft,
    then close the two outer joints until they touch; keep the pose whose pad rests on the far side of the shaft (away from the palm)"""
    R3 = Tw.to_3x3(); ax = R3.col[0]
    palm_out = -GRIP_HW_N                                        # from the shaft axis toward the outside of the fist
    idx = [PHAL['Thumb'][k] for k in range(3)]; allidx = np.concatenate(idx); cuts = np.cumsum([0] + [len(p) for p in idx])
    def link_gaps():
        g_ = shaft_gap(_world_verts(allidx), Tw); return [float(g_[cuts[k]:cuts[k + 1]].min()) for k in range(3)]
    # the pad lands on the OUTER face of the shaft (palm_out side), just behind the index fingertip: the thumb opposes the fingers
    Ti = Tw.inverted(); ix = (Ti @ (W @ fb('Index', 2).head)).x
    yo = Tw.inverted().to_3x3() @ palm_out; yo = Vector((0, yo.y, yo.z)).normalized(); zo = Vector((1, 0, 0)).cross(yo)
    target = Tw @ (Vector((ix - 0.012, 0, 0)) + yo * (R_SHAFT + 0.009) + zo * 0.012)
    best = None
    for x0, z0, y0 in [(x, z, y) for x in np.arange(-0.6, 1.45, 0.15) for z in np.arange(-0.9, 1.15, 0.15) for y in (-0.8, -0.4, 0.0, 0.4, 0.8)]:
        if True:
            fb('Thumb', 0).rotation_quaternion = qz(z0) @ qx(x0) @ qy(y0); fb('Thumb', 1).rotation_quaternion = qx(0); fb('Thumb', 2).rotation_quaternion = qx(0)
            bpy.context.view_layer.update()
            if link_gaps()[0] < CLEAR: continue
            c = [x0, 0.0, 0.0]; act = [False, True, True]
            gl = link_gaps()
            if min(gl) < -0.002: continue
            # MCP and IP flex together (IP a little faster, as in a real thumb), each within its anatomical range, each stopping on contact
            LIM = (None, math.radians(62), math.radians(82)); RATE = (0, 1.0, 1.3)
            for _ in range(80):
                if not any(act): break
                prev = list(c)
                for j in (1, 2):
                    if act[j]: c[j] = min(LIM[j], c[j] + math.radians(1.5) * RATE[j])
                fb('Thumb', 1).rotation_quaternion = qx(c[1]); fb('Thumb', 2).rotation_quaternion = qx(c[2]); bpy.context.view_layer.update()
                gn = link_gaps()
                for j in (1, 2):
                    if not act[j]: continue
                    hit = gn[j] < CLEAR or any(gn[k] < 0 and gn[k] < gl[k] for k in range(j, 3))
                    if hit or c[j] >= LIM[j]:
                        if hit: c[j] = prev[j]
                        act[j] = False
                fb('Thumb', 1).rotation_quaternion = qx(c[1]); fb('Thumb', 2).rotation_quaternion = qx(c[2]); bpy.context.view_layer.update()
                gl = link_gaps()
            # the thumb must not pass through the index or middle finger: keep its bones clear of theirs
            tb = [(W @ fb('Thumb', k).head, W @ fb('Thumb', k + 1).head) for k in (1, 2)]
            fbn = [(W @ fb(f, k).head, W @ fb(f, k + 1).head) for f in ('Index', 'Middle') for k in range(3)]
            clash = min(_seg_dist(p0, p1, q0, q1) for p0, p1 in tb for q0, q1 in fbn)
            if clash < 0.014 or gl[2] > 0.008 or gl[1] > 0.010: continue
            if min(gl) < 0: continue
            tip = W @ fb('Thumb', 3).head; rel = tip - Tw.translation; rel = rel - ax * rel.dot(ax)
            wrap = rel.normalized().dot(palm_out)                # 1 = pad straight on the outer face of the shaft
            if wrap < 0.35: continue                             # the thumb comes round the thenar side onto the outer face, opposite the fingers
            score = (abs(gl[1] - 0.002) + abs(gl[2] - 0.002)) * 30 + (tip - target).length * 6 + (1 - wrap) * 0.15
            if best is None or score < best[0]: best = (score, z0, (x0, c[1], c[2]), gl, wrap, (tip - target).length, y0)
    s, z0, c, gl, wrap, dt, y0 = best
    fb('Thumb', 0).rotation_quaternion = qz(z0) @ qx(c[0]) @ qy(y0); fb('Thumb', 1).rotation_quaternion = qx(c[1]); fb('Thumb', 2).rotation_quaternion = qx(c[2])
    bpy.context.view_layer.update()
    print('thumb fit: swing', round(math.degrees(z0)), 'twist', round(math.degrees(y0)), 'curls', tuple(round(math.degrees(v)) for v in c), 'gaps mm', [round(v * 1000, 1) for v in gl], 'wrap', round(wrap, 2), 'to target mm', round(dt * 1000))
    return tuple(round(float(v), 4) for v in c), float(z0), float(y0)

def _close_thumb_old(Tw, spread_range=(-0.2, 0.9)):
    """the thumb: pick the abduction (spread about Z) that lets it wrap over the front of the shaft closest to the index finger,
    then close its joints in order like the fingers"""
    best = None
    tip_target = W @ fb('Index', 1).head                       # the thumb pad ends over the index finger's middle joint
    for k in range(12):
        s = spread_range[0] + (spread_range[1] - spread_range[0]) * k / 11
        c = close_fingers(Tw, {'Thumb': s}, order=('Thumb',), limits=((1.2, 1.3, 1.2),))['Thumb']
        tip = W @ fb('Thumb', 3).head
        score = (tip - tip_target).length + 0.002 * sum(c)
        if best is None or score < best[0]: best = (score, s, c)
    fb('Thumb', 0).rotation_quaternion = qz(best[1]) @ qx(best[2][0]); fb('Thumb', 1).rotation_quaternion = qx(best[2][1]); fb('Thumb', 2).rotation_quaternion = qx(best[2][2])
    bpy.context.view_layer.update()
    return best[2], best[1]

def build_grip(Hw):
    """pose the right hand on a freshly placed shaft; returns (torch world frame, finger state dict, report)"""
    global GRIP_HW_N
    GRIP_HW_N = Hw.to_3x3().col[2].copy()
    Tw, off = place_shaft(Hw)
    spreads = {f: CLOSED[f][1] * 0.6 for f in FING}
    curls = close_fingers(Tw, spreads)
    tc, ts, ttw = close_thumb(Tw)
    curls['Thumb'] = tc; spreads['Thumb'] = ts
    allidx = np.concatenate([PALM] + [np.concatenate(PHAL[f]) for f in FING])
    gaps = shaft_gap(_world_verts(allidx), Tw)
    per = {f: round(float(shaft_gap(_world_verts(np.concatenate(PHAL[f])), Tw).min()) * 1000, 1) for f in FING}
    rep = {'offset_mm': round(off * 1000, 1), 'min_gap_mm': round(float(gaps.min()) * 1000, 2), 'finger_gap_mm': per,
           'curls_deg': {f: tuple(round(math.degrees(v)) for v in curls[f]) for f in FING}, 'thumb_spread_deg': round(math.degrees(ts))}
    rep['thumb_twist_deg'] = round(math.degrees(ttw))
    st = {f: (curls[f], spreads[f]) for f in FING}; st['Thumb'] = (curls['Thumb'], spreads['Thumb'], ttw)   # the thumb also rolls about its own axis
    return Tw, st, rep
