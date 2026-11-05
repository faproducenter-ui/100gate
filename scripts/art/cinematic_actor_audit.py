"""Read-only audit of the existing actor/wardrobe/chair for new intro blocking."""
import bpy,json,math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
out=Path.cwd()/'outputs/cinematic-intro';out.mkdir(parents=True,exist_ok=True)
s=bpy.context.scene;s.frame_set(241);bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
r=next(o for o in s.objects if o.type=='ARMATURE');b=next(o for o in s.objects if o.type=='MESH' and o.name.endswith('MakeHuman body'))
def bounds(v):return {'min':[min(p[j] for p in v) for j in range(3)],'max':[max(p[j] for p in v) for j in range(3)]}
objects=[];supports=[]
for o in s.objects:
    if o.type!='MESH':continue
    ev=o.evaluated_get(deps);m=ev.to_mesh(preserve_all_data_layers=True,depsgraph=deps);m.calc_loop_triangles()
    vs=[ev.matrix_world@v.co for v in m.vertices]
    adj=[[] for _ in m.vertices]
    for e in m.edges:
        a,z=e.vertices;adj[a].append(z);adj[z].append(a)
    seen=set();components=[]
    for i in range(len(vs)):
        if i in seen:continue
        seen.add(i);todo=[i];ids=[]
        while todo:
            j=todo.pop();ids.append(j)
            for n in adj[j]:
                if n not in seen:seen.add(n);todo.append(n)
        components.append({'vertices':len(ids),'bounds':bounds([vs[j] for j in ids])})
    if 'chair' in o.name.lower():
        for face in m.polygons:
            n=ev.matrix_world.to_3x3()@face.normal
            if n.z>.85 and face.area>.0002:
                ps=[vs[i] for i in face.vertices];center=sum(ps,Vector())/len(ps)
                if abs(center.x)<.3 and abs(center.y)<.4:supports.append({'z':center.z,'area':face.area,'center':list(center)})
    objects.append({'name':o.name,'vertices':len(o.data.vertices),'evaluatedVertices':len(m.vertices),'triangles':len(m.loop_triangles),
        'bounds':bounds(vs),'components':sorted(components,key=lambda x:-x['vertices'])[:12],
        'parent':o.parent.name if o.parent else None,'scale':list(o.scale),
        'modifiers':[{'name':mod.name,'type':mod.type,'enabled':mod.show_viewport} for mod in o.modifiers]})
    ev.to_mesh_clear()
bones=[{'name':p.name,'parent':p.parent.name if p.parent else None,'length':p.length,
        'restHead':list(p.bone.head_local),'restTail':list(p.bone.tail_local),
        'head':list(r.matrix_world@p.head),'tail':list(r.matrix_world@p.tail)} for p in r.pose.bones]
keys=[{'name':k.name,'value':k.value} for k in b.data.shape_keys.key_blocks] if b.data.shape_keys else []
report={'source':bpy.data.filepath,'rigWorld':[list(row) for row in r.matrix_world],'objects':objects,'bones':bones,
        'shapeKeys':keys,'chairSupportFaces':sorted(supports,key=lambda x:x['z']),
        'images':[{'name':i.name,'size':list(i.size),'packed':bool(i.packed_file)} for i in bpy.data.images if i.has_data]}
(out/'actor-audit.json').write_text(json.dumps(report,indent=2))
print('RIG',r.name,'matrix',report['rigWorld'],flush=True)
for obj in objects:print('MESH',obj['name'],obj['bounds'],'components',[(v['vertices']) for v in obj['components']],flush=True)
for bone in bones:
    if not any(bone['name'].startswith(d+'_') for d in ('thumb','index','middle','ring','pinky')):print('BONE',json.dumps(bone),flush=True)
print('SEAT FACES',json.dumps(report['chairSupportFaces']),flush=True)
