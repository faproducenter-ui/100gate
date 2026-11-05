"""Slow skeletal contact study, authored only after the static mesh gate.

Original MPFB mesh/UV and the accepted repaired weights are unchanged by
this animation script. Analytic two-bone arm IK and
individual phalange hinges are baked to the existing skeleton. The unchanged
knife is world-fixed until full grasp, then follows the exact wrist socket.
"""
import bpy,math,json,sys,os
from pathlib import Path
from mathutils import Matrix,Vector,Quaternion
sys.path.insert(0,str(Path(__file__).resolve().parent))
from hand_mesh_audit import audit,self_crossings,snapshot,whole_hand_self_crossings
out=Path.cwd()/'outputs/hand-mesh-rework';s=bpy.context.scene
r=next(o for o in s.objects if o.type=='ARMATURE')
b=next(o for o in s.objects if o.type=='MESH' and o.name.endswith('MakeHuman body'))
k=next(o for o in s.objects if o.type=='EMPTY')
K=k.matrix_world.copy();H=r.matrix_world@r.pose.bones['hand_r'].matrix
socket=H.inverted()@K;orientation=H.to_3x3();wrist=H.translation.copy()
final={p.name:p.rotation_quaternion.copy() for p in r.pose.bones}
base={p.name:p.matrix_basis.copy() for p in r.pose.bones}
s.render.fps=24;s.frame_start=1;s.frame_end=289
if r.animation_data:r.animation_data_clear()
if k.animation_data:k.animation_data_clear()
k.rotation_mode='QUATERNION'
for p in r.pose.bones:p.rotation_mode='QUATERNION'
def smooth(t,a,z):
    x=max(0,min(1,(t-a)/(z-a)));return x*x*(3-2*x)
def update():bpy.context.view_layer.update()
def aim(name,direction):
    p=r.pose.bones[name];old=p.matrix.copy();at=old.translation
    q=(p.tail-p.head).rotation_difference(direction)
    p.matrix=Matrix.Translation(at)@q.to_matrix().to_4x4()@Matrix.Translation(-at)@old;update()
def place_arm(target):
    upper,lower=r.pose.bones['upperarm_r'],r.pose.bones['lowerarm_r']
    shoulder=upper.head.copy();target=r.matrix_world.inverted()@target
    delta=target-shoulder;reach=delta.length;axis=delta.normalized();l1,l2=upper.length,lower.length
    if not abs(l1-l2)+.001<reach<l1+l2-.001:raise RuntimeError('Arm target outside anatomical reach: '+str(reach))
    h=(l1*l1+reach*reach-l2*l2)/(2*reach)
    pole=r.matrix_world.inverted()@Vector((-.40,-.17,.92))-shoulder
    pole=(pole-axis*pole.dot(axis)).normalized()
    elbow=shoulder+axis*h+pole*math.sqrt(l1*l1-h*h)
    aim(upper.name,elbow-shoulder);aim(lower.name,target-lower.head)
    r.pose.bones['hand_r'].matrix=r.matrix_world.inverted()@(Matrix.Translation(r.matrix_world@target)@orientation.to_4x4());update()
animated=['upperarm_r','lowerarm_r','hand_r']+[f'{d}_0{j}_r' for d in ('index','middle','ring','pinky','thumb') for j in (1,2,3)]
identity=Quaternion()
hidden={o:o.hide_viewport for o in s.objects if o.type=='MESH'}
for o in hidden:o.hide_viewport=True
for frame in range(1,s.frame_end+1):
    t=(frame-1)/24;s.frame_set(frame)
    for name,matrix in base.items():r.pose.bones[name].matrix_basis=matrix
    # The arm approaches from the palm-normal direction. The prop does not
    # escape into the palm, and the fingers pre-shape before first contact.
    # As proximal flexion changes the fleshy palm by fractions of a millimetre,
    # seat the wrist through the last 0.8 mm only while the fingers close.
    away=.070*(1-smooth(t,1,3.5))+.0008*(1-smooth(t,3.5,6))
    lift=smooth(t,10,11.5)*.025
    target=wrist+K.to_3x3()@Vector((0,-away,0))+Vector((0,0,lift))
    update();place_arm(target)
    for d,offset in [('index',0),('middle',-.10),('ring',-.20),('pinky',-.30)]:
        for j,(start,end) in enumerate(((3.5,5.5),(4.8,7.0),(6.0,7.0)),1):
            name=f'{d}_0{j}_r'
            r.pose.bones[name].rotation_quaternion=identity.slerp(final[name],smooth(t,start+offset,end+offset))
    for j,start,end in [(1,1,3.0),(2,7.0,8.5),(3,7.0,8.5)]:
        name=f'thumb_0{j}_r'
        amount=smooth(t,start,end)
        if j==1:
            # Opposition is completed together with thumb flexion. Holding
            # CMC at its final angle while MCP/IP are open folds the web skin.
            amount*=.65+.35*smooth(t,7,8.5)
        r.pose.bones[name].rotation_quaternion=identity.slerp(final[name],amount)
    update()
    k.matrix_world=K if t<=10 else r.matrix_world@r.pose.bones['hand_r'].matrix@socket
    update()
    for p in r.pose.bones:
        if p.name in animated or frame in (1,s.frame_end):
            for prop in ('location','rotation_quaternion','scale'):p.keyframe_insert(prop,frame=frame,group=p.name)
    for prop in ('location','rotation_quaternion','scale'):k.keyframe_insert(prop,frame=frame)
    if frame%48==1:print('BAKE',frame,flush=True)
for o,was_hidden in hidden.items():o.hide_viewport=was_hidden
update()
for owner in (r,k):
    owner.animation_data.action.name='HandContact | slow anatomical close'
    for slot in owner.animation_data.action.slots:
        for layer in owner.animation_data.action.layers:
            for strip in layer.strips:
                bag=strip.channelbag(slot)
                if bag:
                    for fc in bag.fcurves:
                        for key in fc.keyframe_points:key.interpolation='LINEAR'
s['hand_contact_timeline']=json.dumps({'OpenHand':[0,1],'Reach':[1,3.5],'Contact':[3.5,3.6],
    'FingerCurl':[3.5,9],'FullGrip':[9,10],'KnifeHold':[10,12]})
s['knife_attachment_seconds']=10.0
s.frame_set(241)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(out/'hand-contact-motion.blend'),compress=True)
if os.environ.get('GATE_ANIMATE_AUDIT','1')=='1':
    frames=[1,25,49,73,85,97,109,121,133,145,157,169,181,193,205,217,229,241,265,289]
    report=[]
    for frame in frames:
        s.frame_set(frame);contact=audit(b,r,k);self_hits=self_crossings(b,r,k)
        points,tris,labels,_=snapshot(b,r,k);whole=whole_hand_self_crossings(points,tris,labels)
        if whole['pairs']:self_hits['wholeHand']=whole
        failed=any(v['insideVertices'] or v['surfaceCrossings'] for v in contact.values()) or bool(self_hits)
        report.append({'frame':frame,'seconds':(frame-1)/24,'contact':contact,'selfCrossings':self_hits,'failed':bool(failed)})
        print('FRAME',frame,'FAILED',bool(failed),json.dumps({d:v for d,v in contact.items() if v['insideVertices'] or v['surfaceCrossings']}),json.dumps(self_hits),flush=True)
    (out/'motion-coarse-mesh.json').write_text(json.dumps(report,indent=2))
    if any(f['failed'] for f in report):raise RuntimeError('Motion candidate has intersections; must not be accepted.')
