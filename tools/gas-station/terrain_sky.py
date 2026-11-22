"""Terrain and sky for the gas-station level:
 - procedural mountain material (rock strata on slopes, frost/snow on flat shoulders, dark soil below), applied to the hill meshes
 - two road valleys carved through the hills (the road leaves the field to the west and to the east, so nothing ends inside rock)
 - night sky: gradient, three star layers with different sizes/colours, a faint milky-way band, a moon disc with halo, matching the Moon sun lamp
Run through the Blender MCP:  exec(open(r"C:\\Users\\libde\\100gate\\tools\\gas-station\\terrain_sky.py", encoding="utf-8").read())
"""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix, Euler

HILLS = ('Plane.002', 'Plane.003', 'Plane.004', 'Plane.005')
RY = -30.0

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

# ------------------------------------------------------------------ 1) carve the road valleys through the hills (vertex heights, smooth falloff)
def smooth(t): t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)
for name in HILLS:
    o = bpy.data.objects[name]; M = o.matrix_world; Mi = M.inverted(); me = o.data; n = 0
    for v in me.vertices:
        w = M @ v.co
        if w.x > -24.0 and w.x < 28.0: continue                                           # only the two ends of the road
        d = abs(w.y - RY); core, edge = 6.5, 16.0
        if d >= edge: continue
        f = smooth((d - core) / (edge - core))                                            # 0 on the road, 1 outside the valley
        lim = 0.15 + 5.0 * (d / edge) ** 2                                                  # road bed stays flat, walls rise smoothly
        if w.z > lim * f + 0.0: w.z = w.z * f + (1 - f) * min(w.z, lim * .2); v.co = Mi @ w; n += 1
    me.update()
print('valley vertices lowered')

# ------------------------------------------------------------------ 2) mountain material
def mat_mountain():
    m = bpy.data.materials.get('S_Mountain') or bpy.data.materials.new('S_Mountain'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = N(nt, 'ShaderNodeOutputMaterial', 1500, 0); b = N(nt, 'ShaderNodeBsdfPrincipled', 1200, 0); lk(nt, b, out)
    tc = N(nt, 'ShaderNodeTexCoord', -1500, 0); geo = N(nt, 'ShaderNodeNewGeometry', -1500, -300)
    sepn = N(nt, 'ShaderNodeSeparateXYZ', -1300, -300); lk(nt, geo, sepn, 'Normal', 0)
    sepp = N(nt, 'ShaderNodeSeparateXYZ', -1300, 0); lk(nt, tc, sepp, 'Object', 0)
    # large-scale shape noise + fine rock grain + strata bands
    big = N(nt, 'ShaderNodeTexNoise', -1100, 300); big.inputs['Scale'].default_value = .035; big.inputs['Detail'].default_value = 8; lk(nt, tc, big, 'Object', 'Vector')
    mid = N(nt, 'ShaderNodeTexNoise', -1100, 50); mid.inputs['Scale'].default_value = .5; mid.inputs['Detail'].default_value = 12; lk(nt, tc, mid, 'Object', 'Vector')
    fine = N(nt, 'ShaderNodeTexNoise', -1100, -200); fine.inputs['Scale'].default_value = 9; fine.inputs['Detail'].default_value = 10; lk(nt, tc, fine, 'Object', 'Vector')
    vor = N(nt, 'ShaderNodeTexVoronoi', -1100, -500, feature='DISTANCE_TO_EDGE'); vor.inputs['Scale'].default_value = 1.4; lk(nt, tc, vor, 'Object', 'Vector')
    st = N(nt, 'ShaderNodeTexWave', -1100, -750, wave_type='BANDS', bands_direction='Z', wave_profile='SAW'); st.inputs['Scale'].default_value = .5; st.inputs['Distortion'].default_value = 6; st.inputs['Detail'].default_value = 3; lk(nt, tc, st, 'Object', 'Vector')
    # slope: 0 = vertical, 1 = flat
    slope = N(nt, 'ShaderNodeMapRange', -1050, -300); slope.inputs['From Min'].default_value = .45; slope.inputs['From Max'].default_value = .88; lk(nt, sepn, slope, 2, 0)
    rock = ramp(nt, -750, 100, [(.25, (.02, .025, .03, 1)), (.55, (.07, .075, .085, 1)), (.8, (.16, .165, .17, 1))]); lk(nt, mid, rock, 0, 0)
    strata = ramp(nt, -750, -750, [(.0, (.7, .7, .7, 1)), (.5, (1.2, 1.2, 1.25, 1))]); lk(nt, st, strata, 0, 0)
    cracks = ramp(nt, -750, -500, [(.0, (.2, .2, .2, 1)), (.04, (1, 1, 1, 1))]); lk(nt, vor, cracks, 'Distance', 0)
    r1 = N(nt, 'ShaderNodeMix', -450, 100, data_type='RGBA', blend_type='MULTIPLY'); r1.inputs[0].default_value = 1; lk(nt, rock, r1, 0, 6); lk(nt, strata, r1, 0, 7)
    r2 = N(nt, 'ShaderNodeMix', -250, 100, data_type='RGBA', blend_type='MULTIPLY'); r2.inputs[0].default_value = 1; lk(nt, r1, r2, 2, 6); lk(nt, cracks, r2, 0, 7)
    # ground cover: dark forest soil on gentle slopes low down, frost/snow on flat shoulders high up
    soil = ramp(nt, -750, 450, [(.3, (.012, .018, .012, 1)), (.7, (.03, .035, .02, 1))]); lk(nt, fine, soil, 0, 0)
    height = N(nt, 'ShaderNodeMapRange', -1050, 600); height.inputs['From Min'].default_value = 3.0; height.inputs['From Max'].default_value = 16.0; lk(nt, sepp, height, 2, 0)
    snowmask = N(nt, 'ShaderNodeMath', -800, 650, operation='MULTIPLY'); lk(nt, height, snowmask, 0, 0); lk(nt, slope, snowmask, 0, 1)
    sn2 = N(nt, 'ShaderNodeMath', -620, 650, operation='MULTIPLY'); lk(nt, snowmask, sn2, 0, 0); lk(nt, big, sn2, 0, 1); sn2.inputs[1].default_value = 1.0
    snowmask_r = ramp(nt, -450, 650, [(.12, (0, 0, 0, 1)), (.3, (1, 1, 1, 1))]); lk(nt, sn2, snowmask_r, 0, 0)
    ground = N(nt, 'ShaderNodeMix', -50, 250, data_type='RGBA', blend_type='MIX'); lk(nt, slope, ground, 0, 0); lk(nt, r2, ground, 2, 6); lk(nt, soil, ground, 0, 7)      # steep -> rock, flat -> soil
    final = N(nt, 'ShaderNodeMix', 250, 250, data_type='RGBA', blend_type='MIX'); lk(nt, snowmask_r, final, 0, 0); lk(nt, ground, final, 2, 6); final.inputs[7].default_value = (.35, .4, .48, 1)   # cold blue-white snow under the moon
    lk(nt, final, b, 2, 'Base Color')
    rg = ramp(nt, 250, -150, [(.3, (.55, .55, .55, 1)), (.7, (.95, .95, .95, 1))]); lk(nt, fine, rg, 0, 0); lk(nt, rg, b, 0, 'Roughness')
    comb = N(nt, 'ShaderNodeMath', 0, -400, operation='ADD'); lk(nt, fine, comb, 0, 0); lk(nt, cracks, comb, 0, 1); comb.inputs[1].default_value = 0
    bp = N(nt, 'ShaderNodeBump', 650, -400); bp.inputs['Strength'].default_value = 1.2; bp.inputs['Distance'].default_value = .4; lk(nt, mid, bp, 0, 'Height'); lk(nt, bp, b, 0, 'Normal')
    bp2 = N(nt, 'ShaderNodeBump', 420, -520); bp2.inputs['Strength'].default_value = .8; bp2.inputs['Distance'].default_value = .1; lk(nt, fine, bp2, 0, 'Height'); lk(nt, bp2, bp, 0, 'Normal')
    return m
MT = mat_mountain()
for name in HILLS:
    o = bpy.data.objects[name]
    if o.data.materials: o.data.materials[0] = MT
    else: o.data.materials.append(MT)
    o.visible_shadow = True

# ------------------------------------------------------------------ 3) night sky
sc = bpy.context.scene
w = bpy.data.worlds.get('Night') or bpy.data.worlds.new('Night'); sc.world = w; w.use_nodes = True; nt = w.node_tree; nt.nodes.clear()
moon = bpy.data.objects.get('Moon')
if moon: moon.rotation_euler = (math.radians(48), math.radians(8), math.radians(-52)); moon.data.energy = 0.9; moon.data.color = (.55, .68, 1.0); moon.data.angle = math.radians(.9)
mdir = (Euler(moon.rotation_euler).to_matrix() @ Vector((0, 0, 1))).normalized() if moon else Vector((.4, -.4, .8))
tc = N(nt, 'ShaderNodeTexCoord', -1700, 0); G = tc.outputs['Generated']
sep = N(nt, 'ShaderNodeSeparateXYZ', -1500, 0); nt.links.new(G, sep.inputs[0])
zen = ramp(nt, -1200, 300, [(.4, (.016, .03, .05, 1)), (.62, (.006, .012, .03, 1)), (1.0, (.002, .004, .012, 1))]); lk(nt, sep, zen, 2, 0)
def stars(x, y, scale, thr, k, col):
    v = N(nt, 'ShaderNodeTexVoronoi', x, y, feature='F1'); v.inputs['Scale'].default_value = scale; nt.links.new(G, v.inputs['Vector'])
    m = N(nt, 'ShaderNodeMath', x + 200, y, operation='LESS_THAN'); m.inputs[1].default_value = thr; lk(nt, v, m, 'Distance', 0)
    s = N(nt, 'ShaderNodeMath', x + 400, y, operation='MULTIPLY'); s.inputs[1].default_value = k; lk(nt, m, s, 0, 0)
    c = N(nt, 'ShaderNodeVectorMath', x + 600, y, operation='SCALE'); c.inputs[0].default_value = col; lk(nt, s, c, 0, 'Scale'); return c
s1 = stars(-1300, -100, 110, .035, 30.0, (.9, .95, 1.0))                  # sparse bright stars
s2 = stars(-1300, -400, 300, .05, 12.0, (.8, .88, 1.0)); s3 = stars(-1300, -700, 700, .07, 5.0, (1.0, .9, .8))       # dense dim ones, a few warm
acc = N(nt, 'ShaderNodeVectorMath', -500, -300, operation='ADD'); lk(nt, s1, acc, 0, 0); lk(nt, s2, acc, 0, 1)
acc2 = N(nt, 'ShaderNodeVectorMath', -300, -300, operation='ADD'); lk(nt, acc, acc2, 0, 0); lk(nt, s3, acc2, 0, 1)
fade = N(nt, 'ShaderNodeMapRange', -900, -950); fade.inputs['From Min'].default_value = .42; fade.inputs['From Max'].default_value = .72; lk(nt, sep, fade, 2, 0)
sf = N(nt, 'ShaderNodeVectorMath', -100, -300, operation='SCALE'); lk(nt, acc2, sf, 0, 0); lk(nt, fade, sf, 0, 'Scale')
# milky way: a tilted band of soft noise
band = N(nt, 'ShaderNodeMapping', -1300, -1100); band.inputs['Rotation'].default_value = (math.radians(55), math.radians(10), math.radians(30)); nt.links.new(G, band.inputs['Vector'])
bs = N(nt, 'ShaderNodeSeparateXYZ', -1100, -1100); lk(nt, band, bs, 0, 0)
bw = N(nt, 'ShaderNodeMath', -900, -1100, operation='ABSOLUTE'); lk(nt, bs, bw, 2, 0)
bm_ = ramp(nt, -700, -1100, [(.0, (1, 1, 1, 1)), (.3, (0, 0, 0, 1))]); lk(nt, bw, bm_, 0, 0)
bn = N(nt, 'ShaderNodeTexNoise', -900, -1350); bn.inputs['Scale'].default_value = 5; bn.inputs['Detail'].default_value = 12; nt.links.new(G, bn.inputs['Vector'])
bnr = ramp(nt, -700, -1350, [(.35, (0, 0, 0, 1)), (.7, (1, 1, 1, 1))]); lk(nt, bn, bnr, 0, 0)
bmul = N(nt, 'ShaderNodeMath', -450, -1200, operation='MULTIPLY'); lk(nt, bm_, bmul, 0, 0); lk(nt, bnr, bmul, 0, 1)
bcol = N(nt, 'ShaderNodeVectorMath', -250, -1200, operation='SCALE'); bcol.inputs[0].default_value = (.06, .075, .11); lk(nt, bmul, bcol, 0, 'Scale')
bf = N(nt, 'ShaderNodeVectorMath', -50, -1200, operation='SCALE'); lk(nt, bcol, bf, 0, 0); lk(nt, fade, bf, 0, 'Scale')
# moon disc + halo from the direction of the sun lamp
md = N(nt, 'ShaderNodeVectorMath', -1300, -1600, operation='DOT_PRODUCT'); md.inputs[1].default_value = (mdir.x, mdir.y, mdir.z); nt.links.new(G, md.inputs[0])
disc = ramp(nt, -1000, -1600, [(.9990, (0, 0, 0, 1)), (.9992, (1, 1, 1, 1))]); lk(nt, md, disc, 'Value', 0)
halo = ramp(nt, -1000, -1850, [(.97, (0, 0, 0, 1)), (.9995, (.05, .06, .09, 1))]); lk(nt, md, halo, 'Value', 0)
dm = N(nt, 'ShaderNodeMath', -850, -1600, operation='MULTIPLY'); lk(nt, disc, dm, 0, 0); dm.inputs[1].default_value = 14.0
dcol = N(nt, 'ShaderNodeVectorMath', -700, -1600, operation='SCALE'); dcol.inputs[0].default_value = (.85, .9, 1.0); lk(nt, dm, dcol, 0, 'Scale')
s_all = N(nt, 'ShaderNodeVectorMath', 150, -300, operation='ADD'); lk(nt, sf, s_all, 0, 0); lk(nt, bf, s_all, 0, 1)
s_all2 = N(nt, 'ShaderNodeVectorMath', 350, -300, operation='ADD'); lk(nt, s_all, s_all2, 0, 0); lk(nt, dcol, s_all2, 0, 1)
col = N(nt, 'ShaderNodeMix', 650, 100, data_type='RGBA', blend_type='ADD'); col.inputs[0].default_value = 1; lk(nt, zen, col, 0, 6); lk(nt, s_all2, col, 0, 7)
halo_add = N(nt, 'ShaderNodeMix', 900, 100, data_type='RGBA', blend_type='ADD'); halo_add.inputs[0].default_value = 1; lk(nt, col, halo_add, 2, 6); lk(nt, halo, halo_add, 0, 7)
bg = N(nt, 'ShaderNodeBackground', 1150, 100); bg.inputs['Strength'].default_value = 1.0; lk(nt, halo_add, bg, 2, 'Color')
wo = N(nt, 'ShaderNodeOutputWorld', 1350, 100); lk(nt, bg, wo, 0, 0)
print('terrain and sky built')

# ------------------------------------------------------------------ 4) keep the scattered pines off the two road valleys (vertex group 'tree_mask' drives the scatter selection)
for name in HILLS:
    o = bpy.data.objects[name]; M = o.matrix_world
    vg = o.vertex_groups.get('tree_mask') or o.vertex_groups.new(name='tree_mask')
    for v in o.data.vertices:
        w = M @ v.co; inside = abs(w.y - RY) < 10.5 and (w.x < -17.0 or w.x > 23.0)
        vg.add([v.index], 0.0 if inside else 1.0, 'REPLACE')
for nm in ('Geometry Nodes', 'Geometry Nodes.001'):
    ng = bpy.data.node_groups[nm]
    if any(n.name == 'TreeMask' for n in ng.nodes): continue
    dist = next(n for n in ng.nodes if n.bl_idname == 'GeometryNodeDistributePointsOnFaces')
    na = ng.nodes.new('GeometryNodeInputNamedAttribute'); na.name = 'TreeMask'; na.data_type = 'FLOAT'; na.inputs['Name'].default_value = 'tree_mask'; na.location = (dist.location.x - 400, dist.location.y - 200)
    cp = ng.nodes.new('FunctionNodeCompare'); cp.data_type = 'FLOAT'; cp.operation = 'GREATER_THAN'; cp.inputs[1].default_value = 0.5; cp.location = (dist.location.x - 200, dist.location.y - 200)
    ng.links.new(na.outputs['Attribute'], cp.inputs[0]); ng.links.new(cp.outputs['Result'], dist.inputs['Selection'])
print('pines kept off the road valleys')
