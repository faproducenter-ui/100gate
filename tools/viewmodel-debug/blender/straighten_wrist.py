# blender -b art/viewmodel-hold.blend --python tools/viewmodel-debug/blender/straighten_wrist.py -- <step_deg> <target_deg> [save]
# Straightens the wrist by turning ONLY the hand bone (forearm, upper arm, shoulder untouched; the flashlight is parented to the hand
# and goes with it). The turn is applied to the hand keys of flashlight_idle / _walk / _raise, in steps of <step_deg>, until the angle
# between forearm and hand (wrist -> middle knuckle) is <target_deg>. After every step: metrics + renders (same view as the user's
# screenshot, from above, from the side, and the game camera) into docs/viewmodel-grip/wrist/.
import bpy, math, os, sys
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
STEP = math.radians(float(argv[0]) if argv else 12.0)
TARGET = math.radians(float(argv[1]) if len(argv) > 1 else 12.0)
SAVE = 'save' in argv[2:]
RADIAL = math.radians(float(next((a.split('=')[1] for a in argv if a.startswith('radial=')), '0')))
OUT = r"C:\Users\libde\100gate\docs\viewmodel-grip\wrist"; os.makedirs(OUT, exist_ok=True)

arm = bpy.data.objects['StoryHeroWalk']; fl = bpy.data.objects['Flashlight']; body = bpy.data.objects['VM_body']; sc = bpy.context.scene
pb = arm.pose.bones; W = arm.matrix_world
ACTS = [bpy.data.actions[n] for n in ('flashlight_idle', 'flashlight_walk', 'flashlight_raise')]
arm.animation_data.action = ACTS[0]; sc.frame_set(1); sc.frame_set(0)

# ---- scene for renders
w = sc.world or bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs['Color'].default_value = (.12, .13, .15, 1); bg.inputs['Strength'].default_value = 1.2
if 'key' not in bpy.data.objects:
    ld = bpy.data.lights.new('key', 'AREA'); ld.energy = 90; ld.size = 2; lo = bpy.data.objects.new('key', ld); sc.collection.objects.link(lo); lo.location = (.3, .2, 2.1); lo.rotation_euler = (.35, 0, 0)
try: sc.render.engine = 'BLENDER_EEVEE_NEXT'
except TypeError: sc.render.engine = 'BLENDER_WORKBENCH'
sc.render.resolution_x, sc.render.resolution_y = 960, 540
cd = bpy.data.cameras.get('wristcam') or bpy.data.cameras.new('wristcam'); cd.angle_y = math.radians(40); cd.clip_start = .01
co = bpy.data.objects.get('wristcam') or bpy.data.objects.new('wristcam', cd)
if co.name not in sc.collection.objects: sc.collection.objects.link(co)

def dirs():
    fore = (W @ pb['lowerarm_r'].tail - W @ pb['lowerarm_r'].head).normalized()
    hand = (W @ pb['middle_01_r'].head - W @ pb['hand_r'].head).normalized()
    return fore, hand
def wrist_angle():
    f, h = dirs(); return math.acos(max(-1, min(1, f.dot(h))))
def twist():
    # roll of the hand about the forearm axis vs. the forearm's own roll: a big value means a candy-wrapper twist
    f, _ = dirs()
    ref_f = (W @ pb['lowerarm_r'].matrix).to_3x3() @ Vector((1, 0, 0))
    ref_h = (W @ pb['hand_r'].matrix).to_3x3() @ Vector((1, 0, 0))
    a = ref_f - f * ref_f.dot(f); b = ref_h - f * ref_h.dot(f)
    return math.degrees(a.angle(b)) if a.length > 1e-6 and b.length > 1e-6 else 0
def contact():
    dg = bpy.context.evaluated_depsgraph_get(); fe = fl.evaluated_get(dg); tree = BVHTree.FromObject(fe, dg); inv = fe.matrix_world.inverted(); FW = fe.matrix_world
    be = body.evaluated_get(dg); me = be.to_mesh(); M = be.matrix_world; names = {vg.index: vg.name for vg in body.vertex_groups}
    deep = touch = 0
    for v in me.vertices:
        if not v.groups: continue
        n = names[max(v.groups, key=lambda g: g.weight).group]
        if not (n.endswith('_r') and any(n.startswith(p) for p in ('index', 'middle', 'ring', 'pinky', 'thumb', 'hand'))): continue
        c = M @ v.co; loc, nor, i, d = tree.find_nearest(inv @ c)
        s = (c - FW @ loc).length * (1 if (inv @ c - loc).dot(nor) >= 0 else -1)
        deep += s < -0.0015; touch += s < 0.003
    be.to_mesh_clear(); return touch, deep
def shots(tag):
    target = W @ pb['hand_r'].head + Vector((-.02, -.05, 0))
    for name, off in (('same', (-.5, -.1, .05)), ('above', (0, -.05, .55)), ('front', (0.05, -.55, .1))):
        co.location = target + Vector(off); co.rotation_euler = (target - co.location).to_track_quat('-Z', 'Y').to_euler()
        sc.camera = co; sc.render.filepath = rf"{OUT}\{tag}_{name}.png"; bpy.ops.render.render(write_still=True)
    sc.camera = bpy.data.objects['VMcam']; sc.render.filepath = rf"{OUT}\{tag}_game.png"; bpy.ops.render.render(write_still=True)

def turn_hand(angle):
    """rotate the hand bone about the wrist, in the plane of forearm and hand, toward the forearm line (all keys of all three clips)"""
    sc.frame_set(0)
    f, h = dirs(); axis = h.cross(f).normalized()
    R = Matrix.Rotation(angle, 3, axis)
    A = (W @ pb['hand_r'].matrix @ pb['hand_r'].matrix_basis.inverted()).to_3x3()
    D = (A.inverted() @ R @ A).to_quaternion()
    dp = 'pose.bones["hand_r"].rotation_quaternion'
    for act in ACTS:
        fcs = [next(fc for fc in act.fcurves if fc.data_path == dp and fc.array_index == k) for k in range(4)]
        for ki in range(len(fcs[0].keyframe_points)):
            from mathutils import Quaternion
            q = D @ Quaternion([fcs[k].keyframe_points[ki].co[1] for k in range(4)])
            for k in range(4):
                kp = fcs[k].keyframe_points[ki]; kp.co[1] = q[k]; kp.handle_left[1] = q[k]; kp.handle_right[1] = q[k]
        for fc in fcs: fc.update()
    sc.frame_set(1); sc.frame_set(0)

lens = lambda: ((fl.matrix_world.to_3x3() @ Vector((1, 0, 0))).normalized())
step = 0
a0 = wrist_angle()
print(f'STEP {step}: wrist {math.degrees(a0):.1f} deg, twist {twist():.1f}, contact touch/deep {contact()}, lens axis {tuple(round(v, 2) for v in lens())}')
shots(f's{step:02d}')
while wrist_angle() > TARGET + math.radians(0.5):
    step += 1
    turn_hand(min(STEP, wrist_angle() - TARGET))
    print(f'STEP {step}: wrist {math.degrees(wrist_angle()):.1f} deg, twist {twist():.1f}, contact touch/deep {contact()}, lens axis {tuple(round(v, 2) for v in lens())}')
    shots(f's{step:02d}')
    if step > 12: break
if RADIAL:
    # a slight bend toward the thumb side (radial deviation): about the palm normal, distal end toward the index finger
    sc.frame_set(0)
    f, h = dirs()
    k = (W @ pb['index_01_r'].head - W @ pb['pinky_01_r'].head).normalized()
    n = h.cross(k).normalized()
    test = Matrix.Rotation(RADIAL, 3, n) @ h
    sign = 1 if test.dot(k) > h.dot(k) else -1
    R = Matrix.Rotation(sign * RADIAL, 3, n)
    A = (W @ pb['hand_r'].matrix @ pb['hand_r'].matrix_basis.inverted()).to_3x3(); D = (A.inverted() @ R @ A).to_quaternion()
    from mathutils import Quaternion
    dp = 'pose.bones["hand_r"].rotation_quaternion'
    for act in ACTS:
        fcs = [next(fc for fc in act.fcurves if fc.data_path == dp and fc.array_index == kk) for kk in range(4)]
        for ki in range(len(fcs[0].keyframe_points)):
            q = D @ Quaternion([fcs[kk].keyframe_points[ki].co[1] for kk in range(4)])
            for kk in range(4):
                kp = fcs[kk].keyframe_points[ki]; kp.co[1] = q[kk]; kp.handle_left[1] = q[kk]; kp.handle_right[1] = q[kk]
        for fc in fcs: fc.update()
    sc.frame_set(1); sc.frame_set(0)
    print(f'RADIAL bend {math.degrees(RADIAL):.0f} deg: wrist {math.degrees(wrist_angle()):.1f} deg, twist {twist():.1f}')
    shots('radial')
if SAVE:
    for a in bpy.data.actions: a.use_fake_user = True
    for o in ('wristcam',):
        ob = bpy.data.objects.get(o)
        if ob: bpy.data.objects.remove(ob, do_unlink=True)
    bpy.ops.wm.save_as_mainfile(filepath=r"C:\Users\libde\100gate\art\viewmodel-hold.blend")
    print('saved')
