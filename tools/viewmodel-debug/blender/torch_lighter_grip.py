# blender -b art/mixamo-hold.blend --python tools/viewmodel-debug/blender/torch_lighter_grip.py -> art/torch/lighter_grip.json + docs/viewmodel-grip/torch/lgrip_*.png
exec(open(r"C:\Users\libde\100gate\tools\viewmodel-debug\blender\torch_rig.py", encoding='utf-8').read())
from mathutils.bvhtree import BVHTree
import itertools
OUTD = r"C:\Users\libde\100gate\docs\viewmodel-grip\torch"; os.makedirs(OUTD, exist_ok=True)
# one temporary mesh with the whole lighter (lid closed) for the contact tests
bpy.ops.object.select_all(action='DESELECT')
dups = []
for o in (l_body, l_lid, l_ins, l_det):
    d = o.copy(); d.data = o.data.copy(); sc.collection.objects.link(d); dups.append(d); d.select_set(True)
bpy.context.view_layer.objects.active = dups[0]; bpy.ops.object.join(); lt = bpy.context.view_layer.objects.active; lt.name = 'LighterTest'
for o in (l_body, l_lid, l_ins, l_det, l_piv, l_wick, torch): o.hide_set(True); o.hide_render = True
lean_pose(0); solve_arm(FL_HOLD @ G.inverted())               # the arm out in front: easy to look at
names = {vg.index: vg.name for vg in BODY.vertex_groups}
def part(v):
    if not v.groups: return ''
    n = names[max(v.groups, key=lambda g: g.weight).group]; return n
GROUPS = {f: [v.index for v in BODY.data.vertices if part(v).startswith(f'mixamorig_RightHand{f}')] for f in FING}
GROUPS['Palm'] = [v.index for v in BODY.data.vertices if part(v) == 'mixamorig_RightHand_037']
def set_curls(cur, sp=None):
    for f, c in cur.items():
        for i in range(3): fb(f, i).rotation_quaternion = qz((sp or {}).get(f, 0) if i == 0 else 0) @ qx(c[i])
    bpy.context.view_layer.update()
def lstats():
    dgp = bpy.context.evaluated_depsgraph_get(); fe = lt.evaluated_get(dgp); tree = BVHTree.FromObject(fe, dgp); inv = fe.matrix_world.inverted()
    be = BODY.evaluated_get(dgp); me = be.to_mesh(); MB = be.matrix_world; out = {}
    for k, idx in GROUPS.items():
        t = d = 0; mn = 9
        for i in idx:
            o = inv @ (MB @ me.vertices[i].co); loc, nor, ix, dist = tree.find_nearest(o)
            if loc is None: continue
            ins = (o - loc).dot(nor) < 0
            if dist < 0.003: t += 1
            if ins and dist < 0.02: d += dist > 0.0015; mn = min(mn, -dist)
        out[k] = (t, d)
    be.to_mesh_clear(); return out
HFm = hand_frame(); O = H(HA)
def place(cx, cy, cz, Rl):
    """lighter frame -> hand frame: lighter origin at (cx,cy,cz) of the hand frame, rotated by Rl (3x3, lighter axes -> hand axes)"""
    G4 = Rl.to_4x4(); G4.translation = Vector((cx, cy, cz)); M = HFm.to_4x4(); M.translation = O
    lt.matrix_world = M @ G4; bpy.context.view_layer.update(); return G4
HAND_LEN = (H('RightHandMiddle1_038') - O).length
# lighter axes: X thickness, Y width, Z height (lid up). Candidate orientations: lid toward the fingertips or toward the thumb side
cands = {
 'lid_distal':  Matrix(((0, 0, 1), (0, 1, 0), (-1, 0, 0))).transposed(),     # lighter Z -> hand +x (distal)... built as columns below
}
def basis(zx, yx, xx): return Matrix((xx, yx, zx)).transposed()               # columns = images of lighter X, Y, Z
ex, ey, ez = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
ORI = {
 'lid_distal_front_palm': basis(ex, ey, -ez),            # Z->distal, Y->radial, X->-z (thickness into the palm)
 'lid_distal_front_back': basis(ex, ey, ez),
 'lid_radial':            basis(ey, ex, -ez),            # Z->radial
 'lid_distal_flip':       basis(ex, -ey, ez),
}
best = None
for oname, Rl in ORI.items():
    for s in (0.55, 0.7, 0.85):
        cur = {'Index': (1.0 * s, 1.3 * s, 0.9 * s), 'Middle': (1.15 * s, 1.35 * s, 0.9 * s), 'Ring': (1.25 * s, 1.4 * s, 0.9 * s), 'Pinky': (1.3 * s, 1.4 * s, 0.9 * s), 'Thumb': (0.15, 0.2, 0.1)}
        set_curls(cur)
        for cx, cy, cz in itertools.product(HAND_LEN * np.array((0.3, 0.45, 0.6)), (-0.012, 0.0, 0.012), (-0.045, -0.035, -0.025)):
            place(cx, cy, cz, Rl); st = lstats()
            touch = sum(st[k][0] for k in ('Index', 'Middle', 'Ring', 'Pinky', 'Palm')); deep = sum(st[k][1] for k in st)
            score = touch - 6 * deep + 3 * st['Thumb'][0] * 0
            if best is None or score > best[0]: best = (score, oname, s, (cx, cy, cz), touch, deep)
print('best lighter grip', best)
score, oname, s, (cx, cy, cz), touch, deep = best
Rl = ORI[oname]; cur = {'Index': (1.0 * s, 1.3 * s, 0.9 * s), 'Middle': (1.15 * s, 1.35 * s, 0.9 * s), 'Ring': (1.25 * s, 1.4 * s, 0.9 * s), 'Pinky': (1.3 * s, 1.4 * s, 0.9 * s), 'Thumb': (0.15, 0.2, 0.1)}
set_curls(cur); G4 = place(cx, cy, cz, Rl)
json.dump({'G': [list(r) for r in G4], 'curls': {k: list(v) for k, v in cur.items()}, 'orientation': oname}, open(r"C:\Users\libde\100gate\art\torch\lighter_grip.json", 'w'), indent=1)
# show it: lighter parts visible at the fitted pose
for o in (l_body, l_lid, l_ins, l_det): o.hide_set(False); o.hide_render = False; o.matrix_world = lt.matrix_world
lt.hide_set(True); lt.hide_render = True
co = bpy.data.objects['shot']; sc.camera = co; sc.render.resolution_x, sc.render.resolution_y = 900, 700
c = lt.matrix_world.translation
for n, off in (('a', (0.25, -0.25, 0.15)), ('b', (-0.25, -0.25, 0.1)), ('c', (0.0, -0.3, 0.3)), ('d', (-0.3, 0.1, 0.1))):
    l = c + Vector(off); co.data.lens = 90; co.location = l; co.rotation_euler = (c - l).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = rf"{OUTD}\lgrip_{n}.png"; bpy.ops.render.render(write_still=True)
print('done')
