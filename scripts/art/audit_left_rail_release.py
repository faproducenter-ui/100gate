"""Actual prop/native surfaces and restraint semantics, not visual acceptance."""
import bpy,sys,json,hashlib
from pathlib import Path
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from cinematic_geometry import getmesh
s=bpy.context.scene;assert s.get('left_rail_failure')
actor=[o for o in s.objects if o.type=='MESH' and o.name.startswith('Alexei | original MakeHuman body') and not o.get('authoring_archive')]
chair=s.objects['old-chair'];fragment=s.objects['Left rail | impact fracture fragment']
ropes=[o for o in s.objects if o.type=='MESH' and 'intact wrist-to-chair rope' in o.name]
assert len(actor)==5 and len(ropes)==2
r=next(o for o in s.objects if o.type=='ARMATURE' and 'MPFB' in o.name)
s.frame_set(1);bpy.context.view_layer.update()
right_anchor=chair.matrix_world.inverted()@(r.matrix_world@r.pose.bones['hand_r'].head)
rows=[]
times=([12.25+i/96 for i in range(409)] if '--dense' in sys.argv else [0,4,8,11.8,12.3,12.5,12.6,13,13.4,14,14.5,15,15.4,16,16.5])
for t in times:
    f=1+t*48;s.frame_set(int(f),subframe=f-int(f));bpy.context.view_layer.update()
    meshes={o.name:getmesh(o) for o in actor+ropes+[chair,fragment]}
    trees={n:BVHTree.FromPolygons(*g,all_triangles=True) for n,g in meshes.items()}
    pairs=[(a.name,b.name) for a in actor for b in [chair,fragment]]
    pairs += [(a.name,b.name) for a in ropes for b in actor+[chair,fragment]]
    if t>12.7:pairs.append((chair.name,fragment.name))
    counts=[{'a':a,'b':b,'crossings':len(trees[a].overlap(trees[b]))} for a,b in pairs]
    bad=[c for c in counts if c['crossings']]
    drift=(chair.matrix_world.inverted()@(r.matrix_world@r.pose.bones['hand_r'].head)-right_anchor).length*1000
    row={'time':t,'rightWristAnchorDriftMm':drift,'contacts':counts,'floorMinMm':{n:min(p.z for p in g[0])*1000 for n,g in meshes.items()}}
    rows.append(row)
    if bad or len(rows)%24==1:print('LEFT_RELEASE',round(t,3),bad,flush=True)
out=Path.cwd()/'outputs/body-postfall'
result={'scope':'Actual partial release surfaces ONLY; no knife or visual acceptance','sourceSha256':hashlib.sha256(Path(bpy.data.filepath).read_bytes()).hexdigest(),'sampleCount':len(rows),'samples':rows}
(out/'left-release-contact.json').write_text(json.dumps(result,indent=2))
assert not any(c['crossings'] for row in rows for c in row['contacts']),'Actual surface crossings: do not promote this candidate'
assert all(mm> -1 for row in rows for mm in row['floorMinMm'].values()),'Floor penetration: do not promote'
assert max(row['rightWristAnchorDriftMm'] for row in rows)<1,'Right hand lost its chair anchor'
