"""Neutral native wrist frames before fitting cuffs and authoring restraints.

The old hands pointed across the lumbar region while forearms pointed down,
creating extreme wrist deviation. Keep the real rig/mesh; solve whole arms,
not isolated hand-object offsets. This is a static BOUND art gate only.
"""
import bpy, json, sys, math
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from native_pose_tools import two_bone_ik
from cinematic_geometry import getmesh
s=bpy.context.scene;s.frame_set(1);bpy.context.view_layer.update()
r=next(o for o in s.objects if o.type=='ARMATURE')
body=next(o for o in s.objects if o.type=='MESH' and o.name.endswith('MakeHuman body') and not o.get('authoring_archive'))
if r.animation_data and r.animation_data.action:r.animation_data.action=r.animation_data.action.copy()
bpy.context.view_layer.update()
socket=Matrix(json.loads(s['approved_grip_socket']))
normal_r=socket.to_3x3().col[1]
rest_normal=r.data.bones['hand_r'].matrix_local.to_3x3()@normal_r
normals={'r':normal_r,'l':r.data.bones['hand_l'].matrix_local.to_3x3().inverted()@Vector((-rest_normal.x,rest_normal.y,rest_normal.z))}
report=[]
for side,sign in (('r',-1),('l',1)):
    elbow=r.matrix_world@r.pose.bones['lowerarm_'+side].head
    target=Vector((sign*.16,.195,.705 if side=='r' else .715))
    forward=(target-elbow).normalized()
    palm=Vector((0,1,0));palm=(palm-forward*palm.dot(forward)).normalized()
    b=r.data.bones['hand_'+side]
    heads=[r.data.bones[f'{digit}_01_{side}'].head_local for digit in ('index','middle','ring','pinky')]
    native_forward=b.matrix_local.to_3x3().inverted()@(sum(heads,Vector())/4-b.head_local);native_forward.normalize()
    native_normal=normals[side];native_normal=(native_normal-native_forward*native_normal.dot(native_forward)).normalized()
    local=Matrix((native_forward.cross(native_normal),native_forward,native_normal)).transposed()
    orientation=Matrix((forward.cross(palm),forward,palm)).transposed()@local.inverted()
    two_bone_ik(r,side,target,elbow,orientation);bpy.context.view_layer.update()
    actual=(r.matrix_world.to_3x3()@(r.pose.bones['lowerarm_'+side].tail-r.pose.bones['lowerarm_'+side].head)).normalized()
    hand_forward=(r.matrix_world.to_3x3()@r.pose.bones['hand_'+side].matrix.to_3x3()@native_forward).normalized()
    angle=math.degrees(actual.angle(hand_forward))
    print('WRIST_DEBUG',side,'old elbow',list(elbow),'new elbow',list(r.matrix_world@r.pose.bones['lowerarm_'+side].head),'target',list(target),'hand',list(r.matrix_world@r.pose.bones['hand_'+side].head),'goalF',list(forward),'actualF',list(hand_forward),'forearmF',list(actual),flush=True)
    assert angle<20, f'Wrist still deviated: {side}/{angle}'
    for name in ('upperarm_'+side,'lowerarm_'+side,'hand_'+side):
        p=r.pose.bones[name]
        for prop in ('location','rotation_quaternion','scale'):p.keyframe_insert(prop,frame=1,group=name)
    report.append({'side':side,'wristDeviationDegrees':angle,'wristPosition':list(target)})
chair=BVHTree.FromPolygons(*getmesh(s.objects['old-chair']),all_triangles=True)
crossings=len(BVHTree.FromPolygons(*getmesh(body),all_triangles=True).overlap(chair))
assert crossings==0, f'Native human intersects chair: {crossings}'
out=Path.cwd()/'outputs/cinematic-intro'
(out/'neutral-bound-wrists.json').write_text(json.dumps({'wrists':report,'bodyChairCrossings':crossings},indent=2))
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(out/'cinematic-neutral-wrists.blend'),compress=True)
print('Native neutral wrist gate',report,flush=True)
