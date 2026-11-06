"""Extend the existing native BOUND performance with left-side fall/recovery.

Original 0..12 s keys are retained. Support is solved against evaluated human,
clothing, wood and rope surfaces; native torso/head/leg reaction and constrained
arms are baked, not a replacement procedural actor or uncontrolled ragdoll.
"""
import bpy, math, json, sys
from pathlib import Path
from mathutils import Matrix,Vector,Quaternion
sys.path.insert(0,str(Path(__file__).resolve().parent))
from cinematic_geometry import getmesh
from native_pose_tools import two_bone_ik

s=bpy.context.scene
assert s.get('bound_performance_partial')
s.frame_set(289);bpy.context.view_layer.update()
r=next(o for o in s.objects if o.type=='ARMATURE');chair=s.objects['old-chair']
eyes=next(o for o in s.objects if o.type=='MESH' and 'low-poly' in o.name and not o.get('authoring_archive'))
fp=s.objects['Cine · First person']
actors=[o for o in s.objects if o.type=='MESH' and not o.get('authoring_archive') and 'MakeHuman body' in o.name]
ropes=[o for o in s.objects if o.type=='MESH' and 'intact wrist-to-chair rope' in o.name]
assert len(actors)==5 and len(ropes)==2
root=r.matrix_world.copy();wood=chair.matrix_world.copy()
bases={p.name:p.matrix_basis.copy() for p in r.pose.bones}
wrists={side:r.matrix_world@r.pose.bones['hand_'+side].matrix for side in ('r','l')}
elbows={side:r.matrix_world@r.pose.bones['lowerarm_'+side].head for side in ('r','l')}
feet={side:r.matrix_world@r.pose.bones['foot_'+side].matrix for side in ('r','l')}
knees={side:r.matrix_world@r.pose.bones['calf_'+side].head for side in ('r','l')}
cp,_=getmesh(chair);z0=min(p.z for p in cp)
support=max(p.x for p in cp if p.z<z0+.003)
pivot=Vector((support,.05,z0))
for obj in (r,chair,fp):
    obj.animation_data.action=obj.animation_data.action.copy()
bpy.context.view_layer.update()
s.frame_end=397
for marker in list(s.timeline_markers):
    if marker.frame>=289:s.timeline_markers.remove(marker)
s.timeline_markers.new('BalanceLoss',frame=289)
s.timeline_markers.new('Impact · wrists still attached',frame=326)
s.timeline_markers.new('GroundRecovery · left side',frame=349)
s.timeline_markers.new('END · knife reach is NEXT',frame=397)

def smooth(x):
    x=max(0,min(1,x));return x*x*x*(x*(x*6-15)+10)
def rotate(name,axis,degrees):
    p=r.pose.bones[name]
    local=p.bone.matrix_local.to_3x3().inverted()@Vector(axis)
    p.rotation_quaternion=p.rotation_quaternion@Quaternion(local.normalized(),math.radians(degrees))

rows=[]
for frame in range(290,398):
    s.frame_set(frame)
    t=(frame-289)/24
    if t<.35:angle=-4*math.sin(math.pi*t/.35)
    elif t<1.55:angle=90*((t-.35)/1.20)**2
    else:angle=90-3.5*math.exp(-5*(t-1.55))*math.sin(19*(t-1.55))
    impact=math.exp(-((t-1.55)/.12)**2)
    recover=smooth((t-1.65)/.9)
    delta=Matrix.Translation(pivot)@Quaternion((0,1,0),math.radians(angle)).to_matrix().to_4x4()@Matrix.Translation(-pivot)
    # Real wooden support edge remains in contact before the body lands.
    delta.translation.z-=min((delta@p).z for p in cp)
    r.matrix_world=delta@root;chair.matrix_world=delta@wood
    for p in r.pose.bones:p.matrix_basis=bases[p.name]
    effort=math.sin(math.pi*max(0,min(1,(t-.25)/1.3)))
    rotate('spine_01',(0,1,0),.55*effort)
    rotate('spine_02',(0,1,0),-.25*effort)
    rotate('neck_01',(0,1,0),-3*effort+10*recover)
    rotate('head',(0,1,0),-2*effort+10*recover)
    rotate('head',(1,0,0),-3*impact)
    for side in ('l','r'):
        rotate('calf_'+side,(1,0,0),(-2 if side=='l' else 3)*effort)
        rotate('foot_'+side,(1,0,0),(-4 if side=='l' else 5)*effort)
    bpy.context.view_layer.update()
    for side in ('r','l'):
        target=delta@wrists[side]
        two_bone_ik(r,side,target.translation,delta@elbows[side],target.to_3x3())
    # Adduct/lower the upper leg after landing, rather than freezing both
    # seated legs 37 cm apart in the air. The native hip/knee/ankle chain moves
    # together; the lower leg remains the ground-side support.
    if recover:
        foot=delta@feet['r'];foot.translation.z-=.23*recover
        pole=delta@knees['r'];pole.z-=.12*recover
        two_bone_ik(r,'r',foot.translation,pole,foot.to_3x3(),kind='leg')
    bpy.context.view_layer.update()
    # Contact support of the evaluated, posed surfaces. No bounding-box floor
    # proxy or independent camera lift; the same correction moves actor/wood.
    lowest=min(min(p.z for p in getmesh(o)[0]) for o in actors+ropes+[chair])
    lift=max(0,-lowest)
    if lift:
        r.matrix_world.translation.z+=lift
        chair.matrix_world.translation.z+=lift
    bpy.context.view_layer.update()
    head=r.pose.bones['head']
    rotation=r.matrix_world.to_3x3()@head.matrix.to_3x3()@head.bone.matrix_local.to_3x3().inverted()
    forward=(rotation@Vector((0,-1,0))).normalized();up=(rotation@Vector((0,0,1))).normalized()
    ep,_=getmesh(eyes);fp.location=sum(ep,Vector())/len(ep)+forward*.035
    pitch=math.radians(60-18*recover)
    direction=forward*math.cos(pitch)-up*math.sin(pitch)
    zz=-direction.normalized();xx=up.cross(zz).normalized();yy=zz.cross(xx).normalized()
    fp.rotation_quaternion=Matrix((xx,yy,zz)).transposed().to_quaternion()
    for p in r.pose.bones:
        for prop in ('location','rotation_quaternion','scale'):p.keyframe_insert(prop,frame=frame,group=p.name)
    for obj in (r,chair,fp):
        for prop in ('location','rotation_quaternion','scale'):obj.keyframe_insert(prop,frame=frame)
    rows.append({'frame':frame,'time':(frame-1)/24,'rollDeg':angle,'supportLiftMm':lift*1000,
        'eye':list(fp.location),'wrists':{side:list(r.matrix_world@r.pose.bones['hand_'+side].head) for side in ('r','l')}})
    if frame%24==1:print('NATIVE FALL',frame,round(angle,2),'support mm',round(lift*1000,2),flush=True)
for obj in (r,chair,fp):
    action=obj.animation_data.action;action.name='IntroFallGround_PARTIAL | '+obj.name
    for slot in action.slots:
        for layer in action.layers:
            for strip in layer.strips:
                bag=strip.channelbag(slot)
                if bag:
                    for fc in bag.fcurves:
                        for k in fc.keyframe_points:k.interpolation='LINEAR'
r['authoredPhases']=json.dumps([{'name':'BoundChairIdle','start':0,'end':4},{'name':'ChairStruggle','start':4,'end':12},
    {'name':'BalanceLossFall','start':12,'end':14.5},{'name':'GroundRecovery','start':14.5,'end':16.5}])
r['missingPhases']='Right chair-hitch release/KnifeReach/Cut/Remove/Drop/Stand: NEXT, not authored'
s['cinematic_export_stem']='intro-fall-ground-partial'
s['fall_ground_partial']=True;s.name='IntroFallGround_PARTIAL'
for name,pos,target in [('Cine · Fall overview',(2.8,-2.8,1.8),(.65,.04,.70)),
    ('Cine · Ground wrists',(.85,1.05,.85),(.93,.19,.43))]:
    data=bpy.data.cameras.new(name);cam=bpy.data.objects.new(name,data);s.collection.objects.link(cam)
    data.lens=38;data.clip_start=.02;cam.location=pos
    cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
s.frame_set(1)
out=Path.cwd()/'outputs/cinematic-intro'
(out/'fall-support.json').write_text(json.dumps({'partial':True,'rows':rows},indent=2))
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(out/'intro-fall-ground-partial.blend'),compress=True)
