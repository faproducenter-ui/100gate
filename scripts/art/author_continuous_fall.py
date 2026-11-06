"""Single C2 rocking-to-fall trajectory on the existing native actor.

No clip reset at balance loss. Angular position, velocity and acceleration
share one authoring curve. Secondary motion uses persistent damped states;
floor support uses evaluated meshes. This is staged animation, not ragdoll.
"""
import bpy,math,json,sys,numpy as np
from pathlib import Path
from mathutils import Matrix,Vector,Quaternion
sys.path.insert(0,str(Path(__file__).resolve().parent))
from cinematic_geometry import getmesh
from native_pose_tools import two_bone_ik
from mathutils.bvhtree import BVHTree
PROBE='--probe' in sys.argv

# time, roll degrees, angular speed deg/s, angular acceleration deg/s².
# Nonzero acceleration at each reversal avoids flat, mechanical dwell points.
KNOTS=[(4,0,0,0),(4.65,3.5,0,-55),(5.35,-5.2,0,75),
 (6.02,7,0,-100),(6.75,-8,0,105),(7.38,9.6,0,-120),
 (8.11,-10,0,135),(8.74,13,0,-150),(9.48,-11,0,150),
 (10.18,15,0,-165),(10.91,-12,0,180),
 (11.5,8,55,60),(11.8,27,72,80),(12.1,52,94,60),
 (12.38,82,108,-80),(12.5,90,-15,-300),
 (12.65,88,0,240),(12.9,90,-3,-80),(13.1,89.65,0,55),
 (13.4,90,0,0),(16.5,90,0,0)]
PROBE_FRAMES={round(1+k[0]*48)+j for k in KNOTS for j in (-1,0,1)}
SEGMENTS=[]
for start,end in zip(KNOTS,KNOTS[1:]):
    t,p,v,a=start;h=end[0]-t
    c=np.array([p,v*h,a*h*h/2,0.,0.,0.])
    rhs=np.array([end[1]-sum(c[:3]),end[2]*h-c[1]-2*c[2],end[3]*h*h-2*c[2]])
    c[3:]=np.linalg.solve(np.array([[1,1,1],[3,4,5],[6,12,20]]),rhs)
    SEGMENTS.append((t,h,c))

def roll(t):
    if t<=4:return (0.,0.,0.)
    for start,h,c in SEGMENTS:
        if t<=start+h+1e-9:
            u=(t-start)/h
            return (sum(c[i]*u**i for i in range(6)),
                sum(i*c[i]*u**(i-1) for i in range(1,6))/h,
                sum(i*(i-1)*c[i]*u**(i-2) for i in range(2,6))/h**2)
    return (90.,0.,0.)
def smooth(x):
    x=max(0,min(1,x));return x*x*x*(10+x*(-15+6*x))

# Analytic contract: no hidden reset of velocity at loss-of-balance knots.
continuity=[]
for k in KNOTS[1:-1]:
    left=roll(k[0]-1e-7);right=roll(k[0]+1e-7)
    continuity.append({'time':k[0],'angleJumpDeg':abs(right[0]-left[0]),
        'speedJumpDegS':abs(right[1]-left[1]),'accelerationJumpDegS2':abs(right[2]-left[2])})
assert all(x['speedJumpDegS']<.01 for x in continuity)
assert min(roll(t)[1] for t in np.linspace(11.15,12.36,300))>0

s=bpy.context.scene;assert s.get('bound_performance_partial')
r=next(o for o in s.objects if o.type=='ARMATURE');chair=s.objects['old-chair']
fp=s.objects['Cine · First person']
eyes=next(o for o in s.objects if o.type=='MESH' and 'low-poly' in o.name and not o.get('authoring_archive'))
actors=[o for o in s.objects if o.type=='MESH' and 'MakeHuman body' in o.name and not o.get('authoring_archive')]
ropes=[o for o in s.objects if o.type=='MESH' and 'intact wrist-to-chair rope' in o.name]
assert len(actors)==5 and len(ropes)==2
# Preserve the original idle exactly in real time; the new bake is 48 fps.
idle=[]
for i in range(193):
    f=1+i*.5;s.frame_set(int(f),subframe=f-int(f));bpy.context.view_layer.update()
    idle.append(({p.name:p.matrix_basis.copy() for p in r.pose.bones},r.matrix_world.copy(),chair.matrix_world.copy(),fp.matrix_world.copy()))
s.frame_set(289);bpy.context.view_layer.update()
bases={p.name:p.matrix_basis.copy() for p in r.pose.bones};root=r.matrix_world.copy();wood=chair.matrix_world.copy()
wrists={side:r.matrix_world@r.pose.bones['hand_'+side].matrix for side in ('r','l')}
elbows={side:r.matrix_world@r.pose.bones['lowerarm_'+side].head for side in ('r','l')}
feet={side:r.matrix_world@r.pose.bones['foot_'+side].matrix for side in ('r','l')}
knees={side:r.matrix_world@r.pose.bones['calf_'+side].head for side in ('r','l')}
cp,_=getmesh(chair);z0=min(p.z for p in cp);contacts=[p for p in cp if p.z<z0+.003]
edges=(min(p.x for p in contacts),max(p.x for p in contacts))
for obj in (r,chair,fp):obj.animation_data_clear()
for obj in s.objects:
    if obj.get('authoring_archive'):
        for mod in obj.modifiers:mod.show_viewport=mod.show_render=False
s.render.fps=48;s.frame_start=1;s.frame_end=793
for marker in list(s.timeline_markers):s.timeline_markers.remove(marker)
for name,t in [('Idle',0),('Growing effort',4),('Last swing · NO RESET',10.91),('Support loss',11.65),('Impact',12.5),('Ground settle',13.4)]:s.timeline_markers.new(name,frame=1+round(t*48))

def rotate(name,axis,degrees):
    p=r.pose.bones[name];local=p.bone.matrix_local.to_3x3().inverted()@Vector(axis)
    p.rotation_quaternion=p.rotation_quaternion@Quaternion(local.normalized(),math.radians(degrees))
def minimum_z(obj):
    # Exact evaluated vertices, batched: floor support does not need to create
    # Python tuples for every triangle on every 48 fps authoring sample.
    ev=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh()
    co=np.empty(len(mesh.vertices)*3,dtype=np.float32);mesh.vertices.foreach_get('co',co)
    matrix=ev.matrix_world;z=co.reshape(-1,3)@np.array(tuple(matrix[2][:3]))+matrix[2][3]
    result=float(np.min(z));ev.to_mesh_clear();return result
lag=0.;lag_v=0.;torso=0.;torso_v=0.;rows=[]
for frame in range(1,794):
    s.frame_set(frame);t=(frame-1)/48;angle,speed,acc=roll(t)
    if frame<=193:
        pose,rr,cc,ff=idle[frame-1]
        for p in r.pose.bones:p.matrix_basis=pose[p.name]
        r.matrix_world=rr;chair.matrix_world=cc;fp.matrix_world=ff
    else:
        recover=smooth((t-12.55)/1.0);release_feet=smooth((t-11.4)/.40)
        effort=max(-1,min(1,angle/18+speed*.003))*(1-smooth((t-11.8)/.7))
        # Continuous causal secondary states; they are never reset at a phase.
        dt=1/48;lag_target=max(-6,min(6,-speed*.04))
        lag_v+=(13**2*(lag_target-lag)-2*.85*13*lag_v)*dt;lag+=lag_v*dt
        torso_v+=(9**2*(-speed*.008-torso)-2*.9*9*torso_v)*dt;torso+=torso_v*dt
        pivot=Vector((edges[1] if angle>=0 else edges[0],.05,z0))
        delta=Matrix.Translation(pivot)@Quaternion((0,1,0),math.radians(angle)).to_matrix().to_4x4()@Matrix.Translation(-pivot)
        delta.translation.z-=min((delta@p).z for p in cp)
        chair.matrix_world=delta@wood;r.matrix_world=delta@root
        r.matrix_world.translation.z+=.008*smooth(abs(angle)/1.5)*(1-smooth((t-11.8)/.7))
        for p in r.pose.bones:p.matrix_basis=bases[p.name]
        rotate('pelvis',(0,1,0),effort*.35)
        rotate('spine_01',(0,1,0),effort*1.2+torso*.35)
        rotate('spine_02',(0,1,0),effort*.5+torso*.3)
        rotate('neck_01',(0,1,0),lag*.55+10*recover)
        rotate('head',(0,1,0),lag*.45+10*recover)
        rotate('head',(1,0,0),-2*math.exp(-((t-12.53)/.12)**2))
        bpy.context.view_layer.update()
        for side,sign in (('r',-1),('l',1)):
            target=delta@wrists[side]
            two_bone_ik(r,side,target.translation,delta@elbows[side],target.to_3x3())
            # The unloaded-side foot lifts with the chair. Forcing BOTH soles
            # flat during a large lean twisted the femurs and drove the real
            # gluteal surface through the seat. The other foot bears the effort.
            unloaded=smooth((((angle if side=='r' else -angle))-.5)/10)
            carry=max(release_feet,unloaded,.25*smooth(abs(angle)/14))
            carried=delta@feet[side];goal=feet[side].copy()
            goal.translation=goal.translation.lerp(carried.translation,carry)
            goal=Matrix.Translation(goal.translation)@feet[side].to_quaternion().slerp(carried.to_quaternion(),carry).to_matrix().to_4x4()
            pole=knees[side].lerp(delta@knees[side],carry)
            if side=='r':goal.translation.z-=.23*recover;pole.z-=.12*recover
            two_bone_ik(r,side,goal.translation,pole,goal.to_3x3(),kind='leg',align_hinge=True)
        bpy.context.view_layer.update()
        if PROBE and frame not in PROBE_FRAMES:continue
        minimum=min(minimum_z(o) for o in actors+ropes+[chair])
        lift=max(0,-minimum)
        if lift:r.matrix_world.translation.z+=lift;chair.matrix_world.translation.z+=lift
        bpy.context.view_layer.update()
        head=r.pose.bones['head'];rotation=r.matrix_world.to_3x3()@head.matrix.to_3x3()@head.bone.matrix_local.to_3x3().inverted()
        forward=(rotation@Vector((0,-1,0))).normalized();up=(rotation@Vector((0,0,1))).normalized()
        ep,_=getmesh(eyes);fp.location=sum(ep,Vector())/len(ep)+forward*(.035+.04*smooth((t-4)/.5))
        pitch=math.radians(60-18*recover);direction=forward*math.cos(pitch)-up*math.sin(pitch)
        zz=-direction.normalized();xx=up.cross(zz).normalized();yy=zz.cross(xx).normalized()
        fp.rotation_quaternion=Matrix((xx,yy,zz)).transposed().to_quaternion()
    bpy.context.view_layer.update()
    if PROBE:
        if frame in PROBE_FRAMES:
            tree=BVHTree.FromPolygons(*getmesh(chair),all_triangles=True)
            pants=next(o for o in actors if 'cargo' in o.name)
            crossings=len(BVHTree.FromPolygons(*getmesh(pants),all_triangles=True).overlap(tree))
            print('SEAT_PROBE',round(t,3),round(angle,3),crossings,flush=True)
        continue
    # Coarse anthropometric authoring estimate, NOT a calibrated simulation.
    # It verifies that the last growing swing crosses the support edge.
    com=Vector()
    masses=[('pelvis',.20),('spine_01',.18),('spine_03',.22),('head',.08),
        ('thigh_l',.10),('thigh_r',.10),('calf_l',.04),('calf_r',.04),('upperarm_l',.02),('upperarm_r',.02)]
    for name,mass in masses:
        b=r.pose.bones[name];com+=(r.matrix_world@((b.head+b.tail)*.5))*mass
    com=(com*78+(chair.matrix_world@wood.inverted()@Vector((0,.08,.5)))*6)/84
    support=(chair.matrix_world@wood.inverted()@Vector((edges[1],.05,z0))).x
    rows.append({'time':t,'angleDeg':angle,'speedDegS':speed,'accelDegS2':acc,'eye':list(fp.location),
        'eyeQ':list(fp.rotation_quaternion),'headLagDeg':lag,'estimatedComX':com.x,'supportEdgeX':support,'estimatedMarginM':com.x-support})
    for p in r.pose.bones:
        for prop in ('location','rotation_quaternion','scale'):p.keyframe_insert(prop,frame=frame,group=p.name)
    for obj in (r,chair,fp):
        for prop in ('location','rotation_quaternion','scale'):obj.keyframe_insert(prop,frame=frame)
    if frame%48==1:print('CONTINUOUS',round(t,2),round(angle,2),round(speed,2),flush=True)
if PROBE:sys.exit(0)
for obj in (r,chair,fp):
    action=obj.animation_data.action;action.name='ContinuousRockFall | '+obj.name
    for slot in action.slots:
        for layer in action.layers:
            for strip in layer.strips:
                bag=strip.channelbag(slot)
                if bag:
                    for fc in bag.fcurves:
                        for key in fc.keyframe_points:key.interpolation='LINEAR'
for name,pos,target in [('Cine · Fall overview',(2.8,-2.8,1.8),(.65,.04,.70)),('Cine · Ground wrists',(.85,1.05,.85),(.93,.19,.43))]:
    data=bpy.data.cameras.new(name);cam=bpy.data.objects.new(name,data);s.collection.objects.link(cam);data.lens=38;data.clip_start=.02
    cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
r['authoredPhases']=json.dumps([{'name':'Idle','start':0,'end':4},{'name':'ContinuousRockFallGround','start':4,'end':16.5}])
r['impactTime']=12.5;r['cameraMotionReduced']=.35
r['missingPhases']='KnifeReach/Cut/Remove/Drop/Stand: not authored; continuous rocking/fall/ground authored'
s['fall_ground_partial']=True;s['continuous_rock_fall']=True;s['cinematic_export_stem']='intro-continuous-fall';s.name='ContinuousRockFall_WIP'
out=Path.cwd()/'outputs/cinematic-intro';s.frame_set(1)
(out/'continuous-rock-fall-trajectory.json').write_text(json.dumps({'fps':48,'impactTime':12.5,'continuity':continuity,'massEstimateOnly':True,'rows':rows},indent=2))
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(out/'intro-continuous-fall.blend'),compress=True)
