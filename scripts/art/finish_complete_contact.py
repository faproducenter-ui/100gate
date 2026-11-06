"""Contact pass on the complete native clip: pincer lift, FK curl, safe heel.

No new human geometry; only native joints and matching prop attachment keys.
Run after author_complete_intro.py, before export/acceptance.
"""
import bpy,json,math,sys
from pathlib import Path
from mathutils import Matrix,Vector,Quaternion
sys.path.insert(0,str(Path(__file__).resolve().parent))
from native_pose_tools import two_bone_ik
from cinematic_geometry import getmesh
s=bpy.context.scene;assert s.get('complete_native_intro')
r=next(o for o in s.objects if o.type=='ARMATURE' and 'MPFB' in o.name)
prop=next(o for o in s.objects if o.type=='ARMATURE' and o!=r)
k=s.objects['Cinematic field knife'];cam=s.objects['Cine · First person'];wood=s.objects['Left rail | impact fracture fragment']
ropes={side:next(o for o in s.objects if f'{side} intact wrist-to-chair rope' in o.name) for side in ('l','r')}
g=json.loads(Path('art/provenance/native-left-grip-contract.json').read_text());S=Matrix.Diagonal((-1,1,1,1));hr=Matrix(g['handRest']);hl=r.data.bones['hand_l'].matrix_local
socket=hl.inverted()@S@hr@Matrix(g['socket'])@S
relative={}
for n,d in g['bones'].items():
 nl=n[:-1]+'l';relative[nl]=hl.inverted()@S@hr@Matrix(g['handPose']).inverted()@Matrix(d['pose'])@Matrix(d['rest']).inverted()@S@r.data.bones[nl].matrix_local
final={}
for n,m in relative.items():
 b=r.data.bones[n];parent=hl@relative[b.parent.name] if b.parent.name in relative else hl
 final[n]=b.convert_local_to_pose(hl@m,b.matrix_local,parent_matrix=parent,parent_matrix_local=b.parent.matrix_local,invert=True)
def ease(t,a,b):
 x=max(0,min(1,(t-a)/(b-a)));return x*x*x*(10+x*(-15+6*x))
def mix(a,b,x):
 p,q,sc=a.decompose();p1,q1,sc1=b.decompose();return Matrix.LocRotScale(p.lerp(p1,x),q.slerp(q1,x),sc.lerp(sc1,x))
def sample(t):
 f=1+t*24;s.frame_set(int(f),subframe=f-int(f));bpy.context.view_layer.update()
heel_done=bool(s.get('complete_contact_pass'))
sample(0);Kfloor=k.matrix_world.copy();Hfloor=Kfloor@socket.inverted()
sample(19);Hstart=r.matrix_world@r.pose.bones['hand_l'].matrix
sample(16.5)
base={n:r.pose.bones[n].matrix_basis.copy() for n in final}
initial_foot=r.matrix_world@r.pose.bones['foot_r'].matrix
initial_knee=r.matrix_world@r.pose.bones['calf_r'].head
contact_r=s.objects['RightCutContact'];sample(29);right_point=contact_r.matrix_world.translation.copy()
def right_hand(t,draw=0):
 # Upright blade uses its working edge on the external standing part; the
 # handle stays below, clear of the restrained right palm and wooden rail.
 rot=Matrix.Identity(3)
 return Matrix.Translation(right_point-rot@Vector((.010,0,.115-draw)))@rot.to_4x4()@socket.inverted()
sample(26.5);Hleft=r.matrix_world@r.pose.bones['hand_l'].matrix
removal={}
for side,start,end in (('r',32.2,33.5),('l',33.2,35.8)):
 prefix='Right' if side=='r' else ''
 sample(start);initial={n:prop.pose.bones[prefix+n].matrix.copy() for n in ('Cuff','Hitch')}
 sample(35.8);settled={n:prop.pose.bones[prefix+n].matrix.copy() for n in ('Cuff','Hitch')}
 removal[side]=(start,end,initial,settled)
# Snapshot the original complete performance before writing edited keys.
snap={}
for f in range(398,1010):
 s.frame_set(f);bpy.context.view_layer.update()
 snap[f]={'hand':r.matrix_world@r.pose.bones['hand_l'].matrix,'fore':r.matrix_world@r.pose.bones['lowerarm_l'].matrix,
 'cuff':prop.pose.bones['Cuff'].matrix.copy(),'hitch':prop.pose.bones['Hitch'].matrix.copy(),'wood':wood.matrix_world.copy(),
 'foot':r.matrix_world@r.pose.bones['foot_r'].matrix,'knee':r.matrix_world@r.pose.bones['calf_r'].head}
for f,data in snap.items():
 s.frame_set(f);t=(f-1)/24
 changed=False
 if 19<=t<=22:
  h=mix(Hstart,Hfloor,ease(t,19,19.4))
  if t>=19.4:
   h=Hfloor.copy();h.translation.z+=.055*ease(t,19.4,19.6)+.065*ease(t,20.5,22)
  pole=Vector((1.40,-.10,.32))
  two_bone_ik(r,'l',h.translation,pole,h.to_3x3());changed=True
 if 26.5<=t<31.9:
  draw=.030*math.sin(max(0,t-27.5)*math.tau*1.5)*(1-ease(t,30.35,31))
  waypoint=right_hand(t);waypoint.translation+=Vector((.18,0,.08))
  if t<27:
   u=ease(t,26.5,27);h=mix(Hleft,waypoint,u);h.translation.z+=.12*math.sin(math.pi*u)
  else:h=mix(waypoint,right_hand(t,draw),ease(t,27,27.5))
  if t>=31:
   if t<31.3:h=mix(right_hand(t),waypoint,ease(t,31,31.3))
   else:
    v=ease(t,31.3,31.9);h=mix(waypoint,Hfloor,v);h.translation.z+=.12*math.sin(math.pi*v)
  # Keep the elbow on the free side of the chair, then recover the validated
  # floor-pickup wrist relation while putting the knife down.
  pole=Vector((.90,-.12,.36)).lerp(Vector((1.40,-.10,.32)),ease(t,31.3,31.9))
  two_bone_ik(r,'l',h.translation,pole,h.to_3x3());changed=True
 bpy.context.view_layer.update()
 # Source proven local-phalanx paths, not global-matrix mixing of bent parents.
 for n,m in final.items():
  digit=n.split('_')[0];j=int(n.split('_')[1]);offset={'index':0,'middle':-.08,'ring':-.15,'pinky':-.20,'thumb':0}[digit]
  if digit=='thumb':c=ease(t,18.8,19.2)*(.65+.35*ease(t,20.1,20.4)) if j==1 else ease(t,20.1,20.4)
  else:
   a,b={1:(19.4,19.8),2:(19.66,20.1),3:(19.9,20.1)}[j]
   if digit=='index' and j==1:a,b=19.1,19.5
   c=ease(t,a+offset,b+offset)
  c*=1-ease(t,31.9,32.3)
  opened=mix(base[n],Matrix.Identity(4),ease(t,16.5,18.8))
  r.pose.bones[n].matrix_basis=mix(opened,m,c)
 bpy.context.view_layer.update()
 if changed:
  fore=r.matrix_world@r.pose.bones['lowerarm_l'].matrix;d=fore@data['fore'].inverted()
  prop.pose.bones['Cuff'].matrix=d@data['cuff']
  if t<22:
   prop.pose.bones['Hitch'].matrix=d@data['hitch'];wood.matrix_world=d@data['wood']
  if 19.4<=t<31.9:k.matrix_world=r.matrix_world@r.pose.bones['hand_l'].matrix@socket
  bpy.context.view_layer.update()
  if t<22:
   low=min(p.z for p in getmesh(wood)[0])
   if low<.003:
    wood.matrix_world.translation.z+=.003-low;h=prop.pose.bones['Hitch'].matrix.copy();h.translation.z+=.003-low;prop.pose.bones['Hitch'].matrix=h
  target=(r.matrix_world@r.pose.bones['hand_l'].head)+Vector((0,-.05,-.02))
  cam.rotation_quaternion=(target-cam.location).to_track_quat('-Z','Y')
 if not heel_done and 34<=t<=38:
  amount=ease(t,34,34.6)*(1-ease(t,37,38))
  goal=data['foot'].translation+Vector((-.25,-.06,0))*amount
  approach=ease(t,35.2,36) if t<36 else 1
  if t<36:goal=initial_foot.translation.lerp(goal,approach)
  hip=r.matrix_world@r.pose.bones['thigh_r'].head
  reach=sum(r.data.bones[n].length for n in ('thigh_r','calf_r'))*.995
  if (goal-hip).length>reach:
   horizontal=Vector((goal.x-hip.x,goal.y-hip.y,0)).normalized()*math.sqrt(max(.0001,reach*reach-(goal.z-hip.z)**2))
   goal.x=hip.x+horizontal.x;goal.y=hip.y+horizontal.y
  pole=initial_knee.lerp(data['knee']+Vector((-.12,0,0))*amount,approach)
  orientation=initial_foot.to_quaternion().slerp(data['foot'].to_quaternion(),approach).to_matrix()
  two_bone_ik(r,'r',goal,pole,orientation,kind='leg',align_hinge=True)
 # Sequential removal: the right wrap is off the open hand first, then the
 # left. Once detached, each rope settles independently rather than retaining
 # the old rotating-forearm deformation which drove it under the floor.
 for side,(start,end,initial,settled) in removal.items():
  if t>=start:
   prefix='Right' if side=='r' else ''
   for n in ('Cuff','Hitch'):prop.pose.bones[prefix+n].matrix=mix(initial[n],settled[n],ease(t,start,end))
 bpy.context.view_layer.update()
 for side,o in ropes.items():
  if t<31:continue
  prefix='Right' if side=='r' else '';points,_=getmesh(o);i=min(range(len(points)),key=lambda i:points[i].z);low=points[i].z
  if low<.005:
   if t>=removal[side][0]:
    for n in ('Cuff','Hitch'):
     p=prop.pose.bones[prefix+n];m=p.matrix.copy();m.translation.z+=.005-low;p.matrix=m
    if side=='l':wood.matrix_world.translation.z+=.005-low
   else:
    group=o.vertex_groups[prefix+'Hitch'].index;w=sum(g.weight for g in o.data.vertices[i].groups if g.group==group)
    # Both load-bearing cords have already been severed by30.4. A loose wrap
    # resting on the floor is supported there; never move the human wrist.
    if w>.05:
     p=prop.pose.bones[prefix+'Hitch'];m=p.matrix.copy();dz=(.005-low)/w;m.translation.z+=dz;p.matrix=m
     if side=='l':wood.matrix_world.translation.z+=dz
    else:
     assert t>=30.4
     p=prop.pose.bones[prefix+'Cuff'];m=p.matrix.copy();m.translation.z+=.005-low;p.matrix=m
 bpy.context.view_layer.update()
 for p in r.pose.bones:
  for a in ('location','rotation_quaternion','scale'):p.keyframe_insert(a,frame=f,group=p.name)
 for p in prop.pose.bones:
  for a in ('location','rotation_quaternion','scale'):p.keyframe_insert(a,frame=f,group=p.name)
 for o in (k,wood,cam):
  for a in ('location','rotation_quaternion','scale'):o.keyframe_insert(a,frame=f)
s['complete_contact_pass']=True;s.frame_set(1);bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(Path('outputs/complete-intro/intro-native-v2.blend').resolve()),compress=True)
