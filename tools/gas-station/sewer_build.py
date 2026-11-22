"""The sewer level under the gas station (collection 'Sewer'), procedural, UV-driven brick/concrete/slime shaders, no booleans.
Local frame O = the manhole shaft centre (-15.2, -31) on the surface; floors (walkway) at z = -5.0, channel bed -5.8, water surface -5.45.
  Shaft  : ladder from the road down into the junction hall
  C1     : junction hall 9 x 9 m, channel along x, walkways both sides       -> tunnels east (T1) / west (T2, collapsed) / north (T3)
  T1     : east tunnel -> C2 valve room (four wheel valves + gauges + wall diagram)
  T3     : north tunnel -> C3 round cistern with the exit gate (and the sweet spot of the last perspective puzzle)
Run through the Blender MCP:  exec(open(r"C:\\Users\\libde\\100gate\\tools\\gas-station\\sewer_build.py", encoding="utf-8").read())
"""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix

random.seed(77)
OX, OY = -15.2, -31.0
ZW, ZC, ZWATER = -5.0, -5.8, -5.45

def fresh(name):
    c = bpy.data.collections.get(name)
    if c:
        for o in list(c.objects): bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(c)
    c = bpy.data.collections.new(name); bpy.context.scene.collection.children.link(c); return c
COL = fresh('Sewer')

# ------------------------------------------------------------------ materials
def new_mat(name):
    m = bpy.data.materials.get(name)
    if m: bpy.data.materials.remove(m)
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); out.location = (1200, 0)
    b = nt.nodes.new('ShaderNodeBsdfPrincipled'); b.location = (900, 0); nt.links.new(b.outputs[0], out.inputs[0]); return m, nt, b
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

def mat_solid(name, col, rough=.6, metal=0, alpha=1, emit=None, k=0):
    m, nt, b = new_mat(name); b.inputs['Base Color'].default_value = col; b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if alpha < 1: b.inputs['Alpha'].default_value = alpha; m.blend_method = 'BLEND'; m.surface_render_method = 'BLENDED'
    if emit: b.inputs['Emission Color'].default_value = emit; b.inputs['Emission Strength'].default_value = k
    return m

def mat_brick(name='S_Brick', base=(.22, .09, .06, 1), slime=.55, scale=1.0):
    """UV in metres -> real brick size. Slime + moss from the floor, wet sheen low on the wall."""
    m, nt, b = new_mat(name); tc = N(nt, 'ShaderNodeTexCoord', -1300, 0)
    br = N(nt, 'ShaderNodeTexBrick', -1000, 250); br.inputs['Scale'].default_value = 1.0
    br.inputs['Brick Width'].default_value = .24; br.inputs['Row Height'].default_value = .075; br.inputs['Mortar Size'].default_value = .008; br.inputs['Mortar Smooth'].default_value = .05; br.inputs['Bias'].default_value = 0
    br.inputs['Color1'].default_value = base; br.inputs['Color2'].default_value = (base[0] * .55, base[1] * .55, base[2] * .55, 1); br.inputs['Mortar'].default_value = (.1, .1, .09, 1)
    lk(nt, tc, br, 'UV', 'Vector')
    ns = N(nt, 'ShaderNodeTexNoise', -1000, -100); ns.inputs['Scale'].default_value = 1.6 * scale; ns.inputs['Detail'].default_value = 12; lk(nt, tc, ns, 'UV', 'Vector')
    ns2 = N(nt, 'ShaderNodeTexNoise', -1000, -400); ns2.inputs['Scale'].default_value = 9; ns2.inputs['Detail'].default_value = 8; lk(nt, tc, ns2, 'UV', 'Vector')
    grime = ramp(nt, -700, -100, [(.35, (1, 1, 1, 1)), (.7, (.25, .27, .2, 1))]); lk(nt, ns, grime, 0, 0)
    moss = ramp(nt, -700, -400, [(.52, (1, 1, 1, 1)), (.68, (.4, .65, .25, 1))]); lk(nt, ns2, moss, 0, 0)
    m1 = N(nt, 'ShaderNodeMix', -400, 150, data_type='RGBA', blend_type='MULTIPLY'); m1.inputs[0].default_value = 1; lk(nt, br, m1, 0, 6); lk(nt, grime, m1, 0, 7)
    m2 = N(nt, 'ShaderNodeMix', -150, 100, data_type='RGBA', blend_type='MULTIPLY'); m2.inputs[0].default_value = slime; lk(nt, m1, m2, 2, 6); lk(nt, moss, m2, 0, 7); lk(nt, m2, b, 2, 'Base Color')
    rg = ramp(nt, -150, -250, [(.3, (.25, .25, .25, 1)), (.65, (.85, .85, .85, 1))]); lk(nt, ns, rg, 0, 0); lk(nt, rg, b, 0, 'Roughness')
    bp = N(nt, 'ShaderNodeBump', 300, -300); bp.inputs['Strength'].default_value = .9; lk(nt, br, bp, 'Fac', 'Height'); lk(nt, bp, b, 0, 'Normal')
    return m

def mat_concrete(name='S_Concrete', base=(.2, .2, .19, 1)):
    m, nt, b = new_mat(name); tc = N(nt, 'ShaderNodeTexCoord', -1000, 0)
    n1 = N(nt, 'ShaderNodeTexNoise', -750, 100); n1.inputs['Scale'].default_value = 1.4; n1.inputs['Detail'].default_value = 12; lk(nt, tc, n1, 'UV', 'Vector')
    n2 = N(nt, 'ShaderNodeTexNoise', -750, -200); n2.inputs['Scale'].default_value = 28; n2.inputs['Detail'].default_value = 6; lk(nt, tc, n2, 'UV', 'Vector')
    r = ramp(nt, -450, 100, [(.3, (base[0] * .55, base[1] * .55, base[2] * .5, 1)), (.7, base)]); lk(nt, n1, r, 0, 0)
    d = ramp(nt, -450, -200, [(.4, (.8, .8, .8, 1)), (.7, (1.1, 1.1, 1.1, 1))]); lk(nt, n2, d, 0, 0)
    mm = N(nt, 'ShaderNodeMix', -150, 0, data_type='RGBA', blend_type='MULTIPLY'); mm.inputs[0].default_value = 1; lk(nt, r, mm, 0, 6); lk(nt, d, mm, 0, 7); lk(nt, mm, b, 2, 'Base Color')
    b.inputs['Roughness'].default_value = .85; bp = N(nt, 'ShaderNodeBump', 200, -250); bp.inputs['Strength'].default_value = .4; lk(nt, n2, bp, 0, 'Height'); lk(nt, bp, b, 0, 'Normal'); return m

def mat_metal(name, col, rust=.5, rough=.45, paint=None):
    m, nt, b = new_mat(name); tc = N(nt, 'ShaderNodeTexCoord', -900, 0); ns = N(nt, 'ShaderNodeTexNoise', -650, 0); ns.inputs['Scale'].default_value = 5; ns.inputs['Detail'].default_value = 12; lk(nt, tc, ns, 'Object', 'Vector')
    p0 = .35 + (1 - rust) * .45
    r = ramp(nt, -350, 100, [(p0, col), (p0 + .2, (.26, .1, .04, 1))]); lk(nt, ns, r, 0, 0); lk(nt, r, b, 0, 'Base Color')
    mt = ramp(nt, -350, -150, [(p0, (.8, .8, .8, 1)), (p0 + .2, (0, 0, 0, 1))]); lk(nt, ns, mt, 0, 0); lk(nt, mt, b, 0, 'Metallic')
    rg = ramp(nt, -350, -350, [(p0, (rough, rough, rough, 1)), (p0 + .2, (.9, .9, .9, 1))]); lk(nt, ns, rg, 0, 0); lk(nt, rg, b, 0, 'Roughness'); return m

def mat_water(name='S_Water'):
    m, nt, b = new_mat(name); tc = N(nt, 'ShaderNodeTexCoord', -900, 0)
    n1 = N(nt, 'ShaderNodeTexNoise', -650, 0); n1.inputs['Scale'].default_value = 3.0; n1.inputs['Detail'].default_value = 6; lk(nt, tc, n1, 'Object', 'Vector')
    r = ramp(nt, -350, 100, [(.3, (.008, .02, .018, 1)), (.7, (.03, .06, .04, 1))]); lk(nt, n1, r, 0, 0); lk(nt, r, b, 0, 'Base Color')
    b.inputs['Roughness'].default_value = .05; b.inputs['Alpha'].default_value = .9; m.blend_method = 'BLEND'; m.surface_render_method = 'BLENDED'
    bp = N(nt, 'ShaderNodeBump', 200, -250); bp.inputs['Strength'].default_value = .25; lk(nt, n1, bp, 0, 'Height'); lk(nt, bp, b, 0, 'Normal'); return m

M = {}
M['brick'] = mat_brick(); M['brick2'] = mat_brick('S_BrickDark', (.14, .06, .045, 1), .75); M['concrete'] = mat_concrete(); M['concrete2'] = mat_concrete('S_ConcreteDark', (.12, .12, .115, 1))
M['rust'] = mat_metal('S_Rust', (.22, .23, .22, 1), .75, .55); M['pipe_g'] = mat_metal('S_PipeGreen', (.1, .22, .14, 1), .6, .45); M['pipe_r'] = mat_metal('S_PipeRed', (.45, .06, .05, 1), .55, .4)
M['pipe_y'] = mat_metal('S_PipeYellow', (.6, .45, .05, 1), .55, .4); M['steel'] = mat_metal('S_Steel', (.35, .36, .37, 1), .25, .35); M['brass'] = mat_solid('S_Brass', (.55, .38, .12, 1), .3, 1)
M['water'] = mat_water(); M['slime'] = mat_solid('S_Slime', (.08, .16, .06, 1), .15)
M['wood'] = mat_solid('S_Wood', (.12, .07, .035, 1), .8); M['paper'] = mat_solid('S_Paper', (.6, .58, .48, 1), .9); M['rubber'] = mat_solid('S_Rubber', (.02, .02, .02, 1), .9)
M['bulb'] = mat_solid('S_Bulb', (.9, .8, .5, 1), .3, emit=(1, .7, .35, 1), k=10); M['bulbdead'] = mat_solid('S_BulbDead', (.2, .18, .12, 1), .3)
M['green'] = mat_solid('S_ExitGreen', (.1, .8, .25, 1), .3, emit=(.1, 1, .3, 1), k=6); M['red'] = mat_solid('S_Red', (.5, .03, .02, 1), .35)
M['glassg'] = mat_solid('S_GaugeGlass', (.7, .8, .75, 1), .05, alpha=.3); M['face'] = mat_solid('S_GaugeFace', (.7, .68, .55, 1), .6); M['black'] = mat_solid('S_Black', (.015, .015, .015, 1), .6)

# ------------------------------------------------------------------ helpers
def link(o): COL.objects.link(o); return o
def uv_box(bm, uvl, ax=None):
    """metre-sized planar UVs per face (so the brick is brick-sized on any box)"""
    for f in bm.faces:
        n = f.normal; a = max(range(3), key=lambda i: abs(n[i])); u, v = [(1, 2), (0, 2), (0, 1)][a]
        for l in f.loops: l[uvl].uv = (l.vert.co[u], l.vert.co[v])
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
    uvl = bm.loops.layers.uv.verify() if bm.loops.layers.uv else bm.loops.layers.uv.new('UVMap')
    bm.normal_update(); uv_box(bm, uvl)
    o = mesh_obj(name, bm, mat); o.location = (OX + c[0], OY + c[1], c[2]); o.rotation_euler = rot; return o
def cyl(name, c, r, h, mat, seg=18, rot=(0, 0, 0), r2=None):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h)
    o = mesh_obj(name, bm, mat, smooth=True); o.location = (OX + c[0], OY + c[1], c[2]); o.rotation_euler = rot; return o
def torus(name, c, R, r, mat, rot=(0, 0, 0), seg=24, rseg=8):
    bm = bmesh.new(); rings = []
    for i in range(seg):
        a = 2 * math.pi * i / seg; ring = []
        for j in range(rseg):
            b_ = 2 * math.pi * j / rseg; ring.append(bm.verts.new(((R + r * math.cos(b_)) * math.cos(a), (R + r * math.cos(b_)) * math.sin(a), r * math.sin(b_))))
        rings.append(ring)
    for i in range(seg):
        for j in range(rseg): bm.faces.new((rings[i][j], rings[i][(j + 1) % rseg], rings[(i + 1) % seg][(j + 1) % rseg], rings[(i + 1) % seg][j]))
    o = mesh_obj(name, bm, mat, smooth=True); o.location = (OX + c[0], OY + c[1], c[2]); o.rotation_euler = rot; return o

def vault(name, p0, p1, w, wall_h, mat='brick', seg=14, floor_z=ZW):
    """barrel-vaulted tunnel shell (inside faces), axis p0->p1 on the xy plane: straight walls up to floor_z+wall_h then a half-circle arch of radius w/2"""
    a = Vector(p0); b = Vector(p1); d = (b - a); L = d.length; d.normalize(); n = Vector((-d.y, d.x, 0))
    prof = [(-w / 2, floor_z)] + [(-w / 2, floor_z + wall_h)] + [((-w / 2) * math.cos(math.pi * i / seg) , floor_z + wall_h + (w / 2) * math.sin(math.pi * i / seg)) for i in range(1, seg)] + [(w / 2, floor_z + wall_h), (w / 2, floor_z)]
    steps = max(1, int(L / 2.0)); bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap')
    rows = []
    for s_ in range(steps + 1):
        t = L * s_ / steps; c = a + d * t; rows.append([bm.verts.new((c.x + n.x * px, c.y + n.y * px, pz)) for px, pz in prof])
    acc = [0.0]
    for i in range(1, len(prof)): acc.append(acc[-1] + math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]))
    for s_ in range(steps):
        for i in range(len(prof) - 1):
            f = bm.faces.new((rows[s_][i], rows[s_][i + 1], rows[s_ + 1][i + 1], rows[s_ + 1][i]))
            for l in f.loops:
                idx = rows.index([r for r in rows if l.vert in r][0]); pi = rows[idx].index(l.vert); l[uvl].uv = (L * idx / steps, acc[pi])
    for f in bm.faces: f.normal_flip() if False else None
    o = mesh_obj(name, bm, mat, smooth=True); return o                 # (the winding above already looks inward)

def ring_frame(name, c, ang, w, wall_h, floor_z=ZW, thick=.35, depth=.5):
    """a masonry arch ring around a doorway / tunnel mouth (hides the seam), axis along `ang`"""
    seg = 14; bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap'); d = Vector((math.cos(ang), math.sin(ang), 0)); n = Vector((-d.y, d.x, 0))
    def pt(px, pz, off): return bm.verts.new((c[0] + d.x * off + n.x * px, c[1] + d.y * off + n.y * px, pz))
    inner = [(-w / 2, floor_z)] + [((-w / 2) * math.cos(math.pi * i / seg), floor_z + wall_h + (w / 2) * math.sin(math.pi * i / seg)) for i in range(0, seg + 1)] + [(w / 2, floor_z)]
    outer = [(x * (1 + 2 * thick / w) , floor_z + (z - floor_z) * 1.0 + (thick if z > floor_z + wall_h else 0)) for x, z in inner]
    for i in range(len(inner) - 1):
        for off in (0,):
            a0, a1 = pt(*inner[i], -depth / 2), pt(*inner[i + 1], -depth / 2); b0, b1 = pt(*outer[i], -depth / 2), pt(*outer[i + 1], -depth / 2)
            a2, a3 = pt(*inner[i], depth / 2), pt(*inner[i + 1], depth / 2); b2, b3 = pt(*outer[i], depth / 2), pt(*outer[i + 1], depth / 2)
            bm.faces.new((a0, a1, b1, b0)); bm.faces.new((a3, a2, b2, b3)); bm.faces.new((b0, b1, b3, b2)); bm.faces.new((a1, a0, a2, a3))
    bm.normal_update()
    for f in bm.faces:
        for l in f.loops: l[uvl].uv = (l.vert.co.x + l.vert.co.y, l.vert.co.z)
    o = mesh_obj(name, bm, 'brick2', smooth=True); return o

# ------------------------------------------------------------------ 1) junction hall C1 (9 x 9, flat-ish brick ceiling), channel + walkways
def hall(tag, cx, cy, sx, sy, zt=-1.2, openings=(), mat='brick'):
    """rectangular hall: floor walkways, channel, walls (with openings: (side, centre, width, height)), ceiling slab"""
    box(f'{tag}_FloorN', (cx, cy + (sy / 2 + 1.0) / 2, ZW - .3), (sx, sy / 2 - 1.0, .6), 'concrete'); box(f'{tag}_FloorS', (cx, cy - (sy / 2 + 1.0) / 2, ZW - .3), (sx, sy / 2 - 1.0, .6), 'concrete')
    box(f'{tag}_ChannelBed', (cx, cy, ZC - .15), (sx, 2.0, .3), 'concrete2'); box(f'{tag}_ChannelWallN', (cx, cy + 1.0, ZC + .4), (sx, .15, 1.2), 'brick2'); box(f'{tag}_ChannelWallS', (cx, cy - 1.0, ZC + .4), (sx, .15, 1.2), 'brick2')
    box(f'{tag}_Water', (cx, cy, ZWATER), (sx, 1.9, .02), 'water')
    box(f'{tag}_Ceiling', (cx, cy, zt + .15), (sx + .6, sy + .6, .3), 'concrete2')
    zh = zt - ZW
    for side, (px, py, ln, ang) in {'N': (cx, cy + sy / 2, sx, 0), 'S': (cx, cy - sy / 2, sx, 0), 'E': (cx + sx / 2, cy, sy, math.pi / 2), 'W': (cx - sx / 2, cy, sy, math.pi / 2)}.items():
        ops = sorted([o for o in openings if o[0] == side], key=lambda o: o[1]); u = -ln / 2; k = 0
        def seg(u_a, u_b, zb, zt_, nm):
            if u_b - u_a < .01 or zt_ - zb < .01: return
            m = (u_a + u_b) / 2; dx, dy = (m, 0) if ang == 0 else (0, m)
            box(f'{tag}_Wall{side}_{nm}{k}', (px + dx, py + dy, (zb + zt_) / 2), ((u_b - u_a) if ang == 0 else .3, .3 if ang == 0 else (u_b - u_a), zt_ - zb), mat, rot=(0, 0, 0))
        for (_, c_, w_, h_) in ops:
            seg(u, c_ - w_ / 2, ZW - .6, zt, 'W'); seg(c_ - w_ / 2, c_ + w_ / 2, ZW + h_, zt, 'Head'); u = c_ + w_ / 2; k += 1
        seg(u, ln / 2, ZW - .6, zt, 'W')

W_T = 3.4                                                                                    # tunnel width
hall('C1', 0, 0, 9, 9, openings=[('E', 0, W_T, 2.2), ('W', 0, W_T, 2.2), ('N', 0, W_T, 2.2)])
# the shaft: a ring of rungs down the south wall, concrete collar through the ceiling
cyl('Shaft_Collar', (0, -3.4, -.6), .85, 1.2, 'concrete2', 24); cyl('Shaft_Hole', (0, -3.4, -.58), .7, 1.25, 'black', 24)
box('Shaft_Ceil_A', (0, -3.4 - 1.35, -1.05), (3.2, 1.5, .3), 'concrete2'); box('Shaft_Ceil_B', (0, -3.4 + 1.35, -1.05), (3.2, 1.5, .3), 'concrete2')
for sd in (-1, 1): box(f'Shaft_Rail{sd}', (sd * .22, -4.44, -2.7), (.05, .05, 5.0), 'rust')
for i in range(14): box(f'Shaft_Rung{i}', (0, -4.44, -.25 - i * .33), (.44, .04, .04), 'rust')
box('Shaft_Wall', (0, -4.46, -2.8), (4.0, .1, 4.0), 'brick')

# ------------------------------------------------------------------ 2) tunnels: east T1 (to the valve room), west T2 (collapsed), north T3 (to the cistern)
def tunnel(tag, p0, p1, w=W_T):
    ang = math.atan2(p1[1] - p0[1], p1[0] - p0[0]); L = math.hypot(p1[0] - p0[0], p1[1] - p0[1]); d = Vector((math.cos(ang), math.sin(ang), 0)); n = Vector((-d.y, d.x, 0))
    vault(tag + '_Vault', p0, p1, w, 2.2)
    # floor: walkway on the left (1.2 m) + channel (2.0) fits w=3.4 -> walkway .7 each side
    for sd, nm in ((1, 'A'), (-1, 'B')):
        c = Vector(((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, 0)) + n * sd * (1.0 + (w / 2 - 1.0) / 2)
        o = box(f'{tag}_Walk{nm}', (c.x - OX, c.y - OY, ZW - .3), (L, w / 2 - 1.0, .6), 'concrete', rot=(0, 0, ang))
    c = Vector(((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, 0))
    box(f'{tag}_Bed', (c.x - OX, c.y - OY, ZC - .15), (L, 2.0, .3), 'concrete2', rot=(0, 0, ang)); box(f'{tag}_Water', (c.x - OX, c.y - OY, ZWATER), (L, 1.9, .02), 'water', rot=(0, 0, ang))
    for sd in (-1, 1): box(f'{tag}_ChWall{sd}', ((c + n * sd * 1.0).x - OX, (c + n * sd * 1.0).y - OY, ZC + .4), (L, .15, 1.2), 'brick2', rot=(0, 0, ang))
    return ang, L, d, n
def pipes(tag, p0, p1, ang, L, d, n, w=W_T, mats=('pipe_g', 'pipe_r')):
    c = Vector(((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, 0))
    for k, (off, zz, r, m) in enumerate(((w / 2 - .22, -2.5, .13, mats[0]), (w / 2 - .22, -3.0, .08, mats[1]), (-w / 2 + .25, -2.3, .1, 'rust'))):
        q = c + n * off; cyl(f'{tag}_Pipe{k}', (q.x - OX, q.y - OY, zz), r, L - .3, m, 14, rot=(0, math.radians(90), ang))
        for i in range(int(L / 2.5) + 1):
            t = -L / 2 + .2 + i * 2.5
            if t > L / 2 - .2: break
            f = c + d * t + n * off; cyl(f'{tag}_Flange{k}_{i}', (f.x - OX, f.y - OY, zz), r * 1.45, .06, 'steel', 14, rot=(0, math.radians(90), ang))
            box(f'{tag}_Bracket{k}_{i}', (f.x - OX, f.y - OY, zz - r - .1), (.08, .08, .2), 'rust')
T1 = ((4.5 + OX, OY), (18.0 + OX, OY)); a1 = tunnel('T1', *T1); pipes('T1', *T1, *a1)
T2 = ((-4.5 + OX, OY), (-13.0 + OX, OY)); a2 = tunnel('T2', *T2); pipes('T2', *T2, *a2)
T3 = ((OX, 4.5 + OY), (OX, 19.0 + OY)); a3 = tunnel('T3', *T3); pipes('T3', *T3, *a3)
for nm, c, ang in (('Ring_E', (4.5, 0), 0), ('Ring_W', (-4.5, 0), 0), ('Ring_N', (0, 4.5), math.pi / 2), ('Ring_E2', (18.0, 0), 0)): ring_frame(nm, (c[0] + OX, c[1] + OY), ang, W_T + .1, 2.2)

# collapse at the end of the west tunnel: rubble, beams, a seeping puddle
for i in range(24):
    box(f'Rubble{i}', (-11.8 - random.uniform(0, 1.2), random.uniform(-1.4, 1.4), ZW + random.uniform(0, 1.8)), (random.uniform(.3, .9), random.uniform(.3, .8), random.uniform(.25, .7)), 'concrete' if i % 2 else 'brick2', rot=(random.random(), random.random(), random.random()))
for i in range(3): box(f'Beam{i}', (-11.3, -1.0 + i * 1.0, ZW + 1.4 + i * .1), (.2, .2, 2.8), 'wood', rot=(0, math.radians(15 * (i - 1)), 0))
# an alcove with a service door in the north tunnel (T3): a recess with a rusted steel door
box('Nook_Back', (2.0, 9.0, ZW + 1.1), (.2, 1.4, 2.2), 'brick2'); box('Nook_Door', (1.68, 9.0, ZW + 1.05), (.08, 1.0, 2.0), 'rust', bevel=.01)
for yy in (-.4, .4): cyl(f'Nook_Hinge{yy}', (1.62, 9.0 + yy, ZW + 1.9), .03, .12, 'steel', 8)
box('Nook_Plate', (1.62, 9.0, ZW + 1.3), (.02, .3, .12), 'brass')

# ------------------------------------------------------------------ 3) valve room C2 (x 18 .. 31) with a pipe manifold and four wheel valves
hall('C2', 24.5, 0, 13, 7, openings=[('W', 0, W_T, 2.2)])
ring_frame('Ring_C2', (18.0 + OX, OY), 0, W_T + .1, 2.2)
box('C2_Manifold', (24.5, 3.1, ZW + 2.0), (11.0, .5, .5), 'pipe_g'); cyl('C2_Main', (24.5, 3.2, ZW + 2.0), .3, 11.0, 'pipe_g', 20, rot=(0, math.radians(90), 0))
for i in range(5): cyl(f'C2_MainFlange{i}', (19.5 + i * 2.5, 3.2, ZW + 2.0), .42, .08, 'steel', 20, rot=(0, math.radians(90), 0))
VX = (20.8, 23.0, 25.2, 27.4)
for i, x in enumerate(VX):
    cyl(f'Valve{i + 1}_Pipe', (x, 3.2, ZW + 1.0), .14, 2.0, 'pipe_r' if i % 2 else 'pipe_y', 14); cyl(f'Valve{i + 1}_Body', (x, 3.05, ZW + 1.2), .26, .3, 'rust', 16, rot=(math.radians(90), 0, 0))
    cyl(f'Valve{i + 1}_Stem', (x, 2.85, ZW + 1.2), .025, .35, 'steel', 8, rot=(math.radians(90), 0, 0))
    torus(f'Valve{i + 1}_Wheel', (x, 2.62, ZW + 1.2), .26, .022, 'pipe_r', rot=(math.radians(90), 0, 0))                         # hand wheel (the puzzle prop; the game turns it)
    for k in range(4): box(f'Valve{i + 1}_Spoke{k}', (x, 2.62, ZW + 1.2), (.52, .02, .02), 'pipe_r', rot=(0, k * math.pi / 4, 0))
    cyl(f'Valve{i + 1}_Gauge', (x, 2.72, ZW + 1.95), .11, .05, 'face', 20, rot=(math.radians(90), 0, 0)); cyl(f'Valve{i + 1}_GaugeRim', (x, 2.74, ZW + 1.95), .125, .03, 'brass', 20, rot=(math.radians(90), 0, 0))
    box(f'Valve{i + 1}_Needle', (x, 2.68, ZW + 1.97), (.008, .01, .09), 'black', rot=(0, 0, 0))
    box(f'Valve{i + 1}_Tag', (x, 2.8, ZW + .55), (.22, .02, .16), 'brass')
# wall diagram (paper) with the valve order, control panel, grating over a pit, barrels, a table with a lantern
box('C2_Diagram', (24.5, 3.38, ZW + 2.6), (1.6, .02, 1.1), 'paper'); box('C2_DiagramFrame', (24.5, 3.39, ZW + 2.6), (1.7, .02, 1.2), 'wood')
for i in range(4): box(f'C2_DiagramMark{i}', (23.9 + i * .4, 3.37, ZW + 2.6), (.12, .01, .12), 'red')
box('C2_Panel', (30.2, 1.2, ZW + 1.0), (.5, 1.2, 2.0), 'steel', bevel=.01)
for i in range(4): cyl(f'C2_Lamp{i}', (29.93, .8 + i * .25, ZW + 1.6), .04, .04, 'green' if i % 2 else 'red', 10, rot=(0, math.radians(90), 0))
box('C2_Lever', (29.9, 1.2, ZW + 1.1), (.06, .06, .4), 'rust', rot=(0, math.radians(35), 0))
for i in range(6): box(f'C2_Grate{i}', (26.0 + i * .3, -1.7, ZW + .02), (.04, 2.4, .04), 'steel')
for k, (x, y) in enumerate(((29.5, -2.8), (30.1, -2.2), (28.8, -3.0))): cyl(f'C2_Barrel{k}', (x, y, ZW + .45), .3, .9, 'rust', 16)
box('C2_Table', (21.5, -2.6, ZW + .5), (1.2, .7, .06), 'wood'); cyl('C2_Lantern', (21.5, -2.6, ZW + .65), .07, .24, 'bulb', 10)
for xx in (-.5, .5):
    for yy in (-.25, .25): box(f'C2_TableLeg{xx}{yy}', (21.5 + xx, -2.6 + yy, ZW + .25), (.06, .06, .5), 'wood')

# ------------------------------------------------------------------ 4) cistern C3: round room R = 6.2 north of the junction, dome ceiling, central pillar, exit gate
CY = 19.0 + 6.2
R3 = 6.2; segs = 36
bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap'); rings = []
for k, (rr, zz) in enumerate([(R3, ZW - .6), (R3, ZW + 3.2)] + [(R3 * math.cos(math.pi / 2 * i / 8), ZW + 3.2 + R3 * .55 * math.sin(math.pi / 2 * i / 8)) for i in range(1, 9)]):
    rings.append([bm.verts.new((rr * math.cos(2 * math.pi * i / segs), rr * math.sin(2 * math.pi * i / segs), zz)) for i in range(segs)])
for k in range(len(rings) - 1):
    for i in range(segs):
        f = bm.faces.new((rings[k][i], rings[k][(i + 1) % segs], rings[k + 1][(i + 1) % segs], rings[k + 1][i]))
        for l in f.loops: l[uvl].uv = (math.atan2(l.vert.co.y, l.vert.co.x) * R3, l.vert.co.z * 1.4 + math.hypot(l.vert.co.x, l.vert.co.y) * .0)
o = mesh_obj('C3_Shell', bm, 'brick', smooth=True); o.location = (OX, OY + CY, 0)
# floor: ring walkway + circular channel + central island
for k in range(segs):
    a0 = 2 * math.pi * k / segs; a1 = 2 * math.pi * (k + 1) / segs; am = (a0 + a1) / 2
    for nm, r_in, r_out, z, mat in (('Walk', 3.4, R3, ZW - .3, 'concrete'), ('Island', 0, 2.2, ZW - .3, 'concrete')):
        pass
bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap')
def disc(r_in, r_out, z, flip=False):
    a = [[bm.verts.new((r * math.cos(2 * math.pi * i / segs), r * math.sin(2 * math.pi * i / segs), z)) for i in range(segs)] for r in (r_in, r_out)] if r_in > 0 else None
    if a:
        for i in range(segs):
            f = bm.faces.new((a[0][i], a[0][(i + 1) % segs], a[1][(i + 1) % segs], a[1][i]))
            for l in f.loops: l[uvl].uv = (l.vert.co.x, l.vert.co.y)
    else:
        v = [bm.verts.new((r_out * math.cos(2 * math.pi * i / segs), r_out * math.sin(2 * math.pi * i / segs), z)) for i in range(segs)]; f = bm.faces.new(v)
        for l in f.loops: l[uvl].uv = (l.vert.co.x, l.vert.co.y)
disc(3.4, R3, ZW, False); disc(0, 2.2, ZW)
fl = mesh_obj('C3_Floor', bm, 'concrete'); fl.location = (OX, OY + CY, 0)
cyl('C3_Bed', (0, CY, ZC - .1), 3.4, .2, 'concrete2', 36); cyl('C3_Water', (0, CY, ZWATER), 3.3, .02, 'water', 36)
cyl('C3_IslandSide', (0, CY, ZW - .5), 2.2, 1.0, 'brick2', 36)
bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap')                                   # the walkway's inner edge, the outer wall of the channel (faces look inward to the island)
lo_ = [bm.verts.new((3.4 * math.cos(2 * math.pi * i / segs), 3.4 * math.sin(2 * math.pi * i / segs), ZC)) for i in range(segs)]
hi_ = [bm.verts.new((3.4 * math.cos(2 * math.pi * i / segs), 3.4 * math.sin(2 * math.pi * i / segs), ZW)) for i in range(segs)]
for i in range(segs):
    f = bm.faces.new((lo_[i], hi_[i], hi_[(i + 1) % segs], lo_[(i + 1) % segs]))
    for l in f.loops: l[uvl].uv = (math.atan2(l.vert.co.y, l.vert.co.x) * 3.4, l.vert.co.z)
cw = mesh_obj('C3_ChannelWall', bm, 'brick2', smooth=True); cw.location = (OX, OY + CY, 0)
for k in range(6):                                                                           # pillar supports the dome, arches rise from it
    a = k * math.pi / 3; box(f'C3_Rib{k}', (1.1 * math.cos(a), CY + 1.1 * math.sin(a), ZW + 2.4), (.3, 1.7, .3), 'concrete2', rot=(0, 0, a + math.pi / 2))
cyl('C3_Pillar', (0, CY, ZW + 1.9), .6, 3.8, 'concrete', 20); cyl('C3_PillarCap', (0, CY, ZW + 3.9), .85, .3, 'concrete2', 20)
# exit gate on the north wall: a heavy steel double gate with rivets, a wheel lock and a green exit sign; the tunnel arrives from the south
GY = CY + R3 - .15
box('Gate_Frame', (0, GY, ZW + 1.6), (3.2, .5, 3.2), 'concrete2');
for sd, nm in ((-1, 'L'), (1, 'R')):
    box(f'Gate_{nm}', (sd * .7, GY - .2, ZW + 1.4), (1.35, .12, 2.7), 'steel', bevel=.015)
    for ix in range(3):
        for iz in range(5): cyl(f'Gate_{nm}_Rivet{ix}{iz}', (sd * .7 - .45 + ix * .45, GY - .27, ZW + .4 + iz * .55), .03, .03, 'brass', 8, rot=(math.radians(90), 0, 0))
    box(f'Gate_{nm}_Bar', (sd * .7, GY - .27, ZW + 1.4), (1.3, .04, .08), 'rust')
torus('Gate_LockWheel', (0, GY - .35, ZW + 1.4), .3, .03, 'pipe_r', rot=(math.radians(90), 0, 0)); cyl('Gate_LockHub', (0, GY - .33, ZW + 1.4), .06, .08, 'brass', 12, rot=(math.radians(90), 0, 0))
for k in range(3): box(f'Gate_LockSpoke{k}', (0, GY - .35, ZW + 1.4), (.6, .02, .02), 'pipe_r', rot=(0, k * math.pi / 3, 0))
cyl('Gate_Keyhole', (.0, GY - .3, ZW + 1.1), .05, .03, 'black', 10, rot=(math.radians(90), 0, 0)); box('Gate_KeySlot', (0, GY - .3, ZW + 1.04), (.02, .02, .08), 'black')
box('Gate_ExitSign', (0, GY - .3, ZW + 3.35), (.9, .06, .25), 'green', bevel=.01)
# sweet spot of the last perspective puzzle: a worn mark on the walkway looking north at the pieces hung from the dome
box('C3_SweetMark', (0, CY - 5.0, ZW + .01), (.5, .5, .01), 'brass', rot=(0, 0, math.radians(45)))
sp = bpy.data.objects.new('C3_SweetSpot', None); sp.empty_display_type = 'ARROWS'; sp.location = (OX, OY + CY - 5.0, ZW + 1.65); sp.rotation_euler = (math.radians(90), 0, 0); link(sp)

# ------------------------------------------------------------------ 5) lamps (caged bulbs, some dead) with lights, drips, graffiti streaks
def lamp(tag, x, y, z, alive=True, energy=35):
    box(f'{tag}_Base', (x, y, z + .06), (.14, .14, .04), 'steel'); cyl(f'{tag}_Bulb', (x, y, z - .02), .06, .13, 'bulb' if alive else 'bulbdead', 12)
    for k in range(6):
        a = k * math.pi / 3; box(f'{tag}_Cage{k}', (x + math.cos(a) * .085, y + math.sin(a) * .085, z - .02), (.01, .01, .17), 'steel')
    cyl(f'{tag}_CageRing', (x, y, z - .1), .09, .01, 'steel', 12)
    if alive:
        ld = bpy.data.lights.new(tag + '_Light', 'POINT'); ld.energy = energy; ld.color = (1, .72, .42); ld.shadow_soft_size = .12
        lo = bpy.data.objects.new(tag + '_Light', ld); lo.location = (OX + x, OY + y, z - .15); link(lo); return lo
LIGHTS = []
for i, (x, y, z, alive) in enumerate(((0, 0, -1.55, True), (3, 2.8, -2.2, False), (-3, -2.8, -2.2, True), (8, 1.15, -2.1, True), (12.5, 1.15, -2.1, False), (-8, 1.15, -2.1, True),
                                      (1.15, 8, -2.1, True), (1.15, 14, -2.1, True), (24.5, 0, -1.75, True), (29, -2.5, -2.0, False), (0, CY - 2.0, -1.2, True), (0, CY + 2.8, -1.4, True))):
    lo = lamp(f'Lamp{i}', x, y, z, alive, 50 if z < -1.5 and i in (0, 8) else 28)
    if lo is not None and i in (3, 6, 10):                                                                   # a flickering lamp: noise on its energy
        lo.data.energy = 30; lo.data.animation_data_create(); act = bpy.data.actions.new('Lamp%d_flicker' % i); lo.data.animation_data.action = act
        fc = act.fcurves.new('energy'); fc.keyframe_points.insert(1, 30); fc.keyframe_points.insert(120, 30); md = fc.modifiers.new('NOISE'); md.scale = 4; md.strength = 28; md.phase = i
for _nm, _loc, _en, _col in (('C3_GateLight', (0, CY + 4.0, ZW + 2.6), 220, (.5, 1, .6)), ('C3_CentreLight', (0, CY - 2.0, ZW + 3.0), 260, (1, .75, .45))):
    _ld = bpy.data.lights.new(_nm, 'POINT'); _ld.energy = _en; _ld.color = _col; _ld.shadow_soft_size = .3
    _lo = bpy.data.objects.new(_nm, _ld); _lo.location = (OX + _loc[0], OY + _loc[1], _loc[2]); link(_lo)
# drips from the ceiling pipes
for i in range(8): cyl(f'Drip{i}', (random.uniform(-3.5, 3.5), random.uniform(-3, 3), ZW + random.uniform(.4, 2.8)), .006, random.uniform(.1, .3), 'water', 6)
print('sewer built:', len(COL.objects), 'objects')

# ------------------------------------------------------------------ review cameras (own collection, survive re-runs of this script's collection wipe)
def _cams():
    cc = bpy.data.collections.get('SewerCams') or bpy.data.collections.new('SewerCams')
    if cc.name not in bpy.context.scene.collection.children: bpy.context.scene.collection.children.link(cc)
    for n_, loc, tg, lens in (('S_HALL', (-3.8, -3.8, -3.0), (2, 1, -3.5), 16), ('S_T1', (5.5, 0.9, -3.7), (17, 0.6, -3.3), 18), ('S_VALVE', (19.6, -2.8, -3.5), (24.5, 3, -3.2), 18),
                              ('S_CIST', (0, 6.5, -3.6), (0, 27, -3.0), 16), ('S_GATE', (2.6, CY - 3.2, -3.4), (0, CY + 5.8, -3.3), 22), ('S_SHAFT', (0, -2.2, -4.0), (0, -4.4, -1.5), 18), ('S_VALVE2', (24.5, -2.2, -3.6), (24.5, 3.2, -3.4), 24)):
        c = bpy.data.objects.get(n_)
        if not c:
            cd = bpy.data.cameras.new(n_); c = bpy.data.objects.new(n_, cd); cc.objects.link(c)
        c.location = (OX + loc[0], OY + loc[1], loc[2]); t = Vector((OX + tg[0], OY + tg[1], tg[2])); c.rotation_euler = (t - c.location).to_track_quat('-Z', 'Y').to_euler(); c.data.lens = lens
_cams()

# Blender 4.4+: actions created via act.fcurves.new() get a legacy slot but are not bound to it, so nothing plays. Bind every unbound action.
for _coll in (bpy.data.objects, bpy.data.lights, bpy.data.materials, bpy.data.worlds):
    for _idb in _coll:
        for _x in (_idb, getattr(_idb, 'node_tree', None)):
            _ad = getattr(_x, 'animation_data', None)
            if _ad and _ad.action and _ad.action_slot is None and _ad.action.slots: _ad.action_slot = _ad.action.slots[0]
