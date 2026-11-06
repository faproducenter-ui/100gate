"""Refine the existing knife: real bevels, authored UVs and packed PBR maps.

Keep the hand socket, handle silhouette/size and original mesh parts. Do not
scale a grip problem away. Original source files remain unchanged.
"""
import bpy,math,json,numpy as np
from pathlib import Path
from mathutils import Vector
out=Path.cwd()/'outputs/cinematic-intro';s=bpy.context.scene;s.frame_set(1)
knife=next(o for o in s.objects if o.type=='EMPTY')
parts=[o for o in knife.children_recursive if o.type=='MESH']
rng=np.random.default_rng(100661)

def packed(name,pixels,color=False):
    h,w=pixels.shape[:2]
    if pixels.ndim==2:pixels=np.repeat(pixels[:,:,None],3,axis=2)
    rgba=np.concatenate((pixels,np.ones((h,w,1))),axis=2).astype(np.float32)
    image=bpy.data.images.new(name,width=w,height=h)
    image.colorspace_settings.name='sRGB' if color else 'Non-Color'
    image.pixels.foreach_set(rgba.ravel());image.pack();return image

def normal(height,strength):
    dy,dx=np.gradient(height);n=np.stack((-dx*strength,-dy*strength,np.ones_like(dx)),axis=-1)
    n/=np.linalg.norm(n,axis=-1)[:,:,None];return n*.5+.5

def tex(mat,img,input_name,normal_map=False):
    bs=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    for link in list(bs.inputs[input_name].links):mat.node_tree.links.remove(link)
    t=mat.node_tree.nodes.new('ShaderNodeTexImage');t.image=img
    if normal_map:
        n=mat.node_tree.nodes.new('ShaderNodeNormalMap');n.inputs['Strength'].default_value=.45
        mat.node_tree.links.new(t.outputs['Color'],n.inputs['Color']);mat.node_tree.links.new(n.outputs['Normal'],bs.inputs['Normal'])
    else:mat.node_tree.links.new(t.outputs['Color'],bs.inputs[input_name])

u,v=np.meshgrid(np.linspace(0,1,1024,endpoint=False),np.linspace(0,1,2048,endpoint=False))
grain=rng.normal(0,1,(2048,1))*.55+np.sin(v*math.tau*670+.2*np.sin(u*9))*.25+rng.normal(0,.12,u.shape)
steel_color=packed('Knife | satin machining · sRGB',np.array((.65,.67,.69))*(1+grain[:,:,None]*.025),True)
steel_rough=packed('Knife | machining roughness',np.clip(.30+grain*.026,.22,.41))
steel_normal=packed('Knife | microscopic transverse grind · tangent normal',normal(grain,.20))
u,v=np.meshgrid(np.linspace(0,1,1024,endpoint=False),np.linspace(0,1,1024,endpoint=False))
warp=v+.014*np.sin(u*math.tau*1.7)+.005*np.sin(u*math.tau*6)
growth=np.sin(warp*math.tau*27+.6*np.sin(warp*math.tau*7))+.28*np.sin(warp*math.tau*81+.3*np.sin(u*13))
fibers=np.sin(warp*math.tau*223+np.sin(u*math.tau*9))*.18
pores=rng.normal(0,.11,u.shape);height=growth*.18+fibers+pores
wood_color=packed('Knife | walnut end-to-end grain · sRGB',np.array((.30,.185,.102))*(1+growth[:,:,None]*.16+fibers[:,:,None]*.12+pores[:,:,None]*.1),True)
wood_rough=packed('Knife | worn oiled walnut roughness',np.clip(.48+growth*.025+pores*.12,.36,.61))
wood_normal=packed('Knife | walnut pores · tangent normal',normal(height,.85))
material_copies={};reports=[]
for obj in parts:
    before=len(obj.data.vertices);obj.data=obj.data.copy()
    for i,mat in enumerate(list(obj.data.materials)):
        if mat not in material_copies:
            copied=mat.copy();copied.name='Refined | '+mat.name;material_copies[mat]=copied
            bs=next(n for n in copied.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
            if 'walnut' in mat.name.lower():
                tex(copied,wood_color,'Base Color');tex(copied,wood_rough,'Roughness');tex(copied,wood_normal,'Normal',True)
            elif 'steel' in mat.name.lower() or 'bevel' in mat.name.lower():
                tex(copied,steel_color,'Base Color');tex(copied,steel_rough,'Roughness');tex(copied,steel_normal,'Normal',True)
                bs.inputs['Metallic'].default_value=.96
                if 'bevel' in mat.name.lower():
                    # Fine edge finish, not an artificial emissive silver line.
                    for link in list(bs.inputs['Roughness'].links):copied.node_tree.links.remove(link)
                    bs.inputs['Roughness'].default_value=.23
        obj.data.materials[i]=material_copies[mat]
    blade='blade' in obj.name.lower()
    if blade:
        layer=obj.data.uv_layers.new(name='Blade machining UV') if not obj.data.uv_layers else obj.data.uv_layers.active
        for face in obj.data.polygons:
            axis=max(range(3),key=lambda j:abs(face.normal[j]))
            for li in face.loop_indices:
                p=obj.data.vertices[obj.data.loops[li].vertex_index].co
                if axis==1:uv=((p.x+.014)/.028,(p.z-.056)/.129)
                elif axis==0:uv=((p.y+.003)/.006,(p.z-.056)/.129)
                else:uv=((p.x+.014)/.028,(p.y+.003)/.006)
                layer.data[li].uv=uv
    bevel=obj.modifiers.new('Physical edge rounding · submillimetre','BEVEL')
    bevel.width=.00012 if blade else .00016;bevel.segments=3
    choices={i.identifier for i in bevel.bl_rna.properties['limit_method'].enum_items}
    if 'ANGLE' in choices:bevel.limit_method='ANGLE'
    bevel.angle_limit=math.radians(35);bevel.use_clamp_overlap=True
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    for polygon in obj.data.polygons:polygon.use_smooth=True
    wn=obj.modifiers.new('Machined surface normals','WEIGHTED_NORMAL');wn.keep_sharp=True
    bpy.ops.object.modifier_apply(modifier=wn.name)
    if obj.name.startswith(('Oval walnut','Exposed tang')):
        uv=obj.data.uv_layers.active
        for face in obj.data.polygons:
            if abs(face.normal.z)<.85:continue
            for li in face.loop_indices:
                p=obj.data.vertices[obj.data.loops[li].vertex_index].co
                uv.data[li].uv=(.5+p.x/.028,.5+p.y/.028)
    # Applied physical bevels leave n-gon caps; export real tangent-ready
    # triangles with the authored split normals, not a failed normal map.
    tri=obj.modifiers.new('Tangent-ready machined caps','TRIANGULATE');tri.min_vertices=5
    if hasattr(tri,'keep_custom_normals'):tri.keep_custom_normals=True
    bpy.ops.object.modifier_apply(modifier=tri.name)
    reports.append({'part':obj.name,'beforeVertices':before,'afterVertices':len(obj.data.vertices),'scale':list(obj.scale),'uvLayers':list(obj.data.uv_layers.keys())})
    obj.select_set(False)
# Keep held contact completely unchanged. Only the separate floor holds are
# grounded against the actual newly bevelled mesh, not the root/pivot guess.
from sys import path
path.insert(0,str(Path(__file__).resolve().parent));from cinematic_geometry import getmesh
if knife.animation_data and knife.animation_data.action:knife.animation_data.action=knife.animation_data.action.copy()
ground=[]
for frame in (1,81,241):
    s.frame_set(frame);bpy.context.view_layer.update();minimum=min(p.z for o in parts for p in getmesh(o)[0])
    knife.location.z+=.0005-minimum;knife.keyframe_insert('location',frame=frame)
    ground.append({'frame':frame,'oldMinimumMm':minimum*1000,'newMinimumMm':.5})
for name,pos,target in [('Cine · Knife floor',(1.45,-.85,.25),(1.24,-.47,.014))]:
    data=bpy.data.cameras.new(name);cam=bpy.data.objects.new(name,data);s.collection.objects.link(cam);data.lens=58;data.clip_start=.008
    cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
# The imported wardrobe retained a disconnected AlphaMapTexture image node.
# It changes no shading, but confuses glTF sampler gathering. Clean a COPY of
# the runtime material only; original authoring materials remain intact.
cleaned={}
for obj in s.objects:
    if obj.type!='MESH' or obj.get('authoring_archive'):continue
    for i,mat in enumerate(list(obj.data.materials)):
        if not mat or not mat.use_nodes:continue
        unused=[n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and not any(o.is_linked for o in n.outputs)]
        if not unused:continue
        if mat not in cleaned:
            new=mat.copy();new.name='Runtime | '+mat.name
            for node in list(new.node_tree.nodes):
                if node.type=='TEX_IMAGE' and not any(o.is_linked for o in node.outputs):new.node_tree.nodes.remove(node)
            cleaned[mat]=new
        obj.data.materials[i]=cleaned[mat]
s.frame_set(1);s.name='100gate | Refined native character + field knife'
s['knife_refinement']='Original socket/size; bevel + real UV, packed authored walnut/steel PBR; held frame unchanged'
(out/'knife-refinement.json').write_text(json.dumps({'parts':reports,'floorHolds':ground,'heldPoseTransformChanged':False,'images':[i.name for i in (steel_color,steel_rough,steel_normal,wood_color,wood_rough,wood_normal)]},indent=2))
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(out/'cinematic-props-refined.blend'),compress=True)
