"""Export the native body + props + eye camera as one synchronised scene clip."""
import bpy
from pathlib import Path
s=bpy.context.scene;s.frame_set(1)
assert s.get('bound_performance_partial'),'Wrong source; do not export a static gate as motion'
bpy.ops.object.select_all(action='DESELECT')
for obj in s.objects:
    if obj.type=='LIGHT' or obj.get('authoring_archive'):continue
    obj.select_set(True)
bpy.context.view_layer.objects.active=next(o for o in s.objects if o.type=='ARMATURE')
properties=bpy.ops.export_scene.gltf.get_rna_type().properties
assert 'SCENE' in {i.identifier for i in properties['export_animation_mode'].enum_items}
bpy.ops.export_scene.gltf(filepath=str(Path.cwd()/'outputs/cinematic-intro/bound-chair-performance-partial.glb'),
    use_selection=True,export_animations=True,export_animation_mode='SCENE',
    export_anim_scene_split_object=False,export_anim_slide_to_zero=True,
    export_force_sampling=True,export_frame_range=True,export_rest_position_armature=True,
    export_skins=True,export_morph=True,export_tangents=True,export_cameras=True,export_extras=True)
