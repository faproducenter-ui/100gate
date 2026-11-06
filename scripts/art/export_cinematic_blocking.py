"""Export separate STATIC pose gates using the proven neutral skin pipeline."""
import bpy,ast,json
from pathlib import Path
ROOT=Path.cwd();OUT=ROOT/'outputs/cinematic-intro';scene=bpy.context.scene
body=next(o for o in scene.objects if o.type=='MESH' and o.name.endswith('MakeHuman body'))
rig=next(o for o in scene.objects if o.type=='ARMATURE')
wardrobe=[o for o in scene.objects if o.type=='MESH' and o.name.startswith(body.name+'.')]
code=(ROOT/'scripts/art/mpfb-character-review.py').read_text()
node=next(n for n in ast.parse(code).body if isinstance(n,ast.FunctionDef) and n.name=='save_neutral_glb')
call=next(n for n in ast.walk(node) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='gltf')
call.keywords.append(ast.keyword(arg='export_current_frame',value=ast.Constant(True)));ast.fix_missing_locations(node)
exec(compile(ast.Module(body=[node],type_ignores=[]),'neutral-skin-export','exec'))
others=[o for o in scene.objects if o not in [body,rig,*wardrobe] and o.type!='LIGHT' and not o.get('authoring_archive')]
poses=((1,'restraints'),) if scene.get('bound_restraints_only') else ((1,'bound'),(81,'ground'),(161,'grip'),(241,'stand'))
for frame,name in poses:
    scene.frame_set(frame);bpy.context.view_layer.update();save_neutral_glb('blocking-'+name+'.glb',posed=True,others=others,animations=False)
    print('STATIC EXPORTED',name,flush=True)
