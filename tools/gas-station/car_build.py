"""The abandoned sedan at the pumps (replaces the first box-shaped car).  A lofted, smooth body (tub + tapered cabin, wheel arches, hood/trunk
profile), real glass with a seen interior (dash, seats, wheel), lathed wheels (one flat), chrome bumpers, round headlights, grille, plates with lettering,
rust/dirt paint, and an open trunk: hollow cavity with a spare wheel, tool box, jerry can, blanket and the folded MAP of the location.
Frame: x forward, y left, z up; root empty 'Car_Root' placed beside pump 1.
Run through the Blender MCP (needs world_build.py's head, run by it): exec(open(r"C:\\Users\\libde\\100gate\\tools\\gas-station\\car_build.py", encoding="utf-8").read())
"""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix, Euler

random.seed(9)
for o in list(bpy.data.objects):
    if o.name.startswith('Car_') or o.name == 'Car_Root': bpy.data.objects.remove(o, do_unlink=True)
CC = bpy.data.collections.get('World') or bpy.data.collections.new('World')
if CC.name not in bpy.context.scene.collection.children: bpy.context.scene.collection.children.link(CC)

def N(nt, t, x, y, **kw):
    n = nt.nodes.new(t); n.location = (x, y)
    for k, v in kw.items(): setattr(n, k, v)
    return n
def ramp(nt, x, y, stops):
    r = N(nt, 'ShaderNodeValToRGB', x, y); els = r.color_ramp.elements
    while len(els) < len(stops): els.new(1.0)
    for e, (p, c) in zip(els, stops): e.position = p; e.color = c
    return r
def lk(nt, a, b, i=0, j=0): nt.links.new(a.outputs[i], b.inputs[j])
def newm(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = N(nt, 'ShaderNodeOutputMaterial', 1400, 0); b = N(nt, 'ShaderNodeBsdfPrincipled', 1100, 0); lk(nt, b, out); return m, nt, b
def solid(name, col, rough=.5, metal=0, alpha=1, emit=None, k=0):
    m, nt, b = newm(name); b.inputs['Base Color'].default_value = col; b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if alpha < 1: b.inputs['Alpha'].default_value = alpha; m.blend_method = 'BLEND'; m.surface_render_method = 'BLENDED'
    if emit: b.inputs['Emission Color'].default_value = emit; b.inputs['Emission Strength'].default_value = k
    return m

def paint():
    m, nt, b = newm('W_CarPaint'); tc = N(nt, 'ShaderNodeTexCoord', -1400, 0); sp = N(nt, 'ShaderNodeSeparateXYZ', -1200, -200); lk(nt, tc, sp, 'Object', 0)
    big = N(nt, 'ShaderNodeTexNoise', -1200, 200); big.inputs['Scale'].default_value = 2.6; big.inputs['Detail'].default_value = 12; lk(nt, tc, big, 'Object', 'Vector')
    fine = N(nt, 'ShaderNodeTexNoise', -1200, -450); fine.inputs['Scale'].default_value = 38; fine.inputs['Detail'].default_value = 6; lk(nt, tc, fine, 'Object', 'Vector')
    scr = N(nt, 'ShaderNodeTexWave', -1200, -750, wave_type='BANDS', bands_direction='X', wave_profile='SAW'); scr.inputs['Scale'].default_value = 60; scr.inputs['Distortion'].default_value = 8; lk(nt, tc, scr, 'Object', 'Vector')
    paintc = ramp(nt, -900, 300, [(.35, (.045, .15, .12, 1)), (.7, (.06, .2, .16, 1))]); lk(nt, fine, paintc, 0, 0)                 # faded teal enamel
    rust = ramp(nt, -900, 0, [(.58, (.0, .0, .0, 1)), (.7, (1, 1, 1, 1))]); lk(nt, big, rust, 0, 0)                                      # where rust blooms
    low = N(nt, 'ShaderNodeMapRange', -900, -250); low.inputs['From Min'].default_value = .85; low.inputs['From Max'].default_value = .38; lk(nt, sp, low, 2, 0)    # more rust near the sills
    both = N(nt, 'ShaderNodeMath', -650, -100, operation='MAXIMUM'); lk(nt, rust, both, 0, 0); lk(nt, low, both, 0, 1)
    rb = N(nt, 'ShaderNodeMath', -450, -100, operation='MULTIPLY'); lk(nt, both, rb, 0, 0); rb.inputs[1].default_value = .8
    rustc = ramp(nt, -900, -500, [(.0, (.13, .04, .015, 1)), (1, (.32, .13, .045, 1))]); lk(nt, fine, rustc, 0, 0)
    m1 = N(nt, 'ShaderNodeMix', -250, 200, data_type='RGBA', blend_type='MIX'); lk(nt, rb, m1, 0, 0); lk(nt, paintc, m1, 0, 6); lk(nt, rustc, m1, 0, 7)
    dirt = N(nt, 'ShaderNodeMapRange', -900, -950); dirt.inputs['From Min'].default_value = .6; dirt.inputs['From Max'].default_value = .25; lk(nt, sp, dirt, 2, 0)
    m2 = N(nt, 'ShaderNodeMix', 0, 150, data_type='RGBA', blend_type='MIX'); lk(nt, dirt, m2, 0, 0); lk(nt, m1, m2, 2, 6); m2.inputs[7].default_value = (.06, .045, .03, 1); lk(nt, m2, b, 2, 'Base Color')
    rg = ramp(nt, 0, -300, [(.3, (.25, .25, .25, 1)), (.6, (.95, .95, .95, 1))]); lk(nt, big, rg, 0, 0); lk(nt, rg, b, 0, 'Roughness')
    mt = N(nt, 'ShaderNodeMath', 0, -500, operation='SUBTRACT'); mt.inputs[0].default_value = .35; lk(nt, rb, mt, 0, 1); lk(nt, mt, b, 0, 'Metallic')
    bp = N(nt, 'ShaderNodeBump', 600, -500); bp.inputs['Strength'].default_value = .6; bp.inputs['Distance'].default_value = .05; lk(nt, fine, bp, 0, 'Height'); lk(nt, bp, b, 0, 'Normal')
    return m
MP = paint()
GL = solid('W_CarGlass', (.03, .045, .045, 1), .04, alpha=.28); RB = solid('W_Rubber', (.015, .015, .015, 1), .85)
CH = solid('W_Chrome', (.55, .55, .56, 1), .22, 1); BLK = solid('W_PlasticBlack', (.03, .03, .03, 1), .5); RED = solid('W_RedLight', (.45, .02, .015, 1), .25, emit=(.5, .02, .01, 1), k=.15)
HEAD = solid('W_Headlight', (.75, .75, .68, 1), .05); INT = solid('W_CarSeat', (.1, .06, .04, 1), .9); DASH = solid('W_CarDash', (.06, .06, .06, 1), .6)
PLATE = solid('W_Plate', (.7, .68, .55, 1), .6); STEEL = solid('W_RustSteel', (.2, .1, .06, 1), .6, 1); PAPERM = solid('W_MapPaper', (.62, .56, .4, 1), .9)
CLOTH = solid('W_Blanket', (.25, .09, .07, 1), .95); ORANGE = solid('W_Jerry', (.5, .2, .03, 1), .6); WOODM = solid('W_ToolBox', (.12, .1, .08, 1), .7, 1)

def obj(name, bm, mats, smooth=True, parent=None, loc=(0, 0, 0), rot=(0, 0, 0)):
    if smooth:
        for e in bm.edges:
            if len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(48): e.smooth = False
        for f in bm.faces: f.smooth = True
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(m)
    o = bpy.data.objects.new(name, me); CC.objects.link(o); o.location = loc; o.rotation_euler = rot
    if parent: o.parent = parent
    return o
root = bpy.data.objects.new('Car_Root', None); CC.objects.link(root); root.location = (-1.6, -10.6, 0)

def box(name, c, s, m, rot=(0, 0, 0), bevel=.0):
    bm = bmesh.new(); r = bmesh.ops.create_cube(bm, size=1)
    for v in r['verts']: v.co = Vector((v.co.x * s[0], v.co.y * s[1], v.co.z * s[2]))
    if bevel: bmesh.ops.bevel(bm, geom=list({e for v in r['verts'] for e in v.link_edges}), offset=bevel, segments=2, affect='EDGES')
    return obj(name, bm, [m], smooth=bevel > 0, parent=root, loc=c, rot=rot)
def cyl(name, c, r, h, m, seg=20, rot=(0, 0, 0), r2=None):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h)
    return obj(name, bm, [m], parent=root, loc=c, rot=rot)

def interp(pts, x):
    for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
        if x0 <= x <= x1:
            t = (x - x0) / (x1 - x0); t = t * t * (3 - 2 * t) * .6 + t * .4; return y0 + (y1 - y0) * t
    return pts[0][1] if x < pts[0][0] else pts[-1][1]

# ------------------------------------------------------------------ 1) tub: lofted rounded-rectangle rings, wheel arches, open trunk
BELT = [(-2.3, .70), (-2.22, .88), (-1.9, .95), (-1.3, .97), (.95, 1.0), (1.4, .97), (2.0, .90), (2.3, .74)]
WHEELS_X = (-1.38, 1.38); WY = .78
def ring(x, zb, z0, w, n=4.0, seg=20, tumble=0.0):
    pts = []
    for i in range(seg):
        t = 2 * math.pi * i / seg; c, s = math.cos(t), math.sin(t)
        y = (w / 2) * math.copysign(abs(c) ** (2 / n), c); z = (z0 + zb) / 2 + ((zb - z0) / 2) * math.copysign(abs(s) ** (2 / n), s)
        y *= 1 - tumble * (z - z0) / max(zb - z0, .01); pts.append((y, z))
    return pts
xs = [-2.3 + 4.6 * i / 34 for i in range(35)]
bm = bmesh.new(); rows = []
for x in xs:
    zb = interp(BELT, x); z0 = .3
    for xw in WHEELS_X:
        dxw = abs(x - xw)
        if dxw < .46: z0 = max(z0, .33 + math.sqrt(max(0.0, .46 ** 2 - dxw ** 2)) - .04)
    w = 1.80 * (1 - .13 * (abs(x) / 2.3) ** 5)
    z0e = min(z0, zb - .12)
    rows.append([bm.verts.new((x, y, z)) for y, z in ring(x, zb, z0e, w, 4.5, 22, .06)])
M = len(rows[0]); top_faces = []
for a in range(len(rows) - 1):
    for i in range(M):
        f = bm.faces.new((rows[a][i], rows[a + 1][i], rows[a + 1][(i + 1) % M], rows[a][(i + 1) % M])); f.material_index = 0
        c = f.calc_center_median()
        if c.z > zb - .08 and -2.13 < c.x < -1.32 and abs(c.y) < .6: top_faces.append(f)
bm.faces.new(rows[0][::-1]); bm.faces.new(rows[-1])
bmesh.ops.delete(bm, geom=top_faces, context='FACES')                                           # the trunk opening
bm.normal_update()
if any(f.normal.dot(Vector((0, 0, 1))) < 0 and f.calc_center_median().z > 1.0 for f in bm.faces[:5]): bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
tub = obj('Car_Body', bm, [MP], parent=root)

# ------------------------------------------------------------------ 2) cabin: tapered loft, glass band + pillars
CABIN_TOP = [(-1.35, .98), (-1.05, 1.36), (-.85, 1.47), (.45, 1.48), (.7, 1.40), (1.02, 1.0)]
cx = [-1.35 + 2.37 * i / 22 for i in range(23)]
bm = bmesh.new(); crow = []
for x in cx:
    zt = interp(CABIN_TOP, x); zb_ = interp(BELT, x) - .03; hw = 1.62 * (1 - .05 * ((x + .15) / 1.3) ** 4)
    crow.append([bm.verts.new((x, y, z)) for y, z in ring(x, zt, zb_, hw, 3.2, 18, .2)])
Mc = len(crow[0])
for a in range(len(crow) - 1):
    for i in range(Mc):
        f = bm.faces.new((crow[a][i], crow[a + 1][i], crow[a + 1][(i + 1) % Mc], crow[a][(i + 1) % Mc])); c = f.calc_center_median(); zt = interp(CABIN_TOP, c.x); zb_ = interp(BELT, c.x)
        on_side = abs(c.y) > .45 and c.z > zb_ + .09 and c.z < zt - .09; on_end = (a < 3 or a > 18) and c.z > zb_ + .09 and c.z < zt - .07
        f.material_index = 1 if (on_side and .08 < (c.x + 1.0) < 1.8 or on_end) else 0
bm.faces.new(crow[0][::-1]); bm.faces.new(crow[-1])
cabin = obj('Car_Cabin', bm, [MP, GL], parent=root)

# ------------------------------------------------------------------ 3) interior seen through the glass
box('Car_Floor', (-.1, 0, .6), (2.2, 1.5, .05), DASH)
for sx, nm in ((.22, 'F'), (-.78, 'R')):
    box(f'Car_Seat{nm}_Base', (sx, 0, .78), (.5 if nm == 'F' else .55, 1.4, .18), INT, bevel=.03)
    for yy in ((-.38, .38) if nm == 'F' else (0,)):
        box(f'Car_Seat{nm}_Back{yy}', (sx - .23, yy, 1.08), (.12, .6 if nm == 'F' else 1.3, .62), INT, rot=(0, math.radians(-10), 0), bevel=.03)
box('Car_Dash', (.78, 0, .98), (.45, 1.5, .24), DASH, bevel=.04); cyl('Car_SteerWheel', (.55, -.38, 1.05), .17, .03, BLK, 22, rot=(0, math.radians(70), 0)); cyl('Car_SteerColumn', (.65, -.38, .98), .02, .28, BLK, 8, rot=(0, math.radians(70), 0))
box('Car_Mirror_In', (.35, 0, 1.36), (.03, .2, .06), BLK)

# ------------------------------------------------------------------ 4) doors, handles, lights, bumpers, grille, plates
for sd in (-1, 1):
    for xx, nm in ((.15, 'A'), (-.95, 'B'), (-1.5, 'C')):
        box(f'Car_DoorLine{nm}{sd}', (xx, sd * .897, .78), (.012, .012, .5 if nm != 'C' else .38), BLK)
    for xx in (-.1, -.85): box(f'Car_Handle{xx}{sd}', (xx, sd * .915, .86), (.12, .02, .028), CH, bevel=.008)
    box(f'Car_Mirror{sd}', (.62, sd * .97, 1.05), (.1, .16, .1), BLK, bevel=.02); box(f'Car_MirrorArm{sd}', (.62, sd * .9, 1.0), (.05, .1, .04), BLK)
    box(f'Car_Sill{sd}', (0, sd * .86, .35), (3.0, .05, .08), BLK)
    for xx, mm in ((2.28, HEAD),):
        bm = bmesh.new(); r = bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=.115); [setattr(v, 'co', Vector((v.co.x * .6, v.co.y, v.co.z))) for v in r['verts']]
        obj(f'Car_Headlamp{sd}', bm, [mm], parent=root, loc=(xx - .05, sd * .6, .72))
        cyl(f'Car_HeadRing{sd}', (xx - .02, sd * .6, .72), .13, .06, CH, 20, rot=(0, math.radians(90), 0))
    box(f'Car_TailLamp{sd}', (-2.28, sd * .66, .76), (.08, .34, .14), RED, bevel=.02); box(f'Car_TailChrome{sd}', (-2.3, sd * .66, .76), (.04, .38, .18), CH, bevel=.01)
    box(f'Car_Indicator{sd}', (2.26, sd * .8, .6), (.06, .12, .06), solid('W_Amber', (.6, .3, .02, 1), .3), bevel=.01)
box('Car_BumperF', (2.35, 0, .45), (.14, 1.84, .15), CH, bevel=.04); box('Car_BumperR', (-2.36, 0, .45), (.14, 1.84, .15), CH, bevel=.04)
for sd in (-1, 1): box(f'Car_BumperGuard{sd}', (2.4, sd * .7, .5), (.1, .08, .2), CH, bevel=.02); box(f'Car_BumperGuardR{sd}', (-2.41, sd * .7, .5), (.1, .08, .2), CH, bevel=.02)
box('Car_GrilleFrame', (2.32, 0, .66), (.06, .88, .22), CH, bevel=.015)
for k in range(7): box(f'Car_GrilleBar{k}', (2.345, 0, .56 + k * .03), (.02, .84, .01), BLK)
box('Car_HoodLine', (1.35, 0, .985), (.9, .01, .008), BLK)
cyl('Car_HoodOrnament', (1.95, 0, .99), .012, .06, CH, 8)
box('Car_PlateR', (-2.395, 0, .6), (.03, .42, .12), PLATE); box('Car_PlateF', (2.4, .0, .39), (.03, .42, .11), PLATE)
cyl('Car_Antenna', (-.45, .86, 1.45), .004, .8, CH, 6, rot=(math.radians(-8), 0, 0))
cyl('Car_Exhaust', (-2.25, .55, .3), .035, .22, CH, 10, rot=(0, math.radians(90), 0))
cyl('Car_FuelCap', (-1.5, -.9, .93), .045, .02, CH, 14, rot=(math.radians(90), 0, 0))

# ------------------------------------------------------------------ 5) wheels (lathed tyre + rim); the front-left tyre is flat
def wheel(name, x, y, flat=False):
    bm = bmesh.new(); seg = 28
    prof = [(.2, -.1), (.29, -.11), (.325, -.085), (.335, -.045), (.335, .045), (.325, .085), (.29, .11), (.2, .1)] if not flat else [(.2, -.1), (.27, -.11), (.3, -.085), (.305, -.045), (.305, .045), (.3, .085), (.27, .11), (.2, .1)]
    rings = [[bm.verts.new((math.cos(2 * math.pi * i / seg) * r, z, math.sin(2 * math.pi * i / seg) * r)) for i in range(seg)] for r, z in prof]
    for k in range(len(rings) - 1):
        for i in range(seg): bm.faces.new((rings[k][i], rings[k][(i + 1) % seg], rings[k + 1][(i + 1) % seg], rings[k + 1][i]))
    tire = obj(name, bm, [RB], parent=root, loc=(x, y, .335 if not flat else .31))
    sd = 1 if y > 0 else -1; out = sd * .1
    cyl(name + '_Rim', (x, y + out * .9, .335 if not flat else .31), .205, .03, STEEL, 24, rot=(math.radians(90), 0, 0))
    cyl(name + '_Hub', (x, y + out * 1.3, .335 if not flat else .31), .07, .03, CH, 16, rot=(math.radians(90), 0, 0))
    for k in range(5):
        a = k * 2 * math.pi / 5; cyl(name + f'_Lug{k}', (x + math.cos(a) * .11, y + out * 1.45, (.335 if not flat else .31) + math.sin(a) * .11), .014, .02, CH, 8, rot=(math.radians(90), 0, 0))
    return tire
for xw in WHEELS_X:
    for sd in (-1, 1): wheel(f'Car_Wheel{int(xw * 10)}{sd}', xw, sd * WY, flat=(xw > 0 and sd < 0))
for xw in WHEELS_X:                                                                                  # dark wheel wells
    for sd in (-1, 1):
        bm = bmesh.new(); seg = 14; rr = .43
        a_ = [bm.verts.new((xw + math.cos(math.pi * i / seg) * rr, sd * .7, .335 + math.sin(math.pi * i / seg) * rr)) for i in range(seg + 1)]
        b_ = [bm.verts.new((xw + math.cos(math.pi * i / seg) * rr, sd * .5, .335 + math.sin(math.pi * i / seg) * rr)) for i in range(seg + 1)]
        for i in range(seg): bm.faces.new((a_[i], a_[i + 1], b_[i + 1], b_[i]))
        obj(f'Car_Well{int(xw * 10)}{sd}', bm, [BLK], parent=root)

# ------------------------------------------------------------------ 6) the trunk: cavity, spare wheel, tools, blanket, the folded map; the lid hangs open on its hinge
cx0, cx1 = -2.14, -1.32
box('Car_TrunkFloor', ((cx0 + cx1) / 2, 0, .58), (cx1 - cx0, 1.5, .05), DASH); box('Car_TrunkWallF', (cx1, 0, .78), (.04, 1.5, .4), DASH); box('Car_TrunkWallR', (cx0, 0, .74), (.04, 1.5, .34), DASH)
for sd in (-1, 1): box(f'Car_TrunkSide{sd}', ((cx0 + cx1) / 2, sd * .75, .76), (cx1 - cx0, .04, .38), DASH)
cyl('Car_SpareTyre', (-1.62, .38, .72), .31, .2, RB, 24, rot=(math.radians(90), 0, 0)); cyl('Car_SpareRim', (-1.62, .27, .72), .2, .02, STEEL, 20, rot=(math.radians(90), 0, 0))
box('Car_ToolBox', (-1.9, -.4, .68), (.34, .22, .14), WOODM, bevel=.012); box('Car_ToolBoxLid', (-1.9, -.4, .76), (.34, .22, .02), WOODM, rot=(math.radians(-25), 0, 0)); box('Car_ToolHandle', (-1.9, -.4, .8), (.2, .02, .02), CH)
cyl('Car_JerryCan', (-1.95, .22, .72), .1, .3, ORANGE, 12, rot=(0, 0, 0)); box('Car_JerryCan2', (-1.95, .22, .72), (.2, .1, .3), ORANGE, bevel=.015)
box('Car_Blanket', (-1.75, -.25, .66), (.4, .6, .08), CLOTH, rot=(0, 0, .2), bevel=.03)
for k in range(4): box(f'Car_Rag{k}', (-1.6 + random.uniform(-.2, .2), random.uniform(-.55, .55), .625 + k * .01), (.18, .1, .01), CLOTH, rot=(0, 0, random.uniform(0, 3)))
# the map: a folded sheet lying on the blanket, ink drawn by a shader (roads, the station, red X marks)
def map_paper():
    m, nt, b = newm('W_MapInk'); tc = N(nt, 'ShaderNodeTexCoord', -1200, 0); sep = N(nt, 'ShaderNodeSeparateXYZ', -1000, 0); lk(nt, tc, sep, 'Generated', 0)
    base = ramp(nt, -700, 200, [(.4, (.55, .5, .34, 1)), (.7, (.66, .6, .42, 1))]); ns = N(nt, 'ShaderNodeTexNoise', -900, 200); ns.inputs['Scale'].default_value = 8; ns.inputs['Detail'].default_value = 8; lk(nt, tc, ns, 'Generated', 'Vector'); lk(nt, ns, base, 0, 0)
    l1 = N(nt, 'ShaderNodeTexWave', -900, -150, wave_type='BANDS', bands_direction='DIAGONAL', wave_profile='SAW'); l1.inputs['Scale'].default_value = 2.2; l1.inputs['Distortion'].default_value = 2; lk(nt, tc, l1, 'Generated', 'Vector')
    ink = ramp(nt, -650, -150, [(.0, (.04, .03, .02, 1)), (.03, (1, 1, 1, 1))]); lk(nt, l1, ink, 0, 0)
    xm = N(nt, 'ShaderNodeTexChecker', -900, -450); xm.inputs['Scale'].default_value = 3; lk(nt, tc, xm, 'Generated', 'Vector')
    mm = N(nt, 'ShaderNodeMix', -350, 100, data_type='RGBA', blend_type='MULTIPLY'); mm.inputs[0].default_value = 1; lk(nt, base, mm, 0, 6); lk(nt, ink, mm, 0, 7); lk(nt, mm, b, 2, 'Base Color'); b.inputs['Roughness'].default_value = .9
    return m
bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=4, y_segments=3, size=.5)
for v in bm.verts: v.co = Vector((v.co.x * .6, v.co.y * .8, math.sin(v.co.x * 9) * .01 + .0))
mp = obj('Car_Map', bm, [map_paper()], smooth=False, parent=root, loc=(-1.78, -.18, .71), rot=(0, 0, .35))
for k, (xx, yy) in enumerate(((.12, .1), (-.15, -.08), (.05, -.2))):                                      # red X marks (treasure-map style)
    for ang in (45, -45): box(f'Car_MapX{k}{ang}', (-1.78 + xx * math.cos(.35) - yy * math.sin(.35), -.18 + xx * math.sin(.35) + yy * math.cos(.35), .722), (.07, .012, .002), solid('W_MapRed', (.6, .03, .02, 1), .8), rot=(0, 0, math.radians(ang) + .35))
# the lid: hinged at the front edge of the trunk, swung open ~62 degrees
bm = bmesh.new(); r = bmesh.ops.create_cube(bm, size=1)
for v in r['verts']: v.co = Vector((v.co.x * .86 - .43, v.co.y * 1.6, v.co.z * .035))
bmesh.ops.bevel(bm, geom=list({e for v in r['verts'] for e in v.link_edges}), offset=.03, segments=2, affect='EDGES')
lid = obj('Car_TrunkLid', bm, [MP], parent=root, loc=(cx1 + .0, 0, .975), rot=(0, math.radians(62), 0))
box('Car_TrunkLid_Inner', (cx1 - .43 * math.cos(math.radians(62)) - .02, 0, .975 + .43 * math.sin(math.radians(62)) - .02), (.8, 1.5, .02), DASH, rot=(0, math.radians(62), 0))
# plates get readable lettering
def text(nm, s, size, loc, rot, m):
    cu = bpy.data.curves.new(nm + '_c', 'FONT'); cu.body = s; cu.size = size; cu.extrude = .002; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'
    tmp = bpy.data.objects.new(nm + '_t', cu); bpy.context.scene.collection.objects.link(tmp); bpy.context.view_layer.update()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(bpy.context.evaluated_depsgraph_get())); me.name = nm; bpy.data.objects.remove(tmp, do_unlink=True); bpy.data.curves.remove(cu); me.materials.append(m)
    o = bpy.data.objects.new(nm, me); CC.objects.link(o); o.parent = root; o.location = loc; o.rotation_euler = rot; return o
text('Car_PlateText', 'К 417 ХВ', .075, (-2.415, 0, .6), (math.radians(90), 0, math.radians(-90)), BLK)
print('car built:', len([o for o in CC.objects if o.name.startswith('Car_')]), 'objects')
