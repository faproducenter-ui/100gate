"""Gas-station surroundings: road, markings, dirt paths, manhole, chain-link fence with a gate, power poles with wires, a road sign and an
abandoned sedan at the pumps (the trunk lid opens: the map lies inside).  Procedural materials, one collection 'World'.
Run through the Blender MCP:  exec(open(r"C:\\Users\\libde\\100gate\\tools\\gas-station\\world_build.py", encoding="utf-8").read())
Flat play area: x -29..32, y -41..20 (the hills around it are the natural boundary). Station: x -6..16, y -10..13 (front = -Y).
"""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix, Euler

random.seed(21)

def fresh(name):
    c = bpy.data.collections.get(name)
    if c:
        for o in list(c.objects): bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(c)
    c = bpy.data.collections.new(name); bpy.context.scene.collection.children.link(c); return c
# ------------------------------------------------------------------ materials
def new_mat(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)            # rebuilt in place, so objects built earlier keep their material
    m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); out.location = (1100, 0)
    b = nt.nodes.new('ShaderNodeBsdfPrincipled'); b.location = (800, 0); nt.links.new(b.outputs[0], out.inputs[0]); return m, nt, b
def N(nt, t, x, y, **kw):
    n = nt.nodes.new(t); n.location = (x, y)
    for k, v in kw.items(): setattr(n, k, v)
    return n
def ramp(nt, x, y, stops):
    r = N(nt, 'ShaderNodeValToRGB', x, y); els = r.color_ramp.elements
    while len(els) < len(stops): els.new(1.0)
    for e, (p, c) in zip(els, stops): e.position = p; e.color = c
    return r
def lk(nt, a, b, i=0, j=0): nt.links.new(a.outputs[i] if isinstance(i, int) else a.outputs[i], b.inputs[j])

def mat_solid(name, col, rough=.6, metal=0, alpha=1, emit=None, k=0):
    m, nt, b = new_mat(name); b.inputs['Base Color'].default_value = col; b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if alpha < 1: b.inputs['Alpha'].default_value = alpha; m.blend_method = 'BLEND'; m.surface_render_method = 'BLENDED'
    if emit: b.inputs['Emission Color'].default_value = emit; b.inputs['Emission Strength'].default_value = k
    return m

def mat_asphalt(name='W_Asphalt', base=(.045, .045, .05, 1), worn=1.0):
    m, nt, b = new_mat(name); tc = N(nt, 'ShaderNodeTexCoord', -1200, 0); mp = N(nt, 'ShaderNodeMapping', -1000, 0); lk(nt, tc, mp, 'Object', 0)
    sp = N(nt, 'ShaderNodeTexNoise', -750, 300); sp.inputs['Scale'].default_value = 220; sp.inputs['Detail'].default_value = 3; lk(nt, mp, sp, 0, 'Vector')     # gravel speckle
    lo = N(nt, 'ShaderNodeTexNoise', -750, 0); lo.inputs['Scale'].default_value = .35; lo.inputs['Detail'].default_value = 8; lk(nt, mp, lo, 0, 'Vector')          # large patches
    vr = N(nt, 'ShaderNodeTexVoronoi', -750, -300, feature='DISTANCE_TO_EDGE'); vr.inputs['Scale'].default_value = .42; lk(nt, mp, vr, 0, 'Vector')             # cracks
    spr = ramp(nt, -450, 300, [(.35, (.7, .7, .7, 1)), (.7, (1.3, 1.3, 1.3, 1))]); lk(nt, sp, spr, 0, 0)
    pat = ramp(nt, -450, 0, [(.35, (.75, .75, .75, 1)), (.65, (1.2, 1.2, 1.25, 1))]); lk(nt, lo, pat, 0, 0)
    crk = ramp(nt, -450, -300, [(.0, (.45, .45, .45, 1)), (.006, (1, 1, 1, 1))]); lk(nt, vr, crk, 'Distance', 0)
    c1 = N(nt, 'ShaderNodeMix', -150, 150, data_type='RGBA', blend_type='MULTIPLY'); c1.inputs[0].default_value = 1; lk(nt, spr, c1, 0, 6); lk(nt, pat, c1, 0, 7)
    c2 = N(nt, 'ShaderNodeMix', 100, 100, data_type='RGBA', blend_type='MULTIPLY'); c2.inputs[0].default_value = 1; lk(nt, c1, c2, 2, 6); lk(nt, crk, c2, 0, 7)
    bc = N(nt, 'ShaderNodeMix', 350, 100, data_type='RGBA', blend_type='MULTIPLY'); bc.inputs[0].default_value = 1; bc.inputs[6].default_value = base; lk(nt, c2, bc, 2, 7); lk(nt, bc, b, 2, 'Base Color')
    rg = ramp(nt, 350, -200, [(.35, (.95, .95, .95, 1)), (.6, (.35, .35, .35, 1))]); lk(nt, lo, rg, 0, 0); lk(nt, rg, b, 0, 'Roughness')        # wet puddly patches
    bp = N(nt, 'ShaderNodeBump', 350, -450); bp.inputs['Strength'].default_value = .3; lk(nt, sp, bp, 0, 'Height'); lk(nt, bp, b, 0, 'Normal')
    return m

def mat_paint(name, col):
    m, nt, b = new_mat(name); tc = N(nt, 'ShaderNodeTexCoord', -800, 0); ns = N(nt, 'ShaderNodeTexNoise', -600, 0); ns.inputs['Scale'].default_value = 45; ns.inputs['Detail'].default_value = 10; lk(nt, tc, ns, 'Object', 'Vector')
    r = ramp(nt, -300, 0, [(.35, (.12, .1, .08, 1)), (.55, col)]); lk(nt, ns, r, 0, 0); lk(nt, r, b, 0, 'Base Color'); b.inputs['Roughness'].default_value = .6
    return m

def mat_dirt(name='W_Dirt'):
    m, nt, b = new_mat(name); tc = N(nt, 'ShaderNodeTexCoord', -900, 0)
    n1 = N(nt, 'ShaderNodeTexNoise', -650, 150); n1.inputs['Scale'].default_value = 1.2; n1.inputs['Detail'].default_value = 10; lk(nt, tc, n1, 'Object', 'Vector')
    n2 = N(nt, 'ShaderNodeTexNoise', -650, -150); n2.inputs['Scale'].default_value = 60; lk(nt, tc, n2, 'Object', 'Vector')
    r = ramp(nt, -350, 150, [(.35, (.045, .03, .02, 1)), (.7, (.16, .11, .07, 1))]); lk(nt, n1, r, 0, 0)
    mm = N(nt, 'ShaderNodeMix', -100, 100, data_type='RGBA', blend_type='MULTIPLY'); mm.inputs[0].default_value = .6; lk(nt, r, mm, 0, 6)
    r2 = ramp(nt, -350, -150, [(.3, (.6, .6, .6, 1)), (.7, (1.1, 1.1, 1.1, 1))]); lk(nt, n2, r2, 0, 0); lk(nt, r2, mm, 0, 7); lk(nt, mm, b, 2, 'Base Color')
    rg = ramp(nt, -100, -300, [(.4, (.4, .4, .4, 1)), (.6, (.95, .95, .95, 1))]); lk(nt, n1, rg, 0, 0); lk(nt, rg, b, 0, 'Roughness')
    bp = N(nt, 'ShaderNodeBump', 200, -300); bp.inputs['Strength'].default_value = .5; lk(nt, n2, bp, 0, 'Height'); lk(nt, bp, b, 0, 'Normal')
    return m

def mat_metal(name, col, rust=.5, rough=.45):
    m, nt, b = new_mat(name); tc = N(nt, 'ShaderNodeTexCoord', -900, 0); ns = N(nt, 'ShaderNodeTexNoise', -650, 0); ns.inputs['Scale'].default_value = 5; ns.inputs['Detail'].default_value = 12; lk(nt, tc, ns, 'Object', 'Vector')
    p0 = .35 + (1 - rust) * .45
    r = ramp(nt, -350, 100, [(p0, col), (p0 + .2, (.25, .1, .04, 1))]); lk(nt, ns, r, 0, 0); lk(nt, r, b, 0, 'Base Color')
    mt = ramp(nt, -350, -150, [(p0, (.85, .85, .85, 1)), (p0 + .2, (0, 0, 0, 1))]); lk(nt, ns, mt, 0, 0); lk(nt, mt, b, 0, 'Metallic')
    rg = ramp(nt, -350, -350, [(p0, (rough, rough, rough, 1)), (p0 + .2, (.9, .9, .9, 1))]); lk(nt, ns, rg, 0, 0); lk(nt, rg, b, 0, 'Roughness'); return m

def mat_wood(name, base=(.18, .1, .05, 1), gray=.5):
    m, nt, b = new_mat(name); tc = N(nt, 'ShaderNodeTexCoord', -900, 0)
    wv = N(nt, 'ShaderNodeTexWave', -650, 100, wave_type='BANDS', bands_direction='Z', wave_profile='SAW'); wv.inputs['Scale'].default_value = 5; wv.inputs['Distortion'].default_value = 6; wv.inputs['Detail'].default_value = 3; lk(nt, tc, wv, 'Object', 'Vector')
    ns = N(nt, 'ShaderNodeTexNoise', -650, -200); ns.inputs['Scale'].default_value = 8; ns.inputs['Detail'].default_value = 9; lk(nt, tc, ns, 'Object', 'Vector')
    r = ramp(nt, -350, 100, [(0, (base[0] * .45, base[1] * .45, base[2] * .45, 1)), (1, base)]); lk(nt, wv, r, 0, 0)
    wea = ramp(nt, -350, -200, [(.35, (1, 1, 1, 1)), (.7, (.55 * gray + .3, .55 * gray + .3, .5 * gray + .3, 1))]); lk(nt, ns, wea, 0, 0)    # weathered grey patches
    mm = N(nt, 'ShaderNodeMix', -100, 0, data_type='RGBA', blend_type='MULTIPLY'); mm.inputs[0].default_value = 1; lk(nt, r, mm, 0, 6); lk(nt, wea, mm, 0, 7); lk(nt, mm, b, 2, 'Base Color')
    b.inputs['Roughness'].default_value = .8; bp = N(nt, 'ShaderNodeBump', 200, -250); bp.inputs['Strength'].default_value = .3; lk(nt, wv, bp, 0, 'Height'); lk(nt, bp, b, 0, 'Normal'); return m

def mat_chainlink(name='W_Chainlink'):
    m, nt, b = new_mat(name); tc = N(nt, 'ShaderNodeTexCoord', -900, 0); mp = N(nt, 'ShaderNodeMapping', -700, 0); mp.inputs['Rotation'].default_value = (0, 0, math.radians(45)); mp.inputs['Scale'].default_value = (1, 1, 1); lk(nt, tc, mp, 'Object', 0)
    ck = N(nt, 'ShaderNodeTexChecker', -450, 0); ck.inputs['Scale'].default_value = 16; lk(nt, mp, ck, 0, 'Vector')
    # thin diamond wires: checker edges via a narrow band of the wave texture in both diagonals
    w1 = N(nt, 'ShaderNodeTexWave', -450, 250, wave_type='BANDS', bands_direction='DIAGONAL', wave_profile='SAW'); w1.inputs['Scale'].default_value = 7; w1.inputs['Distortion'].default_value = 0; lk(nt, tc, w1, 'Object', 'Vector')
    w2 = N(nt, 'ShaderNodeTexWave', -450, -250, wave_type='BANDS', bands_direction='DIAGONAL', wave_profile='SAW'); w2.inputs['Scale'].default_value = 7; w2.inputs['Distortion'].default_value = 0
    mp2 = N(nt, 'ShaderNodeMapping', -700, -250); mp2.inputs['Scale'].default_value = (-1, 1, 1); lk(nt, tc, mp2, 'Object', 0); lk(nt, mp2, w2, 0, 'Vector')
    t1 = ramp(nt, -200, 250, [(.0, (1, 1, 1, 1)), (.07, (0, 0, 0, 1))]); lk(nt, w1, t1, 0, 0)
    t2 = ramp(nt, -200, -250, [(.0, (1, 1, 1, 1)), (.07, (0, 0, 0, 1))]); lk(nt, w2, t2, 0, 0)
    mx = N(nt, 'ShaderNodeMath', 50, 0, operation='MAXIMUM'); lk(nt, t1, mx, 0, 0); lk(nt, t2, mx, 0, 1)
    b.inputs['Base Color'].default_value = (.35, .36, .37, 1); b.inputs['Metallic'].default_value = 1; b.inputs['Roughness'].default_value = .4
    lk(nt, mx, b, 0, 'Alpha'); m.blend_method = 'BLEND'; m.surface_render_method = 'BLENDED'; m.use_backface_culling = False; return m

M = {}
M['asphalt'] = mat_asphalt(); M['asphalt_old'] = mat_asphalt('W_AsphaltOld', (.07, .068, .065, 1))
M['yellow'] = mat_paint('W_PaintYellow', (.7, .55, .08, 1)); M['white'] = mat_paint('W_PaintWhite', (.75, .75, .72, 1))
M['dirt'] = mat_dirt(); M['gravel'] = mat_asphalt('W_Gravel', (.16, .14, .12, 1))
M['steel'] = mat_metal('W_Steel', (.3, .32, .32, 1), .45); M['iron'] = mat_metal('W_Iron', (.07, .07, .075, 1), .55, .55); M['zinc'] = mat_metal('W_Zinc', (.5, .52, .53, 1), .3, .35)
M['pole'] = mat_wood('W_PoleWood', (.16, .1, .06, 1), .7); M['fencewood'] = mat_wood('W_FenceWood', (.2, .13, .07, 1), .8)
M['chain'] = mat_chainlink(); M['wire'] = mat_solid('W_Wire', (.02, .02, .02, 1), .5)
M['glass'] = mat_solid('W_Glass', (.05, .09, .09, 1), .05, alpha=.25); M['rubber'] = mat_solid('W_Rubber', (.015, .015, .015, 1), .85)
M['chrome'] = mat_solid('W_Chrome', (.7, .7, .72, 1), .15, 1); M['red'] = mat_solid('W_RedLight', (.5, .03, .02, 1), .3, emit=(.5, .02, .01, 1), k=.2)
M['white_s'] = mat_solid('W_Headlight', (.8, .8, .75, 1), .2); M['plastic'] = mat_solid('W_PlasticBlack', (.03, .03, .03, 1), .5)
def car_paint():
    m, nt, b = new_mat('W_CarPaint'); tc = N(nt, 'ShaderNodeTexCoord', -900, 0); ns = N(nt, 'ShaderNodeTexNoise', -650, 0); ns.inputs['Scale'].default_value = 3; ns.inputs['Detail'].default_value = 12; lk(nt, tc, ns, 'Object', 'Vector')
    r = ramp(nt, -350, 100, [(.4, (.05, .16, .12, 1)), (.62, (.3, .12, .04, 1))]); lk(nt, ns, r, 0, 0)       # teal paint with rust blooms
    mud = N(nt, 'ShaderNodeTexNoise', -650, -250); mud.inputs['Scale'].default_value = 1.8; mud.inputs['Detail'].default_value = 6; lk(nt, tc, mud, 'Object', 'Vector')
    sep = N(nt, 'ShaderNodeSeparateXYZ', -650, -450); lk(nt, tc, sep, 'Object', 0)
    mk = N(nt, 'ShaderNodeMapRange', -400, -450); mk.inputs['From Min'].default_value = .5; mk.inputs['From Max'].default_value = -.1; lk(nt, sep, mk, 2, 0)
    mm = N(nt, 'ShaderNodeMix', -100, -100, data_type='RGBA', blend_type='MIX'); mm.inputs[7].default_value = (.08, .06, .04, 1); lk(nt, mk, mm, 0, 0); lk(nt, r, mm, 0, 6); lk(nt, mm, b, 2, 'Base Color')
    rg = ramp(nt, -100, -300, [(.4, (.3, .3, .3, 1)), (.65, (.9, .9, .9, 1))]); lk(nt, ns, rg, 0, 0); lk(nt, rg, b, 0, 'Roughness'); b.inputs['Metallic'].default_value = .3; return m
M['car'] = bpy.data.materials.get('W_CarPaint') or car_paint()   # car_build.py owns the real paint; don't overwrite it

COL = fresh('World')

# ------------------------------------------------------------------ helpers
def link(o): COL.objects.link(o); return o
def mesh_obj(name, bm, mat, smooth=False):
    if smooth:
        for e in bm.edges:
            if len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(35): e.smooth = False
        for f in bm.faces: f.smooth = True
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(M[mat] if isinstance(mat, str) else mat)
    o = bpy.data.objects.new(name, me); return link(o)
def box(name, c, s, mat, rot=(0, 0, 0), bevel=0.0):
    bm = bmesh.new(); r = bmesh.ops.create_cube(bm, size=1)
    for v in r['verts']: v.co = Vector((v.co.x * s[0], v.co.y * s[1], v.co.z * s[2]))
    if bevel: bmesh.ops.bevel(bm, geom=list({e for v in r['verts'] for e in v.link_edges}), offset=bevel, segments=1, affect='EDGES')
    o = mesh_obj(name, bm, mat); o.location = c; o.rotation_euler = rot; return o
def cyl(name, c, r, h, mat, seg=20, rot=(0, 0, 0), r2=None):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h)
    o = mesh_obj(name, bm, mat, smooth=True); o.location = c; o.rotation_euler = rot; return o
def strip(name, pts, width, mat, z=.0, jitter=0.0, uvs=False):
    """flat ribbon along a polyline (xy), optional wobbling edges for dirt paths"""
    bm = bmesh.new(); L = []; R = []
    for i, p in enumerate(pts):
        a = Vector(pts[max(i - 1, 0)]); b = Vector(pts[min(i + 1, len(pts) - 1)]); d = (b - a).normalized(); n = Vector((-d.y, d.x))
        w = width / 2 * (1 + random.uniform(-jitter, jitter))
        L.append(bm.verts.new((p[0] + n.x * w, p[1] + n.y * w, z + random.uniform(0, .004 if jitter else 0)))); R.append(bm.verts.new((p[0] - n.x * w, p[1] - n.y * w, z + random.uniform(0, .004 if jitter else 0))))
    for i in range(len(pts) - 1): bm.faces.new((L[i], L[i + 1], R[i + 1], R[i]))
    return mesh_obj(name, bm, mat, smooth=True)

# ------------------------------------------------------------------ 1) road along y = -30 with shoulders, markings, the forecourt apron, and dirt paths
RY, RW = -30.0, 7.4; RX0, RX1 = -72.0, 72.0
box('Road_Asphalt', ((RX0 + RX1) / 2, RY, .03), (RX1 - RX0, RW, .06), 'asphalt', bevel=.01)
for sd in (-1, 1): box(f'Road_Shoulder{sd}', ((RX0 + RX1) / 2, RY + sd * (RW / 2 + .6), .015), (RX1 - RX0, 1.2, .03), 'gravel', bevel=.01)
box('Road_Apron', (3.5, -18.0, .03), (15.0, 17.0, .06), 'asphalt_old', bevel=.01)                                                  # from the road up to the pumps
box('Road_ApronEdge', (3.5, -26.2, .035), (15.0, 1.0, .06), 'asphalt', bevel=.005)
x = RX0 + 1.0; i = 0
while x < RX1 - 3:
    box(f'Road_Dash{i}', (x + 1.5, RY, .062), (3.0, .16, .004), 'yellow'); x += 9.0; i += 1
for sd in (-1, 1):
    x = RX0
    while x < RX1:
        ln = random.uniform(5, 11) if random.random() < .5 else 11.0
        if random.random() < .88: box(f'Road_Edge{sd}_{int(x)}', (x + ln / 2, RY + sd * (RW / 2 - .35), .062), (min(ln, RX1 - x), .12, .004), 'white')
        x += ln + random.uniform(0, .6)
for k in range(7): box(f'Road_Zebra{k}', (3.5, RY - RW / 2 + .55 + k * .95, .062), (3.0, .5, .004), 'white')                         # pedestrian crossing: stripes run along the road, side by side across it
for sd, xx in ((-1, 1.6), (1, 5.4)): box(f'Road_StopLine{sd}', (xx, RY + (-1.8 if sd < 0 else 1.8), .062), (.35, 3.5, .004), 'white')
# patches, cracks as dark/oil blobs
for k in range(10):
    p = (random.uniform(RX0 + 3, RX1 - 3), RY + random.uniform(-2.5, 2.5)); box(f'Road_Patch{k}', (p[0], p[1], .062), (random.uniform(.8, 2.2), random.uniform(.6, 1.4), .003), 'asphalt_old', rot=(0, 0, random.uniform(0, 3)))
# dirt paths to the two houses (the houses themselves are in house_build.py)
strip('Path_HouseA', [(-6.5, 5.5), (-10, 7.5), (-14, 6.5), (-17.5, 5.0), (-20.5, 4.2)], 1.9, 'dirt', .012, .25)
strip('Path_Motel', [(14.0, -7.5), (16.5, -9.5), (18.5, -12.5), (19.5, -16.0)], 2.1, 'dirt', .012, .25)
strip('Path_ToRoad', [(-8.0, -13.5), (-11.5, -19), (-14, -25), (-15, -29)], 1.6, 'dirt', .012, .3)                                     # a worn path from the forecourt to the sewer manhole

# ------------------------------------------------------------------ 2) manhole on the road
MH = (-15.2, RY - 1.0)
cyl('Manhole_Frame', (MH[0], MH[1], .064), .44, .018, 'iron', 32)
cov = cyl('Manhole_Cover', (MH[0], MH[1], .072), .38, .016, 'iron', 32)
for k in range(7): box(f'Manhole_Rib{k}', (MH[0] + math.cos(k * 3.1415 / 7) * .0, MH[1], .084), (.7, .02, .006), 'iron', rot=(0, 0, k * math.pi / 7))
box('Manhole_Lift', (MH[0], MH[1], .086), (.1, .03, .008), 'zinc')

# ------------------------------------------------------------------ 3) chain-link fence behind the station (y = 16), a gate, short returns
def fence(name, a, b, h=2.1, gate=None):
    a = Vector(a); b = Vector(b); L = (b - a).length; d = (b - a).normalized(); ang = math.atan2(d.y, d.x)
    n = max(2, int(L / 2.6));
    for i in range(n + 1):
        p = a + d * (L * i / n); cyl(f'{name}_Post{i}', (p.x, p.y, h / 2), .035, h, 'steel', 10)
    cyl(f'{name}_Top', ((a.x + b.x) / 2, (a.y + b.y) / 2, h - .03), .018, L, 'steel', 8, rot=(0, math.radians(90), ang))
    cyl(f'{name}_Bottom', ((a.x + b.x) / 2, (a.y + b.y) / 2, .12), .014, L, 'steel', 8, rot=(0, math.radians(90), ang))
    mesh = box(f'{name}_Mesh', ((a.x + b.x) / 2, (a.y + b.y) / 2, h / 2 - .04), (L, .004, h - .2), 'chain', rot=(0, 0, ang))
    return mesh
fence('Fence_Back', (-7, 16), (3.4, 16)); fence('Fence_Back2', (6.6, 16), (17, 16))
fence('Fence_West', (-7, 16), (-7, 6.5)); fence('Fence_East', (17, 16), (17, 6.5))
# gate leaves (hinged: origin at the hinge post, so they can be animated open)
for sd, hx in ((-1, 3.4), (1, 6.6)):
    bm = bmesh.new(); cube = bmesh.ops.create_cube
    g = box(f'Gate_{"L" if sd < 0 else "R"}', (hx, 16, 0), (.04, .04, .04), 'steel')
    g.data.clear_geometry()
    bm = bmesh.new()
    def cb(c, s):
        r = bmesh.ops.create_cube(bm, size=1)
        for v in r['verts']: v.co = Vector((v.co.x * s[0] + c[0], v.co.y * s[1] + c[1], v.co.z * s[2] + c[2]))
    wdt = 1.6
    cb((sd * wdt / 2, 0, .1), (wdt, .04, .04)); cb((sd * wdt / 2, 0, 1.95), (wdt, .04, .04)); cb((sd * .02, 0, 1.0), (.04, .04, 2.0)); cb((sd * (wdt - .02), 0, 1.0), (.04, .04, 2.0)); cb((sd * wdt / 2, 0, 1.0), (wdt, .03, .03))
    bm.to_mesh(g.data); bm.free(); g.data.materials.append(M['steel'])
    box(f'Gate_{"L" if sd < 0 else "R"}_Mesh', (hx + sd * wdt / 2, 16, 1.02), (wdt - .1, .004, 1.8), 'chain')
box('Gate_Chain', (5.0, 16.05, 1.05), (.12, .02, .5), 'iron'); box('Gate_Lock', (5.0, 16.06, .95), (.07, .04, .09), 'zinc', bevel=.006)

# ------------------------------------------------------------------ 4) power poles with crossarms, insulators and sagging wires along the road
def pole(i, x, y, tilt=0):
    cyl(f'Pole{i}', (x, y, 4.2), .14, 8.4, 'pole', 12, r2=.11)
    box(f'Pole{i}_Arm', (x, y, 7.6), (.12, 2.2, .12), 'pole'); box(f'Pole{i}_Brace', (x, y + .6, 7.2), (.07, .06, .8), 'pole', rot=(math.radians(45), 0, 0)); box(f'Pole{i}_Brace2', (x, y - .6, 7.2), (.07, .06, .8), 'pole', rot=(math.radians(-45), 0, 0))
    for k, off in enumerate((-.95, 0, .95)): cyl(f'Pole{i}_Ins{k}', (x, y + off, 7.72), .035, .12, 'zinc', 8)
    box(f'Pole{i}_Plate', (x + .15, y, 2.2), (.01, .18, .26), 'zinc')
PX = [-20, -4, 12, 27]; PY = -24.5
for i, x in enumerate(PX): pole(i, x, PY)
def wire(name, p0, p1, sag=.7, r=.012):
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = r; cu.bevel_resolution = 1; sp = cu.splines.new('POLY'); sp.points.add(12)
    for i, pt in enumerate(sp.points):
        t = i / 12; p = Vector(p0).lerp(Vector(p1), t); p.z -= 4 * sag * t * (1 - t); pt.co = (p.x, p.y, p.z, 1)
    o = bpy.data.objects.new(name, cu); cu.materials.append(M['wire']); link(o); return o
for i in range(len(PX) - 1):
    for k, off in enumerate((-.95, 0, .95)): wire(f'Wire{i}_{k}', (PX[i], PY + off, 7.78), (PX[i + 1], PY + off, 7.78), sag=.9)
wire('Wire_Drop', (PX[1], PY, 7.4), (4.0, 14.0, 4.2), sag=1.4)                                                                            # a drop line towards the shop

# ------------------------------------------------------------------ 5) road sign
cyl('Sign_Post', (-20.0, -25.2, 1.2), .03, 2.4, 'zinc', 10)
box('Sign_Plate', (-20.0, -25.25, 2.3), (.75, .03, .75), 'red', rot=(0, 0, 0), bevel=.01)
box('Sign_Rim', (-20.0, -25.22, 2.3), (.64, .03, .64), 'white_s', bevel=.01)
box('Sign_Plate2', (-20.0, -25.2, 2.3), (.5, .03, .5), 'red', bevel=.01)

# ------------------------------------------------------------------ 6) the sedan lives in car_build.py (lofted body, interior, open trunk with the map)
exec(open('C:/Users/libde/100gate/tools/gas-station/car_build.py', encoding='utf-8').read())
print('road & world built:', len(COL.objects), 'objects')

# ------------------------------------------------------------------ 7) clear the decorative trees that stand on the new apron, paths and the motel's side
for _n in ('Tree', 'Tree.001', 'Tree.002', 'Tree.003', 'Tree.004', 'Tree.005', 'Tree.006', 'Tree.007', 'Tree.008', 'Tree.009', 'Tree.010', 'Tree.011', 'Tree.012', 'Tree.013', 'Tree.014',
           'Cone.006', 'Cone.007', 'Cone.008', 'Cone.009'):
    _o = bpy.data.objects.get(_n)
    if _o: bpy.data.objects.remove(_o, do_unlink=True)
