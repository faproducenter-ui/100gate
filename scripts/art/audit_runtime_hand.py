"""Audit the ACTUAL Three.js skinned triangles dumped by Playwright."""
import bpy,sys,json
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from hand_mesh_audit import KnifeSurface,audit_arrays,self_crossings_arrays,snapshot
out=Path.cwd()/'outputs/hand-mesh-rework'
data=json.loads((out/'three-actual-static.json').read_text())
hand=data['hand'];points=[Vector(v) for v in hand['positions']]
contact=audit_arrays(points,hand['triangles'],hand['labels'],KnifeSurface.from_data(data['parts']))
self_hits=self_crossings_arrays(points,hand['triangles'],hand['labels'])
scene=bpy.context.scene
body=next(o for o in scene.objects if o.type=='MESH' and o.name.endswith('MakeHuman body'))
rig=next(o for o in scene.objects if o.type=='ARMATURE');knife=next(o for o in scene.objects if o.type=='EMPTY')
source,source_tris,source_labels,_=snapshot(body,rig,knife)
source_tree=BVHTree.FromPolygons(source,source_tris,all_triangles=True)
runtime_tree=BVHTree.FromPolygons(points,hand['triangles'],all_triangles=True)
distances=[source_tree.find_nearest(p)[3]*1000 for p,label in zip(points,hand['labels']) if label]
distances += [runtime_tree.find_nearest(p)[3]*1000 for p,label in zip(source,source_labels) if label]
report={'basis':data['basis'],'contact':contact,'selfCrossings':self_hits,
        'maxBidirectionalHandSurfaceErrorMm':max(distances),'parts':[p['name'] for p in data['parts']]}
(out/'runtime-actual-mesh-audit.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
if self_hits or any(v['insideVertices'] or v['surfaceCrossings'] for v in contact.values()):
    raise RuntimeError('Actual runtime mesh penetrates a knife component or another digit. Do not animate.')
if max(distances)>.15:raise RuntimeError('Runtime skin differs from Blender by over 0.15 mm')
