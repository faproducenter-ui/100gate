"""Static mesh-contact polish, constrained to existing finger hinge rotations."""
import bpy,sys,json,math
from pathlib import Path
from mathutils import Quaternion,Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from hand_mesh_audit import audit,self_crossings
root=Path.cwd();out=root/'outputs/hand-mesh-rework';s=bpy.context.scene
r=next(o for o in s.objects if o.type=='ARMATURE')
b=next(o for o in s.objects if o.type=='MESH' and o.name.endswith('MakeHuman body'))
k=next(o for o in s.objects if o.type=='EMPTY')
controls=json.loads(s['new_static_grip_hinges'])
angles=json.loads(s['new_static_grip_parameters'])
def evaluate():
    report=audit(b,r,k)
    crossings=self_crossings(b,r,k)
    score=sum(v['insideVertices']*300+sum(v['surfaceCrossings'].values())*12+
              min(0,v.get('minSignedMm',0))**2*100000 for v in report.values())
    score+=sum(v['pairs']*2000 for v in crossings.values())
    score+=sum(max(0,v['minSignedMm']-.7)**2 for name,v in report.items() if name not in ('palm','other'))
    return score,report,crossings
best,contact,self_hits=evaluate()
print('START',best,json.dumps(self_hits),flush=True)
for step in (.6,.25,.1):
    for _ in range(2):
        improved=False
        for digit in ('index','middle','ring','pinky'):
            for j,control in enumerate(controls[digit]):
                bone=r.pose.bones[control['bone']]
                base=bone.rotation_quaternion.copy()
                chosen=0.
                for sign in (-1,1):
                    delta=sign*step
                    if not control['minDeltaDeg']<=angles[digit][j]+delta<=control['maxDeltaDeg']:continue
                    bone.rotation_quaternion=base@Quaternion(Vector(control['axis']),math.radians(delta))
                    bpy.context.view_layer.update()
                    merit,report,hits=evaluate()
                    if merit<best-1e-5:
                        best=merit;chosen=delta;contact=report;self_hits=hits
                bone.rotation_quaternion=base@Quaternion(Vector(control['axis']),math.radians(chosen))
                angles[digit][j]+=chosen
                bpy.context.view_layer.update()
                improved=improved or chosen!=0.
        print('PASS',step,best,flush=True)
        if not improved:break
s['new_static_grip_parameters']=json.dumps(angles)
out.joinpath('polished-static-mesh.json').write_text(json.dumps({'contact':contact,'selfCrossings':self_hits,'parameters':angles},indent=2))
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(out/'static-hand-contact-polished.blend'),compress=True)
failed=any(v['insideVertices'] or any(v['surfaceCrossings'].values()) for v in contact.values()) or bool(self_hits)
print('STATIC ACTUAL-MESH GATE',not failed,json.dumps(contact),flush=True)
if failed:raise RuntimeError('Static mesh contact still fails. Do not animate.')
