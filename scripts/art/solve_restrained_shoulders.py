"""Fix the actual excessive humeral twist in the restrained static pose.

Elbow targets are selected under native-joint rotation and real chair-surface
constraints, while both wrist contact frames stay fixed. This precedes garment
sculpting; compensating a 120-degree shoulder twist with cloth inflation failed.
"""
import bpy,math,json,ast,sys
from pathlib import Path
from mathutils import Vector,Matrix,Quaternion
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from cinematic_geometry import getmesh
out=Path.cwd()/'outputs/cinematic-intro';s=bpy.context.scene;s.frame_set(1)
r=next(o for o in s.objects if o.type=='ARMATURE')
body=next(o for o in s.objects if o.type=='MESH' and o.name.endswith('MakeHuman body') and not o.get('authoring_archive'))
shirt=next(o for o in s.objects if o.type=='MESH' and 'fisherman' in o.name and not o.get('authoring_archive'))
functions=[n for n in ast.parse((Path.cwd()/'scripts/art/cinematic_blocking.py').read_text()).body if isinstance(n,ast.FunctionDef) and n.name in ('update','aim','ik')]
exec(compile(ast.Module(body=functions,type_ignores=[]),'native-two-bone-ik','exec'))
if r.animation_data and r.animation_data.action:r.animation_data.action=r.animation_data.action.copy()
key=shirt.data.shape_keys.key_blocks['Cine · Bound skin clearance'];key.value=0
chair_tree=BVHTree.FromPolygons(*getmesh(s.objects['old-chair']),all_triangles=True)
reports=[]
for side,sign in (('r',-1),('l',1)):
    names=['upperarm_'+side,'lowerarm_'+side,'hand_'+side]
    bases={n:r.pose.bones[n].matrix_basis.copy() for n in names}
    target=r.matrix_world@r.pose.bones['hand_'+side].head
    orientation=r.matrix_world.to_3x3()@r.pose.bones['hand_'+side].matrix.to_3x3()
    candidates=[]
    for yy in (.17,.22,.27,.32,.37,.42,.47):
        for zz in (.66,.72,.78,.84,.90,.96):
            for xx in (.26,.33,.40):
                for n in names:r.pose.bones[n].matrix_basis=bases[n]
                update();pole=(sign*xx,yy,zz);elbow=ik(side,target,pole,orientation=orientation)
                qu=r.pose.bones[names[0]].rotation_quaternion;ql=r.pose.bones[names[1]].rotation_quaternion
                su,tu=qu.to_swing_twist('Y');sl,tl=ql.to_swing_twist('Y');u=abs(math.degrees(tu));l=abs(math.degrees(tl))
                if u>90 or l>90 or su.angle>math.radians(85):continue
                if abs(elbow.x)<.20:continue
                candidates.append({'pole':pole,'upperTwist':u,'forearmTwist':l,'elbow':list(elbow),
                    'score':u*u*2+l*l+.25*math.degrees(su.angle)**2})
    candidates.sort(key=lambda c:c['score']);chosen=None
    for candidate in candidates[:30]:
        for n in names:r.pose.bones[n].matrix_basis=bases[n]
        update();ik(side,target,candidate['pole'],orientation=orientation)
        bp,bt=getmesh(body);candidate['bodyChairCrossings']=len(BVHTree.FromPolygons(bp,bt,all_triangles=True).overlap(chair_tree))
        # The torso/other arm stay unchanged. Only accept collision-free native
        # skin; garment contact is corrected on the new pose in the next step.
        if candidate['bodyChairCrossings']==0:chosen=candidate;break
    if chosen is None:raise RuntimeError('No feasible restrained shoulder '+side)
    for n in names:
        p=r.pose.bones[n]
        for prop in ('location','rotation_quaternion','scale'):p.keyframe_insert(prop,frame=1,group=n)
    chosen['side']=side;chosen['wristFrameErrorMm']=(r.matrix_world@r.pose.bones['hand_'+side].head-target).length*1000
    chosen['candidatesWithinJointLimits']=len(candidates);reports.append(chosen)
    print('SHOULDER',json.dumps(chosen),flush=True)
key.value=1;s.frame_set(1);update()
s['restrained_shoulder_refinement']=json.dumps(reports)
(out/'restrained-shoulder-solve.json').write_text(json.dumps(reports,indent=2))
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(out/'cinematic-shoulders-solved.blend'),compress=True)
