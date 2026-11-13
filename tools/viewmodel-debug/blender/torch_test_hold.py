# blender -b art/mixamo-hold.blend --python tools/viewmodel-debug/blender/torch_test_hold.py -> docs/viewmodel-grip/torch/hold_*.png
exec(open(r"C:\Users\libde\100gate\tools\viewmodel-debug\blender\torch_rig.py", encoding='utf-8').read())
OUTD = r"C:\Users\libde\100gate\docs\viewmodel-grip\torch"; os.makedirs(OUTD, exist_ok=True)
co = bpy.data.objects['shot']; sc.camera = co; sc.render.resolution_x, sc.render.resolution_y = 900, 700
lean_pose(0); solve_arm(FL_HOLD @ G.inverted()); set_fingers(0, {f: 1.0 for f in FING})
bpy.context.view_layer.update()
c = TORCH_HOLD.translation + Vector((0, 0, 0.2))
for n, off in (('front', (0.1, -1.6, 0.25)), ('side', (-1.6, 0.0, 0.2)), ('back', (0.0, 1.6, 0.4)), ('top', (-0.3, -0.3, 1.7)), ('closeR', (-0.5, -0.3, 0.1))):
    l = c + Vector(off); co.data.lens = 45 if n != 'closeR' else 70
    co.location = l; co.rotation_euler = (c - l).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = rf"{OUTD}\hold_{n}.png"; bpy.ops.render.render(write_still=True)
print('done')
