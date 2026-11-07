"""Home dialogue performance, native MPFB woman from the CC0 system pack."""
import bpy,math,sys,json
from pathlib import Path
from mathutils import Matrix,Vector,Quaternion
sys.path.insert(0,str(Path(__file__).resolve().parent))
from story_actor_tools import clear_pose,pose_relaxed,floor_offset,export_actor,ease,actor_meshes
from native_pose_tools import two_bone_ik
OUT=Path.cwd()/'outputs/story-intro/partner'
s=bpy.context.scene;r=s.objects.get('StoryPartner_Rig')
assert r and len(r.data.bones)==53
meshes=actor_meshes(r);assert len(meshes)>=5
for o in list(s.objects):
    if o not in [r,*meshes]:bpy.data.objects.remove(o,do_unlink=True)
clear_pose(r);r.name='StoryPartner'
offset=floor_offset(meshes);restfoot={side:r.data.bones['foot_'+side].matrix_local.copy() for side in ('l','r')}
s.render.fps=24;s.frame_start=1;s.frame_end=457;s.name='100gate | partner · home performance'
for frame in range(1,458,2):
    t=(frame-1)/24;s.frame_set(frame)
    for p in r.pose.bones:p.matrix_basis=Matrix.Identity(4)
    r.matrix_world=Matrix.Translation((.53,.55,offset))@Quaternion((0,0,1),-math.pi/2).to_matrix().to_4x4()
    bpy.context.view_layer.update()
    gesture=ease(t,4.0,4.6)*(1-ease(t,5.9,6.7))*.45
    pose_relaxed(r,t+1.3,False,gesture)
    # Listening nod at the end of the first line, then follow his departure.
    head=r.pose.bones['head']
    head.rotation_quaternion=head.rotation_quaternion@Quaternion((1,0,0),.065*math.sin(math.pi*ease(t,3.1,3.9)))
    from story_actor_tools import rotate
    rotate(r,'head',(0,0,1),-22*ease(t,9.8,13))
    bpy.context.view_layer.update()
    bpy.context.view_layer.update()
    r.keyframe_insert('location',frame=frame);r.keyframe_insert('rotation_quaternion',frame=frame)
    for p in r.pose.bones:
        p.keyframe_insert('location',frame=frame);p.keyframe_insert('rotation_quaternion',frame=frame)
r.animation_data.action.name='StoryPartner_Home'
s.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'story-partner-home.blend'))
export_actor(r,meshes,OUT/'story-partner-home.glb','StoryPartner')
print('PARTNER HOME PERFORMANCE',flush=True)
