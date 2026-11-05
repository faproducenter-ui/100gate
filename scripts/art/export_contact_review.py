"""Export neutral original skin; merge baked arm and socket tracks per scene."""
import bpy,json,ast,os
from pathlib import Path
ROOT=Path.cwd();OUT=ROOT/'outputs/hand-mesh-rework'
scene=bpy.context.scene
body=next(o for o in scene.objects if o.type=='MESH' and o.name.endswith('MakeHuman body'))
rig=next(o for o in scene.objects if o.type=='ARMATURE')
wardrobe=[o for o in scene.objects if o.type=='MESH' and o.name.startswith(body.name+'.')]
assert len(wardrobe)==4
code=(ROOT/'scripts/art/mpfb-character-review.py').read_text()
node=next(n for n in ast.parse(code).body if isinstance(n,ast.FunctionDef) and n.name=='save_neutral_glb')
motion=os.environ.get('GATE_CONTACT_MOTION')=='1'
if motion:
    # Scene mode merges the armature and world/attached prop into one clip.
    call=next(n for n in ast.walk(node) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='gltf')
    call.keywords += [ast.keyword(arg='export_animation_mode',value=ast.Constant('SCENE')),
                     ast.keyword(arg='export_anim_scene_split_object',value=ast.Constant(False)),
                     ast.keyword(arg='export_anim_slide_to_zero',value=ast.Constant(True)),
                     ast.keyword(arg='export_force_sampling',value=ast.Constant(True))]
    ast.fix_missing_locations(node)
exec(compile(ast.Module(body=[node],type_ignores=[]),'existing-character-export','exec'))
others=[o for o in scene.objects if o not in [body,rig,*wardrobe] and o.type!='LIGHT']
if motion:
    scene.frame_set(1)
    scene.name='HandContact_SlowPowerGrip'
save_neutral_glb('hand-contact-motion.glb' if motion else 'hand-static.glb',posed=not motion,others=others,animations=motion)
