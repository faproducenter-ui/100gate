"""Motivated close-ups for rear restraints; retain the actual head/whole mesh.

The camera cannot literally look through a human head to see wrists behind the
back. Use explicit cinematic coverage, then return continuously to the eye.
This pass edits ONLY the camera's action and descriptive scene properties.
"""
import bpy,math,json,hashlib
from pathlib import Path
from mathutils import Vector
s=bpy.context.scene;assert s.get('complete_native_intro')
assert not s.get('intro_camera_style'),'Camera pass already applied; load mesh-gated-before-camera.blend instead'
r=next(o for o in s.objects if o.type=='ARMATURE' and 'MPFB' in o.name)
c=s.objects['Cine · First person']
def signature():
 h=hashlib.sha256()
 # Every non-camera action and every mesh datablock remain identical.
 for o in sorted(s.objects,key=lambda x:x.name):
  if o.type=='CAMERA':continue
  if o.type=='MESH':
   for v in o.data.vertices:h.update(bytes(str(tuple(v.co)),'ascii'))
   for p in o.data.polygons:h.update(bytes(str(tuple(p.vertices)),'ascii'))
  if o.animation_data and o.animation_data.action:
   a=o.animation_data.action
   for l in a.layers:
    for st in l.strips:
     for slot in a.slots:
      bag=st.channelbag(slot)
      if bag:
       for fc in bag.fcurves:
        h.update(fc.data_path.encode());h.update(str(fc.array_index).encode())
        for k in fc.keyframe_points:h.update(str(tuple(k.co)).encode())
 return h.hexdigest()
before=signature();source_sha=hashlib.sha256(Path(bpy.data.filepath).read_bytes()).hexdigest()
cache=[]
for f in range(1,1010):
 s.frame_set(f);bpy.context.view_layer.update()
 p=r.matrix_world@r.pose.bones['hand_l'].head
 head=r.pose.bones['head'];rot=r.matrix_world.to_3x3()@head.matrix.to_3x3()@head.bone.matrix_local.to_3x3().inverted()
 forward=(rot@Vector((0,-1,0))).normalized()
 cache.append((c.location.copy(),c.rotation_quaternion.copy(),p,forward))
def ease(t,a,b):
 x=max(0,min(1,(t-a)/(b-a)));return x*x*x*(10+x*(-15+6*x))
c.animation_data_clear();c.rotation_mode='QUATERNION'
front=Vector((1.4,-.9,.55));rear=Vector((.88,.8,.60))
for f,(eye,q,hand,forward) in enumerate(cache,1):
 t=(f-1)/24
 if 16.5<t<36:
  p=front.copy()
  if 26.5<=t<27.5:
   u=ease(t,26.5,27.5);p=front.lerp(rear,u);p.z+=.75*math.sin(math.pi*u)
  elif 27.5<=t<31.3:p=rear.copy()
  elif 31.3<=t<32.2:
   u=ease(t,31.3,32.2);p=rear.lerp(front,u);p.z+=.75*math.sin(math.pi*u)
  target=hand+Vector((0,0,-.02));view=(target-p).to_track_quat('-Z','Y')
  if t<18:
   u=ease(t,16.5,18);p=eye.lerp(p,u);view=q.slerp((target-p).to_track_quat('-Z','Y'),u)
  if t>34.4:
   u=ease(t,34.4,36);p=p.lerp(eye,u);view=view.slerp(forward.to_track_quat('-Z','Y'),u)
  c.location=p;c.rotation_quaternion=view
 else:c.location=eye;c.rotation_quaternion=q
 for a in ('location','rotation_quaternion','scale'):c.keyframe_insert(a,frame=f)
assert before==signature(),'Camera staging changed non-camera production data'
s['intro_camera_style']='first-person bookends; explicit cinematic restraint close-ups'
s.frame_set(1);bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath,compress=True)
report={'inputSha256':source_sha,'outputSha256':hashlib.sha256(Path(bpy.data.filepath).read_bytes()).hexdigest(),'nonCameraGeometryAndActionsBefore':before,'nonCameraGeometryAndActionsAfter':signature(),'unchanged':True,'cameraStyle':s['intro_camera_style']}
Path('outputs/complete-intro/camera-staging.json').write_text(json.dumps(report,indent=2))
