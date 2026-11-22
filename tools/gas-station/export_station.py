"""Export of the gas-station location for the game (runs HEADLESS so the live Blender is never touched):

  "C:/Program Files/Blender Foundation/Blender 4.5/blender.exe" -b art/gas-station.blend --python tools/gas-station/export_station.py

Outputs into public/assets/iso/:
  station-1.glb      static world merged by material (procedural materials baked to textures), named movable parts (doors, trunk lid, map,
                     lamp tube, register screen...), product library meshes 'LIB_*' and the pine 'PINE' (decimated, one copy each)
  station-1.json     instance transforms for the products and the forest, lights (with flicker patterns), walk grid description, spawn
  station-walk-1.png walk grid (Blender XY plane): 255 = blocked, otherwise floor height in cm
Nothing is written back to the .blend (the file is opened read-only in a separate process and never saved).
"""
import bpy, bmesh, json, math, os, re, sys, time
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT = 'C:/Users/libde/100gate/'
OUT = ROOT + 'public/assets/iso/'
VER = '1'
os.makedirs(OUT, exist_ok=True)
T0 = time.time()
def log(*a): print('[station %5.1fs]' % (time.time() - T0), *a, flush=True)

SRC = bpy.context.scene
SKIP_COLLS = {'Sewer', 'SewerCams', 'ShopLib'}
# movable / scripted parts keep their own node (children are merged into them, the node keeps its pivot)
KEEP = re.compile(r'^(Door_L|Door_R|Car_TrunkLid|Car_Map|Manhole_Cover|Gate_L|Gate_R|Motel_Door\d_Leaf|ShedA_ShedDoor_Leaf|Prop_Safe_Dial|Prop_Reg_Screen|R2_TVScreen|R3_TVScreen)$')
KEEP_MATS = {'Shop_LampFlicker', 'Lib_ScreenBroken'}          # objects using these stay separate too (flicker in code)
DYNAMIC = re.compile(r'^(Door_L|Door_R|Gate_L|Gate_R|Motel_Door\d_Leaf|ShedA_ShedDoor_Leaf|Manhole_Cover)$')   # not in the walk grid
PROC_TYPES = {'TEX_NOISE', 'TEX_VORONOI', 'TEX_WAVE', 'TEX_MUSGRAVE', 'TEX_GRADIENT', 'TEX_BRICK', 'TEX_CHECKER', 'ATTRIBUTE', 'GEOMETRY',
              'LAYER_WEIGHT', 'AMBIENT_OCCLUSION', 'TEX_IMAGE', 'TEX_MAGIC', 'BEVEL', 'VERTEX_COLOR', 'GROUP', 'TEX_COORD', 'MAPPING'}

def coll_of(o):
    return o.users_collection[0].name if o.users_collection else ''
def wanted(o):
    if o.type not in ('MESH', 'CURVE', 'FONT'): return False
    if coll_of(o) in SKIP_COLLS: return False
    return o.visible_get() and not o.hide_render
def principled(m):
    return next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None) if m and m.use_nodes else None
def is_proc(m):
    if not m or not m.use_nodes: return False
    b = principled(m)
    if b is None: return True
    return any(n.type in PROC_TYPES for n in m.node_tree.nodes)

dg = bpy.context.evaluated_depsgraph_get()
data = {'version': VER, 'axis': 'blender-xyz (three: x, z, -y)', 'lights': [], 'products': {}, 'pines': [], 'kept': []}

# ---------------------------------------------------------------- lights (with sampled flicker)
for o in SRC.objects:
    if o.type != 'LIGHT' or coll_of(o) in SKIP_COLLS or o.hide_render: continue
    L = o.data; m = o.matrix_world
    e = {'name': o.name, 'type': L.type, 'pos': [round(v, 3) for v in m.translation], 'color': [round(c, 3) for c in L.color], 'energy': round(L.energy, 2)}
    if L.type in ('SPOT', 'SUN', 'AREA'): e['dir'] = [round(v, 3) for v in (m.to_3x3() @ Vector((0, 0, -1))).normalized()]
    if L.type == 'SPOT': e['angle'] = round(L.spot_size, 3); e['blend'] = round(L.spot_blend, 3)
    if L.type in ('POINT', 'SPOT'): e['radius'] = round(L.shadow_soft_size, 3)
    if L.animation_data and L.animation_data.action:
        pat = []
        for f in range(1, 241):
            SRC.frame_set(f); pat.append(round(L.energy / max(e['energy'], 1e-6), 3) if e['energy'] else 0)
        SRC.frame_set(1); e['energy'] = round(max(L.energy, e['energy']), 2)
        if len(set(pat)) > 1: e['flicker'] = pat           # 24 fps samples, energy multiplier
    data['lights'].append(e)
w = SRC.world
log('lights', len(data['lights']))

# ---------------------------------------------------------------- product instances (linked duplicates of the library meshes)
lib_meshes = {o.data.name: o for o in bpy.data.collections['ShopLib'].all_objects if o.type == 'MESH'} if bpy.data.collections.get('ShopLib') else {}
products = set()
for o in bpy.data.objects:
    if o.type == 'MESH' and o.data.name in lib_meshes and wanted(o):
        products.add(o.name)
        data['products'].setdefault(o.data.name, []).append([round(v, 4) for col in o.matrix_world.col for v in col])
log('product instances', sum(len(v) for v in data['products'].values()), 'types', len(data['products']))

# ---------------------------------------------------------------- forest instances (geometry nodes on the hills)
pine = bpy.data.objects.get('PineSource')
for inst in dg.object_instances:
    if inst.is_instance and inst.instance_object and inst.instance_object.original == pine:
        data['pines'].append([round(v, 3) for col in inst.matrix_world.col for v in col])
log('pines', len(data['pines']))

# ---------------------------------------------------------------- build the export scene
EX = bpy.data.scenes.new('EXPORT')
VL = EX.view_layers[0]
def mesh_of(o):
    """Evaluated mesh in object space with object-level material links resolved."""
    oe = o.evaluated_get(dg)
    if o.type == 'MESH' and any(md.type == 'NODES' for md in o.modifiers) and o.name.startswith('Plane.00'):
        # the hills: their geometry nodes scatter the forest (exported as instances); take the terrain mesh only
        me = oe.to_mesh().copy(); oe.to_mesh_clear()
    else:
        me = bpy.data.meshes.new_from_object(oe, preserve_all_data_layers=True, depsgraph=dg)
    for i, s in enumerate(o.material_slots):
        if i < len(me.materials): me.materials[i] = s.material
        else: me.materials.append(s.material)
    if not me.uv_layers: me.uv_layers.new(name='UVMap')
    return me

def keep_root(o):
    p = o
    while p:
        if KEEP.match(p.name): return p
        p = p.parent
    if any(s.material and s.material.name in KEEP_MATS for s in o.material_slots): return o
    return None

groups = {}          # material name -> list of (mesh in world space)
kept = {}            # keep root name -> list of meshes in root space
n = 0
for o in list(bpy.data.objects):
    if not wanted(o) or o.name in products: continue
    me = mesh_of(o); n += 1
    kr = keep_root(o)
    if kr is not None:
        me.transform(kr.matrix_world.inverted() @ o.matrix_world)
        kept.setdefault(kr.name, (kr, []))[1].append(me); continue
    me.transform(o.matrix_world)
    if o.matrix_world.determinant() < 0: me.flip_normals()
    mats = [m for m in me.materials]
    used = {p.material_index for p in me.polygons}
    if len(used) <= 1:
        mi = next(iter(used), 0); mat = mats[mi] if mi < len(mats) else None
        groups.setdefault(mat.name if mat else '_none', []).append(me)
    else:
        bm0 = bmesh.new(); bm0.from_mesh(me)
        for mi in used:
            bm = bm0.copy(); bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index != mi], context='FACES')
            part = bpy.data.meshes.new(me.name + '_m%d' % mi); bm.to_mesh(part); bm.free()
            part.materials.clear(); part.materials.append(mats[mi])
            for p in part.polygons: p.material_index = 0
            if not part.uv_layers: part.uv_layers.new(name='UVMap')
            groups.setdefault(mats[mi].name if mats[mi] else '_none', []).append(part)
        bm0.free()
log('source objects', n, 'material groups', len(groups), 'kept', len(kept))

def join_meshes(name, meshes, mat=None):
    """Join meshes into one object in EX (data-level join through bmesh keeps the UV map named 'UVMap')."""
    bm = bmesh.new()
    for me in meshes:
        for i, uv in enumerate(me.uv_layers): uv.name = 'UVMap' if i == 0 else uv.name
        bm.from_mesh(me)
    out = bpy.data.meshes.new(name); bm.to_mesh(out); bm.free()
    out.materials.clear()
    if mat: out.materials.append(mat)
    else:
        for m in meshes[0].materials: out.materials.append(m)
    if not out.uv_layers: out.uv_layers.new(name='UVMap')
    ob = bpy.data.objects.new(name, out); EX.collection.objects.link(ob); return ob

statics = []
for mname, mes in groups.items():
    mat = bpy.data.materials.get(mname)
    # one bmesh join keeps a single material: every source part already has exactly one
    for me in mes:
        for p in me.polygons: p.material_index = 0
    ob = join_meshes('S_' + mname, mes, mat); statics.append(ob)
kept_objs = []
for name, (kr, mes) in kept.items():
    kr.name = name + '__src'          # free the exact name for the exported node (the source file is never saved)
    # several materials can live in one kept node: join with a material table merged by name
    allm = []
    for me in mes:
        remap = []
        for m in me.materials:
            if m not in allm: allm.append(m)
            remap.append(allm.index(m))
        for p in me.polygons: p.material_index = remap[p.material_index] if p.material_index < len(remap) else 0
    ob = join_meshes(name, mes)
    ob.data.materials.clear()
    for m in allm: ob.data.materials.append(m)
    ob.matrix_world = kr.matrix_world.copy(); kept_objs.append(ob)
    data['kept'].append({'name': name, 'pos': [round(v, 3) for v in kr.matrix_world.translation], 'dynamic': bool(DYNAMIC.match(name))})
log('joined', len(statics), 'static,', len(kept_objs), 'kept')

# library meshes (one decimated copy each) and the pine
def decimated(src_me, name, target_tris):
    me = src_me.copy(); me.name = name
    ob = bpy.data.objects.new(name, me); EX.collection.objects.link(ob)
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    if tris > target_tris:
        md = ob.modifiers.new('dec', 'DECIMATE'); md.ratio = target_tris / tris; md.use_collapse_triangulate = True
        with bpy.context.temp_override(scene=EX, view_layer=VL):
            dge = bpy.context.evaluated_depsgraph_get(); dge.update()
            new = bpy.data.meshes.new_from_object(ob.evaluated_get(dge)); ob.modifiers.clear(); ob.data = new; new.name = name
    if not ob.data.uv_layers: ob.data.uv_layers.new(name='UVMap')
    return ob
inst_objs = []
TARGET = {'Lib_Can': 96, 'Lib_Pet': 180, 'Lib_Beer': 160, 'Lib_Jar': 140, 'Lib_Tin': 110, 'Lib_Chips': 200}
for mname, src in lib_meshes.items():
    if mname not in data['products']: continue
    tgt = next((v for k, v in TARGET.items() if mname.startswith(k)), 150)
    inst_objs.append(decimated(src.data, 'LIB_' + mname, tgt))
if pine:
    inst_objs.append(decimated(pine.data, 'PINE', 160))
log('instance meshes', len(inst_objs))

# ---------------------------------------------------------------- bake procedural materials to textures
SRC_RENDER = SRC.render.engine
EX.render.engine = 'CYCLES'
EX.cycles.samples = 1; EX.cycles.use_denoising = False
try: EX.cycles.device = 'CPU'
except Exception: pass
EX.render.bake.margin = 4; EX.render.bake.use_clear = True

def area_of(me): return sum(p.area for p in me.polygons)
def tex_size(a, density=64):
    s = math.sqrt(max(a, 1e-4)) * density
    p = 2 ** round(math.log2(max(s, 1)))
    return int(min(2048, max(256, p)))

def smart_uv(ob):
    me = ob.data
    if 'BakeUV' not in me.uv_layers: me.uv_layers.new(name='BakeUV')
    render = me.uv_layers[0]; render.active_render = True
    me.uv_layers.active = me.uv_layers['BakeUV']
    for o in EX.collection.objects: o.select_set(False, view_layer=VL)
    VL.objects.active = ob; ob.select_set(True, view_layer=VL)
    ctx = dict(scene=EX, view_layer=VL, active_object=ob, object=ob, edit_object=ob, selected_objects=[ob], selected_editable_objects=[ob])
    with bpy.context.temp_override(**ctx):
        bpy.ops.object.mode_set(mode='EDIT')
    with bpy.context.temp_override(**ctx):
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004, area_weight=0.0, scale_to_bounds=False)
        bpy.ops.object.mode_set(mode='OBJECT')

def alpha_source(m):
    b = principled(m)
    return b.inputs['Alpha'].links[0].from_socket if b and b.inputs['Alpha'].is_linked else None

def bake_object(ob, size, label):
    """Bake every material on ob into one image (DIFFUSE colour; alpha from a second emission bake when a material cuts out)."""
    img = bpy.data.images.new('T_' + label, size, size, alpha=False)
    nodes_added = []
    for m in ob.data.materials:
        if not m or not m.use_nodes: continue
        nd = m.node_tree.nodes.new('ShaderNodeTexImage'); nd.image = img
        for n_ in m.node_tree.nodes: n_.select = False
        nd.select = True; m.node_tree.nodes.active = nd; nodes_added.append((m, nd))
    for o in EX.collection.objects: o.select_set(False, view_layer=VL)
    ob.select_set(True, view_layer=VL); VL.objects.active = ob
    with bpy.context.temp_override(scene=EX, view_layer=VL, active_object=ob, object=ob, selected_objects=[ob], selected_editable_objects=[ob]):
        bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, use_clear=True, margin=4)
    alpha_img = None
    asrc = [(m, alpha_source(m)) for m in ob.data.materials if m and alpha_source(m)]
    if asrc:
        alpha_img = bpy.data.images.new('A_' + label, size, size, alpha=False)
        undo = []
        for m, nd in nodes_added: nd.image = alpha_img
        for m in ob.data.materials:
            if not m or not m.use_nodes: continue
            nt = m.node_tree; out = next(n_ for n_ in nt.nodes if n_.type == 'OUTPUT_MATERIAL' and n_.is_active_output)
            old = out.inputs['Surface'].links[0].from_socket if out.inputs['Surface'].is_linked else None
            em = nt.nodes.new('ShaderNodeEmission'); s = alpha_source(m)
            if s: nt.links.new(s, em.inputs['Color'])
            else: em.inputs['Color'].default_value = (1, 1, 1, 1)
            nt.links.new(em.outputs[0], out.inputs['Surface']); undo.append((nt, em, out, old))
        with bpy.context.temp_override(scene=EX, view_layer=VL, active_object=ob, object=ob, selected_objects=[ob], selected_editable_objects=[ob]):
            bpy.ops.object.bake(type='EMIT', use_clear=True, margin=4)
        for nt, em, out, old in undo:
            nt.nodes.remove(em)
            if old: nt.links.new(old, out.inputs['Surface'])
        # merge alpha into the colour image (RGBA)
        c = np.empty(size * size * 4, np.float32); img.pixels.foreach_get(c)
        a = np.empty(size * size * 4, np.float32); alpha_img.pixels.foreach_get(a)
        rgba = bpy.data.images.new('T_' + label + '_rgba', size, size, alpha=True)
        c[3::4] = a[0::4]; rgba.pixels.foreach_set(c); bpy.data.images.remove(img); bpy.data.images.remove(alpha_img); img = rgba
    for m, nd in nodes_added: m.node_tree.nodes.remove(nd)
    img.pack()
    return img, bool(asrc)

def flat_value(m, socket, default):
    b = principled(m)
    if not b: return default
    s = b.inputs.get(socket)
    if s is None or s.is_linked: return default
    return s.default_value

def baked_material(name, img, src_mats, cutout):
    m = bpy.data.materials.new('B_' + name); m.use_nodes = True; nt = m.node_tree
    b = principled(m); tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = img
    uv = nt.nodes.new('ShaderNodeUVMap'); uv.uv_map = 'BakeUV'; nt.links.new(uv.outputs[0], tx.inputs[0])
    nt.links.new(tx.outputs['Color'], b.inputs['Base Color'])
    src = src_mats[0]
    b.inputs['Roughness'].default_value = flat_value(src, 'Roughness', .8)
    b.inputs['Metallic'].default_value = flat_value(src, 'Metallic', 0)
    if cutout:
        nt.links.new(tx.outputs['Alpha'], b.inputs['Alpha']); m.blend_method = 'CLIP'; m.alpha_threshold = .5
    return m

def finalize_uv(ob):
    """Keep only BakeUV (renamed) so glTF carries one UV set."""
    me = ob.data
    for uv in [u for u in me.uv_layers if u.name != 'BakeUV']: me.uv_layers.remove(uv)
    if me.uv_layers: me.uv_layers[0].name = 'BakeUV'

nb = 0
for ob in statics + kept_objs + inst_objs:
    mats = [m for m in ob.data.materials if m]
    if not any(is_proc(m) for m in mats): continue
    if not ob.data.polygons:
        log('skip (no faces)', ob.name); EX.collection.objects.unlink(ob); continue
    a = area_of(ob.data)
    size = 256 if ob.name.startswith('LIB_') else 512 if ob.name == 'PINE' else tex_size(a)
    try:
        smart_uv(ob)
        img, cut = bake_object(ob, size, ob.name)
    except Exception as ex:
        log('BAKE FAILED, flat colour kept:', ob.name, ex)
        try: bpy.ops.object.mode_set(mode='OBJECT')
        except Exception: pass
        continue
    nm = baked_material(ob.name, img, mats, cut)
    ob.data.materials.clear(); ob.data.materials.append(nm)
    for p in ob.data.polygons: p.material_index = 0
    finalize_uv(ob); nb += 1
    log('baked', ob.name, size, 'cutout' if cut else '')
log('baked objects', nb)

# ---------------------------------------------------------------- export the GLB
for o in EX.collection.objects: o.select_set(True, view_layer=VL)
bpy.context.window_manager  # noqa
glb = OUT + 'station-%s.glb' % VER
with bpy.context.temp_override(scene=EX, view_layer=VL):
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=False, use_active_scene=True,
        export_apply=True, export_yup=True, export_texcoords=True, export_normals=True, export_materials='EXPORT',
        export_image_format='WEBP', export_image_quality=82, export_cameras=False, export_lights=False, export_animations=False,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_draco_position_quantization=16, export_draco_normal_quantization=10, export_draco_texcoord_quantization=12)
log('glb', glb, round(os.path.getsize(glb) / 1e6, 2), 'MB')

# ---------------------------------------------------------------- walk grid by ray casts against the static + kept (non-dynamic) geometry
bm = bmesh.new()
for ob in statics + kept_objs:
    if DYNAMIC.match(ob.name): continue
    me = ob.data.copy(); me.transform(ob.matrix_world); bm.from_mesh(me); bpy.data.meshes.remove(me)
bvh = BVHTree.FromBMesh(bm); bm.free()
# the hills stand on the ground plane: under them a downward ray from head height finds that plane, so the terrain gets its own test
bmt = bmesh.new()
for ob in statics:
    if 'Mountain' in ob.name:
        me = ob.data.copy(); me.transform(ob.matrix_world); bmt.from_mesh(me); bpy.data.meshes.remove(me)
terrain = BVHTree.FromBMesh(bmt) if bmt.faces else None; bmt.free()
X0, X1, Y0, Y1, CELL = -30.0, 32.0, -44.0, 17.0, 0.1
W, H = int((X1 - X0) / CELL), int((Y1 - Y0) / CELL)
grid = np.full((H, W), 255, np.uint8)
UP, DOWN = Vector((0, 0, 1)), Vector((0, 0, -1))
DIRS = [Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((-1, 0, 0)), Vector((0, -1, 0))]
for j in range(H):
    y = Y0 + (j + .5) * CELL
    for i in range(W):
        x = X0 + (i + .5) * CELL
        if terrain:
            th = terrain.ray_cast(Vector((x, y, 300)), DOWN, 400)
            if th[0] is not None and th[0].z > .45: continue
        hit = bvh.ray_cast(Vector((x, y, 1.6)), DOWN, 3.0)
        if hit[0] is None: continue                      # no floor: outside the world
        fz = hit[0].z
        if fz > .45 or fz < -.6: continue                # something waist-high (counter, shelf, car) or a hole
        blocked = False
        for h in (.45, 1.1, 1.7):
            o = Vector((x, y, fz + h))
            u = bvh.ray_cast(o, UP, .05)
            if u[0] is not None and u[1].z > 0: blocked = True; break     # inside a closed solid (we see its top face from below)
            for d in DIRS:
                if bvh.ray_cast(o, d, CELL * .5)[0] is not None: blocked = True; break
            if blocked: break
        if blocked: continue
        grid[j, i] = int(min(250, max(0, round((fz + .5) * 100))))   # height stored as cm + 50 (so the -0.5..2.0 m range fits)
log('walk grid', W, H, 'walkable', int((grid < 255).sum()))
img = bpy.data.images.new('walk', W, H, alpha=False, float_buffer=False)
px = np.ones((H, W, 4), np.float32); g = grid.astype(np.float32) / 255.0
px[..., 0] = g; px[..., 1] = g; px[..., 2] = g
img.pixels.foreach_set(px.ravel())
img.filepath_raw = OUT + 'station-walk-%s.png' % VER; img.file_format = 'PNG'
img.save()
data['walk'] = {'file': 'station-walk-%s.png' % VER, 'x0': X0, 'y0': Y0, 'cell': CELL, 'w': W, 'h': H, 'blocked': 255, 'heightOffsetCm': 50,
                'rowOrder': 'bottom-up (row 0 = y0)'}
spawn = bpy.data.objects.get('CAM_IN')
data['spawn'] = {'pos': [1.0, 5.0, 0.22], 'yaw': 0}
with open(OUT + 'station-%s.json' % VER, 'w', encoding='utf-8') as f: json.dump(data, f, separators=(',', ':'))
log('json', round(os.path.getsize(OUT + 'station-%s.json' % VER) / 1e6, 2), 'MB')
log('done')
