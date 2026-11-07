"""Original folded paper carrier and products; all original geometry/material."""
import bpy,math,json,numpy as np
from pathlib import Path
from mathutils import Vector
OUT=Path.cwd()/'outputs/story-intro/grocery';OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
s=bpy.context.scene;s.name='100gate | kraft grocery carrier'
root=bpy.data.objects.new('StoryGroceryBag',None);s.collection.objects.link(root)
def mat(name,color,rough=.7):
    m=bpy.data.materials.new(name);m.use_nodes=True
    bs=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Roughness'].default_value=rough
    return m
paper=mat('Kraft paper · fine pressed grain',(.42,.26,.12))
nodes=paper.node_tree.nodes;bs=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
rng=np.random.default_rng(100);pixels=np.ones((512,512,4),np.float32)
noise=rng.normal(0,.014,(512,512));pixels[:,:,:3]=np.array([.57,.40,.23])+noise[:,:,None]
im=bpy.data.images.new('Original kraft grain',width=512,height=512);im.pixels.foreach_set(pixels.ravel());im.pack()
tex=nodes.new('ShaderNodeTexImage');tex.image=im;paper.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
glass=mat('Green glass beverage',(.08,.16,.07),.21);cap=mat('Bottle aluminium cap',(.6,.55,.39),.35)
label=mat('Unbranded grocery label',(.73,.68,.50));bread=mat('Folded bread wrapper',(.65,.51,.33))
def mesh(name,v,f,m):
    d=bpy.data.meshes.new(name);d.from_pydata(v,[],f);d.update();o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.parent=root;d.materials.append(m);return o
# Twelve points per ring include side gussets, creases and a wavy open lip.
points=[(-.13,-.075),(-.05,-.079),(.05,-.078),(.13,-.075),(.123,-.02),(.110,0),(.123,.02),(.13,.075),(.05,.078),(-.05,.077),(-.13,.075),(-.12,0)]
v=[];levels=[-.375,-.35,-.22,-.09]
for ring,z in enumerate(levels):
    for i,(x,y) in enumerate(points):
        w=1 if ring>0 else .91
        v.append((x*w+.0015*math.sin(i*2+ring),y*w,z+(0.003*math.sin(i*1.6) if ring==3 else 0)))
f=[tuple(range(11,-1,-1))]
for j in range(3):
    for i in range(12):f.append((j*12+i,j*12+(i+1)%12,(j+1)*12+(i+1)%12,(j+1)*12+i))
o=mesh('Folded kraft shell · open rim',v,f,paper)
solid=o.modifiers.new('Actual 0.65mm paper wall','SOLIDIFY');solid.thickness=.00065
bevel=o.modifiers.new('Soft creases','BEVEL');bevel.width=.0015;bevel.segments=2
bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project();bpy.ops.object.mode_set(mode='OBJECT');o.select_set(False)
for side in (-1,1):
    c=bpy.data.curves.new('Rolled paper handle','CURVE');c.dimensions='3D';c.bevel_depth=.0042;c.bevel_resolution=3
    sp=c.splines.new('BEZIER');sp.bezier_points.add(4)
    for p,co in zip(sp.bezier_points,[(-.065,side*.068,-.12),(-.064,side*.067,-.034),(0,side*.062,0),(.064,side*.067,-.034),(.065,side*.068,-.12)]):
        p.co=co;p.handle_left_type=p.handle_right_type='AUTO'
    ob=bpy.data.objects.new('Paper handle '+str(side),c);s.collection.objects.link(ob);ob.parent=root;c.materials.append(paper)
def lathe(name,xy,profile,m):
    v=[];f=[];N=32
    for radius,z in profile:
        for i in range(N):v.append((xy[0]+radius*math.cos(i*math.tau/N),xy[1]+radius*math.sin(i*math.tau/N),z))
    for j in range(len(profile)-1):
        for i in range(N):f.append((j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i))
    obj=mesh(name,v,f,m)
    for p in obj.data.polygons:p.use_smooth=True
lathe('Bottle · shoulder neck and lip',(-.060,.008),[(.027,-.35),(.029,-.18),(.025,-.10),(.012,-.068),(.012,-.015),(.014,-.012)],glass)
lathe('Bottle cap',(-.060,.008),[(.014,-.017),(.015,-.015),(.015,-.006),(.001,-.006)],cap)
lathe('Unbranded bottle label',(-.060,.008),[(.0295,-.25),(.0295,-.17)],label)
lathe('Bread wrapper',(.045,.011),[(.031,-.35),(.038,-.18),(.034,-.06),(.018,-.04),(.021,-.035)],bread)
root['license']='Original 100gate geometry and original generated grain, no third-party images'
s.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'story-grocery-bag.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'story-grocery-bag.glb'),export_animations=False,export_apply=True,export_image_format='JPEG',export_extras=True)
(OUT/'story-grocery-bag.json').write_text(json.dumps({'origin':'top centre of carrier handles','sizeMeters':[.26,.16,.375],'license':root['license']}))
