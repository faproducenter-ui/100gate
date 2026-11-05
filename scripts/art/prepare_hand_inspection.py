"""Put the existing actor's hand in open space for uncensored 360° inspection."""
import bpy,math,json
from pathlib import Path
from mathutils import Matrix,Vector
root=Path.cwd();out=root/'outputs/hand-mesh-rework'
s=bpy.context.scene
r=next(o for o in s.objects if o.type=='ARMATURE');k=next(o for o in s.objects if o.type=='EMPTY')
b=next(o for o in s.objects if o.type=='MESH' and o.name.endswith('MakeHuman body'))
bpy.context.view_layer.update()
hand=r.pose.bones['hand_r'];world=r.matrix_world@hand.matrix
grip=world.inverted()@k.matrix_world
orientation=world.to_3x3()
def update():bpy.context.view_layer.update()
def aim(name,direction):
    p=r.pose.bones[name];old=p.matrix.copy();at=old.translation
    q=(p.tail-p.head).rotation_difference(direction)
    p.matrix=Matrix.Translation(at)@q.to_matrix().to_4x4()@Matrix.Translation(-at)@old;update()
upper=r.pose.bones['upperarm_r'];lower=r.pose.bones['lowerarm_r']
target=r.matrix_world.inverted()@Vector((-.26,-.47,1.08))
shoulder=upper.head.copy();delta=target-shoulder;reach=delta.length;axis=delta.normalized()
l1,l2=upper.length,lower.length
assert reach<l1+l2-.001,'Inspection posture is out of reach'
h=(l1*l1+reach*reach-l2*l2)/(2*reach)
pole=r.matrix_world.inverted()@Vector((-.40,-.17,.92))-shoulder
pole=(pole-axis*pole.dot(axis)).normalized()
elbow=shoulder+axis*h+pole*math.sqrt(l1*l1-h*h)
aim(upper.name,elbow-shoulder);aim(lower.name,target-lower.head)
hand.matrix=r.matrix_world.inverted()@(Matrix.Translation(r.matrix_world@target)@orientation.to_4x4())
update()
k.matrix_world=r.matrix_world@hand.matrix@grip;update()
s['inspection_grip_invariant_error']=max(abs(v) for row in ((r.matrix_world@hand.matrix).inverted()@k.matrix_world-grip) for v in row)
focus=k.matrix_world@Vector((-.012,0,.028))
for name,direction in (
    ('Grip · Palm',(.10,1,.12)),('Grip · Dorsal',(.10,-1,.12)),
    ('Grip · Left',(-1,.08,.12)),('Grip · Right',(1,.08,.12)),
    ('Grip · Top',(.12,.05,1)),('Grip · Butt',(.12,.05,-1)),
):
    data=bpy.data.cameras.new(name);cam=bpy.data.objects.new(name,data);s.collection.objects.link(cam)
    data.type='PERSP';data.lens=42;data.clip_start=.004
    cam.location=focus+k.matrix_world.to_3x3()@Vector(direction).normalized()*.37
    cam.rotation_euler=(focus-cam.location).to_track_quat('-Z','Y').to_euler()
s.camera=next(o for o in s.objects if o.name=='Grip · Palm')
s.render.resolution_x=1200;s.render.resolution_y=900;s.render.resolution_percentage=100
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(out/'hand-contact-review.blend'),compress=True)
print('Inspection posture prepared, hand-to-knife transform preserved.')
