# blender -b art/viewmodel-hold.blend --python tools/viewmodel-debug/blender/export_viewmodel.py -> public/assets/iso/viewmodel-6.glb
import bpy
OUT = r"C:\Users\libde\100gate\public\assets\iso\viewmodel-6.glb"
arm = bpy.data.objects['StoryHeroWalk']; fl = bpy.data.objects['Flashlight']; sc = bpy.context.scene
for o in bpy.data.objects: o.select_set(False)
keep = [arm] + [c for c in arm.children_recursive]
for o in keep: o.select_set(True)
bpy.context.view_layer.objects.active = arm
fl.animation_data_create(); fl.animation_data.action = bpy.data.actions['flashlight_pickup_fl']
arm.animation_data.action = bpy.data.actions['flashlight_idle']
sc.frame_set(40)      # the flashlight node's rest transform is taken from the current frame: at frame 40 of the pickup clip it is the hold
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='ACTIONS',
    export_force_sampling=True, export_frame_range=False, export_skins=True, export_yup=True, export_apply=False, export_cameras=False, export_lights=False)
print('exported', OUT, [a.name for a in bpy.data.actions])
