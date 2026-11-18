# Run inside Blender on art/paper-inspect.blend (a copy of art/torch/torch-game.blend: the same armature as viewmodel-8.glb).
#   exec(open(r"C:\Users\libde\100gate\tools\viewmodel-debug\blender\paper_inspect.py", encoding="utf-8").read()); build(); ...
# Builds the two-handed "read a sheet" rig: a `paper` bone in front of the eye, IK targets for both wrists on its side edges,
# elbow poles down and out, fingers fitted onto the sheet (thumbs over the front, fingers behind), then the clips
# paper_open / paper_idle / paper_close for three grip widths, baked to plain bone keys and exported as public/assets/iso/paper-inspect-1.glb
# (armature joints + the sheet only: the game plays the clips on its own clone of viewmodel-8 and borrows its skinned arms).
import bpy, math, json, os, struct
from mathutils import Matrix, Vector, Quaternion, Euler

ARM = 'Hero'
SCRATCH_REL = r"C:\Users\libde\100gate\art\paper-inspect-hand.json"   # the one-hand sheet grip fitted in art/hands-fix-3.blend (hand frame in sheet space)
OUT = r"C:\Users\libde\100gate\public\assets\iso\paper-inspect-1.glb"
W4, H4 = .21, .297
# grip sets: the sheet width the hands are spread for (the game picks the set for each kind of paper)
GRIPS = {'narrow': .15, 'a4': .21, 'wide': .32}
FPS = 24

# eye: the camera of the inspect view, behind the hidden head like the main viewmodel's placement (the shoulders are ahead of it)
EYE_OFF = Vector((0, .12, .06))
PAPER_DIST, PAPER_DROP, PAPER_TILT = .44, .07, math.radians(16)   # in front of the eye, below it, top tipped away
PINCH_IN, PINCH_LOW = .026, -.035          # thumb tip: this far in from the side edge, this far below the sheet's middle
HAND_TURN = math.radians(78)               # the hand turned from "fingers up the page" to "fingers in along the page"

arm = bpy.data.objects[ARM]
def pbone(n): return arm.pose.bones[n]
def head(n): return arm.matrix_world @ pbone(n).head

def hand_frame(side):
    """a frame from the joints only (independent of the bone rolls): x = fingers, y = index - pinky, origin = wrist"""
    d = (head(f'middle_01_{side}') - head(f'hand_{side}')).normalized()
    r = head(f'index_01_{side}') - head(f'pinky_01_{side}'); r = (r - d * r.dot(d)).normalized()
    m = Matrix((d, r, d.cross(r))).transposed().to_4x4(); m.translation = head(f'hand_{side}'); return m

def eye():
    return arm.matrix_world @ arm.data.bones['head'].head_local + EYE_OFF

def sheet_frame():
    """paper bone frame in world: x = to the reader's right (-X), y = up the page, z = the front (toward the eye)"""
    e = eye(); c = e + Vector((0, -PAPER_DIST, -PAPER_DROP))
    x = Vector((-1, 0, 0)); y = Vector((0, -math.sin(PAPER_TILT), math.cos(PAPER_TILT))); z = x.cross(y)
    m = Matrix((x, y, z)).transposed().to_4x4(); m.translation = c; return m

def clear_pose():
    if arm.animation_data: arm.animation_data.action = None
    for b in arm.pose.bones:
        b.rotation_euler = (0, 0, 0); b.rotation_mode = 'QUATERNION'; b.rotation_quaternion = Quaternion(); b.location = (0, 0, 0); b.scale = (1, 1, 1)
    bpy.context.view_layer.update()

# ------------------------------------------------------------------ arms: analytic two-bone solve onto the ik_hand_* bones
# (Blender's IK constraint cannot be used: the forearm bones of this rig end 5 mm after their head, the wrist is an offset child)
ELBOW_OUT, ELBOW_DOWN = .55, 1.0            # where the elbows point: out to the side and down
TWIST_SHARE = .5                            # part of the wrist's turn taken by the forearm (no twist bones in the rig)

def _world(n): return arm.matrix_world @ pbone(n).matrix
def _set_world(n, m):
    # only the rotation is wanted: setting .matrix also writes a tiny location/scale, which used to pile up frame after
    # frame (the solver only reset rotations) and was lost in the rotation-only clips: the baked idle hand drifted 1-3 cm
    # off the sheet and the thumb sank into it
    b = pbone(n); b.matrix = arm.matrix_world.inverted() @ m
    b.location = (0, 0, 0); b.scale = (1, 1, 1); bpy.context.view_layer.update()

def _aim(n, child, point):
    """turn bone n about its head so that the head of `child` lies on the line to `point`"""
    m = _world(n); h = m.translation; c = head(child)
    q = (c - h).rotation_difference(point - h)
    r = q.to_matrix() @ m.to_3x3(); nm = r.to_4x4(); nm.translation = h
    _set_world(n, nm)

# --- v2: the elbow is a hinge, the elbow's swing round the shoulder-wrist line is chosen so that the forearm runs on into the hand,
#     and the turn of the hand about the forearm is taken by the forearm (pronation / supination), not by the wrist.
#     (v1 aimed the upper arm by the shortest turn and put the whole rest of the orientation into the wrist: 60 deg bend + 50 deg twist,
#     and a twisted wrist with this rig's skinning pinches to ~60 % of its width.)
FORE_TWIST_SHARE = .8          # of the hand's turn about the forearm axis; the wrist keeps the rest
SWIVEL_RANGE = range(-100, 101, 5)

def _swing_twist_y(q):
    tw = Quaternion((q.w, 0, q.y, 0)).normalized(); sw = q @ tw.inverted()
    return sw, 2 * math.atan2(tw.y, tw.w)

def wrist_angles(s):
    sw, tw = _swing_twist_y(pbone(f'hand_{s}').rotation_quaternion)
    return math.degrees(sw.angle if sw.angle <= math.pi else 2 * math.pi - sw.angle), math.degrees(tw)

def _place(s, goal, elbow, share=FORE_TWIST_SHARE):
    up, lo, ha = f'upperarm_{s}', f'lowerarm_{s}', f'hand_{s}'
    for n in (up, lo, ha):
        b = pbone(n); b.rotation_quaternion = Quaternion(); b.location = (0, 0, 0); b.scale = (1, 1, 1)
    bpy.context.view_layer.update()
    S = head(up); E0 = head(lo); P = goal.translation
    u0 = (E0 - S).normalized(); front = Vector((0, -1, 0)); n0 = u0.cross(front).normalized()
    u = (elbow - S).normalized(); f = (P - elbow).normalized(); n = u.cross(f)
    if n.length < 1e-6: n = n0.copy()
    n.normalize()
    F0 = Matrix((u0, n0, u0.cross(n0))).transposed(); F = Matrix((u, n, u.cross(n))).transposed()
    U = F @ F0.inverted()
    um = (U @ _world(up).to_3x3()).to_4x4(); um.translation = S; _set_world(up, um)
    Rl = (arm.matrix_world @ arm.data.bones[lo].matrix_local).to_3x3()
    h_loc = (Rl.inverted() @ n0).normalized(); bend = u.angle(f)
    def set_lower(tau):
        pbone(lo).rotation_quaternion = Quaternion(h_loc, bend) @ Quaternion((0, 1, 0), tau); bpy.context.view_layer.update()
        if (head(ha) - P).length > .001: _aim(lo, ha, P)
        hg = goal.to_3x3().to_4x4(); hg.translation = head(ha); _set_world(ha, hg)
    set_lower(0)
    _, ta = _swing_twist_y(pbone(ha).rotation_quaternion)
    if share: set_lower(ta * share)

def solve_arm(s, goal, report=False, prev=None):
    """goal: world matrix wanted for hand_{s}; picks the elbow swivel that leaves the wrist straightest"""
    up, lo, ha = f'upperarm_{s}', f'lowerarm_{s}', f'hand_{s}'
    for n in (up, lo, ha): pbone(n).rotation_quaternion = Quaternion()
    bpy.context.view_layer.update()
    S = head(up); E0 = head(lo); H0 = head(ha)
    L1, L2 = (E0 - S).length, (H0 - E0).length
    P = goal.translation; d = P - S; dist = min(d.length, (L1 + L2) * .998); ax = d.normalized()
    a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist); h = math.sqrt(max(L1 * L1 - a * a, 0))
    down = Vector((0, 0, -1)); e1 = (down - ax * down.dot(ax)).normalized(); e2 = ax.cross(e1)
    out = Vector((-1 if s == 'r' else 1, 0, 0))
    if e2.dot(out) < 0: e2 = -e2                                   # positive swivel = elbow out to the side
    best = None
    for deg in SWIVEL_RANGE:
        ph = math.radians(deg); E = S + ax * a + (e1 * math.cos(ph) + e2 * math.sin(ph)) * h
        _place(s, goal, E)
        sw, tw = wrist_angles(s)
        pen = max(0, E.z - (S.z - .04)) * 400 + max(0, -(E - S).dot(out) + .02) * 300   # elbow not up, not tucked in
        score = sw + .5 * abs(tw) + pen
        if prev is not None: score += .4 * abs(deg - prev)      # in a clip the elbow drifts, it does not flip round
        if best is None or score < best[0]: best = (score, deg, E, sw, tw)
    _place(s, goal, best[2])
    if report: print(s, 'swivel', best[1], 'wrist bend', round(best[3], 1), 'wrist twist', round(best[4], 1), 'elbow', [round(v, 3) for v in best[2]])
    return best

def solve_arm_v1(s, goal):
    """goal: world matrix wanted for hand_{s}"""
    for n in (f'upperarm_{s}', f'lowerarm_{s}', f'hand_{s}'): pbone(n).rotation_quaternion = Quaternion()
    bpy.context.view_layer.update()
    S = head(f'upperarm_{s}'); E0 = head(f'lowerarm_{s}'); H0 = head(f'hand_{s}')
    L1, L2 = (E0 - S).length, (H0 - E0).length
    P = goal.translation; d = P - S; dist = min(d.length, (L1 + L2) * .998); u = d.normalized()
    a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist); h = math.sqrt(max(L1 * L1 - a * a, 0))
    pole = Vector(((-1 if s == 'r' else 1) * ELBOW_OUT, 0, -ELBOW_DOWN)); pole = (pole - u * pole.dot(u)).normalized()
    elbow = S + u * a + pole * h
    _aim(f'upperarm_{s}', f'lowerarm_{s}', elbow)
    _aim(f'lowerarm_{s}', f'hand_{s}', P)
    # forearm twist: take a share of the turn the hand needs about the forearm axis
    fa = _world(f'lowerarm_{s}'); axis = (head(f'hand_{s}') - head(f'lowerarm_{s}')).normalized()
    hm = _world(f'hand_{s}').to_3x3()
    need = goal.to_3x3() @ hm.inverted()                     # world rotation from the current hand to the goal
    q = need.to_quaternion(); proj = Vector((q.x, q.y, q.z)).dot(axis)
    twist = Quaternion((q.w, *(axis * proj))).normalized()
    ang = twist.angle if Vector((twist.x, twist.y, twist.z)).dot(axis) >= 0 else -twist.angle
    if ang > math.pi: ang -= 2 * math.pi
    rot = Quaternion(axis, ang * TWIST_SHARE).to_matrix()
    nf = (rot @ fa.to_3x3()).to_4x4(); nf.translation = fa.translation; _set_world(f'lowerarm_{s}', nf)
    hg = goal.to_3x3().to_4x4(); hg.translation = head(f'hand_{s}'); _set_world(f'hand_{s}', hg)

def solve_arms():
    Pw = _world('paper')
    for s in 'rl': solve_arm(s, Pw @ grip_rel(s, Pw.inverted() @ _world(f'ik_hand_{s}')))

# ------------------------------------------------------------------ fingers: fitted onto the sheet plane
BODY = 'Hero_Body'
FINGERS = ('index', 'middle', 'ring', 'pinky')
CURL_SHARE = {'index': (.3, .6, .45), 'middle': (.3, .6, .45), 'ring': (.35, .65, .5), 'pinky': (.4, .7, .5)}
SPLAY_KEEP = {'index': .5, 'middle': .5, 'ring': .5, 'pinky': .5}
FINGER_GAP, THUMB_GAP = .0015, .0013      # skin clear of the paper: fingers behind it, thumb pad on the front

def _groups(side):
    o = bpy.data.objects[BODY]; gn = {g.index: g.name for g in o.vertex_groups}; out = {}
    for v in o.data.vertices:
        if not v.groups: continue
        n = gn[max(v.groups, key=lambda g: g.weight).group]
        if n.startswith('mixamorig_') and n in arm.data.bones and arm.data.bones[n].parent: n = arm.data.bones[n].parent.name   # left-hand leftovers ride on their game bone
        for f in FINGERS + ('thumb',):
            if n.startswith(f + '_') and n.endswith('_' + side): out.setdefault(f, []).append(v.index); out.setdefault(n, []).append(v.index)
    return out

def _posed(ids):
    o = bpy.data.objects[BODY]; dg = bpy.context.evaluated_depsgraph_get(); e = o.evaluated_get(dg); m = e.to_mesh(); M = o.matrix_world
    out = [M @ m.vertices[i].co for i in ids]; e.to_mesh_clear(); return out

def _sheet_dist(points, outside=0.0, back=False):
    """signed distance to the sheet surface, + = in front (toward the eye); points beyond the sheet's edges get `outside`"""
    S = _world('paper'); Si = S.inverted(); out = []
    for p in points:
        q = Si @ p; u = q.x / (W4 / 2); v = max(-1, min(1, q.y / (H4 / 2))); up = (v + 1) / 2
        if abs(q.x) > W4 / 2 + .001 or abs(q.y) > H4 / 2 + .001: out.append(outside); continue
        # front: above the cockle's crests; back: below its troughs and the sheet's thickness (Solidify grows it backward)
        out.append(q.z - (BOW * u * u - SAG * up ** 3 + (-COCKLE - THICK if back else COCKLE)))
    return out

def _curl(side, f, s, rest):
    for j, k in zip(('01', '02', '03'), CURL_SHARE[f]):
        b = pbone(f'{f}_{j}_{side}')
        if j == '01':
            e = rest.to_euler('XYZ'); e.x = 0; e.y *= SPLAY_KEEP[f]; e.z *= SPLAY_KEEP[f]
            b.rotation_quaternion = e.to_quaternion() @ Quaternion((1, 0, 0), s * k * 2 * CURL_SIGN[side])
        else:
            b.rotation_quaternion = Quaternion((1, 0, 0), s * k * 2 * CURL_SIGN[side])

CURL_SIGN = {'r': 1, 'l': 1}

def fit_fingers(side):
    G = _groups(side)
    # which way is "curl": the one that brings a straight finger's tip toward the sheet (the palm faces the sheet's back)
    tipids = G[f'index_03_{side}']
    for sgn in (1, -1):
        CURL_SIGN[side] = sgn; _curl(side, 'index', .4, Quaternion()); bpy.context.view_layer.update()
        a = max(_sheet_dist(_posed(tipids)))
        _curl(side, 'index', 0, Quaternion()); bpy.context.view_layer.update()
        b = max(_sheet_dist(_posed(tipids)))
        if a > b: break
    res = {}
    for f in FINGERS:
        rest = Quaternion(); best = -.3
        for i in range(80):
            s = -.3 + i * .02; _curl(side, f, s, rest); bpy.context.view_layer.update()
            if max(_sheet_dist(_posed(G[f]), -1, True)) > -FINGER_GAP: break
            best = s
        _curl(side, f, best, rest); bpy.context.view_layer.update(); res[f] = round(best, 2)
    print(side, 'curl sign', CURL_SIGN[side], 'curls', res)
    fit_thumb(side, G)

# ---- pinch grip: the sheet's edge clamped between the thumb pad (front) and the finger pads (back)
# Each finger gets its own three joint curls (and a little abduction) so that its pad presses the sheet's back a little
# in from the edge, with the joints flexed in a natural ratio; the thumb is then fitted so that its pad lies on the front
# right opposite the index/middle pads. (The old fit curled every finger by one scalar until anything touched, which left
# the tips hanging in the air when the knuckle touched first.)
GRIP_REACH = {'index': .018, 'middle': .020, 'ring': .016, 'pinky': .012}   # how far in from the edge each pad presses
GRIP_CURL = {'index': .7, 'middle': .75, 'ring': .8, 'pinky': .85}         # wanted middle-joint flexion (rad): a soft paper grip
GRIP_CURL_PULL = .8
THUMB_REACH = .015                                                         # thumb pad this far in from the edge, on the front

def _sheet_local(p):
    return _world('paper').inverted() @ p

def _back_z(q):
    u = q.x / (W4 / 2); up = (max(-1, min(1, q.y / (H4 / 2))) + 1) / 2
    return BOW * u * u - SAG * up ** 3 - COCKLE - THICK

def _front_z(q):
    u = q.x / (W4 / 2); up = (max(-1, min(1, q.y / (H4 / 2))) + 1) / 2
    return BOW * u * u - SAG * up ** 3 + COCKLE

def _set_finger(side, f, p):
    a, c1, c2, c3 = p; sg = CURL_SIGN[side]
    pbone(f'{f}_01_{side}').rotation_quaternion = Quaternion((0, 0, 1), a) @ Quaternion((1, 0, 0), sg * c1)
    pbone(f'{f}_02_{side}').rotation_quaternion = Quaternion((1, 0, 0), sg * c2)
    pbone(f'{f}_03_{side}').rotation_quaternion = Quaternion((1, 0, 0), sg * c3)

def _finger_cost(side, f, p, G):
    _set_finger(side, f, p); bpy.context.view_layer.update()
    ids = G[f]; tip_ids = set(G[f'{f}_03_{side}'])
    pts = _posed(ids); qs = [_sheet_local(v) for v in pts]
    edge_x = W4 / 2
    pen = 0; tipq = []
    for i, q in zip(ids, qs):
        inside = abs(q.x) <= edge_x and abs(q.y) <= H4 / 2
        if inside:
            d = q.z - _back_z(q)                          # + = in front of the back face (inside the paper or past it)
            pen += max(0, d + FINGER_GAP)
        if i in tip_ids: tipq.append(q)
    c = pen * 3000
    if tipq:
        cen = sum(tipq, Vector()) / len(tipq)
        x_in = edge_x - abs(cen.x)                        # how far in from the side edge the pad is
        c += abs(x_in - GRIP_REACH[f]) * 60
        ins = [q for q in tipq if abs(q.x) <= edge_x]
        if ins:
            contact = max(q.z - _back_z(q) for q in ins)  # the pad's closest point to the back face
            c += abs(contact + FINGER_GAP) * 400
        else:
            c += .5
    a, c1, c2, c3 = p
    c += 2 * (c3 - .75 * c2) ** 2 + .6 * (c1 - .8 * c2) ** 2 + .5 * a * a          # joints flex together, like a relaxed hand
    c += GRIP_CURL_PULL * (c2 - GRIP_CURL[f]) ** 2                                  # a soft curl around the edge, not a flat palm
    c += sum(max(0, -x) for x in (c1, c2, c3)) * 5 + sum(max(0, x - 1.4) for x in (c1, c2, c3)) * 5   # no hyperextension, no fist
    return c

def fit_grip_fingers(side):
    G = _groups(side)
    # curl sign: the one that brings the index tip toward the sheet's back
    tip = G[f'index_03_{side}']
    for sgn in (1, -1):
        CURL_SIGN[side] = sgn; _set_finger(side, 'index', (0, .4, .4, .3)); bpy.context.view_layer.update()
        a = max(_sheet_local(v).z for v in _posed(tip))
        _set_finger(side, 'index', (0, 0, 0, 0)); bpy.context.view_layer.update()
        b = max(_sheet_local(v).z for v in _posed(tip))
        if a > b: break
    res = {}
    for f in FINGERS:
        best = None
        for c0 in (.2, .45, .7, .95):
            p = [0, c0 * .8, c0, c0 * .75]; cb = _finger_cost(side, f, p, G); step = [.08, .15, .15, .15]
            for it in range(7):
                for k in range(4):
                    for sg in (1, -1):
                        q = p[:]; q[k] += sg * step[k]; cq = _finger_cost(side, f, q, G)
                        if cq < cb: cb, p = cq, q
                step = [x * .6 for x in step]
            if best is None or cb < best[0]: best = (cb, p)
        _set_finger(side, f, best[1]); bpy.context.view_layer.update(); res[f] = ([round(x, 2) for x in best[1]], round(best[0], 3))
    print(side, 'curl sign', CURL_SIGN[side], res)
    return G

def fit_grip_thumb(side, G):
    """thumb pad on the front of the sheet, opposite the index/middle pads"""
    ids3 = G.get(f'thumb_03_{side}', []); ids = G.get(f'thumb_02_{side}', []) + ids3
    # the sheet is pinched between the thumb pad and the index finger's last two segments (where a real pinch presses),
    # but never closer than 1.2 cm to the edge, so the edge is really inside the grip
    # (this hand's thumb reaches the front ~1.5 cm in from the edge, level with the middle/ring pads behind: the edge is
    #  clamped there; the height is a soft pull, the depth in from the edge a firm one)
    pads = [_sheet_local(v) for f in FINGERS for v in _posed(G[f'{f}_03_{side}'])]
    pc = sum(pads, Vector()) / len(pads)
    sg = 1 if pc.x > 0 else -1
    target = Vector((sg * (W4 / 2 - THUMB_REACH), pc.y))
    set3 = set(ids3)
    def setp(p):
        pbone(f'thumb_01_{side}').rotation_quaternion = Euler((p[0], p[1], p[2])).to_quaternion()
        # this rig's thumb joints flex about their local Z (X only swings the thumb off the page)
        pbone(f'thumb_02_{side}').rotation_quaternion = Quaternion((0, 0, 1), p[3])
        pbone(f'thumb_03_{side}').rotation_quaternion = Quaternion((0, 0, 1), p[4])
    def cost(p):
        setp(p); bpy.context.view_layer.update()
        qs = [_sheet_local(v) for v in _posed(ids)]
        c = 0; padq = []
        for i, q in zip(ids, qs):
            if abs(q.x) <= W4 / 2 and abs(q.y) <= H4 / 2:
                d = q.z - _front_z(q)                     # + = in front of the sheet
                c += max(0, THUMB_GAP - d) * 3000
            if i in set3: padq.append(q)
        cen = sum(padq, Vector()) / len(padq)
        c += abs(cen.x - target.x) * 80 + abs(cen.y - target.y) * 15
        ins = [q for q in padq if abs(q.x) <= W4 / 2]
        if ins: c += abs(min(q.z - _front_z(q) for q in ins) - THUMB_GAP) * 400
        else: c += .5
        c += (max(0, abs(p[3]) - .9) + max(0, abs(p[4]) - 1.1)) * .5 + .05 * (p[3] - p[4]) ** 2
        return c
    import itertools
    def descend(p, step, iters):
        best = cost(p)
        for it in range(iters):
            for k in range(5):
                for sg in (1, -1):
                    q = p[:]; q[k] += sg * step[k]; cq = cost(q)
                    if cq < best: best, p = cq, q
            step = [x * .6 for x in step]
        return best, p
    grid = [-1, -.75, -.5, -.25, 0, .25, .5, .75, 1]
    starts = sorted(([a, 0, c, f, f] for a in grid for c in grid for f in (-.8, -.4, 0, .4, .8)), key=cost)[:6]
    tried = sorted((descend(s, [.15] * 5, 5) for s in starts), key=lambda r: r[0])
    best, p = descend(tried[0][1], [.08] * 5, 8)
    for sg in (1, -1):                                     # the thumb's joint sign may be either: try flipping 02/03
        q = p[:]; q[3], q[4] = -q[3], -q[4]; b2, q = descend(q, [.1] * 5, 5)
        if b2 < best: best, p = b2, q
    setp(p); bpy.context.view_layer.update()
    padq = [_sheet_local(v) for v in _posed(ids3)]; cen = sum(padq, Vector()) / len(padq)
    print(side, 'thumb', [round(x, 2) for x in p], 'cost', round(best, 3), 'pad vs fingers cm', round((Vector((cen.x, cen.y)) - target).length * 100, 2),
          'pad gap mm', round(min(q.z - _front_z(q) for q in padq) * 1000, 2))

def fit_grip(side):
    G = fit_grip_fingers(side); fit_grip_thumb(side, G)

def _ang_x(q): return 2 * math.atan2(q.x, q.w)

def mirror_fingers(src='r', dst='l'):
    """the other hand's finger rotations, reflected (the left frames are the right ones mirrored across X: (w, x, -y, -z))"""
    for f in FINGERS + ('thumb',):
        for j in ('01', '02', '03'):
            q = pbone(f'{f}_{j}_{src}').rotation_quaternion; pbone(f'{f}_{j}_{dst}').rotation_quaternion = Quaternion((q.w, q.x, -q.y, -q.z))
    bpy.context.view_layer.update()

def fit_thumb(side, G, from_current=False):
    ids = G.get(f'thumb_02_{side}', []) + G.get(f'thumb_03_{side}', [])
    near = [i for f in ('index',) for i in G[f]][::4]
    root = head(f'thumb_01_{side}')
    S = _world('paper'); xs = (S.to_3x3().col[0]).normalized(); ys = S.to_3x3().col[1].normalized(); n = S.to_3x3().col[2].normalized()
    edge = (W4 / 2 - PINCH_IN) * (1 if side == 'r' else -1)
    T = S.translation + xs * edge + ys * PINCH_LOW + n * .009
    base = pbone(f'thumb_01_{side}').rotation_quaternion.copy() if from_current else Quaternion()
    p0 = [0, 0, 0, _ang_x(pbone(f'thumb_02_{side}').rotation_quaternion), _ang_x(pbone(f'thumb_03_{side}').rotation_quaternion)]
    def setp(p):
        e1 = base.to_euler('XYZ'); e1.x += p[0]; e1.y += p[1]; e1.z += p[2]
        pbone(f'thumb_01_{side}').rotation_quaternion = e1.to_quaternion()
        pbone(f'thumb_02_{side}').rotation_quaternion = Quaternion((1, 0, 0), p[3])
        pbone(f'thumb_03_{side}').rotation_quaternion = Quaternion((1, 0, 0), p[4])
    def cost(p):
        setp(p); bpy.context.view_layer.update(); a = _posed(ids); b = _posed(near)
        tip = max(a, key=lambda v: (v - root).length)
        c = (tip - T).length * 10 + sum(max(0, THUMB_GAP - d) for d in _sheet_dist(a, 1)) * 40
        c += sum(max(0, .009 - min((v - w).length for w in b)) for v in a[::3]) * 30
        c += (max(0, abs(p[3]) - .5) + max(0, abs(p[4]) - .6)) * .05
        return c
    def descend(p, step, iters):
        best = cost(p)
        for it in range(iters):
            for k in range(5):
                for sg in (1, -1):
                    q = p[:]; q[k] += sg * step[k]; cq = cost(q)
                    if cq < best: best, p = cq, q
            step = [x * .6 for x in step]
        return best, p
    import itertools, random
    random.seed(7)
    if from_current:
        best, p = descend(p0, [.08] * 5, 9)
    else:
        starts = [[a, b, c, .2, .2] for a, b, c in itertools.product((-.6, 0, .6), (-.6, 0, .6), (-.6, 0, .6))]
        tried = sorted((descend(s, [.25] * 5, 3) for s in starts), key=lambda r: r[0])
        best, p = descend(tried[0][1], [.15] * 5, 8)
    setp(p); bpy.context.view_layer.update()
    a = _posed(ids); tip = max(a, key=lambda v: (v - root).length)
    print(side, 'thumb', [round(x, 3) for x in p], 'cost', round(best, 4), 'tip miss', round((tip - T).length, 4), 'min front', round(min(_sheet_dist(a, 1)), 4))

# ------------------------------------------------------------------ the sheet: Geometry Nodes (grid, hand bow, sag, dog-eared corner, fine cockle) + Solidify
BOW, SAG, DOG, COCKLE, THICK = .007, .006, .012, .0007, .0005    # 0.5 mm: a sheet with a real edge to pinch

def make_paper():
    ng = bpy.data.node_groups.get('PaperSheet') or bpy.data.node_groups.new('PaperSheet', 'GeometryNodeTree')
    ng.nodes.clear()
    for it in list(ng.interface.items_tree): ng.interface.remove(it)
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    for name, val in (('Width', W4), ('Height', H4), ('Bow', BOW), ('Sag', SAG), ('DogEar', DOG), ('Cockle', COCKLE)):
        s = ng.interface.new_socket(name, in_out='INPUT', socket_type='NodeSocketFloat'); s.default_value = val
    N = ng.nodes; L = ng.links
    gi = N.new('NodeGroupInput'); go = N.new('NodeGroupOutput')
    grid = N.new('GeometryNodeMeshGrid'); grid.inputs['Vertices X'].default_value = 15; grid.inputs['Vertices Y'].default_value = 21
    L.new(gi.outputs['Width'], grid.inputs['Size X']); L.new(gi.outputs['Height'], grid.inputs['Size Y'])
    pos = N.new('GeometryNodeInputPosition'); sep = N.new('ShaderNodeSeparateXYZ'); L.new(pos.outputs[0], sep.inputs[0])
    def math(op, a, b=None, v=None):
        m = N.new('ShaderNodeMath'); m.operation = op
        for i, x in enumerate((a, b)):
            if x is None: continue
            if isinstance(x, (int, float)): m.inputs[i].default_value = x
            else: L.new(x, m.inputs[i])
        return m.outputs[0]
    halfw = math('MULTIPLY', gi.outputs['Width'], .5); halfh = math('MULTIPLY', gi.outputs['Height'], .5)
    u = math('DIVIDE', sep.outputs['X'], halfw)                      # -1..1 across
    v = math('DIVIDE', sep.outputs['Y'], halfh)                      # -1..1 up
    # the hands pull the side edges a little toward the eye: a shallow cylinder
    bow = math('MULTIPLY', math('MULTIPLY', u, u), gi.outputs['Bow'])
    # the free top leans back under its own weight
    up01 = math('MULTIPLY', math('ADD', v, 1), .5)
    sag = math('MULTIPLY', math('MULTIPLY', math('MULTIPLY', up01, up01), up01), math('MULTIPLY', gi.outputs['Sag'], -1))
    # the upper left corner is dog-eared: it curls toward the eye
    cu = math('MAXIMUM', math('SUBTRACT', math('MULTIPLY', math('SUBTRACT', 0, u), .5), -.5), 0)    # 0 .. 1 toward the left edge
    cv = math('MAXIMUM', math('SUBTRACT', v, 0), 0)
    corner = math('POWER', math('MAXIMUM', math('SUBTRACT', math('ADD', cu, cv), 1.55), 0), 2)
    dog = math('MULTIPLY', math('MULTIPLY', corner, 4.5), gi.outputs['DogEar'])
    # fine cockle of paper that has been damp and dried
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 9; nz.inputs['Detail'].default_value = 3; nz.inputs['Roughness'].default_value = .55
    L.new(pos.outputs[0], nz.inputs['Vector'])
    ck = math('MULTIPLY', math('SUBTRACT', nz.outputs['Fac'], .5), math('MULTIPLY', gi.outputs['Cockle'], 2))
    z = math('ADD', math('ADD', bow, sag), math('ADD', dog, ck))
    off = N.new('ShaderNodeCombineXYZ'); L.new(z, off.inputs['Z'])
    sp = N.new('GeometryNodeSetPosition'); L.new(grid.outputs['Mesh'], sp.inputs['Geometry']); L.new(off.outputs[0], sp.inputs['Offset'])
    st = N.new('GeometryNodeStoreNamedAttribute'); st.data_type = 'FLOAT2'; st.domain = 'CORNER'; st.inputs['Name'].default_value = 'UVMap'
    L.new(sp.outputs[0], st.inputs['Geometry']); L.new(grid.outputs['UV Map'], st.inputs['Value'])
    sm = N.new('GeometryNodeSetShadeSmooth'); L.new(st.outputs[0], sm.inputs['Geometry'])
    L.new(sm.outputs[0], go.inputs['Geometry'])
    me = bpy.data.meshes.get('PaperMesh') or bpy.data.meshes.new('PaperMesh')
    o = bpy.data.objects['Paper']; old = o.data; o.data = me
    if old and old.users == 0 and old != me: bpy.data.meshes.remove(old)
    for m in list(o.modifiers): o.modifiers.remove(m)
    gm = o.modifiers.new('PaperSheet', 'NODES'); gm.node_group = ng
    so = o.modifiers.new('Thickness', 'SOLIDIFY'); so.thickness = THICK; so.offset = -1; so.material_offset = 1; so.material_offset_rim = 1; so.use_even_offset = True
    me.materials.clear()
    for name, col in (('Paper', (.80, .77, .68, 1)), ('PaperBack', (.70, .67, .58, 1))):
        m = bpy.data.materials.get(name) or bpy.data.materials.new(name); m.use_nodes = True
        bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        bsdf.inputs['Base Color'].default_value = col; bsdf.inputs['Roughness'].default_value = .93
        me.materials.append(m)
    o.matrix_world = arm.matrix_world @ pbone('paper').matrix
    return o

def build():
    bpy.context.view_layer.objects.active = arm
    if bpy.context.mode != 'OBJECT': bpy.ops.object.mode_set(mode='OBJECT')
    clear_pose()
    for b in arm.pose.bones:
        for c in list(b.constraints): b.constraints.remove(c)
    # hand frame -> hand bone, measured on the rest pose (rigid inside the hand)
    off = {s: hand_frame(s).inverted() @ (arm.matrix_world @ pbone(f'hand_{s}').matrix) for s in 'rl'}
    rel = Matrix(json.load(open(SCRATCH_REL))['hand_in_sheet'])          # right hand in the one-hand sheet frame (bottom-right corner grip)
    # the one-hand pinch point in that frame (the thumb tip lay 3 cm in from the right edge, 2.3 cm above the bottom)
    p_old = Vector((.071, -.118, 0))
    S = sheet_frame()
    def hand_in_sheet(side, width):
        p_new = Vector((width / 2 - PINCH_IN, PINCH_LOW, 0))
        m = Matrix.Translation(p_new) @ Matrix.Rotation(HAND_TURN, 4, 'Z') @ Matrix.Translation(-p_old) @ rel
        if side == 'l':
            Sx = Matrix.Diagonal((-1, 1, 1, 1)); m = Sx @ m @ Matrix.Diagonal((1, 1, -1, 1))
        return m
    targets = {s: S @ hand_in_sheet(s, W4) @ off[s] for s in 'rl'}
    # --- bones
    bpy.ops.object.mode_set(mode='EDIT'); eb = arm.data.edit_bones
    for n in ('paper', 'ik_hand_r', 'ik_hand_l', 'pole_r', 'pole_l'):
        if n in eb: eb.remove(eb[n])
    inv = arm.matrix_world.inverted()
    def mk(name, mat, parent=None, length=.06):
        b = eb.new(name); b.head = (0, 0, 0); b.tail = (0, length, 0); b.matrix = inv @ mat; b.length = length
        b.parent = eb[parent] if parent else None; b.use_deform = False; return b
    mk('paper', S, length=.1)
    for s in 'rl':
        mk(f'ik_hand_{s}', targets[s], 'paper', .05)
        sh = arm.matrix_world @ arm.data.bones[f'upperarm_{s}'].head_local
        sgn = -1 if s == 'r' else 1
        mk(f'pole_{s}', Matrix.Translation(sh + Vector((sgn * .42, -.05, -.42))), None, .04)
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.context.view_layer.update()
    solve_arms()
    for s in 'rl':
        print(s, 'wrist error', round((head(f'hand_{s}') - targets[s].translation).length, 4),
              'elbow', [round(v, 3) for v in head(f'lowerarm_{s}')])
    # the eye as an empty (exported, the game puts its camera there) and a preview camera with the in-game lens
    e = bpy.data.objects.get('EYE') or bpy.data.objects.new('EYE', None)
    if e.name not in bpy.context.scene.collection.objects: bpy.context.scene.collection.objects.link(e)
    e.empty_display_size = .03; e.location = eye()
    cam = bpy.data.objects.get('INSPECT_CAM')
    if not cam:
        cam = bpy.data.objects.new('INSPECT_CAM', bpy.data.cameras.new('INSPECT_CAM')); bpy.context.scene.collection.objects.link(cam)
    cam.data.sensor_fit = 'HORIZONTAL'; cam.data.angle = math.radians(90); cam.data.clip_start = .01
    cam.location = eye(); cam.rotation_euler = Euler((math.radians(90), 0, math.pi))   # looking down -Y, up +Z
    bpy.context.scene.camera = cam
    sc = bpy.context.scene; sc.render.resolution_x, sc.render.resolution_y = 1280, 720
    return targets

# ------------------------------------------------------------------ animation: the sheet bone is keyed (ctrl_* actions), the arms are solved onto it every frame and baked
# paper bone pose, in its own rest frame: x = reader's right, y = up the page, z = toward the eye. Rotations in radians (XYZ).
LOW = ((0, -.36, -.06), (-.95, 0, 0))                # down at the belly, face up: where the sheet comes from and goes back to
                                                     # (lower and a little away rather than into the chest: there the hands ended at the
                                                     #  shoulders and the left wrist had to fold ~60°)
OPEN = [(1, *LOW), (9, (.008, -.07, .035), (-.22, .03, -.035)), (15, (0, .006, -.004), (.03, 0, .01)), (20, (0, 0, 0), (0, 0, 0))]
CLOSE = [(1, (0, 0, 0), (0, 0, 0)), (5, (0, -.035, .01), (-.10, .01, -.02)), (14, *LOW)]
IDLE_LEN = 96                                        # 4 s loop: breathing, a slow drift of the hands, a slight see-saw

def idle_pose(f):
    t = (f - 1) / IDLE_LEN * 2 * math.pi
    loc = (.0012 * math.sin(2 * t + .4), .0022 * math.sin(t), .0012 * math.sin(t + 1.1))
    rot = (.006 * math.sin(t + .3), .004 * math.sin(2 * t + 1.7), .005 * math.sin(t + 2.2))
    return loc, rot

def _key_ctrl(name, keys, cyclic=False, ease=True):
    act = bpy.data.actions.get(name) or bpy.data.actions.new(name); act.use_fake_user = True
    for fc in list(act.fcurves): act.fcurves.remove(fc)
    pb = pbone('paper'); pb.rotation_mode = 'XYZ'
    arm.animation_data_create(); arm.animation_data.action = act
    for f, loc, rot in keys:
        pb.location = loc; pb.rotation_euler = rot
        pb.keyframe_insert('location', frame=f, group='paper'); pb.keyframe_insert('rotation_euler', frame=f, group='paper')
    for fc in act.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = 'BEZIER'; kp.handle_left_type = kp.handle_right_type = 'AUTO_CLAMPED'
            if ease: kp.easing = 'AUTO'
        if cyclic: fc.modifiers.new('CYCLES')
    return act

def author():
    _key_ctrl('ctrl_open', OPEN)
    _key_ctrl('ctrl_close', CLOSE)
    _key_ctrl('ctrl_idle', [(f, *idle_pose(f)) for f in range(1, IDLE_LEN + 2, 4)], cyclic=True)

ARM_BONES = [f'{n}_{s}' for s in 'rl' for n in ('upperarm', 'lowerarm', 'hand')]
FINGER_BONES = [f'{f}_{j}_{s}' for s in 'rl' for f in FINGERS + ('thumb',) for j in ('01', '02', '03')]

# The ik_hand rest has the hand square to the page; turned like that the wrist had to bend ~60° and twist ~50°.
# Rolling the hand about the thumb pinch (in the sheet plane, then about the page's up axis) lines the hand up with
# the forearm that the solver's elbow swivel gives: wrist bend < 5°, twist ~16° (taken up by the forearm).
GRIP_ROLL, GRIP_YAW, GRIP_PITCH = -30, -20, 0
# and slid toward the sheet (x = outward from the edge, z = toward the eye): the knuckles sat 3-4 cm behind the page, so the
# finger pads could only meet it 5-8 cm in from the edge and the hand read as posed near the sheet instead of holding it
GRIP_SHIFT = Vector((.02, 0, -.025))

def grip_rel(s, rel):
    sg = 1 if s == 'r' else -1
    piv = Vector((sg * (W4 / 2 - PINCH_IN), PINCH_LOW, 0))
    sh = Vector((sg * GRIP_SHIFT.x, GRIP_SHIFT.y, GRIP_SHIFT.z))
    return (Matrix.Translation(sh) @ Matrix.Translation(piv) @ Matrix.Rotation(math.radians(sg * GRIP_ROLL), 4, 'Z')
            @ Matrix.Rotation(math.radians(sg * GRIP_YAW), 4, 'Y') @ Matrix.Rotation(math.radians(GRIP_PITCH), 4, 'X')
            @ Matrix.Translation(-piv) @ rel)

def bake():
    sc = bpy.context.scene; sc.render.fps = FPS
    # the hands' place on the sheet, from the IK bones' rest pose
    P0 = arm.matrix_world @ arm.data.bones['paper'].matrix_local
    REL = {s: grip_rel(s, P0.inverted() @ (arm.matrix_world @ arm.data.bones[f'ik_hand_{s}'].matrix_local)) for s in 'rl'}
    fingers = {n: pbone(n).rotation_quaternion.copy() for n in FINGER_BONES}
    # clips key only arms, fingers and the sheet: everything else (clavicles, spine) must be at rest while solving,
    # as it is in the game, or a stale clavicle from an earlier action skews the shoulder and the wrist solve
    arm.animation_data.action = None; clear_pose()
    made = []
    for clip, ctrl, last in (('open', 'ctrl_open', OPEN[-1][0]), ('idle', 'ctrl_idle', IDLE_LEN + 1), ('close', 'ctrl_close', CLOSE[-1][0])):
        for g, width in GRIPS.items():
            dx = (width - W4) / 2
            rec = []; swivel = {'r': None, 'l': None}
            arm.animation_data.action = bpy.data.actions[ctrl]; pbone('paper').rotation_mode = 'XYZ'
            for f in range(1, last + 1):
                sc.frame_set(f)
                for n, q in fingers.items(): pbone(n).rotation_quaternion = q
                Pw = _world('paper')
                for s in 'rl':
                    swivel[s] = solve_arm(s, Pw @ Matrix.Translation((dx if s == 'r' else -dx, 0, 0)) @ REL[s], prev=swivel[s])[1]
                pp = pbone('paper')
                rec.append({**{n: pbone(n).rotation_quaternion.copy() for n in ARM_BONES},
                            'paper': (pp.location.copy(), pp.matrix_basis.to_quaternion())})
            name = f'paper_{clip}_{g}'
            old = bpy.data.actions.get(name)                 # a fresh action: emptying a slotted 4.5 action left stale keys behind
            if old: bpy.data.actions.remove(old)
            act = bpy.data.actions.new(name); act.use_fake_user = True
            def put(path, idx, frame, val, grp):
                fc = act.fcurves.find(path, index=idx) or act.fcurves.new(path, index=idx, action_group=grp)
                fc.keyframe_points.insert(frame, val, options={'FAST'}).interpolation = 'LINEAR'
            for i, r in enumerate(rec):
                fr = i + 1
                for n in ARM_BONES:
                    q = r[n]
                    for k in range(4): put(f'pose.bones["{n}"].rotation_quaternion', k, fr, q[k], n)
                loc, q = r['paper']
                for k in range(3): put('pose.bones["paper"].location', k, fr, loc[k], 'paper')
                for k in range(4): put('pose.bones["paper"].rotation_quaternion', k, fr, q[k], 'paper')
            for n, q in fingers.items():                      # the grip holds still: one key at each end
                for fr in (1, len(rec)):
                    for k in range(4): put(f'pose.bones["{n}"].rotation_quaternion', k, fr, q[k], n)
            for fc in act.fcurves: fc.update()
            made.append(name)
    arm.animation_data.action = None
    print('baked', made)
    return made

def _strip(js, binb, keep):
    """only the channels of the bones the clips really move; no skin (no skinned mesh is exported); the buffer repacked"""
    names = [n.get('name') for n in js['nodes']]
    for a in js['animations']:
        ch = [c for c in a['channels'] if names[c['target']['node']] in keep]
        used = sorted({c['sampler'] for c in ch}); remap = {o: i for i, o in enumerate(used)}
        a['samplers'] = [a['samplers'][i] for i in used]
        for c in ch: c['sampler'] = remap[c['sampler']]
        a['channels'] = ch
    js.pop('skins', None)
    for n in js['nodes']: n.pop('skin', None)
    acc_used = set()
    for m in js.get('meshes', []):
        for p in m['primitives']:
            acc_used.update(p['attributes'].values())
            if 'indices' in p: acc_used.add(p['indices'])
    for a in js['animations']:
        for s in a['samplers']: acc_used.update((s['input'], s['output']))
    acc_list = sorted(acc_used); acc_map = {o: i for i, o in enumerate(acc_list)}
    out = bytearray(); views = []
    for o in acc_list:
        acc = js['accessors'][o]; bv = js['bufferViews'][acc['bufferView']]
        start = bv.get('byteOffset', 0); chunk = binb[start:start + bv['byteLength']]
        while len(out) % 4: out.append(0)
        nv = {k: v for k, v in bv.items() if k not in ('byteOffset',)}; nv['byteOffset'] = len(out); nv['buffer'] = 0
        out += chunk; acc['bufferView'] = len(views); views.append(nv)
    js['accessors'] = [js['accessors'][o] for o in acc_list]; js['bufferViews'] = views
    for m in js.get('meshes', []):
        for p in m['primitives']:
            p['attributes'] = {k: acc_map[v] for k, v in p['attributes'].items()}
            if 'indices' in p: p['indices'] = acc_map[p['indices']]
    for a in js['animations']:
        for s in a['samplers']: s['input'] = acc_map[s['input']]; s['output'] = acc_map[s['output']]
    while len(out) % 4: out.append(0)
    js['buffers'] = [{'byteLength': len(out)}]
    return js, bytes(out)

def export():
    """run after bake() on a saved file: strips everything but the baked clips, exports, then reopens the authoring file"""
    src = bpy.data.filepath
    bpy.ops.wm.save_mainfile()
    keep = {a.name for a in bpy.data.actions if a.name.startswith('paper_')}
    for a in list(bpy.data.actions):
        if a.name not in keep: bpy.data.actions.remove(a)
    pbone('paper').rotation_mode = 'QUATERNION'
    clear_pose()
    for n in sorted(keep): arm.animation_data.action = bpy.data.actions[n]      # binds an action slot to the armature (4.4+), else the exporter skips it
    arm.animation_data.action = bpy.data.actions['paper_idle_a4']; bpy.context.scene.frame_set(1)
    paper = bpy.data.objects['Paper']; e = bpy.data.objects['EYE']
    for o in bpy.data.objects: o.select_set(False)
    for o in (arm, paper, e): o.hide_set(False); o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='ACTIONS',
        export_force_sampling=True, export_frame_range=False, export_skins=True, export_yup=True, export_apply=True, export_cameras=False,
        export_lights=False, export_image_format='NONE', export_optimize_animation_size=True, export_def_bones=False, export_texcoords=True, export_normals=True)
    # the sheet hangs on the paper bone at its head, its mesh in the bone's own axes (same patch as the torch props of torch_game.py)
    Cm = Matrix(((1, 0, 0), (0, 0, 1), (0, -1, 0))); qc = Cm.inverted().to_quaternion()
    data = open(OUT, 'rb').read(); jl = struct.unpack('<I', data[12:16])[0]; js = json.loads(data[20:20 + jl].decode('utf-8'))
    bo = 20 + jl; bl = struct.unpack('<I', data[bo:bo + 4])[0]; binb = data[bo + 8:bo + 8 + bl]
    for n in js['nodes']:
        if n.get('name') == 'Paper': n['translation'] = [0, 0, 0]; n['rotation'] = [qc.x, qc.y, qc.z, qc.w]; n['scale'] = [1, 1, 1]
    js, binb = _strip(js, binb, set(ARM_BONES + FINGER_BONES + ['paper']))
    jb = json.dumps(js, separators=(',', ':')).encode('utf-8'); jb += b' ' * (-len(jb) % 4)
    open(OUT, 'wb').write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(jb) + 8 + len(binb)) + struct.pack('<II', len(jb), 0x4E4F534A) + jb + struct.pack('<II', len(binb), 0x004E4942) + bytes(binb))
    print('exported', OUT, os.path.getsize(OUT), [a['name'] for a in js.get('animations', [])], 'nodes', len(js['nodes']), 'skins', len(js.get('skins', [])))
    bpy.ops.wm.open_mainfile(filepath=src)
