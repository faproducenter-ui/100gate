"""Reversible glTF-equivalent actor authoring: subdivision, THEN four weights.

Original cages, native weights, identity keys and modifiers are archived intact
in a hidden source collection. The one visible actor is the exact same evaluated
bind geometry/UV/materials, with explicit four-influence skinning. No new human
mesh is generated or approximated. Corrective keys remain independently editable.
"""
import bpy,json,sys
from pathlib import Path

ROOT=Path.cwd();OUT=ROOT/'outputs/cinematic-intro';OUT.mkdir(parents=True,exist_ok=True)
scene=bpy.context.scene;scene.frame_set(1);bpy.context.view_layer.update()
rig=next(o for o in scene.objects if o.type=='ARMATURE')
body=next(o for o in scene.objects if o.type=='MESH' and o.name.endswith('MakeHuman body'))
actors=[o for o in scene.objects if o.type=='MESH' and o.name.startswith(body.name)]
archive=bpy.data.collections.new('AUTHORING SOURCES | native cages · restore before editing identity')
scene.collection.children.link(archive);report=[]

def cap_four(obj):
    groups={g.index:g for g in obj.vertex_groups if g.name in rig.data.bones}
    changed=0;lost=[];maximum=0
    for v in obj.data.vertices:
        ws=sorted(((g.weight,g.group) for g in v.groups if g.group in groups and g.weight>1e-10),key=lambda x:(-x[0],x[1]))
        maximum=max(maximum,len(ws));keep=ws[:4];total=sum(w for w,_ in keep)
        if not total:raise RuntimeError(f'Unweighted runtime vertex {obj.name}/{v.index}')
        if len(ws)>4:changed+=1;lost.append(sum(w for w,_ in ws[4:]))
        for _,index in ws[4:]:groups[index].remove([v.index])
        for w,index in keep:groups[index].add([v.index],w/total,'REPLACE')
    return maximum,changed,lost

def evaluated_mesh(obj):
    bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
    return bpy.data.meshes.new_from_object(obj.evaluated_get(deps),preserve_all_data_layers=True,depsgraph=deps)

for obj in actors:
    original=obj.data;copy=obj.copy();copy.name='SOURCE | '+obj.name
    copy['authoring_archive']=True;archive.objects.link(copy)
    copy.hide_render=True;copy.hide_set(True)
    armature=next(m for m in obj.modifiers if m.type=='ARMATURE');armature.show_viewport=False
    if obj==body:
        # Occlusion must not change the skin's shape. Masking shoulder patches
        # BEFORE Catmull-Clark made open boundary vertices shrink differently
        # from the complete body under the sweater. Subdivide the native skin
        # first; only then remove covered skin on the runtime authoring copy.
        detail=next((m for m in obj.modifiers if m.type=='SUBSURF'),None)
        if detail:
            bpy.context.view_layer.objects.active=obj
            while list(obj.modifiers).index(detail)>1:bpy.ops.object.modifier_move_up(modifier=detail.name)
    keys=original.shape_keys
    cine=[k for k in keys.key_blocks if k.name.startswith('Cine · ')] if keys else []
    saved={k.name:k.value for k in cine}
    ad=keys.animation_data if keys else None
    action=ad.action if ad else None;slot=ad.action_slot if ad and action else None
    if ad:ad.action=None
    for k in cine:k.value=0
    base=evaluated_mesh(obj);base.name=obj.name+' | runtime bind · original surface'
    if obj==body:
        # Full underlying native skin for garment authoring, never rendered or
        # exported. The source wardrobe masks still govern the visible body.
        masks={m:m.show_viewport for m in obj.modifiers if m.type=='MASK' and m.name!='Hide helpers'}
        for m in masks:m.show_viewport=False
        reference=evaluated_mesh(obj)
        for m,on in masks.items():m.show_viewport=on
        ref=bpy.data.objects.new('REFERENCE | complete native skin under wardrobe',reference)
        scene.collection.objects.link(ref);ref.parent=rig;ref.matrix_world=obj.matrix_world.copy()
        for g in obj.vertex_groups:ref.vertex_groups.new(name=g.name)
        deform=ref.modifiers.new('Four-weight skin reference','ARMATURE');deform.object=rig
        cap_four(ref);ref['authoring_archive']=True;ref['cloth_reference']=True
        ref.hide_render=True;ref.hide_set(True)
    morphs={}
    for key in cine:
        key.value=1;mesh=evaluated_mesh(obj)
        assert len(mesh.vertices)==len(base.vertices),'Corrective changed topology'
        morphs[key.name]=[v.co.copy() for v in mesh.vertices]
        bpy.data.meshes.remove(mesh);key.value=0
    # Restore the untouched archived authoring data, including action binding.
    for k in cine:k.value=saved[k.name]
    if ad and action:
        ad.action=action
        if slot:ad.action_slot=slot
    armature.show_viewport=True
    obj.data=base
    for mod in list(obj.modifiers):
        if mod!=armature:obj.modifiers.remove(mod)
    armature.use_deform_preserve_volume=False
    if morphs:
        obj.shape_key_add(name='Basis',from_mix=False)
        for name,coords in morphs.items():
            key=obj.shape_key_add(name=name,from_mix=False)
            for v,co in zip(key.data,coords):v.co=co
            key.value=saved[name]
        if action:
            new_ad=obj.data.shape_keys.animation_data_create();new_ad.action=action
            if slot:new_ad.action_slot=slot
    maximum,changed,lost=cap_four(obj)
    obj['runtime_skin_contract']='Original evaluated bind surface; explicit <=4 normalised bone influences, linear skin'
    obj['source_cage_object']=copy.name
    obj['runtime_correctives']=json.dumps(list(morphs))
    report.append({'mesh':obj.name,'originalCageVertices':len(original.vertices),'runtimeBindVertices':len(base.vertices),
        'sourceMaxInfluences':maximum,'runtimeMaxInfluences':max(sum(obj.vertex_groups[g.group].name in rig.data.bones and g.weight>1e-10 for g in v.groups) for v in base.vertices),
        'reweightedVertices':changed,'maxDiscardedWeight':max(lost,default=0),'correctives':list(morphs),
        'originalMeshRetained':copy.data==original,'uvLayers':list(base.uv_layers.keys())})
    print('RUNTIME SKIN',json.dumps(report[-1]),flush=True)

archive.hide_render=True;archive.hide_viewport=True
scene['runtime_skin_four_weights']=True
scene['runtime_skin_source']='art/intro-cinematic-blocking.blend · original control cages retained in AUTHORING SOURCES'
scene.name='100gate | Runtime-equivalent skin · static gate'
scene.frame_set(1);bpy.context.view_layer.update()
(OUT/'runtime-skin-preparation.json').write_text(json.dumps(report,indent=2))
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'cinematic-runtime-skin.blend'),compress=True)
print('Prepared one visible actor, preserved original cages, no animation/integration claim.',flush=True)
