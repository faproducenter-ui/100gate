"""Choose a continuous CMC-opposition/MCP/IP path on the accepted static rig."""
import bpy,json,sys
from pathlib import Path
from mathutils import Quaternion
sys.path.insert(0,str(Path(__file__).resolve().parent))
from hand_mesh_audit import snapshot,whole_hand_self_crossings,audit
out=Path.cwd()/'outputs/hand-mesh-rework';s=bpy.context.scene
r=next(o for o in s.objects if o.type=='ARMATURE');b=next(o for o in s.objects if o.type=='MESH' and o.name.endswith('MakeHuman body'));k=next(o for o in s.objects if o.type=='EMPTY')
names=[f'thumb_0{j}_r' for j in (1,2,3)];final=[r.pose.bones[n].rotation_quaternion.copy() for n in names]
results=[]
def pose(pre,u):
    for n,q,f in zip(names,final,(pre+(1-pre)*u,u,u)):r.pose.bones[n].rotation_quaternion=Quaternion().slerp(q,f)
    bpy.context.view_layer.update()
for pre in (.55,.65,.75,.85,.9,1):
    failures=[]
    for i in range(21):
        u=i/20;pose(pre,u);v,t,l,_=snapshot(b,r,k);whole=whole_hand_self_crossings(v,t,l)
        if whole['pairs']:failures.append({'u':u,'pairs':whole['pairs']})
    entry={'preOpposition':pre,'failures':failures};results.append(entry);print('THUMB PATH',json.dumps(entry),flush=True)
valid=[v for v in results if not v['failures']]
if valid:
    # Keep as much of the natural opposed pre-shape as possible, then complete
    # opposition together with MCP/IP flexion instead of holding CMC rigid.
    selected=max(valid,key=lambda v:v['preOpposition'])['preOpposition'];contact=[]
    for i in range(21):
        pose(selected,i/20);a=audit(b,r,k);bad={d:v for d,v in a.items() if v['insideVertices'] or v['surfaceCrossings']}
        contact.append({'u':i/20,'failures':bad});print('PATH CONTACT',i,not bad,flush=True)
    result={'candidates':results,'selected':selected,'contact':contact}
else:result={'candidates':results,'selected':None}
(out/'thumb-path.json').write_text(json.dumps(result,indent=2))
if not valid or any(v['failures'] for v in result['contact']):raise RuntimeError('No accepted thumb path')
