"""Actual evaluated complete-intro geometry/attachment continuity gates."""
import bpy,json,sys,hashlib
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from cinematic_geometry import getmesh
from hand_mesh_audit import audit
s=bpy.context.scene;assert s.get('complete_native_intro')
r=next(o for o in s.objects if o.type=='ARMATURE' and 'MPFB' in o.name)
body=next(o for o in s.objects if o.type=='MESH' and o.name.endswith('MakeHuman body') and not o.get('authoring_archive'))
knife=s.objects['Cinematic field knife'];chair=s.objects['old-chair'];wood=s.objects['Left rail | impact fracture fragment']
actor=[o for o in s.objects if o.type=='MESH' and o.name.startswith('Alexei | original MakeHuman body') and not o.get('authoring_archive')]
ropes=[o for o in s.objects if 'intact wrist-to-chair rope' in o.name]
rows=[];grips=[]
times={16.5,17,17.5,18,18.5,19,19.5,20,20.5,21,22,23.5,25.5,26.4,27,27.5,29,30.5,31.9,32.5,34,35.8,36,37,38,39,40,41,42}
if '--dense' in sys.argv:times.update(16.5+i/6 for i in range(154))
for t in sorted(times):
 f=1+t*24;s.frame_set(int(f),subframe=f-int(f));bpy.context.view_layer.update()
 objects=actor+ropes+[chair,wood]+[o for o in knife.children_recursive if o.type=='MESH']
 geometry={o.name:getmesh(o) for o in objects}
 trees={n:BVHTree.FromPolygons(*data,all_triangles=True) for n,data in geometry.items()}
 contacts=[{'a':a.name,'b':b.name,'crossings':len(trees[a.name].overlap(trees[b.name]))} for a in actor for b in (chair,wood)]
 floor={n:min(p.z for p in data[0])*1000 for n,data in geometry.items()}
 row={'time':t,'floorMinMm':floor,'contacts':contacts};rows.append(row)
 print('GEOMETRY',t,'floor',round(min(floor.values()),2),'chair',sum(c['crossings'] for c in contacts),flush=True)
 if t in (19,19.5,20,20.5,21,22,25.5,29) or ('--dense' in sys.argv and 19<=t<31.9):
  grip=audit(body,r,knife,side='l');grips.append({'time':t,'digits':grip})
  print('GRIP',t,{d:(x.get('minSignedMm'),x['insideVertices']) for d,x in grip.items()},flush=True)
out=Path.cwd()/'outputs/complete-intro'
(out/'geometry-audit.json').write_text(json.dumps({'sourceSha256':hashlib.sha256(Path(bpy.data.filepath).read_bytes()).hexdigest(),'samples':rows,'grips':grips},indent=2))
assert all(mm> -1 for row in rows for mm in row['floorMinMm'].values()),'Surface below floor: fix staging before deploy'
assert not any(c['crossings'] for row in rows for c in row['contacts']),'Body crosses chair/fragment: do not deploy'
assert not any(d['insideVertices'] for row in grips for d in row['digits'].values()),'Hand/knife penetration: do not deploy'
