"""A baked foot-locked stride on Alexei's existing rig (1 m/s, 1.1s cycle)."""
import bpy,sys,math,json
from pathlib import Path
from mathutils import Matrix,Vector,Quaternion
sys.path.insert(0,str(Path(__file__).resolve().parent))
from story_actor_tools import clear_pose,pose_relaxed,floor_offset,export_actor,actor_meshes,arm
from native_pose_tools import two_bone_ik
OUT=Path.cwd()/'outputs/story-intro/hero'
s=bpy.context.scene;r=next(o for o in s.objects if o.type=='ARMATURE');meshes=actor_meshes(r)
for o in list(s.objects):
    if o not in [r,*meshes]:bpy.data.objects.remove(o,do_unlink=True)
clear_pose(r);r.name='StoryHeroWalk';offset=floor_offset(meshes)
rest={side:r.data.bones['foot_'+side].matrix_local.copy() for side in ('l','r')}
s.render.fps=30;s.frame_start=1;s.frame_end=31
for frame in range(1,32):
    t=(frame-1)/30;phase=t
    s.frame_set(frame)
    for p in r.pose.bones:p.matrix_basis=Matrix.Identity(4)
    r.matrix_world=Matrix.Translation((0,0,offset-.065+.006*math.cos(phase*4*math.pi)))
    bpy.context.view_layer.update();pose_relaxed(r,t)
    for side,sign in [('l',1),('r',-1)]:
        q=(phase+(0 if side=='l' else .5))%1.
        if q<.55:y=-.275+q;z=0
        else:
            u=(q-.55)/.45;y=.275-.55*(u*u*(3-2*u));z=.075*math.sin(math.pi*u)
        target=rest[side].translation.copy();target.y+=y;target.z+=offset+z
        two_bone_ik(r,side,target,(sign*.18,-.8,.5),rest[side].to_3x3(),kind='leg',align_hinge=True)
        arm(r,side,(sign*.245,-.06+.12*math.sin(phase*2*math.pi+(math.pi if side=='l' else 0)),.93),(sign*.42,.025,1.17))
    bpy.context.view_layer.update()
    r.keyframe_insert('location',frame=frame)
    for p in r.pose.bones:
        p.keyframe_insert('location',frame=frame);p.keyframe_insert('rotation_quaternion',frame=frame)
r.animation_data.action.name='StoryHero_Walk'
s.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'story-hero-walk.blend'))
export_actor(r,meshes,OUT/'story-hero-walk.glb','StoryHeroWalk')
(OUT/'story-hero-walk.json').write_text(json.dumps({'seconds':1,'speedMetersPerSecond':1,'stanceFraction':.55,'nativeRig':True}))
