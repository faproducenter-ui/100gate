"""Local native weight-paint smoothing at observed skin-fold intersections.

Original MakeHuman coordinates, faces, UVs and textures remain unchanged.
Only weights near actual folded triangles are touched; fingertips are not
scaled, shortened or hidden. Not a global blur of the hand's skinning.
"""
import bpy,json,sys,os,numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from hand_mesh_audit import snapshot,audit,whole_hand_self_crossings
out=Path.cwd()/'outputs/hand-mesh-rework';s=bpy.context.scene
r=next(o for o in s.objects if o.type=='ARMATURE');b=next(o for o in s.objects if o.type=='MESH' and o.name.endswith('MakeHuman body'));k=next(o for o in s.objects if o.type=='EMPTY')
groups=[g for g in b.vertex_groups if g.name.endswith('_r') and (g.name=='hand_r' or g.name.startswith(('thumb_','index_','middle_','ring_','pinky_')))]
group_map={g.index:j for j,g in enumerate(groups)};W=np.zeros((len(b.data.vertices),len(groups)))
for v in b.data.vertices:
    for g in v.groups:
        if g.group in group_map:W[v.index,group_map[g.group]]=g.weight
original=W.copy();totals=W.sum(axis=1)
adj=[[] for _ in b.data.vertices]
for e in b.data.edges:
    a,z=e.vertices;adj[a].append(z);adj[z].append(a)
skin=next(m for m in b.modifiers if m.type=='ARMATURE');skin.show_viewport=False;bpy.context.view_layer.update()
deps=bpy.context.evaluated_depsgraph_get();ev=b.evaluated_get(deps);mesh=ev.to_mesh(preserve_all_data_layers=True,depsgraph=deps)
rest=[v.co.copy() for v in mesh.vertices];ev.to_mesh_clear()
saved_mods={m:m.show_viewport for m in b.modifiers}
for m in b.modifiers:m.show_viewport=False
bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();ev=b.evaluated_get(deps)
base_mesh=ev.to_mesh(preserve_all_data_layers=True,depsgraph=deps)
assert len(base_mesh.vertices)==len(b.data.vertices)
kd=KDTree(len(b.data.vertices))
for v in base_mesh.vertices:kd.insert(v.co,v.index)
ev.to_mesh_clear()
for m,enabled in saved_mods.items():m.show_viewport=enabled
skin.show_viewport=True;bpy.context.view_layer.update()
kd.balance();mask=set();history=[]
for step in range(8):
    points,triangles,labels,_=snapshot(b,r,k)
    faces=[f for f in triangles if any(labels[i] for i in f)];sets=[set(f) for f in faces]
    tree=BVHTree.FromPolygons(points,faces,all_triangles=True)
    hits=[(a,z) for a,z in tree.overlap(tree) if a<z and not sets[a].intersection(sets[z])]
    history.append({'round':step,'foldPairs':len(hits),'baseVerticesSmoothed':len(mask)})
    print('WEIGHT REPAIR',history[-1],flush=True)
    if not hits:break
    for a,z in hits:
        for i in (*faces[a],*faces[z]):
            for _,j,distance in kd.find_range(rest[i],float(os.environ.get('GATE_WEIGHT_RADIUS','.0045'))):
                if totals[j]>.8:mask.add(j)
    ids=np.array(sorted(mask),dtype=int)
    if not len(ids):
        example=faces[hits[0][0]][0]
        raise RuntimeError('No source neighbours: '+str((list(rest[example]),kd.find(rest[example]),max(totals))))
    for _ in range(8):
        means=np.array([np.mean(W[adj[i]],axis=0) if adj[i] else W[i] for i in ids])
        W[ids]=W[ids]*.5+means*.5
        W[ids]*=(totals[ids]/np.maximum(W[ids].sum(axis=1),1e-20))[:,None]
    for i in ids:
        for j,g in enumerate(groups):
            if W[i,j]>1e-8:g.add([int(i)],float(W[i,j]),'REPLACE')
            else:g.remove([int(i)])
    bpy.context.view_layer.update()
points,tris,labels,_=snapshot(b,r,k);whole=whole_hand_self_crossings(points,tris,labels)
report={'history':history,'finalSelf':whole,'contact':audit(b,r,k),
        'changedBaseVertices':int(np.sum(np.max(np.abs(W-original),axis=1)>1e-6)),
        'maxWeightDelta':float(np.max(np.abs(W-original))),
        'method':'Local weight-paint smoothing only; original mesh/UV/materials/proportions untouched.'}
(out/'local-weight-repair.json').write_text(json.dumps(report,indent=2))
s['local_hand_weight_repair']=json.dumps({'changedBaseVertices':report['changedBaseVertices'],'history':history})
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(out/'static-local-weights.blend'),compress=True)
print('WEIGHTS FINAL',json.dumps(report),flush=True)
if whole['pairs']:raise RuntimeError('Local folds remain; do not animate')
