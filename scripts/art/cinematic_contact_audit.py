"""Actual source-mesh contacts at the static cinematic gates; no visual pass."""
import bpy,sys,json
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from hand_mesh_audit import audit,closed_inside,snapshot,whole_hand_self_crossings
out=Path.cwd()/'outputs/cinematic-intro';s=bpy.context.scene
r=next(o for o in s.objects if o.type=='ARMATURE');body=next(o for o in s.objects if o.type=='MESH' and o.name.endswith('MakeHuman body'));knife=next(o for o in s.objects if o.type=='EMPTY')
chair=next(o for o in s.objects if o.type=='MESH' and o.name=='old-chair')
actor=[o for o in s.objects if o.type=='MESH' and o.name.startswith(body.name)]
from cinematic_geometry import getmesh,closed_parts

results=[]
poses=((1,'bound'),) if s.get('bound_restraints_only') else ((1,'bound'),(81,'ground'),(161,'grip'),(241,'stand'))
for frame,label in poses:
    s.frame_set(frame);bpy.context.view_layer.update();cp,ct=getmesh(chair);cb=BVHTree.FromPolygons(cp,ct,all_triangles=True)
    pieces,open_pieces=closed_parts(cp,ct)
    row={'name':label,'frame':frame,'actor':[],'chairClosedComponents':len(pieces),'chairOpenComponentTriangleCounts':open_pieces,'containmentScope':'watertight components only; open components get surface intersection tests'}
    meshes={}
    for obj in actor:
        points,tris=getmesh(obj);meshes[obj.name]=(points,tris)
        inside=[]
        for i,p in enumerate(points):
            depths=[]
            for tree,low,high in pieces:
                if not all(low[j]<=p[j]<=high[j] for j in range(3)):continue
                loc,n,_,distance=tree.find_nearest(p)
                if distance>.0001 and closed_inside(tree,p)[0]:depths.append(distance*1000)
            if depths:inside.append({'vertex':i,'depthMm':max(depths)})
        crossings=BVHTree.FromPolygons(points,tris,all_triangles=True).overlap(cb)
        row['actor'].append({'mesh':obj.name,'minimumFloorMm':min(v.z for v in points)*1000,
            'chairCrossings':len(crossings),'chairInsideVertices':len(inside) if pieces else None,'maxChairDepthMm':max((v['depthMm'] for v in inside),default=0) if pieces else None,
            'worst':sorted(inside,key=lambda v:-v['depthMm'])[:3]})
    shirt=next(v for name,v in meshes.items() if 'fisherman' in name);pants=next(v for name,v in meshes.items() if 'cargo' in name)
    row['shirtPantsTriangleCrossings']=len(BVHTree.FromPolygons(*shirt,all_triangles=True).overlap(BVHTree.FromPolygons(*pants,all_triangles=True)))
    if label=='grip':
        row['knife']=audit(body,r,knife);p,t,l,_=snapshot(body,r,knife);row['handSelf']=whole_hand_self_crossings(p,t,l)
    ropes=[o for o in s.objects if o.type=='MESH' and 'intact wrist-to-chair rope' in o.name]
    if ropes:
        row['ropeContacts']=[]
        for rope in ropes:
            p,t=getmesh(rope);tree=BVHTree.FromPolygons(p,t,all_triangles=True)
            row['ropeContacts'].append({'mesh':rope.name,'chairTriangleCrossings':len(tree.overlap(cb)),
                'actorTriangleCrossings':{name:len(tree.overlap(BVHTree.FromPolygons(*data,all_triangles=True))) for name,data in meshes.items()},
                'minFloorMm':min(v.z for v in p)*1000})
    results.append(row);print('CONTACT',label,json.dumps(row),flush=True)
(out/('bound-rope-contacts.json' if s.get('bound_restraints_only') else 'source-static-contacts.json')).write_text(json.dumps(results,indent=2))
print('Diagnostic contacts saved. Non-zero floor/seat/cloth issues require interpretation and visual correction.',flush=True)
