# blender -b art/viewmodel-hold.blend --python tools/viewmodel-debug/blender/aim_shoulder.py -- [up_deg]
# Turns the upper arm (at the shoulder) so the lens axis points straight ahead of the camera and <up_deg> above level.
# The wrist and the grip are untouched: forearm, hand and flashlight move together. Applied to every key of idle / walk / raise.
import bpy, math, sys
from mathutils import Vector, Matrix, Quaternion
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
UP = math.radians(float(argv[0]) if argv else 6.0)
arm = bpy.data.objects['StoryHeroWalk']; fl = bpy.data.objects['Flashlight']; cam = bpy.data.objects['VMcam']; sc = bpy.context.scene
pb = arm.pose.bones; W = arm.matrix_world
ACTS = [bpy.data.actions[n] for n in ('flashlight_idle', 'flashlight_walk', 'flashlight_raise')]
arm.animation_data.action = ACTS[0]; sc.frame_set(1); sc.frame_set(0)
Cw = cam.matrix_world.to_3x3()
fwd = Cw @ Vector((0, math.sin(UP), -math.cos(UP)))
lens = lambda: (fl.matrix_world.to_3x3() @ Vector((1, 0, 0))).normalized()
for it in range(4):                                           # a few passes: the shoulder turn is not exactly the lens turn
    l = lens(); R = l.rotation_difference(fwd).to_matrix()
    ub = pb['upperarm_r']; A = (W @ ub.matrix @ ub.matrix_basis.inverted()).to_3x3(); D = (A.inverted() @ R @ A).to_quaternion()
    dp = 'pose.bones["upperarm_r"].rotation_quaternion'
    for act in ACTS:
        fcs = [next(fc for fc in act.fcurves if fc.data_path == dp and fc.array_index == k) for k in range(4)]
        for ki in range(len(fcs[0].keyframe_points)):
            q = D @ Quaternion([fcs[k].keyframe_points[ki].co[1] for k in range(4)])
            for k in range(4):
                kp = fcs[k].keyframe_points[ki]; kp.co[1] = q[k]; kp.handle_left[1] = q[k]; kp.handle_right[1] = q[k]
        for fc in fcs: fc.update()
    sc.frame_set(1); sc.frame_set(0)
    print(f'pass {it}: lens off the aim by {math.degrees(lens().angle(fwd)):.1f} deg; hand at camera-space', tuple(round(v, 3) for v in (cam.matrix_world.inverted() @ (W @ pb["hand_r"].head))))
for a in bpy.data.actions: a.use_fake_user = True
bpy.ops.wm.save_as_mainfile(filepath=r"C:\Users\libde\100gate\art\viewmodel-hold.blend")
print('aimed')
