"""Lettering, furnished motel rooms 1 and 3, a workshop shed, exterior details of the houses and the open-air dressing (grass, bushes, rocks,
puddles, litter, guard rail, a burning barrel).  Run AFTER shop_interior / shop_props / world_build / house_build.
Run through the Blender MCP:  exec(open(r"C:\\Users\\libde\\100gate\\tools\\gas-station\\dressing.py", encoding="utf-8").read())
"""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix

random.seed(404)
FONT = bpy.data.fonts.load(r"C:\Windows\Fonts\arialbd.ttf"); FONT_MONO = bpy.data.fonts.load(r"C:\Windows\Fonts\cour.ttf")
_src = open(r"C:\Users\libde\100gate\tools\gas-station\world_build.py", encoding="utf-8").read()
exec(_src[:_src.index("COL = fresh('World')")])                                           # materials + helpers (M, mat_*, new_mat, N, ramp, lk)

def fresh(name):
    c = bpy.data.collections.get(name)
    if c:
        for o in list(c.objects): bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(c)
    c = bpy.data.collections.new(name); bpy.context.scene.collection.children.link(c); return c
DC = fresh('Dressing')
for _o in list(bpy.data.objects):                                                         # objects this script put into other collections on an earlier run
    if _o.name.startswith(('Cal_', 'Clock_Num', 'Valve1_Num', 'Valve2_Num', 'Valve3_Num', 'Valve4_Num', 'C2_Diagram_Title', 'Gate_Sign', 'Shop_DoorCard', 'Shop_Hours', 'Sign_MOTEL', 'Sign_Vacancy',
                           'Sign_Back', 'Room_Num', 'R1_', 'R3_', 'Vend_', 'Ice_', 'Bench_', 'AC0', 'AC1', 'AC2', 'Shed_Shelf', 'Shed_Tin', 'Shed_Saw', 'Shed_Jerry', 'Shed_Hammer', 'Shed_Plank', 'Shed_Note',
                           'A_PorchLamp', 'A_Number', 'A_Log', 'A_RainBarrel', 'A_Gutter', 'A_Downspout', 'A_Antenna', 'A_Shutter', 'Mailbox')):
        bpy.data.objects.remove(_o, do_unlink=True)
def mat(n): return bpy.data.materials[n]

# ------------------------------------------------------------------ lettering helper: real font -> mesh object
def text_obj(name, body, size, loc, rot, material, extrude=.006, font=None, align='CENTER', parent=None, coll=None, bold=0.0):
    cu = bpy.data.curves.new(name + '_cu', 'FONT'); cu.body = body; cu.font = font or FONT; cu.size = size; cu.extrude = extrude; cu.align_x = align; cu.align_y = 'CENTER'
    tmp = bpy.data.objects.new(name + '_tmp', cu); bpy.context.scene.collection.objects.link(tmp); bpy.context.view_layer.update()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(bpy.context.evaluated_depsgraph_get())); me.name = name
    bpy.data.objects.remove(tmp, do_unlink=True); bpy.data.curves.remove(cu)
    me.materials.append(material if not isinstance(material, str) else mat(material))
    o = bpy.data.objects.new(name, me); (coll or DC).objects.link(o); o.location = loc; o.rotation_euler = rot
    if parent: o.parent = parent
    return o
FR = (math.radians(90), 0, 0)                                  # text readable from -Y
FW = (math.radians(90), 0, math.radians(-90))                  # readable from -X
FE = (math.radians(90), 0, math.radians(90))                   # readable from +X
M_TXT = mat_solid('D_TextDark', (.02, .02, .02, 1), .6); M_TXT_R = mat_solid('D_TextRed', (.6, .03, .02, 1), .4, emit=(.8, .03, .02, 1), k=.6)
M_PINK = mat_solid('D_NeonPink', (1, .2, .5, 1), .3, emit=(1, .1, .45, 1), k=10); M_BLUE = mat_solid('D_NeonBlue', (.2, .6, 1, 1), .3, emit=(.1, .45, 1, 1), k=8)
M_CHALK = mat_solid('D_Chalk', (.75, .74, .68, 1), .9); M_PAPER = mat_solid('D_Paper', (.6, .58, .48, 1), .9)

# motel sign: replace the placeholder strips by the real word
for o in list(bpy.data.objects):
    if o.name.startswith('Sign_Letter'): bpy.data.objects.remove(o, do_unlink=True)
B_root = bpy.data.objects['Motel_Root']; MX, MY = B_root.location.x, B_root.location.y
sx_, sy_, sz_ = MX - 4.4 / 2 - 3.2 - .12, MY - 7.4, 5.3
text_obj('Sign_MOTEL', 'МОТЕЛЬ', .62, (sx_, sy_, sz_ + .1), FW, M_PINK, .05)
text_obj('Sign_Vacancy', 'СВОБОДНО', .24, (sx_, sy_, sz_ - .35), FW, M_BLUE, .03)
text_obj('Sign_Back', 'МОТЕЛЬ', .62, (sx_ + .24, sy_, sz_ + .1), FE, M_PINK, .05)
for i, yc in enumerate((-3.8, 0.0, 3.8)):                                       # room numbers on the brass plates
    text_obj(f'Room_Num{i + 1}', str(i + 1), .14, (MX - 2.2 - .075, MY + yc + .45, 2.15), FW, M_TXT, .01)
# shop door card + prices on the shop front
dl = bpy.data.objects['Door_L']
card = bpy.data.objects.new('Shop_DoorCard', bpy.data.meshes.new('Shop_DoorCard')); bm = bmesh.new(); r = bmesh.ops.create_cube(bm, size=1)
for v in r['verts']: v.co = Vector((v.co.x * .34, v.co.y * .008, v.co.z * .2))
bm.to_mesh(card.data); bm.free(); card.data.materials.append(M_PAPER); bpy.data.collections['Collection'].objects.link(card)
card.parent = dl; card.location = (.62, -.08, 1.55)
t = text_obj('Shop_DoorCard_Text', 'ЗАКРЫТО', .075, (.62, -.0875, 1.55), FR, M_TXT_R, .002, parent=dl, coll=bpy.data.collections['Collection'])
text_obj('Shop_Hours', 'Круглосуточно', .1, (0.4, -1.45, 3.15), FR, M_CHALK, .008, coll=bpy.data.collections['Collection'])
# valve numbers in the sewer
OX, OY, ZW = -15.2, -31.0, -5.0
for i, x in enumerate((20.8, 23.0, 25.2, 27.4)):
    text_obj(f'Valve{i + 1}_Num', str(i + 1), .13, (OX + x, OY + 2.8 - .013, ZW + .55), FR, M_TXT, .008, coll=bpy.data.collections['Sewer'])
text_obj('C2_Diagram_Title', 'ПОРЯДОК ЗАКРЫТИЯ', .11, (OX + 24.5, OY + 3.38 - .014, ZW + 3.0), FR, M_TXT, .004, coll=bpy.data.collections['Sewer'])
text_obj('Gate_Sign', 'ВЫХОД', .2, (OX, OY + 25.2 + 6.2 - .15 - .36, ZW + 3.35), FR, M_TXT, .01, coll=bpy.data.collections['Sewer'])
# shop calendar: December 2001 starts on a Saturday; the 4th (a Tuesday) is circled
CZ = .22; cx_, cy_ = -1.6, 11.55; START = 5
for d_ in range(1, 32):
    idx = START + d_ - 1; r_, c_ = idx // 7, idx % 7
    text_obj(f'Cal_{d_}', str(d_), .024, (cx_ - .135 + c_ * .045, cy_ - .0045, CZ + 1.4 - r_ * .045), FR, M_TXT_R if c_ >= 5 else M_TXT, .001, coll=bpy.data.collections['ShopInterior'])
text_obj('Cal_Month', 'ДЕКАБРЬ 2001', .028, (cx_, cy_ - .0045, CZ + 1.47), FR, M_CHALK, .001, coll=bpy.data.collections['ShopInterior'])
ring = bpy.data.objects.new('Cal_Circle', bpy.data.meshes.new('Cal_Circle')); bm = bmesh.new()
for k in range(24):
    a0 = 2 * math.pi * k / 24; a1 = 2 * math.pi * (k + 1) / 24; r1, r2 = .022, .0255
    vs = [bm.verts.new((math.cos(a0) * r1, 0, math.sin(a0) * r1)), bm.verts.new((math.cos(a1) * r1, 0, math.sin(a1) * r1)), bm.verts.new((math.cos(a1) * r2, 0, math.sin(a1) * r2)), bm.verts.new((math.cos(a0) * r2, 0, math.sin(a0) * r2))]; bm.faces.new(vs)
bm.to_mesh(ring.data); bm.free(); ring.data.materials.append(mat_solid('D_CalCircle', (.7, .05, .03, 1), .4)); bpy.data.collections['ShopInterior'].objects.link(ring)
i4 = START + 4 - 1; ring.location = (cx_ - .135 + (i4 % 7) * .045, cy_ - .0052, CZ + 1.4 - (i4 // 7) * .045)
for k, (n_, ang_) in enumerate((('12', 0), ('3', 90), ('6', 180), ('9', 270))):                      # clock numerals
    a = math.radians(ang_); text_obj(f'Clock_Num{n_}', n_, .05, (-.35 + math.sin(a) * .155, 11.55 - .0085, CZ + 2.35 + math.cos(a) * .155), FR, M_TXT, .002, coll=bpy.data.collections['ShopInterior'])

# ------------------------------------------------------------------ furniture for rooms 1 and 3 of the motel and the shed workshop (local frames of the existing roots)
def hmat(n): return mat(n)
def hbox(root, coll, nm, c, s, m, rot=(0, 0, 0), bevel=0.0):
    bm = bmesh.new(); r = bmesh.ops.create_cube(bm, size=1)
    for v in r['verts']: v.co = Vector((v.co.x * s[0], v.co.y * s[1], v.co.z * s[2]))
    if bevel: bmesh.ops.bevel(bm, geom=list({e for v in r['verts'] for e in v.link_edges}), offset=bevel, segments=1, affect='EDGES')
    me = bpy.data.meshes.new(nm); bm.to_mesh(me); bm.free(); me.materials.append(hmat(m) if isinstance(m, str) else m)
    o = bpy.data.objects.new(nm, me); coll.objects.link(o); o.parent = root; o.location = c; o.rotation_euler = rot; return o
def hcyl(root, coll, nm, c, r, h, m, seg=14, rot=(0, 0, 0), r2=None):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h)
    for f in bm.faces: f.smooth = True
    me = bpy.data.meshes.new(nm); bm.to_mesh(me); bm.free(); me.materials.append(hmat(m) if isinstance(m, str) else m)
    o = bpy.data.objects.new(nm, me); coll.objects.link(o); o.parent = root; o.location = c; o.rotation_euler = rot; return o
HC = bpy.data.collections['Houses']; BR = B_root
M_TVSTATIC = mat_solid('D_TVStatic', (.5, .55, .6, 1), .3, emit=(.55, .6, .65, 1), k=1.2)
def room(i, yc, variant):
    p = f'R{i}_'
    # a bed, a nightstand with a lamp, a wardrobe, a desk, a TV: positions mirrored / rearranged per room
    if variant == 1:                                                                    # room 1: ransacked
        hbox(BR, HC, p + 'Bed', (.9, yc + 1.0, .45), (1.9, 1.4, .45), 'H_WoodLight'); hbox(BR, HC, p + 'Mattress', (.8, yc + 1.0, .75), (1.8, 1.3, .2), 'H_Bed', rot=(0, 0, .08), bevel=.04)
        hbox(BR, HC, p + 'Blanket', (-.1, yc + .3, .3), (1.0, 1.0, .07), 'H_Blanket', rot=(0, 0, .5), bevel=.03)                        # blanket dragged onto the floor
        hbox(BR, HC, p + 'Wardrobe', (1.9, yc - 1.4, 1.1), (.6, .9, 2.0), 'H_WoodLight', bevel=.01); hbox(BR, HC, p + 'WardDoor', (1.45, yc - 1.15, 1.1), (.02, .85, 1.9), 'H_Door', rot=(0, 0, math.radians(-50)))
        hbox(BR, HC, p + 'Chair', (-.3, yc - .8, .25), (.42, .42, .5), 'H_WoodLight', rot=(math.radians(80), 0, .4)); hbox(BR, HC, p + 'Suitcase', (.2, yc - 1.2, .3), (.7, .45, .2), 'H_Door', rot=(0, 0, .3), bevel=.02)
        for k in range(10): hbox(BR, HC, p + f'Clothes{k}', (random.uniform(-.8, .9), yc + random.uniform(-1.4, 1.2), .245), (random.uniform(.2, .4), random.uniform(.15, .3), .015), random.choice(['H_Blanket', 'H_Bed', 'H_Curtain']), rot=(0, 0, random.uniform(0, 3)))
    else:                                                                              # room 3: stripped, mouldy, TV left on static
        hbox(BR, HC, p + 'Bed', (.9, yc - .5, .45), (1.9, 1.4, .45), 'H_WoodLight'); hbox(BR, HC, p + 'Mattress', (.9, yc - .5, .75), (1.8, 1.3, .2), 'H_Bed', bevel=.04)
        hbox(BR, HC, p + 'Night', (1.6, yc + .5, .5), (.45, .4, .5), 'H_WoodLight', bevel=.01); hbox(BR, HC, p + 'Radio', (1.6, yc + .5, .83), (.25, .12, .16), 'D_TextDark', bevel=.01)
        hbox(BR, HC, p + 'TVStand', (1.2, yc + 1.5, .5), (.8, .5, .5), 'H_WoodLight'); hbox(BR, HC, p + 'TV', (1.2, yc + 1.5, 1.0), (.7, .5, .5), 'D_TextDark', bevel=.02); hbox(BR, HC, p + 'TVScreen', (.98, yc + 1.5, 1.0), (.02, .55, .4), M_TVSTATIC)
        hbox(BR, HC, p + 'Desk', (-.3, yc - 1.2, .75), (.5, 1.2, .05), 'H_WoodLight'); hbox(BR, HC, p + 'Mirror', (-2.05, yc - 1.2, 1.5), (.04, .7, .9), 'D_Chalk')
        for k in range(4): hbox(BR, HC, p + f'Mold{k}', (-2.1 + .05, yc + random.uniform(-1.4, 1.4), random.uniform(.4, 2.0)), (.01, random.uniform(.3, .8), random.uniform(.3, .6)), mat_solid(f'D_Mold{i}{k}', (.05, .09, .05, 1), .95))
    hbox(BR, HC, p + 'Carpet', (0, yc, .26), (2.8, 3.2, .012), 'H_Rug')
room(1, -3.8, 1); room(3, 3.8, 3)
# vending machine, ice machine, a bench and chairs on the walkway; AC units under the windows
hbox(BR, HC, 'Vend_Body', (-3.1, -5.0, 1.0), (.8, .8, 1.9), 'S_Red' if 'S_Red' in bpy.data.materials else 'D_TextRed', bevel=.02); hbox(BR, HC, 'Vend_Glass', (-3.52, -5.0, 1.25), (.02, .6, 1.0), 'W_Glass'); hbox(BR, HC, 'Vend_Glow', (-3.51, -5.0, 1.25), (.01, .55, .95), M_TVSTATIC)
text_obj('Vend_Text', 'ХОЛОД', .09, (MX - 3.535, MY - 5.0, 1.8), FW, M_CHALK, .004, coll=HC)
hbox(BR, HC, 'Ice_Body', (-3.1, -6.0, .6), (.75, .7, 1.2), 'D_Chalk', bevel=.02); text_obj('Ice_Text', 'ЛЁД', .1, (MX - 3.485, MY - 6.0, 1.05), FW, M_TXT, .004, coll=HC)
hbox(BR, HC, 'Bench_Seat', (-3.3, 1.9, .5), (.5, 1.6, .05), 'H_WoodLight'); hbox(BR, HC, 'Bench_Back', (-3.55, 1.9, .8), (.05, 1.6, .5), 'H_WoodLight')
for yy in (-.7, .7): hbox(BR, HC, f'Bench_Leg{yy}', (-3.3, 1.9 + yy, .25), (.45, .05, .5), 'S_Rust' if 'S_Rust' in bpy.data.materials else 'D_TextDark')
for k, yc in enumerate((-3.8, 0.0, 3.8)): hbox(BR, HC, f'AC{k}', (2.4, yc, 1.0), (.5, .7, .45), 'D_Chalk', bevel=.03)
# shed workshop
SR = bpy.data.objects['ShedA_Root']
hbox(SR, HC, 'Shed_Shelf', (.9, 0.92, 1.4), (.9, .22, .04), 'H_WoodLight'); hbox(SR, HC, 'Shed_Shelf2', (.9, .92, 1.8), (.9, .22, .04), 'H_WoodLight')
for k in range(6): hbox(SR, HC, f'Shed_Tin{k}', (.55 + k * .14, .92, 1.5), (.09, .09, .14), random.choice(['H_Brass', 'S_Rust' if 'S_Rust' in bpy.data.materials else 'H_Brass']))
hbox(SR, HC, 'Shed_Saw', (.0, .98, 1.4), (.7, .01, .12), 'H_Concrete', rot=(0, 0, .02))
for k in range(2): hcyl(SR, HC, f'Shed_Jerry{k}', (-.6 + k * .35, -.7, .44), .13, .5, 'H_Door', 10)
hbox(SR, HC, 'Shed_Hammer_H', (.2, .75, .543), (.25, .02, .02), 'H_WoodLight', rot=(0, 0, .5)); hbox(SR, HC, 'Shed_Hammer_Head', (.33, .8, .543), (.04, .04, .06), 'H_Concrete', rot=(0, 0, .5))
for k in range(3): hbox(SR, HC, f'Shed_Plank{k}', (-.9, .6 - k * .1, .24 + k * .0), (.1, 1.6, .03), 'H_WoodLight', rot=(0, 0, .12 * k))
text_obj('Shed_Note', 'НЕ ВХОДИТЬ', .1, (-1.25 - .08, 0, 1.6), (math.radians(90), 0, math.radians(-90)), M_TXT_R, .004, parent=SR, coll=HC)

# ------------------------------------------------------------------ exterior details
AR = bpy.data.objects['HouseA_Root']; w_, d_ = 5.4, 4.6
hcyl(AR, HC, 'A_PorchLamp', (w_ / 2 + .05, 1.3, 2.35), .07, .16, 'H_LampGlow', 12); hbox(AR, HC, 'A_PorchLampArm', (w_ / 2 + .02, 1.3, 2.52), (.06, .06, .1), 'D_TextDark')
text_obj('A_Number', '7', .16, (w_ / 2 + .075, 1.55, 1.55), FE, M_CHALK, .006, parent=AR, coll=HC)
for k in range(24):                                                                       # firewood stack against the north wall
    row, col = k // 8, k % 8; hcyl(AR, HC, f'A_Log{k}', (-1.2 + col * .17, d_ / 2 + .35, .17 + row * .15), .08, .6, 'H_WoodLight', 8, rot=(math.radians(90), 0, 0))
hcyl(AR, HC, 'A_RainBarrel', (w_ / 2 - .2, d_ / 2 + .35, .5), .3, .9, 'S_Rust' if 'S_Rust' in bpy.data.materials else 'H_Door', 14)
for sd in (-1, 1): hbox(AR, HC, f'A_Gutter{sd}', (sd * (w_ / 2 + .35), 0, 2.88), (.12, d_ + .6, .1), 'H_Concrete', bevel=.01)
hbox(AR, HC, 'A_Downspout', (w_ / 2 + .4, d_ / 2 + .1, 1.5), (.08, .08, 2.8), 'H_Concrete')
hcyl(AR, HC, 'A_AntennaMast', (.5, 0, 4.3), .02, 2.2, 'H_Concrete', 8)
for k in range(4): hbox(AR, HC, f'A_AntennaEl{k}', (.5, 0, 3.7 + k * .35), (.04, 1.0 - k * .17, .015), 'H_Concrete')
for k, (c, ang) in enumerate((((w_ / 2 - 1.55, d_ / 2 + .02, 1.75 + .3), 0), ((w_ / 2 - 3.55, d_ / 2 + .02, 1.75 + .3), 0))):               # crooked shutters
    for sd in (-1, 1): hbox(AR, HC, f'A_Shutter{k}{sd}', (c[0] + sd * .62, c[1] + .03, 1.75), (.3, .03, 1.05), 'H_SidingA' if 'H_SidingA' in bpy.data.materials else 'H_Door', rot=(0, math.radians(random.uniform(-6, 6)), math.radians(random.uniform(-10, 10)) if k else 0))
hbox(AR, HC, 'Mailbox_Post', (w_ / 2 + 4.3, 2.6, .6), (.08, .08, 1.2), 'H_WoodLight'); hbox(AR, HC, 'Mailbox', (w_ / 2 + 4.3, 2.6, 1.28), (.2, .35, .22), 'H_Door', bevel=.03)

# ------------------------------------------------------------------ open-air dressing (merged meshes: one object per kind)
HILLS = ('Plane.002', 'Plane.003', 'Plane.004', 'Plane.005')
def ground_h(x, y):
    """height of the hills under (x, y) (0 on the flat field); other objects are ignored"""
    sc_ = bpy.context.scene; dg_ = bpy.context.evaluated_depsgraph_get(); org = Vector((x, y, 80)); best = 0.0
    for _ in range(6):
        r = sc_.ray_cast(dg_, org, Vector((0, 0, -1)), distance=200)
        if not r[0]: break
        if r[4].name in HILLS: best = max(best, r[1].z)
        org = r[1] - Vector((0, 0, .02))
    return best
def free(x, y):                                                                           # keep dressing off the road, apron, station, houses, paths and fence
    if -34.5 < y < -25.8: return False
    if ground_h(x, y) > .12: return False
    if -5 < x < 11.5 and -27 < y < -9: return False
    if -8 < x < 18.5 and -11.5 < y < 17.5: return False
    if -26.5 < x < -15.5 and -1 < y < 15: return False
    if 15.5 < x < 26.5 and -24 < y < -8: return False
    paths = [[(-6.5, 5.5), (-10, 7.5), (-14, 6.5), (-17.5, 5.0), (-20.5, 4.2)], [(16.5, 4.0), (19.5, 3.2), (22.5, 4.5), (25.5, 3.8)], [(-8.0, -13.5), (-11.5, -19), (-14, -25), (-15, -29)]]
    for p in paths:
        for a, b in zip(p[:-1], p[1:]):
            ax, ay = a; bx, by = b; dx, dy = bx - ax, by - ay; t = max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
            if math.hypot(x - ax - t * dx, y - ay - t * dy) < 1.8: return False
    return True
def rnd_pt():
    while True:
        x, y = random.uniform(-29, 31.5), random.uniform(-40, 19)
        if free(x, y): return x, y
# grass: crossed blade cards, one mesh
M_GRASS = mat_solid('D_Grass', (.1, .12, .05, 1), .9)
nt = M_GRASS.node_tree; b_ = nt.nodes['Principled BSDF']; tc = N(nt, 'ShaderNodeTexCoord', -900, 0); sep = N(nt, 'ShaderNodeSeparateXYZ', -700, 0); lk(nt, tc, sep, 'Generated', 0)
gr = ramp(nt, -450, 0, [(0, (.03, .03, .015, 1)), (1, (.28, .26, .1, 1))]); lk(nt, sep, gr, 2, 0); lk(nt, gr, b_, 0, 'Base Color')
bm = bmesh.new()
for k in range(1100):
    x, y = rnd_pt(); h = random.uniform(.25, .75); n = random.randint(3, 5)
    for j in range(n):
        a = random.uniform(0, math.tau); l = random.uniform(.03, .07); lean = random.uniform(-.2, .2)
        v0 = bm.verts.new((x + math.cos(a) * l * .5 + random.uniform(-.1, .1), y + math.sin(a) * l * .5 + random.uniform(-.1, .1), 0)); base = v0.co.copy()
        v1 = bm.verts.new((base.x - math.sin(a) * .018, base.y + math.cos(a) * .018, 0)); v2 = bm.verts.new((base.x + math.cos(a) * lean * h, base.y + math.sin(a) * lean * h, h))
        bm.faces.new((v0, v1, v2))
me = bpy.data.meshes.new('Grass'); bm.to_mesh(me); bm.free(); me.materials.append(M_GRASS)
for p in me.polygons: p.use_smooth = False
go = bpy.data.objects.new('Grass', me); DC.objects.link(go)
# rocks, bushes
M_ROCK = mat_metal('D_Rock', (.22, .22, .21, 1), .1, .9)
def blob(name, c, r, mat_, squash=.7, rough=.25, sub=2):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    for v in bm.verts:
        n = v.co.normalized(); v.co = v.co * (1 + random.uniform(-rough, rough)); v.co.z *= squash
    for f in bm.faces: f.smooth = False
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(mat_); o = bpy.data.objects.new(name, me); DC.objects.link(o); o.location = c; o.rotation_euler = (0, 0, random.uniform(0, 3)); return o
for k in range(34):
    x, y = rnd_pt(); r = random.uniform(.15, .7); blob(f'Rock{k}', (x, y, r * .25), r, M_ROCK, rough=.3)
M_BUSH = mat_solid('D_Bush', (.04, .08, .035, 1), .95)
for k in range(16):
    x, y = rnd_pt()
    for j in range(random.randint(2, 4)): blob(f'Bush{k}_{j}', (x + random.uniform(-.5, .5), y + random.uniform(-.5, .5), .35), random.uniform(.4, .75), M_BUSH, squash=.8, rough=.18, sub=2)
# puddles on the apron and road (flat glossy ellipses)
M_PUD = mat_solid('D_Puddle', (.01, .015, .02, 1), .02, alpha=.85)
for k in range(14):
    x, y = (random.uniform(-3, 10), random.uniform(-26, -10)) if k < 8 else (random.uniform(-28, 30), random.uniform(-32, -28))
    bm = bmesh.new(); pts = [(math.cos(2 * math.pi * i / 18) * random.uniform(.5, 1) * random.uniform(.6, 1.6), math.sin(2 * math.pi * i / 18) * random.uniform(.5, 1) * random.uniform(.4, 1.0)) for i in range(18)]
    vs = [bm.verts.new((px, py, 0)) for px, py in pts]; bm.faces.new(vs); me = bpy.data.meshes.new(f'Puddle{k}'); bm.to_mesh(me); bm.free(); me.materials.append(M_PUD)
    o = bpy.data.objects.new(f'Puddle{k}', me); DC.objects.link(o); o.location = (x, y, .066); o.rotation_euler = (0, 0, random.uniform(0, 3))
# litter: cans, papers, bottles scattered near the pumps and the road (one merged mesh, flat colour)
bm = bmesh.new()
for k in range(80):
    x, y = (random.uniform(-6, 12), random.uniform(-26, -8)) if k < 50 else rnd_pt(); z = .066 if -27 < y < -8 and -5 < x < 11 else 0
    if random.random() < .5: r_ = bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=.033, radius2=.033, depth=.12); rot = Matrix.Rotation(math.radians(90), 4, 'X') @ Matrix.Rotation(random.uniform(0, 3), 4, 'Z'); [setattr(v, 'co', rot @ v.co + Vector((x, y, z + .033))) for v in r_['verts']]
    else:
        r_ = bmesh.ops.create_cube(bm, size=1); rot = Matrix.Rotation(random.uniform(0, 3), 4, 'Z')
        for v in r_['verts']: v.co = rot @ Vector((v.co.x * .2, v.co.y * .14, v.co.z * .004)) + Vector((x, y, z + .004))
me = bpy.data.meshes.new('Litter'); bm.to_mesh(me); bm.free(); me.materials.append(mat_solid('D_Litter', (.45, .42, .35, 1), .8)); DC.objects.link(bpy.data.objects.new('Litter', me))
# guard rail along the north side of the road, with posts
M_RAIL = mat_metal('D_Rail', (.4, .42, .43, 1), .1, .35)
for k in range(26):
    x = -22 + k * 2.1; bm = bmesh.new(); r_ = bmesh.ops.create_cube(bm, size=1)
    for v in r_['verts']: v.co = Vector((v.co.x * .1, v.co.y * .1, v.co.z * .9)) + Vector((x, -35.2, .45))
    me = bpy.data.meshes.new(f'RailPost{k}'); bm.to_mesh(me); bm.free(); me.materials.append(M_RAIL); DC.objects.link(bpy.data.objects.new(f'RailPost{k}', me))
for k in range(13):
    x = -21 + k * 4.2; bm = bmesh.new(); r_ = bmesh.ops.create_cube(bm, size=1)
    for v in r_['verts']: v.co = Vector((v.co.x * 4.1, v.co.y * .04, v.co.z * .3)) + Vector((x, -35.3, .65))
    me = bpy.data.meshes.new(f'Rail{k}'); bm.to_mesh(me); bm.free(); me.materials.append(M_RAIL); DC.objects.link(bpy.data.objects.new(f'Rail{k}', me))
# a burning barrel behind the shop: orange flame cones, an ember light that flickers
bo = bpy.data.objects.new('Barrel', bpy.data.meshes.new('Barrel')); bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=False, segments=16, radius1=.3, radius2=.3, depth=.9); bm.to_mesh(bo.data); bm.free(); bo.data.materials.append(mat('S_Rust') if 'S_Rust' in bpy.data.materials else M_ROCK)
DC.objects.link(bo); bo.location = (13.0, 14.8, .45)
M_FLAME = mat_solid('D_Flame', (1, .35, .05, 1), .5, emit=(1, .4, .05, 1), k=14)
for k in range(5):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=7, radius1=.08 + random.uniform(0, .06), radius2=0, depth=random.uniform(.3, .6)); me = bpy.data.meshes.new(f'Flame{k}'); bm.to_mesh(me); bm.free(); me.materials.append(M_FLAME)
    fo = bpy.data.objects.new(f'Flame{k}', me); DC.objects.link(fo); fo.location = (13.0 + random.uniform(-.12, .12), 14.8 + random.uniform(-.12, .12), .95 + .1)
ld = bpy.data.lights.new('Barrel_Fire', 'POINT'); ld.energy = 160; ld.color = (1, .5, .18); ld.shadow_soft_size = .3
lo = bpy.data.objects.new('Barrel_Fire', ld); lo.location = (13.0, 14.8, 1.3); DC.objects.link(lo)
ld.animation_data_create(); act = bpy.data.actions.new('Barrel_Fire_flicker'); ld.animation_data.action = act; fc = act.fcurves.new('energy'); fc.keyframe_points.insert(1, 160); fc.keyframe_points.insert(120, 160)
md = fc.modifiers.new('NOISE'); md.scale = 3; md.strength = 110; md.phase = 7
print('dressing done:', len(DC.objects), 'objects in Dressing')

# Blender 4.4+: actions created via act.fcurves.new() get a legacy slot but are not bound to it, so nothing plays. Bind every unbound action.
for _coll in (bpy.data.objects, bpy.data.lights, bpy.data.materials, bpy.data.worlds):
    for _idb in _coll:
        for _x in (_idb, getattr(_idb, 'node_tree', None)):
            _ad = getattr(_x, 'animation_data', None)
            if _ad and _ad.action and _ad.action_slot is None and _ad.action.slots: _ad.action_slot = _ad.action.slots[0]
