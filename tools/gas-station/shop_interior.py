"""Gas-station shop interior, built procedurally in art/gas-station.blend.
Run through the Blender MCP:  exec(open(r"C:\\Users\\libde\\100gate\\tools\\gas-station\\shop_interior.py", encoding="utf-8").read())
World frame: the shop shell '111' has its inside at x -3.95..14.35, y -0.78..11.63, floor z .22, ceiling z 3.9.
Idempotent: the collection 'ShopInterior' and its materials are rebuilt on every run.
"""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix

X0, X1, Y0, Y1, Z0, Z1 = -3.95, 14.35, -0.78, 11.63, 0.22, 3.9
random.seed(11)

# ------------------------------------------------------------------ collection
def fresh_collection(name):
    old = bpy.data.collections.get(name)
    if old:
        for o in list(old.objects): bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(old)
    c = bpy.data.collections.new(name); bpy.context.scene.collection.children.link(c); return c
COL = fresh_collection('ShopInterior')

# ------------------------------------------------------------------ materials (all procedural nodes)
def new_mat(name):
    m = bpy.data.materials.get(name)
    if m: bpy.data.materials.remove(m)
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); out.location = (900, 0)
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled'); bsdf.location = (600, 0); nt.links.new(bsdf.outputs[0], out.inputs[0])
    return m, nt, bsdf

def node(nt, t, x, y, **kw):
    n = nt.nodes.new(t); n.location = (x, y)
    for k, v in kw.items(): setattr(n, k, v)
    return n

def tex_coord(nt, scale, obj=True):
    tc = node(nt, 'ShaderNodeTexCoord', -1000, 0); mp = node(nt, 'ShaderNodeMapping', -800, 0)
    mp.inputs['Scale'].default_value = (scale, scale, scale)
    nt.links.new(tc.outputs['Object' if obj else 'UV'], mp.inputs['Vector']); return mp

def ramp(nt, x, y, stops):
    r = node(nt, 'ShaderNodeValToRGB', x, y)
    els = r.color_ramp.elements
    while len(els) < len(stops): els.new(1.0)
    for e, (p, c) in zip(els, stops): e.position = p; e.color = c
    return r

def mat_solid(name, col, rough=.7, metal=0, emit=None, emit_k=0):
    m, nt, b = new_mat(name)
    b.inputs['Base Color'].default_value = col; b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if emit: b.inputs['Emission Color'].default_value = emit; b.inputs['Emission Strength'].default_value = emit_k
    return m

def mat_tile():
    m, nt, b = new_mat('Shop_FloorTile'); mp = tex_coord(nt, 1.0)
    ck = node(nt, 'ShaderNodeTexChecker', -500, 150); ck.inputs['Scale'].default_value = 1.6
    ck.inputs['Color1'].default_value = (.33, .31, .27, 1); ck.inputs['Color2'].default_value = (.12, .115, .105, 1)
    nt.links.new(mp.outputs[0], ck.inputs['Vector'])
    ns = node(nt, 'ShaderNodeTexNoise', -500, -150); ns.inputs['Scale'].default_value = 3.0; ns.inputs['Detail'].default_value = 8
    nt.links.new(mp.outputs[0], ns.inputs['Vector'])
    dirt = ramp(nt, -250, -150, [(.35, (1, 1, 1, 1)), (.75, (.35, .32, .26, 1))]); nt.links.new(ns.outputs['Fac'], dirt.inputs[0])
    mix = node(nt, 'ShaderNodeMix', -50, 100, data_type='RGBA', blend_type='MULTIPLY'); mix.inputs['Factor'].default_value = 1
    nt.links.new(ck.outputs['Color'], mix.inputs['A']); nt.links.new(dirt.outputs['Color'], mix.inputs['B'])
    nt.links.new(mix.outputs['Result'], b.inputs['Base Color'])
    rg = ramp(nt, -250, -400, [(0, (.35, .35, .35, 1)), (1, (.9, .9, .9, 1))]); nt.links.new(ns.outputs['Fac'], rg.inputs[0]); nt.links.new(rg.outputs['Color'], b.inputs['Roughness'])
    bump = node(nt, 'ShaderNodeBump', 300, -250); bump.inputs['Strength'].default_value = .15
    ns2 = node(nt, 'ShaderNodeTexNoise', 50, -300); ns2.inputs['Scale'].default_value = 40; nt.links.new(mp.outputs[0], ns2.inputs['Vector'])
    nt.links.new(ns2.outputs['Fac'], bump.inputs['Height']); nt.links.new(bump.outputs[0], b.inputs['Normal'])
    return m

def mat_wall(name, base, dirt_col, scale=.6, grime=1.0):
    m, nt, b = new_mat(name); mp = tex_coord(nt, 1.0)
    ns = node(nt, 'ShaderNodeTexNoise', -600, 100); ns.inputs['Scale'].default_value = scale * 3; ns.inputs['Detail'].default_value = 10; ns.inputs['Roughness'].default_value = .65
    nt.links.new(mp.outputs[0], ns.inputs['Vector'])
    r = ramp(nt, -350, 100, [(.3, base), (.8, dirt_col)]); nt.links.new(ns.outputs['Fac'], r.inputs[0])
    # grime climbs from the floor and drips from the ceiling: a gradient on world z
    sep = node(nt, 'ShaderNodeSeparateXYZ', -600, -200); nt.links.new(mp.outputs[0], sep.inputs[0])
    gr = ramp(nt, -350, -200, [(0, (1, 1, 1, 1)), (1, (.55, .5, .42, 1))]); nt.links.new(sep.outputs[2], gr.inputs[0])
    mx = node(nt, 'ShaderNodeMix', -100, 50, data_type='RGBA', blend_type='MULTIPLY'); mx.inputs['Factor'].default_value = grime
    nt.links.new(r.outputs['Color'], mx.inputs['A']); nt.links.new(gr.outputs['Color'], mx.inputs['B']); nt.links.new(mx.outputs['Result'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = .85
    bump = node(nt, 'ShaderNodeBump', 200, -250); bump.inputs['Strength'].default_value = .08; nt.links.new(ns.outputs['Fac'], bump.inputs['Height']); nt.links.new(bump.outputs[0], b.inputs['Normal'])
    return m

def mat_wood(name='Shop_Wood', base=(.12, .06, .03, 1)):
    m, nt, b = new_mat(name); mp = tex_coord(nt, 1.0)
    wv = node(nt, 'ShaderNodeTexWave', -600, 100, wave_type='BANDS', bands_direction='X', wave_profile='SAW'); wv.inputs['Scale'].default_value = 7; wv.inputs['Distortion'].default_value = 5; wv.inputs['Detail'].default_value = 3
    nt.links.new(mp.outputs[0], wv.inputs['Vector'])
    r = ramp(nt, -300, 100, [(0, (base[0] * .5, base[1] * .5, base[2] * .5, 1)), (1, base)]); nt.links.new(wv.outputs['Fac'], r.inputs[0]); nt.links.new(r.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = .55
    bump = node(nt, 'ShaderNodeBump', 200, -250); bump.inputs['Strength'].default_value = .25; nt.links.new(wv.outputs['Fac'], bump.inputs['Height']); nt.links.new(bump.outputs[0], b.inputs['Normal'])
    return m

def mat_metal(name, base, rust=.45):
    m, nt, b = new_mat(name); mp = tex_coord(nt, 1.0)
    ns = node(nt, 'ShaderNodeTexNoise', -600, 100); ns.inputs['Scale'].default_value = 5; ns.inputs['Detail'].default_value = 12
    nt.links.new(mp.outputs[0], ns.inputs['Vector'])
    p0 = .35 + (1 - rust) * .45; p1 = p0 + .2             # rust: .8 = flaky, .2 = a few stains
    r = ramp(nt, -300, 100, [(p0, base), (p1, (.28, .11, .04, 1))]); nt.links.new(ns.outputs['Fac'], r.inputs[0]); nt.links.new(r.outputs['Color'], b.inputs['Base Color'])
    mt = ramp(nt, -300, -150, [(p0, (.75, .75, .75, 1)), (p1, (0, 0, 0, 1))]); nt.links.new(ns.outputs['Fac'], mt.inputs[0]); nt.links.new(mt.outputs['Color'], b.inputs['Metallic'])
    rg = ramp(nt, -300, -350, [(p0, (.38, .38, .38, 1)), (p1, (.9, .9, .9, 1))]); nt.links.new(ns.outputs['Fac'], rg.inputs[0]); nt.links.new(rg.outputs['Color'], b.inputs['Roughness'])
    return m

def mat_vcol(name='Shop_Products'):
    m, nt, b = new_mat(name); at = node(nt, 'ShaderNodeAttribute', -400, 0); at.attribute_name = 'Col'; at.attribute_type = 'GEOMETRY'
    nt.links.new(at.outputs['Color'], b.inputs['Base Color']); b.inputs['Roughness'].default_value = .45
    return m

def mat_glass(name='Shop_Glass'):
    m, nt, b = new_mat(name); b.inputs['Base Color'].default_value = (.5, .65, .6, 1); b.inputs['Roughness'].default_value = .05
    b.inputs['Alpha'].default_value = .18; m.blend_method = 'BLEND'; m.surface_render_method = 'BLENDED'
    return m

M = {}
M['tile'] = mat_tile()
M['wall'] = mat_wall('Shop_WallPaint', (.46, .5, .42, 1), (.2, .19, .14, 1))
M['ceil'] = mat_wall('Shop_Ceiling', (.55, .55, .5, 1), (.16, .14, .1, 1), grime=1.0)
M['wood'] = mat_wood(); M['woodlight'] = mat_wood('Shop_WoodLight', (.28, .17, .08, 1))
M['shelf'] = mat_metal('Shop_ShelfMetal', (.42, .45, .43, 1), .7); M['steel'] = mat_metal('Shop_SafeSteel', (.12, .16, .14, 1), .2)
M['prod'] = mat_vcol(); M['glass'] = mat_glass()
M['plastic'] = mat_solid('Shop_PlasticDark', (.03, .03, .035, 1), .4)
M['paper'] = mat_solid('Shop_Paper', (.62, .6, .5, 1), .9)
M['cardboard'] = mat_solid('Shop_Cardboard', (.33, .22, .11, 1), .95)
M['lamp'] = mat_solid('Shop_Lamp', (.9, .95, 1, 1), .3, emit=(.75, .88, 1, 1), emit_k=14)
M['lampdead'] = mat_solid('Shop_LampDead', (.35, .38, .38, 1), .5)
M['screen'] = mat_solid('Shop_Screen', (.02, .08, .03, 1), .2, emit=(.1, .8, .25, 1), emit_k=1.6)
M['brass'] = mat_solid('Shop_Brass', (.6, .42, .13, 1), .3, metal=1)
M['red'] = mat_solid('Shop_RedPlastic', (.5, .03, .02, 1), .35)
M['fridgeglow'] = mat_solid('Shop_FridgeLight', (.7, .85, .9, 1), .4, emit=(.55, .8, .95, 1), emit_k=1.2)
M['puddle'] = mat_solid('Shop_Puddle', (.02, .03, .035, 1), .02)
M['rubber'] = mat_solid('Shop_Rubber', (.02, .02, .02, 1), .9)

# ------------------------------------------------------------------ geometry helpers
def link(o): COL.objects.link(o); return o

def mesh_obj(name, bm, mat):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); me.materials.append(M[mat] if isinstance(mat, str) else mat); return link(o)

def box(name, c, s, mat, rz=0):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts: v.co.x *= s[0]; v.co.y *= s[1]; v.co.z *= s[2]
    o = mesh_obj(name, bm, mat); o.location = c; o.rotation_euler = (0, 0, rz); return o

def cyl(name, c, r, h, mat, seg=24, axis='Z'):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=h)
    o = mesh_obj(name, bm, mat); o.location = c
    if axis == 'X': o.rotation_euler = (0, math.radians(90), 0)
    if axis == 'Y': o.rotation_euler = (math.radians(90), 0, 0)
    return o

def smooth(o): [setattr(p, 'use_smooth', True) for p in o.data.polygons]

# ------------------------------------------------------------------ 1) interior surfaces of the shell: floor tile, wall paint, ceiling
sh = bpy.data.objects['111']
for key, nm in (('tile', 'Shop_FloorTile'), ('wall', 'Shop_WallPaint'), ('ceil', 'Shop_Ceiling')):
    if M[key].name not in [s.material.name for s in sh.material_slots if s.material]: sh.data.materials.append(M[key])
idx = {s.material.name: i for i, s in enumerate(sh.material_slots) if s.material}
inside = lambda c: X0 - .03 <= c.x <= X1 + .03 and Y0 - .03 <= c.y <= Y1 + .03 and Z0 - .03 <= c.z <= Z1 + .03
n_f = n_w = n_c = 0
mw = sh.matrix_world
for p in sh.data.polygons:
    c = mw @ p.center; n = (mw.to_3x3() @ p.normal).normalized()
    if not inside(c): continue
    ctr = Vector(((X0 + X1) / 2, (Y0 + Y1) / 2, (Z0 + Z1) / 2))
    if (ctr - c).dot(n) <= 0: continue                    # only faces that look into the room
    if n.z > .9 and abs(c.z - Z0) < .05: p.material_index = idx['Shop_FloorTile']; n_f += 1
    elif n.z < -.9 and abs(c.z - Z1) < .05: p.material_index = idx['Shop_Ceiling']; n_c += 1
    elif abs(n.z) < .3: p.material_index = idx['Shop_WallPaint']; n_w += 1
print('shell faces: floor', n_f, 'walls', n_w, 'ceiling', n_c)

# ------------------------------------------------------------------ 2) counter, register
CZ = Z0
box('Counter_Front', (3.0, 2.65, CZ + .52), (4.4, .7, 1.04), 'woodlight')
box('Counter_Top', (3.0, 2.65, CZ + 1.06), (4.6, .82, .06), 'wood')
box('Counter_Side', (1.15, 4.05, CZ + .52), (.7, 2.1, 1.04), 'woodlight'); box('Counter_SideTop', (1.15, 4.05, CZ + 1.06), (.82, 2.3, .06), 'wood')
box('Counter_Kick', (3.0, 2.31, CZ + .06), (4.4, .04, .12), 'plastic')
# cash register
box('Reg_Body', (3.5, 2.7, CZ + 1.22), (.44, .36, .26), 'plastic')
rs = box('Reg_Screen', (3.5, 2.56, CZ + 1.45), (.28, .03, .2), 'screen'); rs.rotation_euler = (math.radians(-18), 0, 0)
box('Reg_Drawer', (3.5, 2.5, CZ + 1.12), (.4, .04, .08), 'steel')
for i in range(12): box(f'Reg_Key{i}', (3.38 + (i % 4) * .08, 2.52, CZ + 1.31 - (i // 4) * .045), (.06, .015, .03), 'paper')
# receipt spike with receipts
cyl('Spike', (2.5, 2.6, CZ + 1.22), .006, .3, 'brass', 8)
for i in range(7): box(f'Receipt{i}', (2.5, 2.6, CZ + 1.1 + i * .012), (.07, .07, .001), 'paper', rz=random.uniform(-.7, .7))
# bell, tip jar, candy rack
cyl('Bell', (1.9, 2.55, CZ + 1.1), .045, .03, 'brass', 20)
jar = cyl('TipJar', (4.4, 2.55, CZ + 1.17), .07, .18, 'glass', 20)
cyl('Coins', (4.4, 2.55, CZ + 1.1), .06, .035, 'brass', 20)

# ------------------------------------------------------------------ 3) back shelf behind the counter
box('BackCabinet', (3.4, 5.15, CZ + .55), (3.2, .5, 1.1), 'woodlight')
for i in range(3): box(f'BackShelf{i}', (3.4, 5.35, CZ + 1.3 + i * .38), (3.2, .3, .03), 'wood')
box('BackBoard', (3.4, 5.5, CZ + 1.7), (3.2, .02, 1.3), 'wood')

# ------------------------------------------------------------------ 4) gondola shelves + products
def gondola(prefix, x0, x1, y, h=1.55, lv=4, depth=.52, tipped=False):
    L = x1 - x0; xc = (x0 + x1) / 2
    if tipped:
        return
    box(prefix + '_Base', (xc, y, CZ + .05), (L, depth, .1), 'shelf')
    box(prefix + '_Spine', (xc, y, CZ + h / 2), (L, .03, h), 'shelf')
    for i in range(lv): box(prefix + f'_Level{i}', (xc, y, CZ + .22 + i * (h - .3) / (lv - 1)), (L, depth, .02), 'shelf')
    for xe in (x0, x1): box(prefix + '_End', (xe, y, CZ + h / 2), (.03, depth, h), 'shelf')
    return xc, L, lv, h, depth

rows = []
for i, y in enumerate((4.6, 6.9, 9.2)):
    rows.append(gondola(f'Gondola{i}', 6.4, 12.4, y, h=1.55))
# one row has fallen over
box('Gondola_Fallen_Spine', (4.9, 9.2, CZ + .22), (.03, 1.9, 1.5), 'shelf', rz=0)
# (the shelves are drawn as aisle fixtures; products below)

bm = bmesh.new(); colL = bm.loops.layers.color.new('Col')
PAL = [(.7, .05, .04), (.85, .62, .06), (.08, .22, .6), (.06, .45, .12), (.82, .82, .78), (.8, .32, .05), (.45, .08, .35), (.05, .05, .05)]
def add_item(kind, p, s, col):
    if kind == 'can':
        r = bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=s[0], radius2=s[0], depth=s[2]); verts = r['verts']
    else:
        r = bmesh.ops.create_cube(bm, size=1); verts = r['verts']
        for v in verts: v.co.x *= s[0] * 2; v.co.y *= s[1] * 2; v.co.z *= s[2]
    for v in verts: v.co += Vector(p)
    for f in {f for v in verts for f in v.link_faces}:
        for l in f.loops: l[colL] = (*(c * .5 for c in col), 1)         # sun-faded, dusty packaging
n_items = 0
for (xc, L, lv, h, depth), y in zip(rows, (4.6, 6.9, 9.2)):
    for i in range(lv):
        zl = CZ + .22 + i * (h - .3) / (lv - 1) + .01
        x = xc - L / 2 + .12
        while x < xc + L / 2 - .1:
            if random.random() < .18: x += random.uniform(.1, .35); continue         # gaps: the shop was looted
            kind = random.choice(('can', 'can', 'box', 'box', 'box')); col = random.choice(PAL)
            h_i = random.uniform(.1, .26); w_i = random.uniform(.04, .08)
            for side in (-1, 1):
                if random.random() < .85:
                    add_item(kind, (x, y + side * depth * .22, zl + h_i / 2), (w_i, depth * .18, h_i), col); n_items += 1
            x += w_i * 2 + random.uniform(.01, .05)
# loose items on the counter and floor
for k in range(30):
    add_item(random.choice(('can', 'box')), (random.uniform(4.0, 11.5), random.uniform(1.0, 3.6), CZ + .06), (random.uniform(.03, .05), random.uniform(.03, .05), random.uniform(.1, .2)), random.choice(PAL))
mesh_obj('Products', bm, 'prod'); print('products', n_items)

# ------------------------------------------------------------------ 5) coolers on the back wall
for i in range(5):
    x = 6.4 + i * 1.4; yb = Y1 - .32
    box(f'Cooler{i}_Body', (x, yb, CZ + 1.0), (1.3, .62, 2.0), 'steel')
    box(f'Cooler{i}_Glass', (x, yb - .31, CZ + 1.0), (1.2, .02, 1.8), 'glass')
    box(f'Cooler{i}_Glow', (x, yb - .27, CZ + 1.0), (1.1, .01, 1.7), 'fridgeglow' if i not in (2,) else 'plastic')
    for lv_ in range(4): box(f'Cooler{i}_Rack{lv_}', (x, yb - .1, CZ + .35 + lv_ * .42), (1.15, .45, .015), 'shelf')
    box(f'Cooler{i}_Handle', (x + .5, yb - .34, CZ + 1.0), (.02, .03, .6), 'brass')

# ------------------------------------------------------------------ 6) back office: walls, safe, desk, calendar, clock, key board
T = .14; WH = Z1 - Z0 - .02
box('Office_WallFront_A', (-2.475, 7.0, CZ + WH / 2), (2.95, T, WH), 'wall' if False else M['wall'])
box('Office_WallFront_B', (1.0, 7.0, CZ + WH / 2), (1.6, T, WH), M['wall'])
box('Office_WallSide', (1.8, 9.315, CZ + WH / 2), (T, 4.63, WH), M['wall'])
box('Office_DoorHeader', (-.4, 7.0, CZ + 2.6 + .5), (1.2, T, 1.1 - .02), M['wall'])
# desk + chair
box('Desk_Top', (-.2, 10.2, CZ + .75), (1.6, .75, .05), 'wood'); box('Desk_L', (-.9, 10.2, CZ + .37), (.05, .7, .74), 'wood'); box('Desk_R', (.5, 10.2, CZ + .37), (.05, .7, .74), 'wood')
box('Desk_Back', (-.2, 10.5, CZ + .45), (1.5, .03, .6), 'wood')
box('Chair_Seat', (-.2, 9.4, CZ + .45), (.5, .5, .06), 'plastic', rz=.35); box('Chair_Back', (-.12, 9.17, CZ + .75), (.5, .05, .55), 'plastic', rz=.35)
cyl('Chair_Leg', (-.2, 9.4, CZ + .22), .03, .44, 'steel', 8)
box('Lamp_Base', (-.6, 10.4, CZ + .79), (.12, .12, .03), 'steel'); box('Papers', (.1, 10.1, CZ + .785), (.3, .22, .02), 'paper', rz=.3)
# filing cabinet + shelves of folders
box('FileCab', (-3.65, 8.2, CZ + .65), (.5, .62, 1.3), 'steel')
for i in range(4): box(f'FileCab_Drawer{i}', (-3.39, 8.2, CZ + .25 + i * .32), (.02, .55, .26), 'shelf')
box('OfficeShelf', (-1.5, 11.5, CZ + 1.6), (2.4, .22, .03), 'wood')
for i in range(9): box(f'Folder{i}', (-2.5 + i * .25, 11.5, CZ + 1.78), (.06, .18, .3), 'paper' if i % 2 else 'cardboard', rz=random.uniform(-.1, .1))
# safe (the cash-box puzzle)
box('Safe_Body', (-3.4, 11.15, CZ + .35), (.78, .68, .7), 'steel'); box('Safe_Door', (-3.4, 10.8, CZ + .35), (.7, .03, .62), 'shelf')
sd = cyl('Safe_Dial', (-3.4, 10.77, CZ + .42), .09, .03, 'brass', 24, axis='Y')
box('Safe_Handle', (-3.4, 10.76, CZ + .22), (.2, .03, .04), 'brass')
for i, a in enumerate((0, 90, 180, 270)): pass
# wall calendar and clock (clue anchors; numbers will be set by the puzzle)
box('Calendar', (-1.6, 11.55, CZ + 1.45), (.36, .01, .5), 'paper'); box('Calendar_Header', (-1.6, 11.545, CZ + 1.62), (.36, .012, .1), 'red')
cyl('Clock', (-.35, 11.57, CZ + 2.35), .22, .04, 'paper', 36, axis='Y'); cyl('Clock_Rim', (-.35, 11.575, CZ + 2.35), .24, .03, 'plastic', 36, axis='Y')
box('Clock_Hour', (-.35, 11.54, CZ + 2.4), (.012, .008, .12), 'plastic', rz=0); box('Clock_Min', (-.3, 11.54, CZ + 2.35), (.08, .008, .012), 'plastic')
# key board: hooks on the office side wall (the assembled key will hang here)
box('KeyBoard', (1.72, 8.4, CZ + 1.7), (.02, .7, .5), 'wood')
for i in range(6): cyl(f'KeyHook{i}', (1.69, 8.15 + i * .1, CZ + 1.7), .008, .05, 'brass', 8, axis='X')

# ------------------------------------------------------------------ 7) lights, clutter, floor mat, puddle
LX, LY = (0.5, 4.5, 8.5, 12.5), (1.6, 5.5, 9.5)
LIVE = (1, 1)                                                                     # the one working fixture (over the aisle in front of the counter's end)
# blink pattern (frames at 24 fps, 240 = 10 s loop): (state, frames). 1 = on, 0 = off; a fluorescent tube that stutters and dies for a moment, as in a horror film
PATTERN = [(1, 34), (0, 3), (1, 2), (0, 2), (1, 14), (0, 1), (1, 1), (0, 6), (1, 22), (0, 9), (1, 3), (0, 1), (1, 3), (0, 14), (1, 38), (0, 2), (1, 2), (0, 2), (1, 2), (0, 22), (1, 24), (0, 4), (1, 6)]
m_on = bpy.data.materials.get('Shop_LampFlicker') or bpy.data.materials.new('Shop_LampFlicker'); m_on.use_nodes = True; nt_ = m_on.node_tree; nt_.nodes.clear()
o_ = nt_.nodes.new('ShaderNodeOutputMaterial'); b_ = nt_.nodes.new('ShaderNodeBsdfPrincipled'); nt_.links.new(b_.outputs[0], o_.inputs[0])
b_.inputs['Base Color'].default_value = (.9, .95, 1, 1); b_.inputs['Roughness'].default_value = .3; b_.inputs['Emission Color'].default_value = (.75, .88, 1, 1)
M['lampflicker'] = m_on
em_idx = list(b_.inputs).index(b_.inputs['Emission Strength'])
for i, x in enumerate(LX):
    for j, y in enumerate(LY):
        live = (i, j) == LIVE
        box(f'Light_{i}{j}', (x, y, Z1 - .08), (1.25, .22, .06), 'lampflicker' if live else 'lampdead')
        box(f'Light_{i}{j}_Housing', (x, y, Z1 - .03), (1.3, .26, .04), 'shelf')
        if live:
            ld = bpy.data.lights.new('ShopLamp_Spot', 'SPOT'); ld.energy = 700; ld.color = (.82, .92, 1.0); ld.spot_size = math.radians(115); ld.spot_blend = .75; ld.shadow_soft_size = .25
            lo = bpy.data.objects.new('ShopLamp_Spot', ld); lo.location = (x, y, Z1 - .13); lo.rotation_euler = (0, 0, 0); link(lo)               # a spot looks down the -Z axis: straight at the floor
            ld.animation_data_create(); act = bpy.data.actions.new('ShopLamp_blink'); ld.animation_data.action = act; fc = act.fcurves.new('energy')
            ma = m_on.node_tree.animation_data_create() if False else None
            f_ = 1
            for st, n in PATTERN:
                k = fc.keyframe_points.insert(f_, 700.0 if st else 0.0); k.interpolation = 'CONSTANT'; f_ += n
            k = fc.keyframe_points.insert(f_, 700.0); k.interpolation = 'CONSTANT'
            fc.modifiers.new('CYCLES')
            nt_.animation_data_create(); act2 = bpy.data.actions.new('ShopLamp_tube'); nt_.animation_data.action = act2
            fc2 = act2.fcurves.new(f'nodes["{b_.name}"].inputs[{em_idx}].default_value'); f_ = 1
            for st, n in PATTERN:
                k = fc2.keyframe_points.insert(f_, 14.0 if st else 0.0); k.interpolation = 'CONSTANT'; f_ += n
            k = fc2.keyframe_points.insert(f_, 14.0); k.interpolation = 'CONSTANT'; fc2.modifiers.new('CYCLES')
# (the office has no light at all: the desk lamp and the bulb are dead; the safe is found by the torch)
bpy.context.view_layer.update()
print('interior built:', len(COL.objects), 'objects')

# Blender 4.4+: actions created via act.fcurves.new() get a legacy slot but are not bound to it, so nothing plays. Bind every unbound action.
for _coll in (bpy.data.objects, bpy.data.lights, bpy.data.materials, bpy.data.worlds):
    for _idb in _coll:
        for _x in (_idb, getattr(_idb, 'node_tree', None)):
            _ad = getattr(_x, 'animation_data', None)
            if _ad and _ad.action and _ad.action_slot is None and _ad.action.slots: _ad.action_slot = _ad.action.slots[0]
