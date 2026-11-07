"""Check actual mesh contact on the new seated clip, separate from FSM tests."""
import bpy,sys,json,hashlib
from pathlib import Path
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from cinematic_geometry import getmesh
from hand_mesh_audit import audit
s=bpy.context.scene;r=s.objects['StoryEscape_Alexei'];k=s.objects['StoryEscape_Knife'];chair=s.objects['StoryEscape_Chair']
body=next(o for o in s.objects if o.parent==r and o.name.endswith('MakeHuman body'))
actor=[o for o in s.objects if o.type=='MESH' and o.parent==r]
chairBVH=BVHTree.FromPolygons(*getmesh(chair),all_triangles=True)
rows=[]
times={0,3.5,6.1,7.3,9.5,10.9,11.8,12.1,12.5,12.8,13,13.4,14.2,15.3,16.5,17.4,18.15,19.5,21.9,23.2}
if '--dense' in sys.argv:times.update(11.8+i/24 for i in range(31))
for t in sorted(times):
    f=1+t*s.render.fps;s.frame_set(int(f),subframe=f-int(f));bpy.context.view_layer.update()
    meshes={o.name:getmesh(o) for o in actor}
    row={'t':t,'chairCrossings':{n:len(chairBVH.overlap(BVHTree.FromPolygons(*m,all_triangles=True))) for n,m in meshes.items()},
        'footFloorMm':min(v.z for o in actor if 'boots' in o.name for v in meshes[o.name][0])*1000}
    if 11.8<=t<18.1:row['grip']=audit(body,r,k,side='l')
    rows.append(row)
    print('AUDIT',t,'chair crossings',sum(row['chairCrossings'].values()),'sole mm',round(row['footFloorMm'],1),
        'penetrating',sum(d['insideVertices'] for d in row.get('grip',{}).values()),flush=True)
out=Path.cwd()/'outputs/story-intro/escape/geometry-audit.json'
out.write_text(json.dumps({'blendSha256':hashlib.sha256(Path(bpy.data.filepath).read_bytes()).hexdigest(),'samples':rows},indent=2))
