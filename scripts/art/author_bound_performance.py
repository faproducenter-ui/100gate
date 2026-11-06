"""Native skeletal BOUND idle/struggle ONLY; not the complete escape intro.

Chair support edges, planted feet and fixed chair-relative wrist frames drive
the authored IK bake. Torso anticipation/lag is separate from chair roll.
No independent procedural hands or whole-scene pendulum animation.
"""
import bpy,math,json,ast,sys
from pathlib import Path
from mathutils import Vector,Matrix,Quaternion
sys.path.insert(0,str(Path(__file__).resolve().parent))
from cinematic_geometry import getmesh
from native_pose_tools import two_bone_ik
out=Path.cwd()/'outputs/cinematic-intro';s=bpy.context.scene;s.frame_set(1);bpy.context.view_layer.update()
assert s.get('bound_restraints_only'), 'Author and save the complete static restraints gate first'
assert len([o for o in s.objects if 'intact wrist-to-chair rope' in o.name])==2, 'Do not animate a failed/empty restraint source'
r=next(o for o in s.objects if o.type=='ARMATURE');chair=s.objects['old-chair']
for side in ('r','l'):
    hand=r.pose.bones['hand_'+side]
    forward=sum((r.pose.bones[d+'_01_'+side].head for d in ('index','middle','ring','pinky')),Vector())/4-hand.head
    forearm=hand.head-r.pose.bones['lowerarm_'+side].head
    deviation=math.degrees(forward.angle(forearm))
    assert deviation<25, f'Rejected old extreme wrist pose {side}: {deviation:.2f} degrees'
r['bound_wrist_alignment']='Native metacarpal/forearm deviation <25 degrees; validate all imported frames'
knife=next(o for o in s.objects if o.type=='EMPTY')
body=next(o for o in s.objects if o.type=='MESH' and o.name.endswith('MakeHuman body') and not o.get('authoring_archive'))
shirt=next(o for o in s.objects if o.type=='MESH' and 'fisherman' in o.name and not o.get('authoring_archive'))
eyes=next(o for o in s.objects if o.type=='MESH' and 'low-poly' in o.name and not o.get('authoring_archive'))
fp=next(o for o in s.objects if o.type=='CAMERA' and o.name=='Cine · First person')
functions=[n for n in ast.parse((Path.cwd()/'scripts/art/cinematic_blocking.py').read_text()).body if isinstance(n,ast.FunctionDef) and n.name in ('update','aim','rotate','ik')]
exec(compile(ast.Module(body=functions,type_ignores=[]),'native-performance-ik','exec'))
root=r.matrix_world.copy();chair_rest=chair.matrix_world.copy();knife_rest=knife.matrix_world.copy()
bases={p.name:p.matrix_basis.copy() for p in r.pose.bones}
wrist={side:(r.matrix_world@r.pose.bones['hand_'+side].matrix) for side in ('r','l')}
elbow={side:r.matrix_world@r.pose.bones['lowerarm_'+side].head for side in ('r','l')}
feet={side:r.matrix_world@r.pose.bones['foot_'+side].matrix for side in ('r','l')}
knees={side:r.matrix_world@r.pose.bones['calf_'+side].head for side in ('r','l')}
chair_points,_=getmesh(chair);minz=min(p.z for p in chair_points)
contact=[p for p in chair_points if p.z<minz+.003]
left=min(p.x for p in contact);right=max(p.x for p in contact)
for o in (r,chair,knife,fp):o.animation_data_clear();o.rotation_mode='QUATERNION'
knife.matrix_world=knife_rest
if shirt.data.shape_keys.animation_data:shirt.data.shape_keys.animation_data_clear()
for obj in s.objects:
    if obj.get('authoring_archive'):
        for mod in obj.modifiers:
            mod.show_viewport=mod.show_render=False
s.frame_start=1;s.frame_end=289;s.render.fps=24
for marker in list(s.timeline_markers):s.timeline_markers.remove(marker)
s.timeline_markers.new('BoundChairIdle · NOT full intro',frame=1)
s.timeline_markers.new('ChairStruggle',frame=97)
s.timeline_markers.new('END OF AUTHORED FRAGMENT · fall not implemented',frame=289)
metrics=[]
def local_rotate(name,axis,degrees):
    p=r.pose.bones[name];local=p.bone.matrix_local.to_3x3().inverted()@Vector(axis)
    p.rotation_quaternion=p.rotation_quaternion@Quaternion(local.normalized(),math.radians(degrees))
for frame in range(1,290):
    s.frame_set(frame)
    t=(frame-1)/24;u=max(0,(t-4)/8)
    # A real loop before player effort; then asymmetric effort bouts with
    # torso anticipation and delayed chair response, not one shared sine.
    breath=(1-math.cos(2*math.pi*t/4))*.5
    envelope=(math.sin(math.pi*min(1,u))**.7) if t>4 else 0
    phase=2*math.pi*((t-4)*.75+.022*(t-4)**2)
    effort=math.sin(phase)*envelope
    theta=math.radians(2.8)*math.sin(phase-.42)*envelope
    pivot=Vector((right if theta>=0 else left,.05,minz))
    delta=Matrix.Translation(pivot)@Quaternion((0,1,0),theta).to_matrix().to_4x4()@Matrix.Translation(-pivot)
    # Exact wood support against the floor, rather than an AABB-centre pivot.
    delta.translation.z-=min((delta@p).z for p in chair_points)
    chair.matrix_world=delta@chair_rest;r.matrix_world=delta@root
    # The pelvis unweights the supporting seat during effort. Keep the
    # original garment clear of the real slat instead of letting the axial
    # pelvis roll push its underside through the wood. Feet and wrists are
    # solved back to their support/contact frames below.
    r.matrix_world.translation.z+=.003*effort*effort
    for p in r.pose.bones:p.matrix_basis=bases[p.name]
    local_rotate('pelvis',(0,1,0),effort*.55)
    local_rotate('spine_01',(0,1,0),effort*2.2)
    local_rotate('spine_02',(0,1,0),math.sin(phase+.15)*envelope*1.0)
    local_rotate('spine_01',(1,0,0),breath*.45)
    local_rotate('spine_02',(1,0,0),-breath*.25)
    local_rotate('neck_01',(0,1,0),-effort*.55)
    local_rotate('head',(1,0,0),-breath*.3+math.sin(phase-.25)*envelope*.35)
    update()
    for side,sign in (('r',-1),('l',1)):
        target=delta@wrist[side]
        two_bone_ik(r,side,target.translation,delta@elbow[side],target.to_3x3())
        foot=feet[side].copy();lift=max(0,-sign*effort)*.004;foot.translation.z+=lift
        two_bone_ik(r,side,foot.translation,knees[side],foot.to_3x3(),kind='leg')
    update()
    head=r.pose.bones['head'];rotation=r.matrix_world.to_3x3()@head.matrix.to_3x3()@head.bone.matrix_local.to_3x3().inverted()
    forward=(rotation@Vector((0,-1,0))).normalized();up=(rotation@Vector((0,0,1))).normalized()
    ep,_=getmesh(eyes);fp.location=sum(ep,Vector())/len(ep)+forward*.035
    direction=forward*math.cos(math.radians(60))-up*math.sin(math.radians(60))
    z=-direction.normalized();x=up.cross(z).normalized();y=z.cross(x).normalized();fp.rotation_quaternion=Matrix((x,y,z)).transposed().to_quaternion()
    for p in r.pose.bones:
        for prop in ('location','rotation_quaternion','scale'):p.keyframe_insert(prop,frame=frame,group=p.name)
    for o in (r,chair,fp):
        for prop in ('location','rotation_quaternion','scale'):o.keyframe_insert(prop,frame=frame)
    errors={side:(r.matrix_world@r.pose.bones['hand_'+side].head-(delta@wrist[side]).translation).length*1000 for side in ('r','l')}
    metrics.append({'frame':frame,'wristConstraintErrorMm':errors,'chairRollDeg':math.degrees(theta),
        'chairMinimumFloorMm':min((delta@p).z for p in chair_points)*1000})
    if frame%48==1:print('BAKED native BOUND frame',frame,flush=True)
for o in (r,chair,fp):
    action=o.animation_data.action;action.name='BoundChairPerformance_PARTIAL | '+o.name
    for slot in action.slots:
        for layer in action.layers:
            for strip in layer.strips:
                bag=strip.channelbag(slot)
                if bag:
                    for fc in bag.fcurves:
                        for p in fc.keyframe_points:p.interpolation='LINEAR'
s.name='BoundChairPerformance_PARTIAL'
r['cinematicPartial']=True;r['authoredPhases']=json.dumps([{'name':'BoundChairIdle','start':0,'end':4},{'name':'ChairStruggle','start':4,'end':12}])
r['missingPhases']='BalanceLoss/Fall/KnifeReach/Cut/Remove/Drop/Stand: NOT authored in this asset'
s['blocking_only']=False;s['bound_restraints_only']=False;s['bound_performance_partial']=True;s.frame_set(1);update()
(out/'bound-performance-constraints.json').write_text(json.dumps({'partial':True,'frames':metrics,'supportEdges':[left,right]},indent=2))
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(out/'bound-chair-performance-partial.blend'),compress=True)
