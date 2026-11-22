"""Detailed props for the gas-station shop (run AFTER shop_interior.py): a product library (cans, bottles, boxes, bags, cartons,
oil bottles ...) with their own label shaders, real shelving, counter, register, coolers, safe, desk, chair, clock, calendar.
Run through the Blender MCP:  exec(open(r"C:\\Users\\libde\\100gate\\tools\\gas-station\\shop_props.py", encoding="utf-8").read())
Items are linked duplicates of library meshes (one mesh, many objects), the fronts of the labels face -Y.
"""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix, Euler

random.seed(5)
X0, X1, Y0, Y1, Z0, Z1 = -3.95, 14.35, -0.78, 11.63, 0.22, 3.9
CZ = Z0
COL = bpy.data.collections['ShopInterior']

# ------------------------------------------------------------------ remove the primitive stand-ins from shop_interior.py
GONE = ('Products', 'Gondola', 'Cooler', 'Reg_', 'Counter_', 'Spike', 'Receipt', 'Bell', 'TipJar', 'Coins', 'BackCabinet', 'BackShelf', 'BackBoard',
        'Desk_', 'Chair_', 'Lamp_Base', 'Papers', 'FileCab', 'OfficeShelf', 'Folder', 'Safe_', 'Calendar', 'Clock', 'KeyBoard', 'KeyHook', 'Crate', 'Bucket',
        'Prop_', 'Lib_')
for o in list(COL.objects):
    if o.name.startswith(GONE): bpy.data.objects.remove(o, do_unlink=True)
for c in list(bpy.data.collections):
    if c.name == 'ShopLib':
        for o in list(c.objects): bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(c)
LIB = bpy.data.collections.new('ShopLib'); bpy.context.scene.collection.children.link(LIB)
LIB.hide_viewport = True; LIB.hide_render = True

# ------------------------------------------------------------------ materials
def new_mat(name):
    m = bpy.data.materials.get(name)
    if m: bpy.data.materials.remove(m)
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); out.location = (1000, 0)
    b = nt.nodes.new('ShaderNodeBsdfPrincipled'); b.location = (700, 0); nt.links.new(b.outputs[0], out.inputs[0]); return m, nt, b
def N(nt, t, x, y, **kw):
    n = nt.nodes.new(t); n.location = (x, y)
    for k, v in kw.items(): setattr(n, k, v)
    return n
def L(nt, a, b, i=0, j=0): nt.links.new(a.outputs[i], b.inputs[j])
def ramp(nt, x, y, stops):
    r = N(nt, 'ShaderNodeValToRGB', x, y); els = r.color_ramp.elements
    while len(els) < len(stops): els.new(1.0)
    for e, (p, c) in zip(els, stops): e.position = p; e.color = c
    return r

def mat_solid(name, col, rough=.6, metal=0, emit=None, k=0, alpha=1):
    m, nt, b = new_mat(name); b.inputs['Base Color'].default_value = col; b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if emit: b.inputs['Emission Color'].default_value = emit; b.inputs['Emission Strength'].default_value = k
    if alpha < 1: b.inputs['Alpha'].default_value = alpha; m.blend_method = 'BLEND'; m.surface_render_method = 'BLENDED'
    return m

def mat_label(name, c1, c2, c3=(.9, .9, .85, 1), pattern='bands', rough=.35, metal=0, scale=1.0):
    """printed packaging, driven by Generated coords (0..1 over the bounding box): z = height, x/y = across / depth.
    c1 base, c2 accent, c3 'text' blocks. Wraps round cans and bottles, reads as a front design on boxes."""
    m, nt, b = new_mat(name)
    tc = N(nt, 'ShaderNodeTexCoord', -1300, 0); G = tc.outputs['Generated']
    sep = N(nt, 'ShaderNodeSeparateXYZ', -1100, 0); nt.links.new(G, sep.inputs[0])
    if pattern == 'bands':                                   # two thin accent stripes round the body
        def near(zc, w, y):
            sub = N(nt, 'ShaderNodeMath', -1000, y, operation='SUBTRACT'); nt.links.new(sep.outputs[2], sub.inputs[0]); sub.inputs[1].default_value = zc
            ab = N(nt, 'ShaderNodeMath', -850, y, operation='ABSOLUTE'); nt.links.new(sub.outputs[0], ab.inputs[0])
            lt = N(nt, 'ShaderNodeMath', -700, y, operation='LESS_THAN'); nt.links.new(ab.outputs[0], lt.inputs[0]); lt.inputs[1].default_value = w; return lt
        a1 = near(.28, .035, 300); a2 = near(.72, .035, 150); a3 = near(.5, .17, 450)
        s1 = N(nt, 'ShaderNodeMath', -550, 250, operation='ADD'); nt.links.new(a1.outputs[0], s1.inputs[0]); nt.links.new(a2.outputs[0], s1.inputs[1])
        s2 = N(nt, 'ShaderNodeMath', -400, 250, operation='MAXIMUM'); nt.links.new(s1.outputs[0], s2.inputs[0]); nt.links.new(a3.outputs[0], s2.inputs[1])
        fac = s2.outputs[0]; base = ramp(nt, -250, 250, [(.4, c1), (.6, c2)])
    elif pattern == 'circle':
        mp = N(nt, 'ShaderNodeMapping', -1000, -100); mp.inputs['Scale'].default_value = (2, 2, 2); mp.inputs['Location'].default_value = (-1, -1, -1); nt.links.new(G, mp.inputs['Vector'])
        gr = N(nt, 'ShaderNodeTexGradient', -800, -100, gradient_type='SPHERICAL'); nt.links.new(mp.outputs[0], gr.inputs['Vector']); fac = gr.outputs['Fac']
        base = ramp(nt, -600, 250, [(.42, c1), (.5, c2)])
    elif pattern == 'checker':
        ck = N(nt, 'ShaderNodeTexChecker', -900, 100); ck.inputs['Scale'].default_value = 6 * scale; nt.links.new(G, ck.inputs['Vector']); fac = ck.outputs['Fac']
        base = ramp(nt, -600, 250, [(.4, c1), (.6, c2)])
    else:                                                    # 'split': a colour field with a band across the middle
        fac = sep.outputs[2]
        base = ramp(nt, -600, 250, [(.3, c1), (.34, c2), (.62, c2), (.66, c1)]) if False else ramp(nt, -600, 250, [(.0, c1), (.4, c2)])
        mr = N(nt, 'ShaderNodeMapRange', -800, 250); mr.inputs['From Min'].default_value = .3; mr.inputs['From Max'].default_value = .7
        nt.links.new(sep.outputs[2], mr.inputs[0]); fac = mr.outputs[0]
    nt.links.new(fac, base.inputs[0])
    # 'text': a fine checker inside a horizontal band
    bl = N(nt, 'ShaderNodeTexChecker', -900, -450); bl.inputs['Scale'].default_value = 70 * scale; nt.links.new(G, bl.inputs['Vector'])
    inband = N(nt, 'ShaderNodeMath', -900, -650, operation='GREATER_THAN'); nt.links.new(sep.outputs[2], inband.inputs[0]); inband.inputs[1].default_value = .42
    inband2 = N(nt, 'ShaderNodeMath', -700, -650, operation='LESS_THAN'); nt.links.new(sep.outputs[2], inband2.inputs[0]); inband2.inputs[1].default_value = .6
    bandm = N(nt, 'ShaderNodeMath', -500, -600, operation='MULTIPLY'); nt.links.new(inband.outputs[0], bandm.inputs[0]); nt.links.new(inband2.outputs[0], bandm.inputs[1])
    txt = N(nt, 'ShaderNodeMath', -300, -500, operation='MULTIPLY'); nt.links.new(bandm.outputs[0], txt.inputs[0]); nt.links.new(bl.outputs['Fac'], txt.inputs[1])
    txt2 = N(nt, 'ShaderNodeMath', -200, -500, operation='MULTIPLY'); nt.links.new(txt.outputs[0], txt2.inputs[0]); txt2.inputs[1].default_value = .75; txt = txt2
    mixtxt = N(nt, 'ShaderNodeMix', -100, 100, data_type='RGBA', blend_type='MIX'); nt.links.new(txt.outputs[0], mixtxt.inputs[0])
    nt.links.new(base.outputs[0], mixtxt.inputs[6]); mixtxt.inputs[7].default_value = c3
    ns = N(nt, 'ShaderNodeTexNoise', -100, -250); ns.inputs['Scale'].default_value = 28; ns.inputs['Detail'].default_value = 8; nt.links.new(tc.outputs['Object'], ns.inputs['Vector'])
    dust = ramp(nt, 150, -250, [(.45, (1, 1, 1, 1)), (.85, (.42, .4, .34, 1))]); nt.links.new(ns.outputs['Fac'], dust.inputs[0])
    mx = N(nt, 'ShaderNodeMix', 400, 100, data_type='RGBA', blend_type='MULTIPLY'); mx.inputs[0].default_value = 1
    nt.links.new(mixtxt.outputs[2], mx.inputs[6]); nt.links.new(dust.outputs[0], mx.inputs[7]); nt.links.new(mx.outputs[2], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    return m

def mat_metal(name, col, rough=.35, rust=.2):
    m, nt, b = new_mat(name); tc = N(nt, 'ShaderNodeTexCoord', -900, 0)
    ns = N(nt, 'ShaderNodeTexNoise', -650, 0); ns.inputs['Scale'].default_value = 6; ns.inputs['Detail'].default_value = 12; nt.links.new(tc.outputs['Object'], ns.inputs['Vector'])
    p0 = .35 + (1 - rust) * .45
    r = ramp(nt, -350, 100, [(p0, col), (p0 + .2, (.26, .1, .04, 1))]); L(nt, ns, r, 0, 0); L(nt, r, b, 0, 'Base Color')
    mt = ramp(nt, -350, -150, [(p0, (.85, .85, .85, 1)), (p0 + .2, (0, 0, 0, 1))]); L(nt, ns, mt, 0, 0); L(nt, mt, b, 0, 'Metallic')
    rg = ramp(nt, -350, -350, [(p0, (rough, rough, rough, 1)), (p0 + .2, (.9, .9, .9, 1))]); L(nt, ns, rg, 0, 0); L(nt, rg, b, 0, 'Roughness')
    return m

def mat_glass(name, col, alpha=.5, rough=.08):
    return mat_solid(name, col, rough, 0, alpha=alpha)

def mat_barcode(name='Lib_Barcode'):
    m, nt, b = new_mat(name); tc = N(nt, 'ShaderNodeTexCoord', -700, 0)
    wv = N(nt, 'ShaderNodeTexWave', -450, 0, wave_type='BANDS', bands_direction='X', wave_profile='SQUARE' if False else 'SAW'); wv.inputs['Scale'].default_value = 90; wv.inputs['Distortion'].default_value = 3; nt.links.new(tc.outputs['Generated'], wv.inputs['Vector'])
    r = ramp(nt, -150, 0, [(.45, (.02, .02, .02, 1)), (.55, (.85, .85, .8, 1))]); L(nt, wv, r, 0, 0); L(nt, r, b, 0, 'Base Color'); b.inputs['Roughness'].default_value = .5
    return m

M = {}
def P(n, *a, **k): M[n] = mat_solid(*(('Lib_' + n,) + a), **k)
# packaging
M['can_cola'] = mat_label('Lib_CanCola', (.55, .02, .02, 1), (.9, .9, .88, 1), (.92, .92, .9, 1), 'bands', .22, .6)
M['can_lime'] = mat_label('Lib_CanLime', (.12, .45, .1, 1), (.9, .85, .2, 1), (.95, .95, .9, 1), 'bands', .22, .6)
M['can_blue'] = mat_label('Lib_CanBlue', (.05, .12, .45, 1), (.75, .85, .95, 1), (.95, .95, .9, 1), 'split', .22, .6)
M['can_orange'] = mat_label('Lib_CanOrange', (.75, .3, .03, 1), (.95, .8, .3, 1), (.2, .1, .04, 1), 'bands', .22, .6)
M['tin_beans'] = mat_label('Lib_TinBeans', (.62, .2, .06, 1), (.95, .85, .45, 1), (.95, .9, .8, 1), 'split', .4, .3)
M['tin_fish'] = mat_label('Lib_TinFish', (.1, .25, .45, 1), (.9, .9, .85, 1), (.95, .95, .95, 1), 'bands', .4, .3)
M['pet_water'] = mat_label('Lib_PetWater', (.55, .75, .9, 1), (.2, .45, .75, 1), (.95, .97, 1, 1), 'split', .25)
M['pet_cola'] = mat_label('Lib_PetCola', (.4, .02, .02, 1), (.1, .05, .04, 1), (.9, .9, .88, 1), 'bands', .25)
M['bottle_label'] = mat_label('Lib_BeerLabel', (.9, .82, .55, 1), (.45, .1, .05, 1), (.1, .08, .05, 1), 'split', .6)
M['cereal1'] = mat_label('Lib_Cereal1', (.9, .65, .1, 1), (.75, .12, .05, 1), (.95, .95, .9, 1), 'circle', .55)
M['cereal2'] = mat_label('Lib_Cereal2', (.15, .4, .75, 1), (.95, .85, .2, 1), (.95, .95, .9, 1), 'circle', .55)
M['cereal3'] = mat_label('Lib_Cereal3', (.2, .5, .2, 1), (.85, .9, .5, 1), (.12, .1, .05, 1), 'checker', .55)
M['chips1'] = mat_label('Lib_Chips1', (.8, .15, .06, 1), (.95, .75, .1, 1), (.95, .95, .9, 1), 'circle', .18, .5)
M['chips2'] = mat_label('Lib_Chips2', (.1, .35, .6, 1), (.9, .9, .9, 1), (.95, .8, .2, 1), 'bands', .18, .5)
M['chips3'] = mat_label('Lib_Chips3', (.85, .7, .1, 1), (.4, .15, .05, 1), (.1, .06, .03, 1), 'circle', .18, .5)
M['milk'] = mat_label('Lib_Milk', (.9, .92, .95, 1), (.2, .45, .8, 1), (.1, .15, .3, 1), 'split', .5)
M['juice'] = mat_label('Lib_Juice', (.95, .5, .1, 1), (.9, .85, .3, 1), (.2, .1, .02, 1), 'bands', .5)
M['cig1'] = mat_label('Lib_Cig1', (.85, .85, .8, 1), (.7, .05, .05, 1), (.1, .1, .1, 1), 'split', .5)
M['cig2'] = mat_label('Lib_Cig2', (.1, .2, .12, 1), (.85, .75, .35, 1), (.95, .95, .9, 1), 'split', .5)
M['bar1'] = mat_label('Lib_Bar1', (.25, .12, .06, 1), (.8, .1, .08, 1), (.95, .9, .5, 1), 'bands', .4)
M['bar2'] = mat_label('Lib_Bar2', (.15, .2, .55, 1), (.9, .9, .2, 1), (.95, .95, .95, 1), 'bands', .4)
M['oil'] = mat_label('Lib_Oil', (.95, .75, .05, 1), (.08, .08, .08, 1), (.95, .95, .9, 1), 'split', .3)
M['oilcap'] = mat_solid('Lib_OilCap', (.05, .05, .05, 1), .4)
M['washer'] = mat_label('Lib_Washer', (.15, .55, .85, 1), (.9, .9, .95, 1), (.05, .1, .3, 1), 'bands', .3)
M['antifreeze'] = mat_label('Lib_Antifreeze', (.2, .7, .35, 1), (.95, .95, .95, 1), (.05, .2, .1, 1), 'split', .3)
M['jar_jam'] = mat_label('Lib_Jar', (.45, .05, .12, 1), (.95, .9, .8, 1), (.2, .02, .05, 1), 'split', .35)
M['lid_gold'] = mat_metal('Lib_LidGold', (.7, .5, .15, 1), .3, .35)
M['glass_green'] = mat_glass('Lib_GlassGreen', (.05, .22, .08, 1), .85, .06)
M['glass_amber'] = mat_glass('Lib_GlassAmber', (.35, .13, .02, 1), .9, .06)
M['pet_clear'] = mat_glass('Lib_PetClear', (.7, .85, .95, 1), .45, .08)
M['pet_dark'] = mat_glass('Lib_PetDark', (.12, .03, .02, 1), .9, .1)
M['cap_blue'] = mat_solid('Lib_CapBlue', (.05, .2, .6, 1), .3)
M['cap_red'] = mat_solid('Lib_CapRed', (.6, .04, .03, 1), .3)
M['cap_silver'] = mat_metal('Lib_CapSilver', (.7, .7, .72, 1), .25, .15)
M['alu'] = mat_metal('Lib_Alu', (.75, .76, .78, 1), .25, 0.0)
M['tin_metal'] = mat_metal('Lib_TinMetal', (.55, .56, .58, 1), .4, .3)
M['barcode'] = mat_barcode()
# furniture
M['wood'] = mat_solid('Lib_WoodDark', (.1, .045, .02, 1), .5)
M['woodlight'] = mat_solid('Lib_WoodLight', (.28, .16, .07, 1), .55)
M['laminate'] = mat_solid('Lib_Laminate', (.55, .5, .4, 1), .4)
M['shelf'] = mat_metal('Lib_Shelf', (.45, .48, .46, 1), .4, .55)
M['shelfdark'] = mat_metal('Lib_ShelfDark', (.15, .17, .16, 1), .45, .4)
M['steel'] = mat_metal('Lib_Steel', (.12, .17, .14, 1), .4, .15)
M['safe'] = mat_metal('Lib_Safe', (.08, .1, .09, 1), .35, .12)
M['plastic'] = mat_solid('Lib_Plastic', (.05, .05, .055, 1), .4)
M['plasticlt'] = mat_solid('Lib_PlasticLt', (.55, .53, .46, 1), .45)
M['paper'] = mat_solid('Lib_Paper', (.62, .6, .5, 1), .9)
M['cardboard'] = mat_solid('Lib_Cardboard', (.33, .22, .11, 1), .95)
M['tape'] = mat_solid('Lib_Tape', (.5, .38, .15, 1), .3)
M['brass'] = mat_solid('Lib_Brass', (.55, .38, .12, 1), .3, 1)
M['chrome'] = mat_solid('Lib_Chrome', (.75, .75, .78, 1), .15, 1)
M['rubber'] = mat_solid('Lib_Rubber', (.02, .02, .02, 1), .9)
M['red'] = mat_solid('Lib_Red', (.5, .03, .02, 1), .35)
M['green'] = mat_solid('Lib_Green', (.05, .35, .1, 1), .35)
M['screen'] = mat_solid('Lib_Screen', (.02, .08, .03, 1), .2, emit=(.1, .8, .25, 1), k=.45)
M['glow'] = mat_solid('Lib_Glow', (.7, .85, .9, 1), .4, emit=(.55, .8, .95, 1), k=.55)
M['glass'] = mat_glass('Lib_Glass', (.55, .7, .65, 1), .16, .03)
M['clockface'] = mat_solid('Lib_ClockFace', (.62, .6, .52, 1), .6)
M['key'] = mat_metal('Lib_KeyMetal', (.6, .55, .35, 1), .3, .2)

# ------------------------------------------------------------------ mesh helpers
def finish(name, bm, mats, smooth=True, sharp=35, lib=True):
    if smooth:
        for e in bm.edges:
            if len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(sharp): e.smooth = False
        for f in bm.faces: f.smooth = True
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(M[m] if isinstance(m, str) else m)
    o = bpy.data.objects.new(name, me); (LIB if lib else COL).objects.link(o); return o

def lathe(bm, prof, seg=20, slot=lambda z: 0, close_top=True, close_bot=True, a0=0):
    rings = []
    for r, z in prof:
        rings.append([bm.verts.new((r * math.cos(a0 + 2 * math.pi * i / seg), r * math.sin(a0 + 2 * math.pi * i / seg), z)) for i in range(seg)])
    for k in range(len(rings) - 1):
        for i in range(seg):
            f = bm.faces.new((rings[k][i], rings[k][(i + 1) % seg], rings[k + 1][(i + 1) % seg], rings[k + 1][i]))
            f.material_index = slot((prof[k][1] + prof[k + 1][1]) / 2)
    if close_bot: bm.faces.new(rings[0][::-1]).material_index = slot(prof[0][1])
    if close_top: bm.faces.new(rings[-1]).material_index = slot(prof[-1][1])
    return rings

def cube(bm, c, s, bevel=0.0, slot=0):
    r = bmesh.ops.create_cube(bm, size=1)
    for v in r['verts']: v.co = Vector((v.co.x * s[0] + c[0], v.co.y * s[1] + c[1], v.co.z * s[2] + c[2]))
    for f in {f for v in r['verts'] for f in v.link_faces}: f.material_index = slot
    if bevel > 0:
        edges = list({e for v in r['verts'] for e in v.link_edges})
        bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=1, affect='EDGES')
    return r['verts']

def place(o_src, name, loc, rz=0, rx=0, ry=0, sc=1.0):
    o = bpy.data.objects.new(name, o_src.data); o.location = loc; o.rotation_euler = (rx, ry, rz); o.scale = (sc,) * 3; COL.objects.link(o); return o

def prim(name, kind, c, s, mat, rot=(0, 0, 0), bevel=0.0):
    bm = bmesh.new()
    if kind == 'box': cube(bm, (0, 0, 0), s, bevel)
    elif kind == 'cyl':
        bmesh.ops.create_cone(bm, cap_ends=True, segments=int(s[3]) if len(s) > 3 else 20, radius1=s[0], radius2=s[1] if s[1] is not None else s[0], depth=s[2])
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for f in me.polygons: f.use_smooth = (kind == 'cyl')
    me.materials.append(M[mat] if isinstance(mat, str) else mat)
    o = bpy.data.objects.new(name, me); o.location = c; o.rotation_euler = rot; COL.objects.link(o); return o

# ------------------------------------------------------------------ product library (base at z 0, label front toward -Y, lathe seams hidden at +Y)
SEG = 24
def can(name, matname, r=.033, h=.122):
    bm = bmesh.new()
    prof = [(r * .82, 0), (r * .94, .003), (r, .009), (r, h - .009), (r * .94, h - .004), (r * .84, h - .0015), (r * .82, h)]
    lathe(bm, prof, SEG, slot=lambda z: 1 if .012 < z < h - .012 else 0, a0=math.pi / 2 + math.pi / SEG)
    cube(bm, (0, 0, h + .001), (.016, .005, .0015), 0, 0)
    return finish(name, bm, ['alu', matname])
def tin(name, matname, r=.04, h=.1):
    bm = bmesh.new()
    prof = [(r * .96, 0), (r, .004), (r, .008), (r * .97, .012), (r * .97, h - .012), (r, h - .008), (r, h - .004), (r * .96, h)]
    lathe(bm, prof, SEG, slot=lambda z: 1 if .013 < z < h - .013 else 0, a0=math.pi / 2 + math.pi / SEG)
    return finish(name, bm, ['tin_metal', matname])
def beer_bottle(name, glass, cap):
    bm = bmesh.new()
    prof = [(.03, 0), (.035, .004), (.0355, .125), (.033, .142), (.026, .158), (.017, .178), (.0128, .192), (.0125, .208), (.0158, .21), (.0158, .218), (.0128, .218), (.0128, .222)]
    lathe(bm, prof, SEG, slot=lambda z: 2 if z > .209 else (1 if .035 < z < .12 else 0), a0=math.pi / 2 + math.pi / SEG)
    return finish(name, bm, [glass, 'bottle_label', cap])
def pet_bottle(name, body, label, cap, h=.26, r=.033):
    bm = bmesh.new()
    prof = [(r * .75, 0), (r * .95, .006), (r, .018), (r, .03), (r * .92, .04), (r, .05), (r, h * .55), (r * .96, h * .6), (r * .88, h * .68), (r * .55, h * .8), (.0135, h * .86), (.0135, h * .9), (.0155, h * .905), (.0155, h * .93), (.0125, h * .935)]
    lathe(bm, prof, SEG, slot=lambda z: 2 if z > h * .895 else (1 if h * .2 < z < h * .55 else 0), a0=math.pi / 2 + math.pi / SEG)
    return finish(name, bm, [body, label, cap])
def jar(name, matname):
    bm = bmesh.new()
    prof = [(.035, 0), (.04, .004), (.0425, .01), (.0425, .095), (.04, .1), (.037, .103), (.037, .108), (.0405, .109), (.0405, .122), (.038, .124)]
    lathe(bm, prof, SEG, slot=lambda z: 2 if z > .108 else (1 if .02 < z < .09 else 0), a0=math.pi / 2 + math.pi / SEG)
    return finish(name, bm, ['pet_clear', matname, 'lid_gold'])
def box_pack(name, matname, w, d, h, bevel=.003):
    bm = bmesh.new(); cube(bm, (0, 0, h / 2), (w, d, h), bevel)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = False
    me.materials.append(M[matname]); o = bpy.data.objects.new(name, me); LIB.objects.link(o); return o
def chips(name, matname, w=.16, d=.045, h=.24):
    bm = bmesh.new(); cube(bm, (0, 0, h / 2), (w, d, h));
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=7, use_grid_fill=True)
    for v in bm.verts:
        t = (v.co.z / h) * 2 - 1                                   # -1 .. 1 along the height
        pinch = 1 - abs(t) ** 6                                    # thick middle, crimped ends
        v.co.y *= .25 + .75 * pinch
        v.co.x *= 1 - .06 * (1 - pinch)
        v.co.y += math.sin(v.co.x / w * math.pi * 1.4) * .0 + (.003 * math.sin(v.co.z * 140) if abs(t) > .9 else 0)
    for f in bm.faces: f.smooth = True
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(M[matname]); o = bpy.data.objects.new(name, me); LIB.objects.link(o); return o
def carton(name, matname, w=.07, d=.07, h=.2):
    bm = bmesh.new(); cube(bm, (0, 0, h / 2), (w, d, h), .002)
    # gable roof: two sloped panels + fin
    top = h; hv = [bm.verts.new(p) for p in ((-w / 2, -d / 2, top), (w / 2, -d / 2, top), (w / 2, d / 2, top), (-w / 2, d / 2, top), (-w / 2, 0, top + .05), (w / 2, 0, top + .05))]
    bm.faces.new((hv[0], hv[1], hv[5], hv[4])); bm.faces.new((hv[2], hv[3], hv[4], hv[5])); bm.faces.new((hv[0], hv[4], hv[3])); bm.faces.new((hv[1], hv[2], hv[5]))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(M[matname])
    for p in me.polygons: p.use_smooth = False
    o = bpy.data.objects.new(name, me); LIB.objects.link(o); return o
def oil_bottle(name):
    bm = bmesh.new(); cube(bm, (0, 0, .11), (.1, .06, .22), .012)
    bmesh.ops.create_cone  # body only; neck + cap via lathe on top
    lathe(bm, [(.024, .22), (.021, .23), (.021, .26), (.024, .262), (.024, .275), (.021, .277)], 16, slot=lambda z: 2 if z > .262 else 0)
    cube(bm, (.055, 0, .13), (.014, .03, .15), .004)                        # moulded handle
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = False
    for m in ('pet_clear', 'oil', 'oilcap'): me.materials.append(M[m])
    o = bpy.data.objects.new(name, me); LIB.objects.link(o)
    # label material on the large faces: faces whose normal is -Y
    for p in me.polygons:
        if p.normal.y < -.9: p.material_index = 1
    return o
def jug(name, matname, w=.17, d=.1, h=.25):
    bm = bmesh.new(); cube(bm, (0, 0, h / 2), (w, d, h), .016)
    lathe(bm, [(.03, h - .004), (.026, h + .01), (.026, h + .03), (.03, h + .032), (.03, h + .05), (.026, h + .052)], 16, slot=lambda z: 2 if z > h + .03 else 0)
    cube(bm, (w * .3, 0, h * .9), (.05, .03, .07), .005)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = False;
    for m in ('pet_clear', matname, 'oilcap'): me.materials.append(M[m])
    for p in me.polygons:
        if p.normal.y < -.9: p.material_index = 1
    o = bpy.data.objects.new(name, me); LIB.objects.link(o); return o
def cigpack(name, matname):
    bm = bmesh.new(); cube(bm, (0, 0, .045), (.056, .021, .09), .001)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(M[matname]); o = bpy.data.objects.new(name, me); LIB.objects.link(o); return o

LIBP = {}
LIBP['can_cola'] = can('Lib_CanCola', 'can_cola'); LIBP['can_lime'] = can('Lib_CanLime', 'can_lime'); LIBP['can_blue'] = can('Lib_CanBlue', 'can_blue'); LIBP['can_orange'] = can('Lib_CanOrange', 'can_orange')
LIBP['tin_beans'] = tin('Lib_TinBeans', 'tin_beans'); LIBP['tin_fish'] = tin('Lib_TinFish', 'tin_fish', .045, .04)
LIBP['beer_g'] = beer_bottle('Lib_BeerG', 'glass_green', 'cap_silver'); LIBP['beer_a'] = beer_bottle('Lib_BeerA', 'glass_amber', 'cap_red')
LIBP['pet_water'] = pet_bottle('Lib_PetWater', 'pet_clear', 'pet_water', 'cap_blue'); LIBP['pet_cola'] = pet_bottle('Lib_PetCola', 'pet_dark', 'pet_cola', 'cap_red', .3, .037)
LIBP['jar'] = jar('Lib_Jar', 'jar_jam')
LIBP['cereal1'] = box_pack('Lib_Cereal1', 'cereal1', .2, .07, .3); LIBP['cereal2'] = box_pack('Lib_Cereal2', 'cereal2', .2, .07, .3); LIBP['cereal3'] = box_pack('Lib_Cereal3', 'cereal3', .16, .06, .26)
LIBP['chips1'] = chips('Lib_Chips1', 'chips1'); LIBP['chips2'] = chips('Lib_Chips2', 'chips2', .15, .04, .22); LIBP['chips3'] = chips('Lib_Chips3', 'chips3', .17, .05, .25)
LIBP['milk'] = carton('Lib_Milk', 'milk'); LIBP['juice'] = carton('Lib_Juice', 'juice', .065, .065, .19)
LIBP['cig1'] = cigpack('Lib_Cig1', 'cig1'); LIBP['cig2'] = cigpack('Lib_Cig2', 'cig2')
LIBP['bar1'] = box_pack('Lib_Bar1', 'bar1', .1, .025, .02, .002); LIBP['bar2'] = box_pack('Lib_Bar2', 'bar2', .1, .025, .02, .002)
LIBP['oil'] = oil_bottle('Lib_Oil'); LIBP['washer'] = jug('Lib_Washer', 'washer'); LIBP['antifreeze'] = jug('Lib_Antifreeze', 'antifreeze', .16, .09, .22)
LIBP['tag'] = box_pack('Lib_Tag', 'barcode', .045, .002, .022, .0005)
H = {'can_cola': .122, 'can_lime': .122, 'can_blue': .122, 'can_orange': .122, 'tin_beans': .1, 'tin_fish': .04, 'beer_g': .222, 'beer_a': .222, 'pet_water': .26, 'pet_cola': .3, 'jar': .124,
     'cereal1': .3, 'cereal2': .3, 'cereal3': .26, 'chips1': .24, 'chips2': .22, 'chips3': .25, 'milk': .25, 'juice': .24, 'cig1': .09, 'cig2': .09, 'bar1': .02, 'bar2': .02, 'oil': .28, 'washer': .3, 'antifreeze': .27}
W = {'can_cola': .066, 'can_lime': .066, 'can_blue': .066, 'can_orange': .066, 'tin_beans': .08, 'tin_fish': .09, 'beer_g': .07, 'beer_a': .07, 'pet_water': .07, 'pet_cola': .075, 'jar': .085,
     'cereal1': .2, 'cereal2': .2, 'cereal3': .16, 'chips1': .16, 'chips2': .15, 'chips3': .17, 'milk': .07, 'juice': .065, 'cig1': .056, 'cig2': .056, 'bar1': .1, 'bar2': .1, 'oil': .12, 'washer': .17, 'antifreeze': .16}
CAT = {'snacks': ['chips1', 'chips2', 'chips3', 'cereal1', 'cereal2', 'cereal3', 'bar1', 'bar2'],
       'drinks': ['can_cola', 'can_lime', 'can_blue', 'can_orange', 'beer_g', 'beer_a', 'pet_water', 'pet_cola'],
       'auto': ['oil', 'oil', 'washer', 'antifreeze', 'tin_beans', 'tin_fish', 'jar']}
COUNT = {'n': 0}
def put_item(kind, x, y, z, rz=0, jitter=True):
    o = place(LIBP[kind], f'Prop_{kind}_{COUNT["n"]}', (x, y, z), rz + (random.uniform(-.12, .12) if jitter else 0)); COUNT['n'] += 1; return o

# ------------------------------------------------------------------ shelving
def shelf_unit(tag, x0, x1, y, h=1.6, lv=4, depth=.5, cat='snacks', fallen=False):
    xc = (x0 + x1) / 2; Ln = x1 - x0
    bm = bmesh.new()
    cube(bm, (xc, y, .05), (Ln, depth, .1), .004)                                          # plinth
    for i in range(int(Ln / .9) + 2):                                                      # slotted uprights, both faces of the back
        xp = x0 + i * Ln / (int(Ln / .9) + 1); cube(bm, (xp, y, h / 2), (.04, depth * .96, h), .003)
    cube(bm, (xc, y, h / 2), (Ln, .02, h * .96))                                           # back panel
    for k in range(int(Ln / .12)):                                                         # louvre slots on the back panel
        for j in range(int(h / .1)): cube(bm, (x0 + .06 + k * .12, y + .011, .12 + j * .1), (.012, .003, .05))
    for i in range(lv):                                                                    # pans with front lips and back stops
        zz = .22 + i * (h - .3) / (lv - 1)
        cube(bm, (xc, y, zz), (Ln - .04, depth * .94, .012), .002)
        for sd in (-1, 1): cube(bm, (xc, y + sd * depth * .46, zz + .02), (Ln - .04, .008, .04), .002)
    cube(bm, (xc, y, h + .04), (Ln + .06, depth + .02, .08), .006)                         # header board
    for e in (x0, x1): cube(bm, (e, y, h / 2), (.03, depth + .01, h), .003)
    so = finish(f'Prop_{tag}_Frame', bm, ['shelf'], sharp=40, lib=False)
    so.location = (0, 0, CZ)
    # price-tag rails + tags
    for i in range(lv):
        zz = CZ + .22 + i * (h - .3) / (lv - 1)
        for sd in (-1, 1):
            prim(f'Prop_{tag}_Rail{i}{sd}', 'box', (xc, y + sd * (depth * .47), zz + .012), (Ln - .05, .004, .022), 'plasticlt')
            for k in range(int(Ln / .22)):
                if random.random() < .8: place(LIBP['tag'], f'Prop_{tag}_Tag', (x0 + .15 + k * .22 + random.uniform(-.02, .02), y + sd * (depth * .475 + .004), zz + .013), 0 if sd < 0 else math.pi)
    # products
    for i in range(lv):
        zz = CZ + .22 + i * (h - .3) / (lv - 1) + .007
        for sd in (-1, 1):
            c = cat if (i % 2 == 0 or cat != 'snacks') else random.choice(('snacks', 'drinks'))
            x = x0 + .1; rz = 0 if sd < 0 else math.pi
            while x < x1 - .1:
                if random.random() < .12: x += random.uniform(.1, .4); continue
                kind = random.choice(CAT[c]); w = W[kind]; rows = 2 if H[kind] < .15 else 1
                for r_ in range(rows):
                    put_item(kind, x + w / 2, y + sd * depth * .38, zz, rz)
                    if kind.startswith(('can', 'tin', 'beer', 'pet', 'jar')) and random.random() < .7:
                        put_item(kind, x + w / 2, y + sd * depth * .14, zz, rz)            # a second row behind
                    if random.random() < .35 and H[kind] < .13: put_item(kind, x + w / 2, y + sd * depth * .38, zz + H[kind], rz)   # stacked
                x += w + random.uniform(.004, .03)
    return so

for i, (y, cat) in enumerate(((4.6, 'snacks'), (6.9, 'drinks'), (9.2, 'auto'))):
    shelf_unit(f'Row{i}', 6.4, 12.4, y, cat=cat)

# ------------------------------------------------------------------ coolers
for i in range(5):
    x = 6.4 + i * 1.4; yb = Y1 - .34
    bm = bmesh.new()
    cube(bm, (x, yb + .3, CZ + 1.05), (1.34, .05, 2.1), .006)                                  # back
    for sd in (-1, 1): cube(bm, (x + sd * .66, yb, CZ + 1.05), (.04, .66, 2.1), .006)           # sides
    cube(bm, (x, yb, CZ + 2.1), (1.34, .66, .06), .006); cube(bm, (x, yb, CZ + .1), (1.34, .66, .2), .006)   # top, plinth
    cube(bm, (x, yb, CZ + .22), (1.28, .6, .03))                                                # floor of the cabinet
    so = finish(f'Prop_Cooler{i}_Body', bm, ['steel'], lib=False)
    prim(f'Prop_Cooler{i}_Inside', 'box', (x, yb + .2, CZ + 1.03), (1.2, .01, 1.8), 'glow' if i != 2 else 'plastic')
    prim(f'Prop_Cooler{i}_Glass', 'box', (x, yb - .34, CZ + 1.03), (1.2, .01, 1.84), 'glass')
    prim(f'Prop_Cooler{i}_FrameT', 'box', (x, yb - .345, CZ + 1.97), (1.28, .03, .06), 'chrome'); prim(f'Prop_Cooler{i}_FrameB', 'box', (x, yb - .345, CZ + .14), (1.28, .03, .06), 'chrome')
    for sd in (-1, 1): prim(f'Prop_Cooler{i}_FrameS{sd}', 'box', (x + sd * .62, yb - .345, CZ + 1.05), (.04, .03, 1.82), 'chrome')
    prim(f'Prop_Cooler{i}_Handle', 'box', (x + .5, yb - .375, CZ + 1.05), (.025, .035, .7), 'chrome', bevel=.006)
    prim(f'Prop_Cooler{i}_Header', 'box', (x, yb - .3, CZ + 2.16), (1.3, .16, .14), 'glow' if i in (0, 1, 3, 4) else 'plastic')
    for lv_ in range(5):
        zz = CZ + .3 + lv_ * .34
        prim(f'Prop_Cooler{i}_Rack{lv_}', 'box', (x, yb - .08, zz), (1.14, .5, .012), 'shelf')
        if i == 2 and lv_ > 1: continue                                                                        # one cooler is broken and empty
        xx = x - .52
        while xx < x + .5:
            kind = random.choice(('pet_water', 'pet_cola', 'can_cola', 'can_lime', 'can_blue', 'can_orange', 'milk', 'juice', 'beer_g', 'beer_a'))
            if H[kind] > .3 - 0.02 and lv_ == 4: kind = 'can_cola'
            if random.random() > .12:
                put_item(kind, xx + W[kind] / 2, yb - .27, zz + .006, 0); put_item(kind, xx + W[kind] / 2, yb - .18, zz + .006, 0)
            xx += W[kind] + .006

# ------------------------------------------------------------------ counter
bm = bmesh.new()
cube(bm, (3.0, 2.65, CZ + .5), (4.4, .66, 1.0), .006)                                         # cabinet body
for k in range(9): cube(bm, (1.0 + k * .5 + .25, 2.31, CZ + .5), (.44, .02, .8), .004)         # raised panels on the customer side
cube(bm, (3.0, 2.62, CZ + 1.04), (4.62, .84, .06), .008)                                       # top slab with an overhang
cube(bm, (3.0, 2.34, CZ + .05), (4.4, .05, .1))                                                # toe kick
cube(bm, (1.15, 4.05, CZ + .5), (.66, 2.1, 1.0), .006); cube(bm, (1.15, 4.1, CZ + 1.04), (.84, 2.3, .06), .008)
finish('Prop_Counter_Body', bm, ['woodlight'], lib=False)
prim('Prop_Counter_Trim', 'box', (3.0, 2.2, CZ + 1.0), (4.66, .03, .03), 'brass')
# display case on the counter's left end
prim('Prop_Case_Base', 'box', (1.9, 2.65, CZ + 1.1), (1.7, .6, .06), 'wood'); prim('Prop_Case_Glass', 'box', (1.9, 2.65, CZ + 1.3), (1.7, .6, .34), 'glass')
for xx in (1.05, 2.75): prim('Prop_Case_Post', 'box', (xx, 2.65, CZ + 1.3), (.03, .6, .36), 'chrome')
for k in range(10): put_item(random.choice(('bar1', 'bar2')), 1.15 + k * .15, 2.55, CZ + 1.13); put_item(random.choice(('bar1', 'bar2')), 1.15 + k * .15, 2.75, CZ + 1.13)
# register
bm = bmesh.new()
cube(bm, (0, 0, .06), (.42, .38, .12), .006)                                                  # lower body
cube(bm, (0, -.02, .15), (.4, .32, .05), .006)
ro = finish('Prop_Reg_Body', bm, ['plastic'], lib=False); ro.location = (3.5, 2.62, CZ + 1.07); ro.rotation_euler = (math.radians(-6), 0, 0)
for r_ in range(4):
    for c_ in range(6): prim(f'Prop_Reg_Key{r_}{c_}', 'box', (3.5 - .15 + c_ * .06, 2.57 - r_ * .045 + .12, CZ + 1.268), (.045, .036, .014), 'red' if c_ == 5 else ('green' if r_ == 3 and c_ == 4 else 'plasticlt'), bevel=.003)
prim('Prop_Reg_Stalk', 'cyl', (3.5, 2.8, CZ + 1.28), (.012, .012, .3, 12), 'plastic')
sc_ = prim('Prop_Reg_Screen', 'box', (3.5, 2.78, CZ + 1.45), (.3, .035, .2), 'plastic', rot=(math.radians(-12), 0, 0), bevel=.006)
prim('Prop_Reg_Display', 'box', (3.5, 2.755, CZ + 1.45), (.26, .004, .16), 'screen', rot=(math.radians(-12), 0, 0))
prim('Prop_Reg_Drawer', 'box', (3.5, 2.435, CZ + 1.1), (.4, .02, .07), 'steel', bevel=.003)
prim('Prop_Reg_Reader', 'box', (3.1, 2.55, CZ + 1.1), (.09, .15, .035), 'plastic', rot=(0, 0, .2), bevel=.006)
prim('Prop_Reg_Receipt', 'box', (3.5, 2.8, CZ + 1.22), (.07, .004, .12), 'paper', rot=(math.radians(20), 0, 0))
# spike with receipts
prim('Prop_Spike', 'cyl', (4.3, 2.6, CZ + 1.18), (.004, .002, .3, 8), 'chrome'); prim('Prop_Spike_Base', 'cyl', (4.3, 2.6, CZ + 1.08), (.045, .05, .02, 16), 'chrome')
for i in range(9): prim(f'Prop_Receipt{i}', 'box', (4.3, 2.6, CZ + 1.1 + i * .014), (.075, .075, .0012), 'paper', rot=(0, 0, random.uniform(-.8, .8)))
# bell, tip jar
bm = bmesh.new(); lathe(bm, [(.05, 0), (.048, .006), (.04, .02), (.01, .028), (.004, .03)], 24)
bo = finish('Prop_Bell_Mesh', bm, ['brass'], lib=False); bo.location = (2.9, 2.35, CZ + 1.07)
bm = bmesh.new(); lathe(bm, [(.06, 0), (.07, .01), (.07, .15), (.06, .16), (.06, .17), (.068, .17)], 24)
jo = finish('Prop_TipJar', bm, ['glass'], lib=False); jo.location = (4.55, 2.5, CZ + 1.07)
prim('Prop_Coins', 'cyl', (4.55, 2.5, CZ + 1.095), (.06, .06, .05, 20), 'brass')
# cigarette rack + back bar behind the counter
bm = bmesh.new(); cube(bm, (3.4, 5.15, .55), (3.2, .5, 1.1), .006)
for i in range(4): cube(bm, (3.4, 5.32, 1.25 + i * .34), (3.2, .26, .025))
cube(bm, (3.4, 5.46, 1.75), (3.2, .02, 1.5))
bb = finish('Prop_BackBar', bm, ['woodlight'], lib=False); bb.location = (0, 0, CZ)
for i in range(4):
    zz = CZ + 1.25 + i * .34 + .013
    for k in range(int(3.0 / .062)):
        if random.random() < .85: put_item(random.choice(('cig1', 'cig2')), 1.95 + k * .062, 5.3, zz, 0, jitter=False)
for k in range(8): put_item(random.choice(('beer_g', 'beer_a')), 2.0 + k * .38, 5.0, CZ + 1.1 + .013, 0)

# ------------------------------------------------------------------ office
T = .14
def wall_piece(nm, c, s):
    o = prim(nm, 'box', c, s, 'wall_ref' if False else bpy.data.materials['Shop_WallPaint']); return o
# (office walls from shop_interior.py stay)

# desk with pedestals
bm = bmesh.new()
cube(bm, (0, 0, .75), (1.6, .76, .05), .006)
for sx in (-1, 1):
    cube(bm, (sx * .62, 0, .37), (.36, .7, .72), .004)
    for k in range(3): cube(bm, (sx * .62, -.355, .13 + k * .23), (.32, .012, .2), .003)
cube(bm, (0, .32, .45), (1.0, .02, .6))
do = finish('Prop_Desk', bm, ['woodlight'], lib=False); do.location = (-.2, 10.2, CZ)
for sx in (-1, 1):
    for k in range(3): prim(f'Prop_Desk_Handle{sx}{k}', 'box', (-.2 + sx * .62, 9.82, CZ + .13 + k * .23), (.1, .02, .014), 'chrome', bevel=.003)
# lamp
bm = bmesh.new(); lathe(bm, [(.08, 0), (.07, .015), (.02, .02), (.012, .04)], 16)
lo = finish('Prop_Lamp_Base', bm, ['shelfdark'], lib=False); lo.location = (-.75, 10.35, CZ + .775)
prim('Prop_Lamp_Arm1', 'cyl', (-.75, 10.35, CZ + .97), (.007, .007, .36, 8), 'shelfdark', rot=(math.radians(8), 0, 0)); prim('Prop_Lamp_Arm2', 'cyl', (-.68, 10.28, CZ + 1.17), (.007, .007, .24, 8), 'shelfdark', rot=(0, math.radians(70), 0))
bm = bmesh.new(); lathe(bm, [(.03, 0), (.06, -.07), (.065, -.075)], 20, close_top=False); sh = finish('Prop_Lamp_Shade', bm, ['shelfdark'], lib=False); sh.location = (-.58, 10.28, CZ + 1.19)
prim('Prop_Lamp_Bulb', 'cyl', (-.58, 10.28, CZ + 1.13), (.02, .02, .03, 10), 'glow')
# phone, papers, mug, notebook
prim('Prop_Phone', 'box', (.3, 10.1, CZ + .81), (.18, .22, .06), 'plastic', bevel=.008); prim('Prop_Phone_Handset', 'box', (.3, 10.1, CZ + .86), (.05, .2, .035), 'plastic', bevel=.01)
bm = bmesh.new(); lathe(bm, [(.035, 0), (.038, .003), (.04, .09), (.037, .092)], 20, close_top=False); mu = finish('Prop_Mug', bm, ['plasticlt'], lib=False); mu.location = (.65, 10.4, CZ + .775)
for i in range(8): prim(f'Prop_Paper{i}', 'box', (.05 + random.uniform(-.01, .01), 10.15 + random.uniform(-.01, .01), CZ + .776 + i * .003), (.3, .21, .0025), 'paper', rot=(0, 0, .25 + random.uniform(-.05, .05)))
prim('Prop_Notebook', 'box', (-.45, 10.0, CZ + .785), (.2, .27, .02), 'green', rot=(0, 0, -.2), bevel=.003)
# chair (five-star base, gas column, seat, curved back)
cx, cy = -.2, 9.35
for k in range(5):
    a = 2 * math.pi * k / 5 + .3
    prim(f'Prop_Chair_Leg{k}', 'box', (cx + math.cos(a) * .15, cy + math.sin(a) * .15, CZ + .08), (.3, .035, .025), 'shelfdark', rot=(0, 0, a), bevel=.004)
    prim(f'Prop_Chair_Wheel{k}', 'cyl', (cx + math.cos(a) * .29, cy + math.sin(a) * .29, CZ + .035), (.028, .028, .05, 12), 'rubber', rot=(math.radians(90), 0, a + math.pi / 2))
prim('Prop_Chair_Column', 'cyl', (cx, cy, CZ + .28), (.025, .025, .4, 12), 'chrome')
prim('Prop_Chair_Seat', 'box', (cx, cy, CZ + .5), (.5, .5, .08), 'plastic', rot=(0, 0, .35), bevel=.025)
for k in range(5): prim(f'Prop_Chair_Back{k}', 'box', (cx - .1 + (k - 2) * .09 * math.cos(.35) + .0, cy - .24 + (k - 2) * .09 * math.sin(.35) * .0 + abs(k - 2) * .02, CZ + .8), (.09, .04, .5), 'plastic', rot=(math.radians(-8), 0, .35 + (k - 2) * .1), bevel=.008)
# filing cabinet
bm = bmesh.new(); cube(bm, (0, 0, .65), (.5, .62, 1.3), .006)
for k in range(4): cube(bm, (.255, 0, .27 + k * .3), (.012, .56, .26), .003)
fo = finish('Prop_FileCab', bm, ['steel'], lib=False); fo.location = (-3.65, 8.2, CZ)
for k in range(4):
    prim(f'Prop_FileCab_Handle{k}', 'box', (-3.38, 8.2, CZ + .3 + k * .3), (.03, .16, .022), 'chrome', bevel=.004); prim(f'Prop_FileCab_Label{k}', 'box', (-3.388, 8.2, CZ + .38 + k * .3), (.004, .09, .05), 'paper')
# wall shelf with folders
prim('Prop_OfficeShelf', 'box', (-1.5, 11.5, CZ + 1.6), (2.4, .24, .035), 'woodlight', bevel=.004)
for sx in (-2.55, -.45): prim(f'Prop_OfficeShelf_Brk{sx}', 'box', (sx, 11.52, CZ + 1.52), (.03, .2, .15), 'shelfdark')
for i in range(10): prim(f'Prop_Folder{i}', 'box', (-2.55 + i * .21, 11.5, CZ + 1.78), (.05 + random.uniform(0, .03), .2, .26 + random.uniform(-.03, .03)), 'paper' if i % 2 else 'cardboard', rot=(0, 0, random.uniform(-.06, .06)), bevel=.002)
# safe
bm = bmesh.new()
cube(bm, (0, 0, .36), (.78, .68, .72), .012)
cube(bm, (0, -.345, .36), (.64, .018, .6), .006)                                           # recessed door plate
for dz in (.16, .56): cube(bm, (-.4, -.31, dz), (.03, .05, .1), .004)                      # hinges
so = finish('Prop_Safe', bm, ['safe'], lib=False); so.location = (-3.4, 11.12, CZ)
for dx in (-.34, .34):
    for dz in (.08, .64): prim(f'Prop_Safe_Bolt{dx}{dz}', 'cyl', (-3.4 + dx, 10.775, CZ + dz), (.012, .012, .01, 8), 'chrome', rot=(math.radians(90), 0, 0))
bm = bmesh.new(); lathe(bm, [(.075, 0), (.07, .006), (.065, .02), (.055, .024), (.012, .03)], 32, a0=0)
for k in range(24): cube(bm, (math.cos(k * math.pi / 12) * .058, math.sin(k * math.pi / 12) * .058, .026), (.004, .014, .004) if k % 6 else (.006, .02, .005))
do_ = finish('Prop_Safe_Dial', bm, ['brass'], lib=False); do_.location = (-3.4, 10.765, CZ + .46); do_.rotation_euler = (math.radians(90), 0, 0)
prim('Prop_Safe_Pointer', 'box', (-3.4, 10.77, CZ + .545), (.006, .004, .03), 'red')
for k in range(3): prim(f'Prop_Safe_Spoke{k}', 'box', (-3.4 + math.cos(k * 2.094 + .5) * .045, 10.762, CZ + .2 + math.sin(k * 2.094 + .5) * .045), (.09, .012, .014), 'chrome', rot=(0, k * 2.094 + .5, 0), bevel=.003)
prim('Prop_Safe_Hub', 'cyl', (-3.4, 10.762, CZ + .2), (.02, .02, .03, 12), 'chrome', rot=(math.radians(90), 0, 0))
prim('Prop_Safe_Plate', 'box', (-3.4, 10.768, CZ + .62), (.16, .004, .03), 'brass')
# calendar (grid of days) and clock (hands at 3:47)
prim('Prop_Calendar_Page', 'box', (-1.6, 11.56, CZ + 1.43), (.36, .008, .6), 'paper'); prim('Prop_Calendar_Photo', 'box', (-1.6, 11.553, CZ + 1.62), (.32, .004, .17), 'cereal2')
prim('Prop_Calendar_Head', 'box', (-1.6, 11.553, CZ + 1.47), (.32, .004, .035), 'red')
for r_ in range(6):
    for c_ in range(7): prim(f'Prop_Calendar_Day{r_}{c_}', 'box', (-1.6 - .135 + c_ * .045, 11.552, CZ + 1.4 - r_ * .045), (.036, .003, .036), 'plasticlt' if (r_ * 7 + c_) % 7 < 5 else 'red')
cc = (-.35, 11.56, CZ + 2.35)
bm = bmesh.new(); lathe(bm, [(.0, 0), (.2, 0), (.2, .004)], 40, close_top=False, close_bot=False)
fc = finish('Prop_Clock_Face', bm, ['clockface'], lib=False); fc.location = cc; fc.rotation_euler = (math.radians(90), 0, 0)
bm = bmesh.new(); lathe(bm, [(.2, -.004), (.225, -.004), (.225, .03), (.2, .03), (.2, .022)], 40, close_top=False, close_bot=False)
rm = finish('Prop_Clock_Rim', bm, ['plastic'], lib=False); rm.location = (cc[0], cc[1] - .01, cc[2]); rm.rotation_euler = (math.radians(90), 0, 0)
for k in range(12): a = k * math.pi / 6; prim(f'Prop_Clock_Tick{k}', 'box', (cc[0] + math.sin(a) * .17, cc[1] - .008, cc[2] + math.cos(a) * .17), (.01 if k % 3 == 0 else .005, .004, .03 if k % 3 == 0 else .02), 'plastic', rot=(0, a, 0))
def hand(nm, ang_deg, ln, wd, z_off):
    a = math.radians(ang_deg); prim(nm, 'box', (cc[0] + math.sin(a) * ln / 2, cc[1] - .012 - z_off, cc[2] + math.cos(a) * ln / 2), (wd, .004, ln), 'plastic', rot=(0, a, 0), bevel=.001)
hand('Prop_Clock_Hour', (3 + 47 / 60) * 30, .11, .012, 0); hand('Prop_Clock_Min', 47 * 6, .16, .008, .004); hand('Prop_Clock_Sec', 20 * 6, .17, .003, .008)
prim('Prop_Clock_Pin', 'cyl', (cc[0], cc[1] - .02, cc[2]), (.01, .01, .012, 10), 'chrome', rot=(math.radians(90), 0, 0))
# key board with keys on hooks, one hook free
prim('Prop_KeyBoard', 'box', (1.72, 8.4, CZ + 1.7), (.025, .72, .52), 'wood', bevel=.004)
for i in range(6):
    yy = 8.12 + i * .11; prim(f'Prop_KeyHook{i}', 'cyl', (1.69, yy, CZ + 1.78), (.007, .007, .045, 8), 'brass', rot=(0, math.radians(90), 0))
    if i == 3: continue
    prim(f'Prop_KeyTag{i}', 'box', (1.678, yy, CZ + 1.66), (.006, .05, .05), 'red' if i % 2 else 'cardboard', bevel=.002)
    prim(f'Prop_KeyRing{i}', 'cyl', (1.676, yy, CZ + 1.745), (.014, .014, .003, 14), 'key', rot=(0, math.radians(90), 0)); prim(f'Prop_KeyBlade{i}', 'box', (1.676, yy, CZ + 1.61), (.003, .012, .07), 'key')
# cardboard boxes stacked in the south-east corner, a bucket and a mop in the south-west corner (leaning on the wall)
for i, (x, y_, lv_) in enumerate(((13.8, .15, 0), (13.8, .68, 0), (13.28, .15, 0), (13.28, .68, 0), (13.8, .42, 1), (13.28, .42, 1))):
    prim(f'Prop_Box{i}', 'box', (x, y_, CZ + .22 + lv_ * .44), (.48, .5, .44), 'cardboard', rot=(0, 0, random.uniform(-.1, .1)), bevel=.008)
    prim(f'Prop_BoxTape{i}', 'box', (x, y_, CZ + .443 + lv_ * .44), (.06, .5, .002), 'tape')
prim('Prop_BoxOpen', 'box', (13.55, 1.35, CZ + .13), (.46, .4, .26), 'cardboard', rot=(0, 0, .3), bevel=.008)
for k in range(3): prim(f'Prop_BoxFlap{k}', 'box', (13.55 + (k - 1) * .15, 1.35 + .22, CZ + .27), (.2, .02, .16), 'cardboard', rot=(math.radians(35 - 20 * k), 0, .3))
bm = bmesh.new(); lathe(bm, [(.12, 0), (.14, .01), (.16, .3), (.165, .305), (.155, .305), (.15, .02)], 24, close_top=False)
bk = finish('Prop_Bucket', bm, ['plasticlt'], lib=False); bk.location = (-3.62, .25, CZ)
prim('Prop_Mop_Stick', 'cyl', (-3.82, .27, CZ + .72), (.012, .012, 1.45, 8), 'woodlight', rot=(0, math.radians(-14), 0))
prim('Prop_Mop_Head', 'cyl', (-3.62, .25, CZ + .28), (.09, .12, .2, 12), 'plasticlt', rot=(0, 0, 0))
for k in range(10): prim(f'Prop_Mop_String{k}', 'cyl', (-3.62 + math.cos(k) * .08, .25 + math.sin(k) * .08, CZ + .22), (.008, .005, .24, 5), 'plasticlt', rot=(math.radians(math.sin(k) * 8), math.radians(math.cos(k) * 8), 0))
# the register turns its screen to the cashier (+Y) and flickers: a dying error display
lk = L
reg = [o for o in COL.objects if o.name.startswith('Prop_Reg_')]
rr = bpy.data.objects.new('Prop_Reg_Root', None); COL.objects.link(rr); rr.location = (3.5, 2.7, CZ + 1.07)
for o in reg: o.parent = rr; o.matrix_parent_inverse = Matrix.Translation(-rr.location)   # rr.matrix_world is stale until a depsgraph update
rr.rotation_euler = (0, 0, math.pi)
sm, snt, sb = new_mat('Lib_ScreenBroken'); sb.inputs['Base Color'].default_value = (.02, .08, .03, 1); sb.inputs['Roughness'].default_value = .2
sb.inputs['Emission Color'].default_value = (.1, .8, .25, 1); sb.inputs['Emission Strength'].default_value = .5
ei = list(sb.inputs).index(sb.inputs['Emission Strength']); ci = list(sb.inputs).index(sb.inputs['Emission Color'])
import random as _r
_r.seed(3); sa = bpy.data.actions.new('RegScreen_error'); snt.animation_data_create(); snt.animation_data.action = sa
fe = sa.fcurves.new(f'nodes["{sb.name}"].inputs[{ei}].default_value')
fcs = [sa.fcurves.new(f'nodes["{sb.name}"].inputs[{ci}].default_value', index=k) for k in range(3)]
f_ = 1
while f_ < 240:
    on = _r.random() < .62; k = fe.keyframe_points.insert(f_, _r.uniform(.5, 1.3) if on else _r.uniform(0, .06)); k.interpolation = 'CONSTANT'
    colr = (.1, .8, .25) if _r.random() < .55 else (.9, .12, .06)                                      # green "ready" / red "ERROR"
    for ch, v in zip(fcs, colr): kk = ch.keyframe_points.insert(f_, v); kk.interpolation = 'CONSTANT'
    f_ += _r.choice((1, 1, 2, 3, 5, 8))
for fcx in [fe] + fcs: fcx.modifiers.new('CYCLES')
for o in reg:
    if o.name == 'Prop_Reg_Display': o.data.materials.clear(); o.data.materials.append(sm)
# entrance mat (ribbed rubber, worn) and a puddle with an irregular edge
mm_, mnt, mb = new_mat('Lib_EntryMat'); tcn = N(mnt, 'ShaderNodeTexCoord', -700, 0); wv = N(mnt, 'ShaderNodeTexWave', -500, 0, wave_type='BANDS', bands_direction='X', wave_profile='SAW'); wv.inputs['Scale'].default_value = 24; lk(mnt, tcn, wv, 'Object', 'Vector')
ns_ = N(mnt, 'ShaderNodeTexNoise', -500, -250); ns_.inputs['Scale'].default_value = 5; ns_.inputs['Detail'].default_value = 10; lk(mnt, tcn, ns_, 'Object', 'Vector')
rr_ = ramp(mnt, -250, -250, [(.3, (.01, .01, .01, 1)), (.75, (.1, .08, .06, 1))]); lk(mnt, ns_, rr_, 0, 0); lk(mnt, rr_, mb, 0, 'Base Color'); bpn = N(mnt, 'ShaderNodeBump', 0, -200); bpn.inputs['Strength'].default_value = .8; lk(mnt, wv, bpn, 0, 'Height'); lk(mnt, bpn, mb, 0, 'Normal'); mb.inputs['Roughness'].default_value = .85
prim('Prop_EntryMat', 'box', (-1.9, .75, Z0 + .01), (1.5, 1.0, .02), mm_, bevel=.006)
bm = bmesh.new(); pts = [(math.cos(2 * math.pi * i / 28) * (1.0 + .45 * math.sin(i * 1.7) + .25 * math.cos(i * 3.1)) * 1.15, math.sin(2 * math.pi * i / 28) * (.8 + .3 * math.cos(i * 2.3)) * 1.0) for i in range(28)]
vs = [bm.verts.new((px * .75, py * .75, 0)) for px, py in pts]; bm.faces.new(vs)
pu = finish('Prop_Puddle', bm, [M['glass'] if False else mat_solid('Lib_PuddleWater', (.015, .02, .025, 1), .02, alpha=.8)], smooth=False, lib=False); pu.location = (2.3, 0.9, Z0 + .006)
for k in range(5):
    r_ = .05 + .04 * k; b2 = bmesh.new(); vv = [b2.verts.new((math.cos(2 * math.pi * i / 10) * r_, math.sin(2 * math.pi * i / 10) * r_, 0)) for i in range(10)]; b2.faces.new(vv)
    sp_ = finish(f'Prop_Splash{k}', b2, [bpy.data.materials['Lib_PuddleWater']], smooth=False, lib=False); sp_.location = (2.3 + 1.0 + k * .22, .9 + math.sin(k * 2) * .3, Z0 + .006)
print('props done; items', COUNT['n'], 'library', len(LIBP), 'objects in interior', len(COL.objects))

# Blender 4.4+: actions created via act.fcurves.new() get a legacy slot but are not bound to it, so nothing plays. Bind every unbound action.
for _coll in (bpy.data.objects, bpy.data.lights, bpy.data.materials, bpy.data.worlds):
    for _idb in _coll:
        for _x in (_idb, getattr(_idb, 'node_tree', None)):
            _ad = getattr(_x, 'animation_data', None)
            if _ad and _ad.action and _ad.action_slot is None and _ad.action.slots: _ad.action_slot = _ad.action.slots[0]
