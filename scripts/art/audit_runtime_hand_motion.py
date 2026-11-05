"""Actual imported Three.js triangles, source comparison at each sampled pose."""
import bpy,sys,json,time
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from hand_mesh_audit import KnifeSurface,audit_arrays,self_crossings_arrays,whole_hand_self_crossings,snapshot
out=Path.cwd()/'outputs/hand-mesh-rework'
top=json.loads((out/'motion-runtime-topology.json').read_text());surface=KnifeSurface.from_data(top['parts'])
s=bpy.context.scene;r=next(o for o in s.objects if o.type=='ARMATURE')
b=next(o for o in s.objects if o.type=='MESH' and o.name.endswith('MakeHuman body'));k=next(o for o in s.objects if o.type=='EMPTY')
report=[]
for file in sorted(out.glob('runtime-frame-*.json'),key=lambda f:int(f.stem.split('-')[-1])):
    data=json.loads(file.read_text());points=[Vector(p) for p in data['positions']]
    contact=audit_arrays(points,top['triangles'],top['labels'],surface)
    self_hits=self_crossings_arrays(points,top['triangles'],top['labels'])
    whole=whole_hand_self_crossings(points,top['triangles'],top['labels'],top['weld'])
    if whole['pairs']:self_hits['wholeHand']=whole
    frame=data['time']*24+1;s.frame_set(int(frame),subframe=frame%1)
    source,triangles,labels,_=snapshot(b,r,k)
    src=BVHTree.FromPolygons(source,triangles,all_triangles=True)
    glb=BVHTree.FromPolygons(points,top['triangles'],all_triangles=True)
    distances=[src.find_nearest(p)[3]*1000 for p,label in zip(points,top['labels']) if label]
    distances += [glb.find_nearest(p)[3]*1000 for p,label in zip(source,labels) if label]
    issues={d:v for d,v in contact.items() if v['insideVertices'] or v['surfaceCrossings']}
    entry={'time':data['time'],'contact':contact,'selfCrossings':self_hits,'sourceSurfaceErrorMm':max(distances),
           'failed':bool(issues or self_hits or max(distances)>.15)}
    report.append(entry);print('RUNTIME',data['time'],'FAILED',entry['failed'],'surface delta',round(max(distances),4),json.dumps(issues),json.dumps(self_hits),flush=True)
(out/'motion-runtime-mesh-audit.json').write_text(json.dumps(report,indent=2))
if any(f['failed'] for f in report):raise RuntimeError('Actual imported mesh/animation differs or penetrates')
