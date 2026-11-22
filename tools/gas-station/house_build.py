"""The two mini houses of the gas-station level, built procedurally in the same file as world_build.py (run that first):
  House A  "Дом смотрителя" (caretaker's cabin), west of the station at (-21, 5), door to the east, porch, chimney, shed
  House B  "Мотель" (three-room motel block), east of the station at (25, 4), doors to the west, walkway, neon sign
Both have real interiors (inner wall lining, floor boards, ceiling, partitions) and hinged door leaves (origin at the hinge) for animation.
Run through the Blender MCP:  exec(open(r"C:\\Users\\libde\\100gate\\tools\\gas-station\\house_build.py", encoding="utf-8").read())
"""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix

random.seed(33)
_src = open(r"C:\Users\libde\100gate\tools\gas-station\world_build.py", encoding="utf-8").read()
exec(_src[:_src.index("COL = fresh('World')")])      # the materials and helpers of world_build.py, without touching its collection

def fresh(name):
    c = bpy.data.collections.get(name)
    if c:
        for o in list(c.objects): bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(c)
    c = bpy.data.collections.new(name); bpy.context.scene.collection.children.link(c); return c
HC = fresh('Houses')

class House:
    def __init__(s, name, cx, cy, rz):
        s.name = name; s.root = bpy.data.objects.new(name + '_Root', None); s.root.location = (cx, cy, 0); s.root.rotation_euler = (0, 0, rz); HC.objects.link(s.root)
    def add(s, o): o.parent = s.root; return o
    def box(s, nm, c, sz, mat, rot=(0, 0, 0), bevel=0.0):
        bm = bmesh.new(); r = bmesh.ops.create_cube(bm, size=1)
        for v in r['verts']: v.co = Vector((v.co.x * sz[0], v.co.y * sz[1], v.co.z * sz[2]))
        if bevel: bmesh.ops.bevel(bm, geom=list({e for v in r['verts'] for e in v.link_edges}), offset=bevel, segments=1, affect='EDGES')
        me = bpy.data.meshes.new(nm); bm.to_mesh(me); bm.free(); me.materials.append(M[mat] if isinstance(mat, str) else mat)
        o = bpy.data.objects.new(nm, me); HC.objects.link(o); o.location = c; o.rotation_euler = rot; return s.add(o)
    def cyl(s, nm, c, r, h, mat, seg=14, rot=(0, 0, 0), r2=None):
        bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h)
        for f in bm.faces: f.smooth = True
        me = bpy.data.meshes.new(nm); bm.to_mesh(me); bm.free(); me.materials.append(M[mat] if isinstance(mat, str) else mat)
        o = bpy.data.objects.new(nm, me); HC.objects.link(o); o.location = c; o.rotation_euler = rot; return s.add(o)
    def raw(s, nm, bm, mats, smooth=False):
        if smooth:
            for f in bm.faces: f.smooth = True
        me = bpy.data.meshes.new(nm); bm.to_mesh(me); bm.free()
        for m in mats: me.materials.append(M[m] if isinstance(m, str) else m)
        o = bpy.data.objects.new(nm, me); HC.objects.link(o); return s.add(o)

    def wall(s, tag, p0, p1, h, thick, mat, openings=(), z0=0.0, off=0.0):
        """straight wall from p0 to p1 (xy, local). openings: (u0, u1, zb, zt) along the wall from p0. off shifts it sideways (to build an inner lining)."""
        a = Vector(p0); b = Vector(p1); L = (b - a).length; d = (b - a).normalized(); n = Vector((-d.y, d.x)); ang = math.atan2(d.y, d.x)
        cuts = sorted(openings, key=lambda o: o[0]); u = 0.0; k = 0
        def seg(u_a, u_b, zb, zt, nm):
            if u_b - u_a < .005 or zt - zb < .005: return
            m = a + d * ((u_a + u_b) / 2) + n * off
            s.box(f'{s.name}_{tag}_{nm}{k}', (m.x, m.y, z0 + (zb + zt) / 2), (u_b - u_a, thick, zt - zb), mat, rot=(0, 0, ang))
        for (o0, o1, zb, zt) in cuts:
            seg(u, o0, 0, h, 'W'); seg(o0, o1, 0, zb, 'Sill'); seg(o0, o1, zt, h, 'Head'); u = o1; k += 1
        seg(u, L, 0, h, 'W')

    def window(s, tag, p, ang, w, h, zb, frame='woodlight', curtain=None):
        c = Vector(p)
        d = Vector((math.cos(ang), math.sin(ang), 0)); n = Vector((-d.y, d.x, 0))
        for nm, off, sz in (('Top', (0, h / 2), (w + .12, .06)), ('Bot', (0, -h / 2), (w + .16, .08)), ('L', (-w / 2, 0), (.06, h)), ('R', (w / 2, 0), (.06, h))):
            q = c + d * off[0]
            s.box(f'{s.name}_{tag}_Fr{nm}', (q.x, q.y, zb + h / 2 + off[1]), (sz[0] if nm in ('Top', 'Bot') else .06, .2, sz[1]), frame, rot=(0, 0, ang))
        s.box(f'{s.name}_{tag}_Glass', (c.x, c.y, zb + h / 2), (w, .015, h), 'glass', rot=(0, 0, ang))
        s.box(f'{s.name}_{tag}_MullV', (c.x, c.y, zb + h / 2), (.03, .05, h), frame, rot=(0, 0, ang)); s.box(f'{s.name}_{tag}_MullH', (c.x, c.y, zb + h / 2), (w, .05, .03), frame, rot=(0, 0, ang))
        if curtain:
            for sd in (-1, 1):
                q = c + d * (sd * w * .36) - n * .12
                s.box(f'{s.name}_{tag}_Curtain{sd}', (q.x, q.y, zb + h / 2 + .05), (w * .3, .03, h * 1.05), curtain, rot=(0, 0, ang + random.uniform(-.06, .06)))

    def door(s, tag, p, ang, w=.95, h=2.05, mat='door', hinge=-1, open_deg=0, frame='woodlight', knob=True):
        """door leaf with its origin at the hinge; p = centre of the opening on the wall line"""
        c = Vector(p); d = Vector((math.cos(ang), math.sin(ang), 0)); hp = c + d * (hinge * w / 2)
        leaf = s.box(f'{s.name}_{tag}_Leaf', (0, 0, 0), (.04, .04, .04), mat); leaf.data.clear_geometry()
        bm = bmesh.new(); r = bmesh.ops.create_cube(bm, size=1)
        for v in r['verts']: v.co = Vector((v.co.x * w + (-hinge) * w / 2, v.co.y * .05, v.co.z * h + h / 2))
        bm.to_mesh(leaf.data); bm.free(); leaf.data.materials.clear(); leaf.data.materials.append(M[mat])
        leaf.location = (hp.x, hp.y, 0); leaf.rotation_euler = (0, 0, ang + math.radians(open_deg))
        for nm, off, sz in (('Top', (0, h + .04), (w + .14, .08)), ('L', (-w / 2 - .035, h / 2), (.07, h)), ('R', (w / 2 + .035, h / 2), (.07, h))):
            q = c + d * off[0]; s.box(f'{s.name}_{tag}_Fr{nm}', (q.x, q.y, off[1]), (sz[0], .22, sz[1]), frame, rot=(0, 0, ang))
        if knob:
            q = c + d * (-hinge * (w / 2 - .09)); s.cyl(f'{s.name}_{tag}_Knob', (q.x, q.y, 1.0), .028, .08, 'brass', 10, rot=(math.radians(90), 0, ang)); s.box(f'{s.name}_{tag}_Lock', (q.x, q.y, 1.0 + .1), (.1, .06, .05), 'brass', rot=(0, 0, ang))
        return leaf

    def gable_roof(s, tag, w, d, wall_h, rise, over=.45, mat='shingle', ridge_along='y', thick=.1):
        """gabled roof: two sloped slabs, gable triangles, fascia, ridge cap"""
        hw = w / 2 + over; slope = math.atan2(rise, w / 2); ln = hw / math.cos(slope)
        for sd in (-1, 1):
            s.box(f'{s.name}_{tag}_Slab{sd}', (sd * (w / 4 + over / 2) * 1.0, 0, wall_h + rise / 2 + thick / 2 - .02), (ln, d + over * 1.4, thick), mat, rot=(0, -sd * slope, 0))
        s.box(f'{s.name}_{tag}_Ridge', (0, 0, wall_h + rise + .08), (.35, d + over * 1.4 + .1, .08), 'iron', bevel=.01)
        for sd in (-1, 1):
            bm = bmesh.new(); y = sd * d / 2
            vs = [bm.verts.new(p) for p in ((-w / 2, y, wall_h), (w / 2, y, wall_h), (0, y, wall_h + rise))]
            vs2 = [bm.verts.new((p.co.x, y + sd * .1, p.co.z)) for p in vs]
            bm.faces.new(vs); bm.faces.new(vs2[::-1])
            for i in range(3): bm.faces.new((vs[i], vs[(i + 1) % 3], vs2[(i + 1) % 3], vs2[i]))
            s.raw(f'{s.name}_{tag}_Gable{sd}', bm, ['siding'])

# ------------------------------------------------------------------ extra materials
def mat_shingle(name='H_Shingle'):
    m, nt, b = new_mat(name); tc = N(nt, 'ShaderNodeTexCoord', -900, 0)
    br = N(nt, 'ShaderNodeTexBrick', -650, 100); br.inputs['Scale'].default_value = 7; br.inputs['Mortar Size'].default_value = .02; br.inputs['Brick Width'].default_value = .4; br.inputs['Row Height'].default_value = .2
    br.inputs['Color1'].default_value = (.04, .04, .045, 1); br.inputs['Color2'].default_value = (.09, .085, .08, 1); br.inputs['Mortar'].default_value = (.01, .01, .01, 1); lk(nt, tc, br, 'Object', 'Vector')
    ns = N(nt, 'ShaderNodeTexNoise', -650, -200); ns.inputs['Scale'].default_value = 2; ns.inputs['Detail'].default_value = 10; lk(nt, tc, ns, 'Object', 'Vector')
    moss = ramp(nt, -350, -200, [(.45, (1, 1, 1, 1)), (.7, (.35, .5, .25, 1))]); lk(nt, ns, moss, 0, 0)
    mm = N(nt, 'ShaderNodeMix', -100, 50, data_type='RGBA', blend_type='MULTIPLY'); mm.inputs[0].default_value = 1; lk(nt, br, mm, 0, 6); lk(nt, moss, mm, 0, 7); lk(nt, mm, b, 2, 'Base Color')
    b.inputs['Roughness'].default_value = .85; bp = N(nt, 'ShaderNodeBump', 200, -250); bp.inputs['Strength'].default_value = .5; lk(nt, br, bp, 'Fac', 'Height'); lk(nt, bp, b, 0, 'Normal'); return m

def mat_siding(name, base, grime=.8):
    m, nt, b = new_mat(name); tc = N(nt, 'ShaderNodeTexCoord', -1000, 0)
    wv = N(nt, 'ShaderNodeTexWave', -750, 200, wave_type='BANDS', bands_direction='Z', wave_profile='SAW'); wv.inputs['Scale'].default_value = 5.5; wv.inputs['Distortion'].default_value = .5; lk(nt, tc, wv, 'Object', 'Vector')
    joint = ramp(nt, -450, 200, [(.0, (.25, .25, .25, 1)), (.06, (1, 1, 1, 1))]); lk(nt, wv, joint, 0, 0)
    ns = N(nt, 'ShaderNodeTexNoise', -750, -100); ns.inputs['Scale'].default_value = 3; ns.inputs['Detail'].default_value = 12; lk(nt, tc, ns, 'Object', 'Vector')
    peel = ramp(nt, -450, -100, [(.4, base), (.62, (.16, .1, .06, 1))]); lk(nt, ns, peel, 0, 0)                       # paint peeling to bare wood
    sep = N(nt, 'ShaderNodeSeparateXYZ', -750, -400); lk(nt, tc, sep, 'Object', 0)
    gr = ramp(nt, -450, -400, [(0, (.45, .4, .3, 1)), (.35, (1, 1, 1, 1))]); lk(nt, sep, gr, 2, 0)                       # damp dirt near the ground
    m1 = N(nt, 'ShaderNodeMix', -150, 100, data_type='RGBA', blend_type='MULTIPLY'); m1.inputs[0].default_value = 1; lk(nt, peel, m1, 0, 6); lk(nt, joint, m1, 0, 7)
    m2 = N(nt, 'ShaderNodeMix', 100, 100, data_type='RGBA', blend_type='MULTIPLY'); m2.inputs[0].default_value = grime; lk(nt, m1, m2, 2, 6); lk(nt, gr, m2, 0, 7); lk(nt, m2, b, 2, 'Base Color')
    b.inputs['Roughness'].default_value = .85; bp = N(nt, 'ShaderNodeBump', 300, -250); bp.inputs['Strength'].default_value = .6; lk(nt, wv, bp, 0, 'Height'); lk(nt, bp, b, 0, 'Normal'); return m

def mat_wallpaper(name, c1, c2):
    m, nt, b = new_mat(name); tc = N(nt, 'ShaderNodeTexCoord', -900, 0)
    wv = N(nt, 'ShaderNodeTexWave', -650, 150, wave_type='BANDS', bands_direction='X', wave_profile='SAW'); wv.inputs['Scale'].default_value = 9; lk(nt, tc, wv, 'Object', 'Vector')
    r = ramp(nt, -350, 150, [(.4, c1), (.6, c2)]); lk(nt, wv, r, 0, 0)
    ns = N(nt, 'ShaderNodeTexNoise', -650, -150); ns.inputs['Scale'].default_value = 2.2; ns.inputs['Detail'].default_value = 12; lk(nt, tc, ns, 'Object', 'Vector')
    st = ramp(nt, -350, -150, [(.35, (1, 1, 1, 1)), (.65, (.3, .27, .2, 1))]); lk(nt, ns, st, 0, 0)                    # water stains
    mm = N(nt, 'ShaderNodeMix', -100, 0, data_type='RGBA', blend_type='MULTIPLY'); mm.inputs[0].default_value = 1; lk(nt, r, mm, 0, 6); lk(nt, st, mm, 0, 7); lk(nt, mm, b, 2, 'Base Color'); b.inputs['Roughness'].default_value = .9; return m

def mat_floorboards(name='H_Boards', base=(.12, .07, .035, 1)):
    m, nt, b = new_mat(name); tc = N(nt, 'ShaderNodeTexCoord', -900, 0)
    wv = N(nt, 'ShaderNodeTexWave', -650, 100, wave_type='BANDS', bands_direction='X', wave_profile='SAW'); wv.inputs['Scale'].default_value = 7; wv.inputs['Distortion'].default_value = .3; lk(nt, tc, wv, 'Object', 'Vector')
    j = ramp(nt, -380, 100, [(.0, (.1, .1, .1, 1)), (.05, (1, 1, 1, 1))]); lk(nt, wv, j, 0, 0)
    ns = N(nt, 'ShaderNodeTexNoise', -650, -200); ns.inputs['Scale'].default_value = 14; ns.inputs['Detail'].default_value = 8; lk(nt, tc, ns, 'Object', 'Vector')
    v = ramp(nt, -380, -200, [(.3, (base[0] * .6, base[1] * .6, base[2] * .6, 1)), (.7, base)]); lk(nt, ns, v, 0, 0)
    mm = N(nt, 'ShaderNodeMix', -100, 0, data_type='RGBA', blend_type='MULTIPLY'); mm.inputs[0].default_value = 1; lk(nt, v, mm, 0, 6); lk(nt, j, mm, 0, 7); lk(nt, mm, b, 2, 'Base Color'); b.inputs['Roughness'].default_value = .6; return m

def mat_fabric(name, col):
    m, nt, b = new_mat(name); tc = N(nt, 'ShaderNodeTexCoord', -800, 0); ns = N(nt, 'ShaderNodeTexNoise', -550, 0); ns.inputs['Scale'].default_value = 80; lk(nt, tc, ns, 'Object', 'Vector')
    r = ramp(nt, -300, 0, [(.35, (col[0] * .6, col[1] * .6, col[2] * .6, 1)), (.7, col)]); lk(nt, ns, r, 0, 0); lk(nt, r, b, 0, 'Base Color'); b.inputs['Roughness'].default_value = .95; return m

M['shingle'] = mat_shingle()
M['siding'] = mat_siding('H_SidingA', (.14, .3, .2, 1)); M['sidingB'] = mat_siding('H_SidingB', (.62, .5, .3, 1))
for _k in ('siding', 'sidingB'):
    for _n in M[_k].node_tree.nodes:
        if _n.type == 'TEX_NOISE': _n.inputs['Scale'].default_value = 7
        if _n.type == 'VALTORGB' and len(_n.color_ramp.elements) == 2 and abs(_n.color_ramp.elements[0].position - .4) < 1e-3: _n.color_ramp.elements[0].position = .5; _n.color_ramp.elements[1].position = .66
M['paperA'] = mat_wallpaper('H_PaperA', (.4, .33, .22, 1), (.3, .25, .17, 1)); M['paperB'] = mat_wallpaper('H_PaperB', (.32, .38, .34, 1), (.26, .31, .27, 1))
M['boards'] = mat_floorboards(); M['boardsB'] = mat_floorboards('H_BoardsB', (.1, .09, .08, 1))
M['woodlight'] = mat_wood('H_WoodLight', (.35, .25, .14, 1), .6); M['door'] = mat_wood('H_Door', (.24, .13, .07, 1), .5); M['doorB'] = mat_wood('H_DoorB', (.45, .12, .08, 1), .5)
M['bed'] = mat_fabric('H_Bed', (.35, .3, .26, 1)); M['blanket'] = mat_fabric('H_Blanket', (.35, .12, .1, 1)); M['curtain'] = mat_fabric('H_Curtain', (.4, .33, .2, 1)); M['rug'] = mat_fabric('H_Rug', (.3, .08, .06, 1))
M['brass'] = mat_solid('H_Brass', (.55, .38, .12, 1), .3, 1); M['concrete'] = mat_metal('H_Concrete', (.28, .28, .27, 1), .1, .9)
M['lampglow'] = mat_solid('H_LampGlow', (.9, .8, .5, 1), .4, emit=(1, .72, .35, 1), k=4); M['neon'] = mat_solid('H_Neon', (1, .2, .5, 1), .3, emit=(1, .1, .45, 1), k=9)
M['neonb'] = mat_solid('H_NeonB', (.2, .6, 1, 1), .3, emit=(.1, .45, 1, 1), k=7)

# ================================================================== HOUSE A: caretaker's cabin  (local: x east, y north; door on +x gable end)
A = House('HouseA', -21.0, 5.0, 0.0)
w, d, h, T = 5.4, 4.6, 2.5, .1
A.box('A_Foundation', (0, 0, .15), (w + .3, d + .3, .3), 'concrete', bevel=.01)
A.box('A_Floor', (0, 0, .33), (w - .1, d - .1, .06), 'boards'); A.box('A_Ceiling', (0, 0, h + .3), (w, d, .08), 'paperA')
Z0 = .3
# outer siding + inner lining. door wall = east (+x): opening around y = -.7; windows on N, S, W
ODOOR = (d / 2 + (-.7) - .5, d / 2 + (-.7) + .5)
A.wall('E', (w / 2, -d / 2), (w / 2, d / 2), h, T, 'siding', [(ODOOR[0], ODOOR[1], 0, 2.1)], z0=Z0); A.wall('Ei', (w / 2 - .09, -d / 2), (w / 2 - .09, d / 2), h, T, 'paperA', [(ODOOR[0], ODOOR[1], 0, 2.1)], z0=Z0)
A.wall('N', (w / 2, d / 2), (-w / 2, d / 2), h, T, 'siding', [(1.0, 2.1, .9, 1.9), (3.0, 4.1, .9, 1.9)], z0=Z0); A.wall('Ni', (w / 2, d / 2 - .09), (-w / 2, d / 2 - .09), h, T, 'paperA', [(1.0, 2.1, .9, 1.9), (3.0, 4.1, .9, 1.9)], z0=Z0)
A.wall('W', (-w / 2, d / 2), (-w / 2, -d / 2), h, T, 'siding', [(1.7, 2.9, .9, 1.9)], z0=Z0); A.wall('Wi', (-w / 2 + .09, d / 2), (-w / 2 + .09, -d / 2), h, T, 'paperA', [(1.7, 2.9, .9, 1.9)], z0=Z0)
A.wall('S', (-w / 2, -d / 2), (w / 2, -d / 2), h, T, 'siding', [(1.1, 2.2, .9, 1.9), (3.3, 4.4, .9, 1.9)], z0=Z0); A.wall('Si', (-w / 2, -d / 2 + .09), (w / 2, -d / 2 + .09), h, T, 'paperA', [(1.1, 2.2, .9, 1.9), (3.3, 4.4, .9, 1.9)], z0=Z0)
# partition: a small bedroom in the north-west corner (door gap)
A.wall('P', (-.4, -.1), (-.4, d / 2 - .09), h, .09, 'paperA', [(.0, .0, 0, 0)], z0=Z0)
A.wall('P2', (-.4, -.1), (-w / 2 + .09, -.1), h, .09, 'paperA', [(.9, 1.9, 0, 2.05)], z0=Z0)
# windows (ang along the wall direction), door on the east wall
A.window('N1', (w / 2 - 1.55, d / 2, 0), 0, 1.1, 1.0, .9 + Z0, curtain='curtain'); A.window('N2', (w / 2 - 3.55, d / 2, 0), 0, 1.1, 1.0, .9 + Z0, curtain='curtain')
A.window('S1', (-w / 2 + 1.65, -d / 2, 0), 0, 1.1, 1.0, .9 + Z0, curtain='curtain'); A.window('S2', (-w / 2 + 3.85, -d / 2, 0), 0, 1.1, 1.0, .9 + Z0, curtain='curtain')
A.window('W1', (-w / 2, -d / 2 + 2.3, 0), math.radians(90), 1.2, 1.0, .9 + Z0)
A.door('Front', (w / 2, -.7, Z0), math.radians(90), mat='door', hinge=-1)
for nm_ in list(HC.objects):
    pass
# roof, chimney, porch
A.gable_roof('Roof', w, d, h + Z0, 1.5, over=.5)
A.box('A_Chimney', (-w / 2 + .5, 0, h + 1.6), (.7, .7, 3.4), 'concrete', bevel=.02); A.box('A_ChimneyCap', (-w / 2 + .5, 0, h + 3.35), (.9, .9, .12), 'concrete', bevel=.02)
A.box('A_Porch', (w / 2 + 1.2, -.7, .15), (2.4, 2.4, .3), 'woodlight', bevel=.01)
for yy in (-1.8, .4): A.box(f'A_PorchPost{yy}', (w / 2 + 2.25, yy, 1.4), (.14, .14, 2.4), 'woodlight')
A.box('A_PorchRoof', (w / 2 + 1.3, -.7, 2.78), (2.8, 2.8, .1), 'shingle', rot=(0, math.radians(5), 0))
for i in range(3): A.box(f'A_Step{i}', (w / 2 + 2.6 + i * .3, -.7, .1 - i * .02 + .1 - .1 * i), (.32, 1.4, .08), 'woodlight')
A.box('A_Rail', (w / 2 + 1.2, -1.8, .9), (2.4, .05, .06), 'woodlight')
# interior
A.box('A_Table', (1.3, 1.2, .68), (1.3, .8, .06), 'woodlight', bevel=.01)
for sx in (-.55, .55):
    for sy in (-.3, .3): A.box(f'A_TableLeg{sx}{sy}', (1.3 + sx, 1.2 + sy, .35), (.06, .06, .7), 'woodlight')
for nm_, c in (('A_Chair1', (.4, 1.2)), ('A_Chair2', (2.2, 1.3))):
    A.box(nm_ + '_Seat', (c[0], c[1], .5), (.42, .42, .05), 'woodlight'); A.box(nm_ + '_Back', (c[0] + (-.2 if c[0] < 1 else .2), c[1], .85), (.04, .42, .6), 'woodlight')
    for sx in (-.18, .18):
        for sy in (-.18, .18): A.box(f'{nm_}_L{sx}{sy}', (c[0] + sx, c[1] + sy, .25), (.04, .04, .5), 'woodlight')
# the radio (a puzzle prop): cabinet, dial, speaker, antenna, knobs
A.box('A_Radio', (1.3, 1.2, .93), (.5, .22, .3), 'woodlight', bevel=.01); A.box('A_RadioSpeaker', (1.15, 1.085, .93), (.2, .01, .22), 'plastic'); A.box('A_RadioDial', (1.45, 1.085, .98), (.2, .01, .1), 'lampglow')
for i in range(2): A.cyl(f'A_RadioKnob{i}', (1.4 + i * .1, 1.08, .88), .018, .03, 'brass', 10, rot=(math.radians(90), 0, 0))
A.cyl('A_RadioAntenna', (1.5, 1.2, 1.3), .004, .5, 'zinc', 6, rot=(0, math.radians(20), 0))
# stove, cupboard, bed, shelf, rug, lamp, boxes
A.box('A_Stove', (-w / 2 + 1.0, d / 2 - .45, .55), (.7, .6, .9), 'iron', bevel=.01); A.cyl('A_StovePipe', (-w / 2 + 1.0, d / 2 - .45, 1.85), .06, 1.8, 'iron', 10)
A.box('A_Cupboard', (-w / 2 + 2.0, d / 2 - .3, .9), (1.1, .5, 1.8), 'woodlight', bevel=.01)
for sx in (-.28, .28): A.box(f'A_CupDoor{sx}', (-w / 2 + 2.0 + sx, d / 2 - .56, .9), (.52, .02, 1.6), 'door', bevel=.006); A.cyl(f'A_CupKnob{sx}', (-w / 2 + 2.0 + sx * .35, d / 2 - .59, .95), .016, .03, 'brass', 8, rot=(math.radians(90), 0, 0))
A.box('A_Bed', (-w / 2 + 1.0, d / 2 - 1.6, .4), (1.0, 2.0, .35), 'woodlight'); A.box('A_Mattress', (-w / 2 + 1.0, d / 2 - 1.6, .62), (.92, 1.9, .14), 'bed', bevel=.03); A.box('A_Blanket', (-w / 2 + 1.0, d / 2 - 2.0, .72), (.94, 1.0, .08), 'blanket', bevel=.03)
A.box('A_Pillow', (-w / 2 + 1.0, d / 2 - .8, .74), (.5, .3, .1), 'bed', bevel=.04)
A.box('A_Rug', (.9, -.9, .365), (2.0, 1.3, .012), 'rug'); A.box('A_Shelf', (1.0, -d / 2 + .2, 1.5), (1.6, .22, .04), 'woodlight')
for i in range(5): A.box(f'A_Book{i}', (.4 + i * .28, -d / 2 + .2, 1.68), (.06 + random.uniform(0, .04), .16, .26), random.choice(['bed', 'blanket', 'door']), bevel=.003)
A.cyl('A_Lamp', (1.9, 1.2, .8), .09, .22, 'lampglow', 16, r2=.13); A.box('A_Crate1', (-1.4, -d / 2 + .4, .5), (.6, .5, .4), 'woodlight'); A.box('A_Crate2', (-.9, -d / 2 + .4, .8), (.45, .4, .3), 'woodlight', rot=(0, 0, .3))
# shed beside the cabin
S = House('ShedA', -21.0, 11.0, math.radians(-10))
S.box('Shed_Floor', (0, 0, .1), (2.6, 2.2, .2), 'concrete')
S.wall('Sw', (-1.2, -1), (1.2, -1), 2.2, .1, 'siding', [], z0=.2); S.wall('Sn', (1.2, 1), (-1.2, 1), 2.2, .1, 'siding', [], z0=.2); S.wall('Se', (1.2, -1), (1.2, 1), 2.2, .1, 'siding', [], z0=.2); S.wall('Ss', (-1.2, 1), (-1.2, -1), 2.2, .1, 'siding', [(.4, 1.4, 0, 1.9)], z0=.2)
S.box('Shed_Roof', (0, 0, 2.55), (2.9, 2.6, .08), 'shingle', rot=(math.radians(8), 0, 0)); S.door('ShedDoor', (-1.2, 0, .2), math.radians(90), w=1.0, h=1.9, mat='door', hinge=1, open_deg=-45, knob=False)
S.box('Shed_Barrel', (.6, .3, .6), (.55, .55, .85), 'iron'); S.box('Shed_Bench', (0, .75, .5), (2.0, .45, .06), 'woodlight')

# ================================================================== HOUSE B: motel block  (local: doors on the west face, y runs along the block)
B = House('Motel', 22.0, -16.0, 0.0)
w, d, h = 4.4, 11.4, 2.7
B.box('B_Slab', (0, 0, .1), (w + 1.8, d + .4, .2), 'concrete', bevel=.01)                                    # building + walkway
Zb = .2
B.box('B_Floor', (0, 0, .23), (w - .1, d - .1, .06), 'boardsB'); B.box('B_Ceiling', (0, 0, h + .2), (w, d, .08), 'paperB')
rooms = [(-3.8, -1.9), (-1.9, 1.9), (1.9, 3.8)]                                                              # y-centres: doors at y = -3.8, 0.0, 3.8 (room width 3.8)
dys = (-3.8, 0.0, 3.8)
door_open = [(d / 2 + dy - .5, d / 2 + dy + .5) for dy in dys]
B.wall('Wd', (-w / 2, -d / 2), (-w / 2, d / 2), h, .1, 'sidingB', [(a, b, 0, 2.05) for a, b in door_open] + [(d / 2 + dy + 1.0, d / 2 + dy + 1.9, .95, 1.95) for dy in (-3.8, 0.0)] if False else [], z0=Zb)
# west face: three doors and a window beside each
wop = []
for dy in dys: wop += [(d / 2 + dy - .5, d / 2 + dy + .5, 0, 2.05), (d / 2 + dy + 1.0, d / 2 + dy + 1.8, .95, 1.95)]
wop = [o for o in wop if o[1] <= d + .01]
B.wall('W2', (-w / 2, -d / 2), (-w / 2, d / 2), h, .1, 'sidingB', wop, z0=Zb); B.wall('W2i', (-w / 2 + .09, -d / 2), (-w / 2 + .09, d / 2), h, .1, 'paperB', wop, z0=Zb)
B.wall('E', (w / 2, d / 2), (w / 2, -d / 2), h, .1, 'sidingB', [(1.4, 2.2, 1.2, 1.9), (5.2, 6.0, 1.2, 1.9), (9.0, 9.8, 1.2, 1.9)], z0=Zb); B.wall('Ei', (w / 2 - .09, d / 2), (w / 2 - .09, -d / 2), h, .1, 'paperB', [(1.4, 2.2, 1.2, 1.9), (5.2, 6.0, 1.2, 1.9), (9.0, 9.8, 1.2, 1.9)], z0=Zb)
B.wall('N', (w / 2, d / 2), (-w / 2, d / 2), h, .1, 'sidingB', [], z0=Zb); B.wall('S', (-w / 2, -d / 2), (w / 2, -d / 2), h, .1, 'sidingB', [], z0=Zb)
B.wall('Ni', (w / 2 - .09, d / 2 - .09), (-w / 2 + .09, d / 2 - .09), h, .1, 'paperB', [], z0=Zb); B.wall('Si', (-w / 2 + .09, -d / 2 + .09), (w / 2 - .09, -d / 2 + .09), h, .1, 'paperB', [], z0=Zb)
for pyy in (-1.9, 1.9): B.wall(f'Part{pyy}', (-w / 2 + .09, d / 2 + pyy), (w / 2 - .09, d / 2 + pyy), h, .1, 'paperB', [], z0=Zb)     # partitions between the rooms
for i, dy in enumerate(dys):
    yc = dy
    B.door(f'Door{i + 1}', (-w / 2, yc, Zb), math.radians(90), mat='doorB', hinge=1, open_deg=0 if i != 1 else -70)
    B.window(f'Win{i + 1}', (-w / 2, yc + 1.4, Zb), math.radians(90), .8, 1.0, .95 + Zb, frame='woodlight', curtain='curtain')
    B.box(f'B_NumPlate{i + 1}', (-w / 2 - .06, yc - .45 + .9, 2.15), (.03, .22, .16), 'brass'); B.box(f'B_NumPlate{i + 1}i', (-w / 2 - .062, yc - .45 + .9, 2.15), (.01, .12, .1), 'lampglow')
    for ww in (3.0, 3.8): pass
    B.window(f'EWin{i + 1}', (w / 2, yc, Zb), math.radians(90), .8, .7, 1.2 + Zb, frame='woodlight', curtain='curtain')
# roof: shed roof with an overhang covering the walkway
B.box('B_Roof', (-.6, 0, h + .55), (w + 2.5, d + .9, .12), 'shingle', rot=(0, math.radians(-6), 0)); B.box('B_Fascia', (-1.85, 0, h + .55), (.1, d + 1, .22), 'woodlight')
for yy in (-d / 2 + .1, -3.8, 0.0, 3.8, d / 2 - .1): B.box(f'B_Post{yy}', (-w / 2 - 1.35, yy, 1.45), (.12, .12, 2.5), 'woodlight')
B.box('B_Rail', (-w / 2 - 1.35, 0, 1.0), (.05, d, .06), 'woodlight')
# interior of room 2 (the open one): bed, nightstand with a lamp, wardrobe, desk with notes, TV, carpet
r2 = (0.0, 0.0)
B.box('R2_Bed', (.9, -.5, .45), (1.9, 1.4, .45), 'woodlight'); B.box('R2_Mattress', (.9, -.5, .75), (1.8, 1.3, .2), 'bed', bevel=.04); B.box('R2_Blanket', (1.0, -.5, .88), (1.2, 1.3, .07), 'blanket', bevel=.03); B.box('R2_Pillow', (1.7, -.5, .9), (.3, .55, .12), 'bed', bevel=.05)
B.box('R2_Night', (1.6, .5, .5), (.45, .4, .5), 'woodlight', bevel=.01); B.cyl('R2_Lamp', (1.6, .5, .85), .08, .24, 'lampglow', 16, r2=.12)
B.box('R2_Wardrobe', (1.9, -1.45, 1.1), (.6, .9, 2.0), 'woodlight', bevel=.01); B.box('R2_WardDoor', (1.6, -1.45, 1.1), (.02, .85, 1.9), 'door', bevel=.006)
B.box('R2_Desk', (-.3, -1.2, .75), (.5, 1.2, .05), 'woodlight'); B.box('R2_DeskL', (-.3, -1.7, .38), (.45, .05, .75), 'woodlight'); B.box('R2_DeskR', (-.3, -.7, .38), (.45, .05, .75), 'woodlight')
for i in range(5): B.box(f'R2_Note{i}', (-.3 + random.uniform(-.1, .1), -1.2 + random.uniform(-.4, .4), .785 + i * .003), (.2, .15, .002), 'paper' if 'paper' in M else 'bed', rot=(0, 0, random.uniform(-.6, .6)))
B.box('R2_TV', (1.2, 1.5, 1.0), (.7, .5, .5), 'plastic', bevel=.02); B.box('R2_TVScreen', (.98, 1.5, 1.0), (.02, .55, .4), 'glass'); B.box('R2_TVStand', (1.2, 1.5, .5), (.8, .5, .5), 'woodlight')
B.box('R2_Carpet', (0, 0, .26), (2.8, 3.2, .012), 'rug')
# neon sign on a pole in front of the motel
for nm_, c in (('Sign_Pole', (-w / 2 - 3.2, -7.4, 0)),):
    B.cyl('Sign_Pole', (c[0], c[1], 2.8), .12, 5.6, 'iron', 12)
B.box('Sign_Board', (-w / 2 - 3.2, -7.4, 5.3), (.2, 2.6, 1.0), 'iron', bevel=.02)
# letters as small emissive bars forming "MOTEL" blocks (readable shapes come in the game's text sprite; here neon strips)
for i in range(5): B.box(f'Sign_Letter{i}', (-w / 2 - 3.32, -7.4 - 1.0 + i * .5, 5.3), (.04, .3, .55), 'neon' if i % 2 == 0 else 'neonb', bevel=.01)
B.box('Sign_Arrow', (-w / 2 - 3.32, -7.4, 4.6), (.04, 1.4, .1), 'neon')
print('houses built:', len(HC.objects), 'objects')

# warm interior lights so the cabins read from the doorway
for _nm, _loc, _en in (('A_LampLight', (-19.1, 6.2, 1.4), 70), ('B_LampLight', (23.6, -15.5, 1.4), 50)):
    _ld = bpy.data.lights.new(_nm, 'POINT'); _ld.energy = _en; _ld.color = (1, .72, .4); _ld.shadow_soft_size = .1
    _lo = bpy.data.objects.new(_nm, _ld); _lo.location = _loc; HC.objects.link(_lo)
