# Run inside Blender (Scripting tab or the MCP): rebuilds the flashlight HOLD from public/assets/iso/viewmodel-5.glb.
# The authored grip is kept (fingers already wrap the barrel); the flashlight is turned end for end so the wide lens end
# leaves the fist on the PINKY side and the narrow tail sits at the thumb, like the reference screenshot. Then every finger is
# curled until it touches the barrel (0.7 mm), the shoulder is turned toward the centre of the frame, the flashlight is slid
# 3.5 cm toward its tail so the tail shows past the fist. Result is saved to art/viewmodel-hold.blend.
import bpy, math, sys, numpy as np
NOFLIP = 'noflip' in (sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])   # keep the authored hammer grip (lens past the thumb/index side)
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree

GLB = r"C:\Users\libde\100gate\public\assets\iso\viewmodel-5.glb"
OUT = r"C:\Users\libde\100gate\art\viewmodel-hold.blend"

bpy.ops.import_scene.gltf(filepath=GLB)
arm = bpy.data.objects['StoryHeroWalk']; fl = bpy.data.objects['Flashlight']; body = bpy.data.objects['VM_body']
sc = bpy.context.scene
print('imported action:', arm.animation_data.action.name if arm.animation_data and arm.animation_data.action else None)
arm.animation_data.action = bpy.data.actions['flashlight_idle']; sc.frame_set(1); sc.frame_set(0)
for pb in arm.pose.bones: pb.custom_shape = None
arm.data.display_type = 'STICK'
ico = bpy.data.objects.get('Icosphere')
if ico: bpy.data.objects.remove(ico, do_unlink=True)

# hide the non-arm faces of the body (material VM_hide) with a Transparent BSDF
m = bpy.data.materials['VM_hide']; m.use_nodes = True; nt = m.node_tree
for n in list(nt.nodes): nt.nodes.remove(n)
out = nt.nodes.new('ShaderNodeOutputMaterial'); tr = nt.nodes.new('ShaderNodeBsdfTransparent'); nt.links.new(tr.outputs[0], out.inputs[0])

# game camera: eye = head bone + 5 cm, looks along -Y, 55.4 deg vertical (90 deg horizontal at 16:9)
eye = arm.matrix_world @ arm.pose.bones['head'].head + Vector((0, 0, 0.05))
cd = bpy.data.cameras.new('VMcam'); cam = bpy.data.objects.new('VMcam', cd); sc.collection.objects.link(cam)
cam.location = eye; cam.rotation_euler = (math.radians(90), 0, math.radians(180))
cd.sensor_fit = 'VERTICAL'; cd.angle_y = math.radians(55.4); cd.clip_start = .01
sc.camera = cam; sc.render.resolution_x, sc.render.resolution_y = 1280, 720

W = arm.matrix_world
def hb(n): return W @ arm.pose.bones[n].head

# 1. flip the flashlight about the grip point (the point of the barrel axis nearest the palm)
dg = bpy.context.evaluated_depsgraph_get(); ev = fl.evaluated_get(dg); me = ev.to_mesh(); M = ev.matrix_world
pts = np.array([(M @ v.co)[:] for v in me.vertices]); ev.to_mesh_clear()
c = pts.mean(axis=0); axis = Vector(np.linalg.svd(pts - c, full_matrices=False)[2][0])
fingers = (hb('middle_01_r') - hb('hand_r')).normalized(); knuckle = (hb('index_01_r') - hb('pinky_01_r')).normalized()
palmn = knuckle.cross(fingers)
palm = hb('hand_r') + 0.7 * (hb('middle_01_r') - hb('hand_r'))
P = Vector(c) + axis * (palm - Vector(c)).dot(axis)
n = (palmn - axis * palmn.dot(axis)).normalized()
R = Matrix.Rotation(math.pi, 4, n); T = Matrix.Translation(P)
if not NOFLIP: fl.matrix_world = T @ R @ T.inverted() @ fl.matrix_world

# 1b. slide the flashlight toward its tail (the narrow end) so it shows past the fist (before the fingers are fitted)
dg = bpy.context.evaluated_depsgraph_get(); ev = fl.evaluated_get(dg); me = ev.to_mesh(); M = ev.matrix_world
pts = np.array([(M @ v.co)[:] for v in me.vertices]); ev.to_mesh_clear()
c = pts.mean(axis=0); ax = np.linalg.svd(pts - c, full_matrices=False)[2][0]
t = (pts - c) @ ax; q = pts - c; r = np.sqrt(((q - np.outer(t, ax)) ** 2).sum(1))
head_sign = 1 if r[t > np.percentile(t, 85)].mean() > r[t < np.percentile(t, 15)].mean() else -1
tail_dir = Vector(ax * -head_sign)
if not NOFLIP: fl.matrix_world = Matrix.Translation(tail_dir * 0.035) @ fl.matrix_world

def edit_action(act, bone, delta):
    dp = f'pose.bones["{bone}"].rotation_quaternion'
    fcs = [next(fc for fc in act.fcurves if fc.data_path == dp and fc.array_index == k) for k in range(4)]
    for ki in range(len(fcs[0].keyframe_points)):
        qq = delta(Quaternion([fcs[k].keyframe_points[ki].co[1] for k in range(4)]))
        for k in range(4):
            kp = fcs[k].keyframe_points[ki]; kp.co[1] = qq[k]; kp.handle_left[1] = qq[k]; kp.handle_right[1] = qq[k]
    for fc in fcs: fc.update()
pb = arm.pose.bones
# 3. turn the shoulder so the fist sits nearer the centre of the frame
sc.frame_set(1); sc.frame_set(0)
ub = pb['upperarm_r']
A = (W @ ub.matrix @ ub.matrix_basis.inverted()).to_3x3()
D = (A.inverted() @ (Matrix.Rotation(0.13, 3, 'Z') @ Matrix.Rotation(-0.067, 3, 'X')) @ A).to_quaternion()
for act in bpy.data.actions: edit_action(act, 'upperarm_r', lambda q: D @ q)
# 2. curl every finger about its knuckle axis: scan the curl and keep the one with the most skin touching the barrel (< 2 mm)
#    while at most 3 vertices go deeper than 1.5 mm into it (robust against single stray vertices)
pb = arm.pose.bones
names = {vg.index: vg.name for vg in body.vertex_groups}
fv = {f: [v.index for v in body.data.vertices if v.groups and names[max(v.groups, key=lambda g: g.weight).group].startswith(f) and names[max(v.groups, key=lambda g: g.weight).group].endswith('_r')] for f in ('index', 'middle', 'ring', 'pinky')}
def counts(f):
    dg = bpy.context.evaluated_depsgraph_get()
    fe = fl.evaluated_get(dg); tree = BVHTree.FromObject(fe, dg); inv = fe.matrix_world.inverted(); FW = fe.matrix_world
    be = body.evaluated_get(dg); me = be.to_mesh(); MB = be.matrix_world
    touch = deep = 0; best = 9
    for i in fv[f]:
        co = MB @ me.vertices[i].co; loc, nor, idx, dist = tree.find_nearest(inv @ co)
        if loc is None: continue
        d = (co - FW @ loc).length * (1 if (inv @ co - loc).dot(nor) >= 0 else -1)
        touch += d < 0.002; deep += d < -0.0015; best = min(best, d)
    be.to_mesh_clear(); return touch, deep, best
deltas = {}
for f in ('index', 'middle', 'ring', 'pinky'):
    base = [pb[f'{f}_0{i}_r'].rotation_quaternion.copy() for i in (1, 2, 3)]
    best_th, best_score = 0.0, -1
    for k in range(-30, 31):
        th = k * 0.012
        for i, q0 in zip((1, 2, 3), base): pb[f'{f}_0{i}_r'].rotation_quaternion = q0 @ Quaternion(Vector((1, 0, 0)), th)
        bpy.context.view_layer.update()
        touch, deep, dmin = counts(f)
        if deep <= 3 and touch > best_score: best_score, best_th = touch, th
    deltas[f] = best_th
    for i, q0 in zip((1, 2, 3), base): pb[f'{f}_0{i}_r'].rotation_quaternion = q0
    print('finger', f, 'delta deg', round(math.degrees(best_th), 1), 'touching verts', best_score)
for act in bpy.data.actions:
    for f, th in deltas.items():
        for i in (1, 2, 3):
            edit_action(act, f'{f}_0{i}_r', lambda q, th=th: q @ Quaternion(Vector((1, 0, 0)), th))

arm.animation_data.action = bpy.data.actions['flashlight_idle']; sc.frame_set(1); sc.frame_set(0)

for a in bpy.data.actions: a.use_fake_user = True      # keep every clip in the saved file
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print('hold saved', OUT, {k: round(math.degrees(v), 2) for k, v in deltas.items()})
