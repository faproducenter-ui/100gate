"""Author two working rear doors on the CC0 Innerscene sedan."""
import bpy, bmesh, hashlib, json, math, struct, sys
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

bpy.ops.wm.read_factory_settings(use_empty=True)
repo=Path(__file__).resolve().parents[2]
base=repo/'outputs/quality-overhaul/vehicle'
base.mkdir(parents=True,exist_ok=True)
source=repo.parent/'100gate-art-sources/story-vehicle/innerscene-red-sedan.glb'
assert hashlib.sha256(source.read_bytes()).hexdigest()=='f7420509dc0baeed9c193208f726eecc9e7a1b84d3463f64ed912cc992d9f7e3'
bpy.ops.import_scene.gltf(filepath=str(source),merge_vertices=True)
scene=bpy.context.scene
vctx=bpy.context.view_layer
root=bpy.data.objects['Red four-door sedan']
root.name='SedanRoot'
root['source_asset']='Red four-door sedan'
root['source_author']='Innerscene Corp'
root['source_url']='https://www.innerscene.com/tools/library/3d-parts/red-four-door-sedan-1d32e180'
root['source_license']='CC0-1.0'
root['source_sha256']='f7420509dc0baeed9c193208f726eecc9e7a1b84d3463f64ed912cc992d9f7e3'
root['changes']='Two real apertures, hinged original door panels, separate trim, door cards and grouped wheels'
src_shell=bpy.data.objects['Watertight 14-station body shell']

def parent_keep(o,p):
    w=o.matrix_world.copy()
    o.parent=p
    o.matrix_parent_inverse.identity()
    o.matrix_world=w
    vctx.update()

def new_group(name,loc):
    o=bpy.data.objects.new(name,None);scene.collection.objects.link(o);o.location=loc
    vctx.update();parent_keep(o,root)
    return o

def operator_object(o):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True);vctx.objects.active=o

def duplicate(o,name):
    other=o.copy();other.data=o.data.copy();o.users_collection[0].objects.link(other);other.name=name
    return other

def make_prism(name,shape,y0,y1):
    vs=[(x,y,z) for y in (y0,y1) for x,z in shape]
    n=len(shape)
    faces=[tuple(range(n)),tuple(range(2*n-1,n-1,-1))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    m=bpy.data.meshes.new(name);m.from_pydata(vs,[],faces);m.update()
    bm=bmesh.new();bm.from_mesh(m);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(m);bm.free()
    o=bpy.data.objects.new(name,m);scene.collection.objects.link(o);vctx.update()
    return o

def exact(o,cutter,op,edge_mat):
    # Make new cut faces read as the dark return/jamb, not a raw zero-thickness sheet.
    cutter.data.materials.clear()
    cutter.data.materials.append(edge_mat)
    if edge_mat.name not in o.data.materials:
        o.data.materials.append(edge_mat)
    mod=o.modifiers.new('True aperture volume','BOOLEAN')
    mod.object=cutter;mod.operation=op;mod.solver='EXACT';mod.material_mode='INDEX'
    # Mirror the destination's slot indices: only the last slot is used on cutter faces.
    cutter.data.materials.clear()
    for m in o.data.materials:
        cutter.data.materials.append(m)
    for f in cutter.data.polygons:
        f.material_index=len(o.data.materials)-1
    operator_object(o)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    assert len(o.data.polygons)>0,(o.name,op)
    vctx.update()

# The far/curb-side rears use mirrored cutter geometry traced from original seams.
rear=[(.131,.300),(.933,.300),(.951,.324),(1.033,.5),(1.102,.650),(1.17,.901),(1.181,.937),(1.186,1.115),(.131,1.115)]
def fit(profile,sx,sz,cx=.64,cz=.70):
    return [(cx+sx*(x-cx),cz+sz*(z-cz)) for x,z in profile]
def pbr(name,color,roughness,metallic=0):
    mat=bpy.data.materials.new(name);mat.use_nodes=True;mat.diffuse_color=(*color,1)
    p=mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=mat.diffuse_color
    p.inputs['Metallic'].default_value=metallic
    p.inputs['Roughness'].default_value=roughness
    return mat

jamb=pbr('Door return | dark graphite elastomer',(.029,.033,.037),.53,.12)
polymer=pbr('Door card | soft-touch graphite',(.045,.050,.056),.61)
vinyl=pbr('Door armrest | grained black vinyl',(.022,.026,.030),.72)
latch=pbr('Door latch | satin brushed alloy',(.205,.225,.24),.29,.77)
pocket=pbr('Door storage recess',(.009,.013,.018),.83)
cloth=bpy.data.materials.get('interior')

def manifold_report(o):
    bm=bmesh.new();bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
    r={'vertices':len(bm.verts),'faces':len(bm.faces),'boundaryEdges':sum(len(e.link_faces)==1 for e in bm.edges),'nonmanifoldEdges':sum(len(e.link_faces)!=2 for e in bm.edges)}
    bm.free()
    return r

# The source bead and sill each span both doors; retain UVs and split their moving aft portions.
def split_trim(old,x_cut,hinge):
    aft=duplicate(old,old.name+' | moving rear section')
    for obj,clear_inner in [(old,False),(aft,True)]:
        bm=bmesh.new();bm.from_mesh(obj.data)
        inv=obj.matrix_world.inverted()
        local_normal=(obj.matrix_world.to_3x3().transposed() @ Vector((1,0,0))).normalized()
        bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
            plane_co=inv@Vector((x_cut,0,0)),plane_no=local_normal,dist=1e-7,clear_outer=not clear_inner,clear_inner=clear_inner)
        bm.to_mesh(obj.data);bm.free();obj.data.update()
        assert len(obj.data.polygons)>0,obj.name
    parent_keep(aft,hinge)
    return aft

def uv_side(m):
    uv=m.uv_layers.get('UVMap') or m.uv_layers.new(name='UVMap')
    for p in m.polygons:
        for i in p.loop_indices:
            v=m.vertices[m.loops[i].vertex_index].co
            uv.data[i].uv=((v.x-.14)/1.05,(v.z-.28)/.72)

def plate(name,shape,y0,y1,mat,hinge,bevel=.004):
    ob=make_prism(name,shape,min(y0,y1),max(y0,y1))
    ob.data.materials.append(mat);uv_side(ob.data)
    if bevel:
        mod=ob.modifiers.new('Soft injection-moulded edge','BEVEL')
        mod.width=bevel;mod.segments=3;mod.limit_method='ANGLE';mod.affect='EDGES'
        operator_object(ob);bpy.ops.object.modifier_apply(modifier=mod.name)
    for f in ob.data.polygons:
        f.use_smooth=abs(f.normal.y)<.995
    mod=ob.modifiers.new('Weighted trim normals','WEIGHTED_NORMAL')
    operator_object(ob);bpy.ops.object.modifier_apply(modifier=mod.name)
    parent_keep(ob,hinge)
    return ob

def rounded(center_x,center_z,rw,rh,count=24):
    return [(center_x+rw*math.cos(2*math.pi*i/count),center_z+rh*math.sin(2*math.pi*i/count)) for i in range(count)]

def card(side,sign,hinge):
    pre='RearDoor_'+side+'_'
    def p(name,shape,inner,outer,mat,b=.004):
        return plate(pre+name,shape,sign*inner,sign*outer,mat,hinge,b)
    main=[(.184,.355),(.855,.355),(.918,.376),(1.008,.580),(1.080,.777),(1.098,.884),(1.073,.931),(.228,.931),(.184,.9)]
    p('Moulded_inner_card',main,.729,.775,polymer,.007)
    p('Padded_waist_rail',[(.178,.9),(.205,.889),(1.092,.889),(1.118,.924),(1.091,.957),(.193,.955),(.177,.944)],.716,.773,vinyl,.009)
    p('Cloth_insert',[(.222,.781),(.266,.747),(.92,.747),(1.005,.785),(1.024,.865),(.994,.886),(.253,.885),(.222,.854)],.723,.742,cloth,.004)
    p('Armrest_padded_saddle',[(.295,.714),(.359,.688),(.792,.695),(.898,.727),(.901,.749),(.86,.762),(.417,.751),(.3,.738)],.676,.737,vinyl,.011)
    # Three joined sections preserve a functional negative-space grab under the handle.
    p('Grab_front_boss',[(.337,.639),(.395,.639),(.397,.719),(.352,.731),(.33,.703)],.668,.731,polymer,.008)
    p('Grab_rear_boss',[(.791,.646),(.832,.655),(.847,.722),(.822,.745),(.78,.727)],.668,.733,polymer,.008)
    p('Grab_hollow_bridge',[(.369,.653),(.411,.636),(.785,.651),(.823,.682),(.804,.703),(.422,.69),(.371,.688)],.651,.694,polymer,.009)
    p('Latch_recess',[(.214,.806),(.236,.789),(.392,.792),(.412,.814),(.400,.861),(.376,.873),(.232,.872),(.214,.851)],.710,.731,pocket,.007)
    p('Latch_actual_lever',[(.238,.821),(.256,.811),(.366,.823),(.381,.847),(.372,.856),(.344,.848),(.248,.846)],.700,.723,latch,.005)
    p('Map_pocket_dark_recess',[(.366,.445),(.403,.425),(.826,.438),(.873,.46),(.874,.536),(.826,.550),(.418,.536),(.365,.510)],.718,.735,pocket,.005)
    p('Map_pocket_lip',[(.361,.443),(.405,.414),(.824,.429),(.883,.460),(.894,.519),(.879,.531),(.827,.496),(.409,.485),(.373,.506)],.685,.728,polymer,.007)
    p('Speaker_grille',rounded(.273,.471,.064,.072),.715,.732,vinyl,.005)
    for i in range(7):
        z=.419+i*.017
        width=.047*math.sqrt(max(.12,1-((z-.47)/.063)**2))
        p('Speaker_slot_'+str(i),[(.274-width,z),(.274+width,z),(.274+width,z+.005),(.274-width,z+.005)],.7135,.717,pocket,.001)

hinges={}; leaves={}
for side,sign,number in [('R',1,3),('L',-1,1)]:
    ys=(.705,1.19) if sign>0 else (-1.19,-.705)
    cut_jamb=make_prism(side+'_aperture_cutter',fit(rear,1.000,1.000),*ys)
    cut_leaf=make_prism(side+'_door_cutter',fit(rear,.991,.987),*ys)
    leaf=duplicate(src_shell,'Door_Rear_'+side+'_OriginalShell')
    exact(leaf,cut_leaf,'INTERSECT',jamb)
    exact(src_shell,cut_jamb,'DIFFERENCE',jamb)
    bpy.data.objects.remove(cut_leaf,do_unlink=True);bpy.data.objects.remove(cut_jamb,do_unlink=True)
    hinge=new_group('Sedan_Door_Rear_'+side+'_Pivot',(.142,sign*.875,.683))
    hinge['axis']='local +Z in Blender / local +Y in glTF'
    hinge['open_angle_radians']=sign*1.08
    hinge['seat_position_original_blender']=[.68,sign*.408,.68]
    parent_keep(leaf,hinge)
    s='.001' if sign>0 else ''
    movables=[f'Door panel shut line.{number:03d}', 'Rear side door glass'+s,'Rear side door glass rubber seal'+s,f'Recessed handle pocket.{number:03d}',f'Satin door pull handle.{number:03d}']
    for name in movables: parent_keep(bpy.data.objects[name],hinge)
    split_trim(bpy.data.objects['Beltline satin bead'+s],.135,hinge)
    split_trim(bpy.data.objects['Painted door glazing lower sill'+s],.135,hinge)
    card(side,sign,hinge)
    hinges[side]=hinge;leaves[side]=leaf
src_shell.name='BodyShell_RealDualRearApertures'

# Source tyre/rim/brake/sidewall objects are separate; local Y is the Blender axle, local Z after glTF.
wheel_groups=[]
for j,(name,x,y) in enumerate([('Front_L',-1.4015,-.81),('Front_R',-1.4015,.81),('Rear_L',1.4017,-.81),('Rear_R',1.4017,.81)]):
    wheel=new_group('Sedan_Wheel_'+name,(x,y,.3312))
    wheel['rolling_axis']='local +Y in Blender; local -Z in glTF/Three.js'
    wheel['radius_m']=.328
    suff='' if j==0 else f'.{j:03}'
    spinning=['107 reused Alloy_five_spoke_rim','107 reused Sculpted_tyre','107 reused Center_cap','107 reused Valve_stem','Siped tread blocks','Ventilated brake rotor','Brake rotor hat']+['107 reused Lug_'+str(i) for i in range(1,6)]
    for n in spinning:
        child=bpy.data.objects[n+suff]
        centroid=sum([child.matrix_world @ Vector(p) for p in child.bound_box],Vector((0,0,0)))/8
        assert (centroid-Vector((x,y,.3312))).length<.36,(child.name,list(centroid),[x,y])
        parent_keep(child,wheel)
    assert len(wheel.children)==12,(wheel.name,len(wheel.children))
    old_cen=next(child for child in wheel.children if 'Lug_1' in child.name)
    local_origin=old_cen.matrix_world.copy()
    wheel.rotation_euler.y=.71;vctx.update()
    assert old_cen.matrix_world != local_origin, old_cen.name
    wheel.rotation_euler.y=0;vctx.update()
    wheel_groups.append({'name':wheel.name,'pivot':list(wheel.matrix_world.translation),'children':[c.name for c in wheel.children]})

def bvh(o):
    return BVHTree.FromPolygons([o.matrix_world @ v.co for v in o.data.vertices],[tuple(f.vertices) for f in o.data.polygons])
def ray_set(side):
    sign=1 if side=='R' else -1
    bs=bvh(src_shell);bl=bvh(leaves[side])
    results=[]
    for x,z in [(x,z) for x in (.54,.69,.84) for z in (.48,.67,.84)]:
        o=Vector((x,.63*sign,z));d=Vector((0,sign,0))
        a=bs.ray_cast(o,d,.44);b=bl.ray_cast(o,d,.44)
        results.append({'x':x,'z':z,'shellHit':a[3] is not None,'doorHit':b[3] is not None})
    return results
report={'axis':{'blender':'forward -X, right +Y, up +Z','gltf':'forward -X, right -Z, up +Y','street':'rotate Y by pi to face +X; right ends up +Z'},'source':root['source_url'],'author':root['source_author'],'sha256':root['source_sha256'],'license':root['source_license'],'wheels':wheel_groups,'bodyTopology':manifold_report(src_shell),'doors':{}}
assert report['bodyTopology']['nonmanifoldEdges']==0,report['bodyTopology']
for side,hinge in hinges.items():
    angle=hinge['open_angle_radians']
    closed=ray_set(side)
    assert all(not hit['shellHit'] and hit['doorHit'] for hit in closed),(side,closed)
    hinge.rotation_euler.z=angle;vctx.update()
    opened=ray_set(side)
    assert all(not hit['shellHit'] and not hit['doorHit'] for hit in opened),(side,opened)
    topology=manifold_report(leaves[side])
    assert topology['nonmanifoldEdges']==0,(side,topology)
    hinge.rotation_euler.z=0;vctx.update()
    report['doors'][side]={'pivot':list(hinge.matrix_world.translation),'angle':angle,
        'closed':closed,'open':opened,'topology':topology,'parts':[c.name for c in hinge.children]}
    for frame,value in ((1,0),(12,0),(38,angle),(60,angle)):
        hinge.rotation_euler.z=value
        hinge.keyframe_insert(data_path='rotation_euler',index=2,frame=frame,group='Rear '+side+' hinge')
    hinge.animation_data.action.name='Rear_'+side+'_Closed_To_Open_Review'

scene.frame_start=1;scene.frame_end=60;scene.render.fps=24
scene.frame_set(38)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(base/'story-sedan.blend'))
scene.frame_set(1)

# Reduce the source's 300+ primitives without joining independently animated
# owners. The editable blend above still contains every original piece.
pivots={root,*hinges.values(),*(bpy.data.objects[w['name']] for w in wheel_groups)}
groups={p:[] for p in pivots}
for obj in [o for o in root.children_recursive if o.type=='MESH']:
    p=obj.parent
    while p and p not in pivots:
        p=p.parent
    assert p,obj.name
    if obj.parent!=p:parent_keep(obj,p)
    groups[p].append(obj)
for parent,objects in sorted(groups.items(),key=lambda kv:kv[0].name):
    assert objects,parent.name
    bpy.ops.object.select_all(action='DESELECT')
    # Blender join deletes one child object, not its shared texture/mesh data.
    for obj in objects:obj.select_set(True)
    vctx.objects.active=objects[0]
    bpy.ops.object.join()
    vctx.objects.active.name=parent.name+'_Geometry'
for img in bpy.data.images:
    w,h=img.size
    if max(w,h)>768:
        img.scale(max(1,round(w*768/max(w,h))),max(1,round(h*768/max(w,h))))
        img.pixels[0]=img.pixels[0]
target=base/'story-sedan.glb'
bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',export_extras=True,
    export_animations=False,export_yup=True,export_image_format='JPEG',export_jpeg_quality=88)
data=target.read_bytes()
glb=json.loads(data[20:20+struct.unpack_from('<I',data,12)[0]])
primitives=[p for mesh in glb['meshes'] for p in mesh['primitives']]
report['gltf']={'bytes':len(data),'primitives':len(primitives),
    'triangles':sum(glb['accessors'][p['indices']]['count']//3 for p in primitives),
    'textures':len(glb.get('images',[]))}
assert len(primitives)<=100,report['gltf']
(base/'story-sedan.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print('PASS',json.dumps(report['gltf']),flush=True)
