"""Authored home performance on the original Alexei, with planted-foot IK.

Run background Blender on art/character-mpfb-review.blend. Outputs are isolated;
no old introduction or source character is overwritten.
"""
import bpy, math, sys, json
from pathlib import Path
from mathutils import Matrix, Vector, Quaternion
sys.path.insert(0,str(Path(__file__).resolve().parent))
from story_actor_tools import clear_pose,pose_relaxed,floor_offset,export_actor,ease,arm,actor_meshes
from native_pose_tools import two_bone_ik
ROOT=Path.cwd();OUT=ROOT/'outputs/story-intro/hero';OUT.mkdir(parents=True,exist_ok=True)
s=bpy.context.scene;r=next(o for o in s.objects if o.type=='ARMATURE')
assert len(r.data.bones)>=53 and 'MPFB' in r.name
meshes=actor_meshes(r);assert len(meshes)==5
for garment in meshes:
    if 'sweater' not in garment.name:continue
    key=garment.shape_key_add(name='Story standing hem clearance')
    for v in key.data:
        w=max(0.,1-abs(v.co.z-1.015)/.12)
        radial=Vector((v.co.x,v.co.y-.01,0))
        if radial.length>.03:v.co+=radial.normalized()*.014*w
    key.value=1
for obj in list(s.objects):
    if obj not in [r,*meshes]:bpy.data.objects.remove(obj,do_unlink=True)
clear_pose(r);r.name='StoryHero';s.name='100gate | original Alexei · home performance'
offset=floor_offset(meshes)
restfoot={side:r.data.bones['foot_'+side].matrix_local.copy() for side in ('l','r')}
r['source']='art/character-mpfb-review.blend';r['license']='CC0-1.0; see art/provenance/MPFB-SOURCES.json'
s.render.fps=24;s.frame_start=1;s.frame_end=457
start=Vector((-.95,.49,offset));middle=Vector((.50,1.14,offset));wait=Vector((2.43,1.18,offset));end=Vector((3.58,1.18,offset))
def path(t):
    if t<9.65:return start.copy(),math.pi/2
    if t<12.6:
        u=(t-9.65)/(12.6-9.65);length1=(middle-start).length;length2=(wait-middle).length
        d=u*(length1+length2)
        if d<length1:
            p=start.lerp(middle,d/length1);angle=math.atan2(middle.x-start.x,-(middle.y-start.y))
        else:p=middle.lerp(wait,(d-length1)/length2);angle=math.pi/2
        return p,angle
    if t<16.65:return wait.copy(),math.pi/2
    return wait.lerp(end,ease(t,16.65,18.4)),math.pi/2

def foot_at(t,side):
    # Alternate actual planted contacts. Swing arcs only occur between them.
    sign=1 if side=='l' else -1;rest=restfoot[side]
    def contact(when):
        p,a=path(when);R=Quaternion((0,0,1),a).to_matrix()
        return p+R@rest.translation,R@rest.to_3x3()
    walking=(9.65<=t<12.6) or (16.65<=t<18.4)
    a,b=(9.65,12.6) if t<15 else (16.65,18.4)
    if not walking:return contact(t)
    stride=.48;delay=0 if side=='l' else .24
    previous=a+delay+math.floor((t-a-delay)/stride)*stride
    nxt=previous+stride
    if previous<a:previous=a
    nxt=min(nxt,b)
    takeoff=max(previous,nxt-.25)
    p0,R0=contact(previous if previous==a else min(b,previous+.12))
    p1,R1=contact(min(b,nxt+.12))
    if t<=takeoff or nxt<=takeoff:return p0,R0
    u=ease(t,takeoff,nxt);pos=p0.lerp(p1,u);pos.z+=.065*math.sin(math.pi*u)
    return pos,R0.to_quaternion().slerp(R1.to_quaternion(),u).to_matrix()

contact_samples=[]
for frame in range(s.frame_start,s.frame_end+1,2):
    t=(frame-1)/24;s.frame_set(frame)
    for p in r.pose.bones:p.matrix_basis=Matrix.Identity(4)
    pos,angle=path(t)
    # Small pelvis compression makes a straight-leg IK singularity impossible.
    walking=(9.65<=t<12.6) or (16.65<=t<18.4)
    if walking:pos.z-=.04+.006*math.sin(t*9)**2
    r.matrix_world=Matrix.Translation(pos)@Quaternion((0,0,1),angle).to_matrix().to_4x4()
    bpy.context.view_layer.update()
    gesture=(ease(t,1.0,1.65)*(1-ease(t,3.05,3.8)))*.9
    pose_relaxed(r,t,True,gesture)
    # Door is at Blender X2.79. Hinge moves from 14.3 until 16.5.
    reach=ease(t,12.8,13.55)*(1-ease(t,14.75,15.1))
    opening=1.42*ease(t,14.3,16.35)
    if reach>0:
        hinge=Vector((2.79,.624,1.04))
        handle=hinge+Quaternion((0,0,1),opening)@Vector((-.06,.80,0))
        # Follow the handle while attached; preserve original palm/phalanges.
        idle=r.matrix_world@Vector((.245,-.06,.93))
        target=idle.lerp(handle,reach)
        orient=r.matrix_world.to_3x3()@r.data.bones['hand_l'].matrix_local.to_3x3()
        two_bone_ik(r,'l',target,r.matrix_world@Vector((.40,-.12,1.16)),orient)
    bpy.context.view_layer.update()
    for side in ('l','r'):
        if not walking:continue
        goal,rot=foot_at(t,side)
        pole=r.matrix_world@Vector((.19 if side=='l' else -.19,-.8,.52))
        two_bone_ik(r,side,goal,pole,rot,kind='leg',align_hinge=True)
    bpy.context.view_layer.update()
    r.keyframe_insert('location',frame=frame);r.keyframe_insert('rotation_quaternion',frame=frame)
    for p in r.pose.bones:
        p.keyframe_insert('location',frame=frame);p.keyframe_insert('rotation_quaternion',frame=frame)
    if frame%12==1:contact_samples.append({'t':t,'feet':{side:list(r.matrix_world@r.pose.bones['foot_'+side].head) for side in ('l','r')}})
for action in bpy.data.actions:
    for slot in action.slots:
        for layer in action.layers:
            for strip in layer.strips:
                bag=strip.channelbag(slot)
                if bag:
                    for curve in bag.fcurves:
                        for point in curve.keyframe_points:point.interpolation='LINEAR'
r.animation_data.action.name='StoryHero_Home'
s['authored_performance']='Dialogue + turn + foot-planted walk + hand-to-door + exit; no camera animation substitute'
s.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'story-hero-home.blend'))
export_actor(r,meshes,OUT/'story-hero-home.glb','StoryHero')
(OUT/'story-hero-home.json').write_text(json.dumps({'fps':24,'seconds':19,'rig':'StoryHero','source':'art/character-mpfb-review.blend','bones':len(r.data.bones),'doorOpen':[14.3,16.35],'doorClose':[18.4,19],'samples':contact_samples},indent=2))
print('EXPORTED ORIGINAL HUMAN PERFORMANCE',flush=True)
