# blender -b art/mixamo-hold.blend --python tools/viewmodel-debug/blender/mixamo_game_export.py -> public/assets/iso/viewmodel-7.glb
# The first-person arm for the game, made from the user's ready model (Mike Alger, CC-BY 4.0; credit in models-credits-3.txt).
# Same hold, same take-from-the-table motion as art/mixamo-pickup-anim.blend, cut to the game's clips:
#   flashlight_pickup (40 frames, fingers closed at 16 -> see interaction.ts), flashlight_pickup_fl (the flashlight node), flashlight_idle (60), flashlight_walk (24), flashlight_raise (12), flashlight_open (1: relaxed open hand, the game's finger rest).
# Only the right arm is kept (faces that belong to other parts are removed); bones get the game's names (upperarm_r, lowerarm_r, hand_r, index_01_r ...).
import bpy, math, sys, os, json
import numpy as np
from mathutils import Vector, Matrix, Quaternion

OUT = r"C:\Users\libde\100gate\public\assets\iso\viewmodel-7.glb"

# ---------- 1. unit scale: the Sketchfab parent empty carried the 0.01 (bones are in centimetres); bake it into the armature and meshes
arm = bpy.data.objects['Hero']
keep_meshes = ('Hero_Body', 'Hero_Sweatshirt')
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o.parent == arm and o.name not in keep_meshes: bpy.data.objects.remove(o, do_unlink=True)
for o in list(bpy.data.objects):
    if o.name.startswith(('Table', 'Icosphere')) or (o.type == 'EMPTY' and o.parent == arm): bpy.data.objects.remove(o, do_unlink=True)
mw = arm.matrix_world.copy(); arm.parent = None; arm.matrix_world = mw
bpy.context.view_layer.update()
for o in bpy.data.objects: o.select_set(False)
for o in [arm] + list(arm.children): o.select_set(True)
bpy.context.view_layer.objects.active = arm
SC = arm.matrix_world.to_scale()[0]
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
for b in arm.pose.bones: b.location = b.location * SC        # pose-bone offsets are not scaled by Apply Scale: 1 cm must not become 1 m
bpy.context.view_layer.update()
print('armature scale after apply', tuple(round(v, 4) for v in arm.matrix_world.to_scale()))

# ---------- 2. the animation machinery from mixamo_anim.py (everything before its frame loop)
src = open(r"C:\Users\libde\100gate\tools\viewmodel-debug\blender\mixamo_anim.py", encoding='utf-8').read()
prefix = src[:src.index("miss = []\nneed = []")]
prefix = prefix.replace("if o.name.startswith('Table'):", "if False:")      # no table in the game model
exec(prefix, globals())
print('machinery ready; arm lengths', round(Lu, 3), round(Lf, 3))

S_sh = H(UA)
print('table pose reach', round((Hw_table.translation - S_sh).length / (Lu + Lf), 3), '(the game leans the arm in itself when the prop is out of reach)')

ARM_BONES = ['mixamorig_' + UA, 'mixamorig_' + FA, 'mixamorig_' + HA] + [fb(f, i).name for f in FING for i in range(3)]
def record(Hw, FL, op, close, resolve=True):
    lean_pose(0)
    solve_arm(Hw)
    fl.matrix_world = FL; bpy.context.view_layer.update()
    set_fingers(op, close); bpy.context.view_layer.update()
    if resolve:
        for fn in FING:
            while close[fn] > 0 and depth(fn) > 0.0015:
                close[fn] = max(0.0, close[fn] - 0.04); set_fingers(op, close); bpy.context.view_layer.update()
    handM = W @ B(HA).matrix
    return {'q': {n: pb[n].rotation_quaternion.copy() for n in ARM_BONES}, 'rel': handM.inverted() @ FL, 'wrist': tuple(round(v, 3) for v in (W @ B(HA).head)), 'fl': tuple(round(v, 3) for v in FL.translation)}

HELD = {f: 1.0 for f in FING}
def lerpmap(pts, g):
    for (g0, m0), (g1, m1) in zip(pts, pts[1:]):
        if g <= g1: return m0 + (m1 - m0) * (g - g0) / (g1 - g0)
    return pts[-1][1]
# ---------- 3. the clips
CLIPS = {}
PICK = [(0, 12), (8, 30), (13, 40), (16, 46), (19, 52), (34, 84), (40, 86)]
CLIPS['flashlight_pickup'] = [record(*scene_at(lerpmap(PICK, g))[:4]) for g in range(41)]
_pick_frames = True
def hold_target(dx=0.0, dy=0.0, dz=0.0, roll=0.0):
    FL = Matrix.Translation(Vector((dx, dy, dz))) @ FL_HOLD @ Matrix.Rotation(roll, 4, 'Y')
    return FL @ G.inverted(), FL
def idle(g):
    p = 2 * math.pi * g / 60
    Hw, FL = hold_target(0.002 * math.sin(p + 1.0), 0.0, 0.0045 * math.sin(p), math.radians(0.8) * math.sin(p + 0.6))
    return record(Hw, FL, 0.0, dict(HELD))
CLIPS['flashlight_idle'] = [idle(g) for g in range(61)]
def walk(g):
    p = 2 * math.pi * g / 24
    Hw, FL = hold_target(0.010 * math.sin(p), 0.006 * math.sin(2 * p + 1.2), 0.013 * -math.cos(2 * p), math.radians(2.2) * math.sin(p))
    return record(Hw, FL, 0.0, dict(HELD))
CLIPS['flashlight_walk'] = [walk(g) for g in range(25)]
def raise_(g):
    t = ease(g / 12)
    Hw0 = REST_HAND; Hw1 = FL_HOLD @ G.inverted()
    Hw = mat_lerp(Hw0, Hw1, t); Hw.translation = Hw.translation + Vector((0, 0, 0.03 * math.sin(math.pi * t)))
    return record(Hw, Hw @ G, 0.0, dict(HELD), resolve=False)
CLIPS['flashlight_raise'] = [raise_(g) for g in range(13)]
OPEN_REST = record(*(lambda: (REST_HAND, REST_HAND @ G, 0.55, {f: 0.0 for f in FING}))(), resolve=False)
CLIPS['flashlight_open'] = [OPEN_REST]
REL = CLIPS['flashlight_idle'][0]['rel']          # the flashlight in the hand bone's frame, measured on the solved hold
for g, rec in enumerate(CLIPS['flashlight_pickup']):
    if g >= 13: rec['rel'] = REL                  # from the grasp on the flashlight is glued to the hand exactly as in the hold
print({k: len(v) for k, v in CLIPS.items()})
print('recorded hold wrist', CLIPS['flashlight_idle'][0]['wrist'], 'fl', CLIPS['flashlight_idle'][0]['fl'], 'rel t', tuple(round(v, 3) for v in REL.translation))
print('recorded pickup end', CLIPS['flashlight_pickup'][40]['wrist'])

# ---------- 4. trim to the right arm
R_PREFIX = ('mixamorig_RightArm', 'mixamorig_RightForeArm', 'mixamorig_RightHand', 'mixamorig_RightShoulder')
import bmesh
for nm in keep_meshes:
    ob = bpy.data.objects[nm]; gn = {vg.index: vg.name for vg in ob.vertex_groups}
    bm = bmesh.new(); bm.from_mesh(ob.data); dl = bm.verts.layers.deform.active
    def dom(v):
        w = v[dl]; return gn[max(w.keys(), key=lambda k: w[k])] if len(w) else ''
    inR = {v.index: dom(v).startswith(R_PREFIX) for v in bm.verts}
    bad = [f for f in bm.faces if not all(inR[v.index] for v in f.verts)]
    bmesh.ops.delete(bm, geom=bad, context='FACES')
    loose = [v for v in bm.verts if not v.link_faces]; bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.to_mesh(ob.data); bm.free(); ob.data.update()
    print(nm, 'faces kept', len(ob.data.polygons), 'verts', len(ob.data.vertices))

# ---------- 5. the game's bone names
GN = {'mixamorig_RightShoulder_034': 'clavicle_r', 'mixamorig_' + UA: 'upperarm_r', 'mixamorig_' + FA: 'lowerarm_r', 'mixamorig_' + HA: 'hand_r', 'mixamorig_Head_06': 'head'}
for f, short in (('Index', 'index'), ('Middle', 'middle'), ('Ring', 'ring'), ('Pinky', 'pinky'), ('Thumb', 'thumb')):
    for i in range(4): GN[f'mixamorig_RightHand{f}{i + 1}_{FING[f][i]}'] = f'{short}_0{i + 1}_r'
for old, new in GN.items():
    if old in arm.data.bones: arm.data.bones[old].name = new
    else: print('missing bone', old)
print('renamed', len(GN))

# ---------- 6. actions
fl.parent = arm; fl.parent_type = 'BONE'; fl.parent_bone = 'hand_r'
fl.matrix_parent_inverse = Matrix.Identity(4)
pbn = arm.pose.bones
if arm.animation_data is None: arm.animation_data_create()
if fl.animation_data is None: fl.animation_data_create()
new_names = {n: GN.get(n, n) for n in ARM_BONES}
def build(name, frames, with_fl=False):
    act = bpy.data.actions.new(name)
    arm.animation_data.action = act
    if with_fl:
        fa = bpy.data.actions.new(name + '_fl'); fl.animation_data.action = fa
    for gi, rec in enumerate(frames):
        fr = gi + 1
        for old, q in rec['q'].items():
            b = pbn[new_names[old]]; b.rotation_mode = 'QUATERNION'; b.rotation_quaternion = q; b.keyframe_insert('rotation_quaternion', frame=fr)
        if with_fl:
            bpy.context.view_layer.update()
            fl.matrix_world = arm.matrix_world @ pbn['hand_r'].matrix @ rec['rel']
            fl.rotation_mode = 'QUATERNION'; fl.keyframe_insert('location', frame=fr); fl.keyframe_insert('rotation_quaternion', frame=fr)
    return act
# parent inverse so that the flashlight keeps its world pose when parented to the bone
bpy.context.view_layer.update()
acts = {}
# the flashlight is parented to hand_r with an identity parent inverse (its transform is then relative to the bone, which is what the clips key)
for name in ('flashlight_idle', 'flashlight_walk', 'flashlight_raise', 'flashlight_open'):
    acts[name] = build(name, CLIPS[name])
acts['flashlight_pickup'] = build('flashlight_pickup', CLIPS['flashlight_pickup'], with_fl=True)
fl.animation_data.action = bpy.data.actions['flashlight_pickup_fl']
for a in bpy.data.actions: a.use_fake_user = True

bpy.context.scene.frame_set(41); bpy.context.view_layer.update()
print('after build at 41: hand', tuple(round(v, 3) for v in (arm.matrix_world @ pbn['hand_r'].head)), 'fl', tuple(round(v, 3) for v in fl.matrix_world.translation))
# ---------- 7. export (rest transform of the flashlight node = the last frame of its pickup clip, where the arm is also in the hold)
arm.animation_data.action = acts['flashlight_pickup']
bpy.context.scene.frame_set(41)
for o in bpy.data.objects: o.select_set(False)
for o in [arm, fl, bpy.data.objects['Flashlight_switch']] + [bpy.data.objects[n] for n in keep_meshes]: o.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='ACTIONS',
    export_force_sampling=True, export_frame_range=False, export_skins=True, export_yup=True, export_apply=False, export_cameras=False, export_lights=False,
    export_image_format='JPEG', export_jpeg_quality=88)
print('exported', OUT, os.path.getsize(OUT))

# ---------- 8. the exporter writes the flashlight node's local transform in its own convention; write the exact one: the flashlight in the hand bone's frame (REL), with the mesh's Z-up -> Y-up conversion undone
import struct
Cm = Matrix(((1, 0, 0), (0, 0, 1), (0, -1, 0)))            # Blender object space -> glTF mesh space (x, y, z) -> (x, z, -y)
def local_gltf(rel):
    R = rel.to_3x3() @ Cm.inverted(); q = R.to_quaternion()
    return [round(v, 7) for v in rel.translation], [q.x, q.y, q.z, q.w]
data = open(OUT, 'rb').read()
jl = struct.unpack('<I', data[12:16])[0]; js = json.loads(data[20:20 + jl].decode('utf-8'))
bo = 20 + jl; bl = struct.unpack('<I', data[bo:bo + 4])[0]; binb = bytearray(data[bo + 8:bo + 8 + bl])
fn = next(n for n in js['nodes'] if n.get('name') == 'Flashlight')
t, q = local_gltf(REL); fn['translation'] = t; fn['rotation'] = q; fn.pop('matrix', None)
an = next(a for a in js['animations'] if a['name'] == 'flashlight_pickup_fl')
for ch in an['channels']:
    acc = js['accessors'][an['samplers'][ch['sampler']]['output']]; bv = js['bufferViews'][acc['bufferView']]
    off = bv.get('byteOffset', 0) + acc.get('byteOffset', 0); vals = []
    for rec in CLIPS['flashlight_pickup']:
        tt, qq = local_gltf(rec['rel']); vals += tt if ch['target']['path'] == 'translation' else qq
    assert acc['count'] * (3 if ch['target']['path'] == 'translation' else 4) == len(vals), (acc['count'], len(vals))
    struct.pack_into('<%df' % len(vals), binb, off, *vals)
    if ch['target']['path'] == 'translation': acc['min'] = [min(vals[i::3]) for i in range(3)]; acc['max'] = [max(vals[i::3]) for i in range(3)]
jb = json.dumps(js, separators=(',', ':')).encode('utf-8'); jb += b' ' * (-len(jb) % 4)
out = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(jb) + 8 + len(binb)) + struct.pack('<II', len(jb), 0x4E4F534A) + jb + struct.pack('<II', len(binb), 0x004E4942) + bytes(binb)
open(OUT, 'wb').write(out)
print('patched flashlight node local', t, 'size', len(out))
bpy.ops.wm.save_as_mainfile(filepath=r"C:\Users\libde\100gate\art\mixamo-viewmodel-game.blend")
