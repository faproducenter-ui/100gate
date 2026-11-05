"""Separate, editable Blender scene for inspecting the actual knife/grasp contact."""
import bpy, json, math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

root=Path(ROOT) if 'ROOT' in globals() else Path(__file__).resolve().parents[2]
source=bpy.data.scenes['100gate | Escape choreography']
name='100gate | Knife grip inspection'
window=bpy.context.window
old=bpy.data.scenes.get(name)
if old:
    window.scene=source
    for o in list(old.objects):
        if o.get('escapeReviewOwned') and o.users_collection[0]==old.collection:bpy.data.objects.remove(o,do_unlink=True)
    bpy.data.scenes.remove(old)
scene=bpy.data.scenes.new(name)
scene.world=bpy.data.worlds.new('Grip review world');scene.world.use_nodes=True
scene.world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.16,.18,.22,1)
scene.world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.38
def own(o):
    scene.collection.objects.link(o);o['escapeReviewOwned']=True;return o
def part(role):
    return next(o for o in source.objects if o.get('escapeRole')==role and not o.name.startswith('Left hand preview'))
def copy(o,label):
    n=own(o.copy());n.name=label;n.animation_data_clear();n.parent=None;return n
hand=copy(part('IntroHand'),'QA · right hand');hand.data=hand.data.copy()
hand.data.shape_keys.animation_data_clear()
for key in list(hand.data.shape_keys.key_blocks)[1:]:key.value=1
hand.matrix_world.identity();hand.location=(0,0,0);hand.rotation_euler=(0,0,0);hand.scale=(1,1,1)
socket=part('GripSocket');knife=copy(part('EscapeKnife'),'QA · knife');knife.location=socket.location;knife.rotation_quaternion=socket.rotation_quaternion
for child in part('EscapeKnife').children:
    c=copy(child,'QA · '+child.get('escapeRole',child.name));c.parent=knife;c.matrix_parent_inverse.identity();c.matrix_basis=child.matrix_basis
window.scene=scene;bpy.context.view_layer.update()
handle=next(o for o in knife.children if o.get('escapeRole')=='Contoured walnut handle')
tree=BVHTree.FromPolygons([handle.matrix_world@v.co for v in handle.data.vertices],[p.vertices[:] for p in handle.data.polygons],all_triangles=True)
evaluated=hand.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh()
depths=[]
for i,v in enumerate(mesh.vertices):
    hit,normal,_,d=tree.find_nearest(v.co)
    if (v.co-hit).dot(normal)<0:depths.append((d,i,tuple(round(x,5) for x in (v.co.x,v.co.z,-v.co.y))))
mesh.calc_loop_triangles()
skin=BVHTree.FromPolygons([evaluated.matrix_world@v.co for v in mesh.vertices],[p.vertices[:] for p in mesh.loop_triangles],all_triangles=True)
intersections=tree.overlap(skin)
evaluated.to_mesh_clear()
report={'skinVerticesInside':len(depths),'maxDepthMm':max((d for d,_,_ in depths),default=0)*1000,'worst':sorted(depths,reverse=True)[:8],
        'skinHandleTriangleIntersections':len(intersections),'pads':json.loads(source.get('gripPadStats','{}'))}
print(json.dumps(report))

focus=Vector((-.037,.026,.079))
def camera(label,direction):
    data=bpy.data.cameras.new(label);o=own(bpy.data.objects.new(label,data));data.type='ORTHO';data.ortho_scale=.277
    o.location=focus+Vector(direction).normalized()*.44;o.rotation_euler=(focus-o.location).to_track_quat('-Z','Y').to_euler()
    return o
angles=[('01 · back of hand',(0,-1,.21)),('02 · palm',(0,1,.17)),('03 · thumb side',(-1,.34,.23)),
        ('04 · little-finger side',(1,.20,.29)),('05 · tips / knuckles',(.18,.16,1)),('06 · handle end',(1,.44,-.19))]
cams=[camera(label,angle) for label,angle in angles]
for i,(at,energy,size) in enumerate([((-.22,-.31,.39),11,.28),((.25,.22,.29),8,.32),((-.28,.20,-.10),5,.24)]):
    light=bpy.data.lights.new(f'Grip softbox {i}',type='AREA');light.energy=energy;light.shape='DISK';light.size=size
    o=own(bpy.data.objects.new(light.name,light));o.location=at;o.rotation_euler=(focus-o.location).to_track_quat('-Z','Y').to_euler()
scene.camera=cams[1];scene.render.resolution_x=720;scene.render.resolution_y=620;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
for area in window.screen.areas:
    if area.type=='VIEW_3D':
        space=area.spaces.active;space.overlay.show_overlays=False
        space.region_3d.view_location=focus;space.region_3d.view_distance=.38;space.region_3d.view_rotation=cams[1].rotation_euler.to_quaternion()
bpy.data.libraries.write(str(root/'art/knife-grip-review.blend'),{scene},fake_user=True,compress=True)
out=root.parent.parent/'outputs/intro-animation/grip-review';out.mkdir(exist_ok=True)
(out/'contact.json').write_text(json.dumps(report,indent=2))
