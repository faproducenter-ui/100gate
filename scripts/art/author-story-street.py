"""Authored, bounded night street and grocery set. Original actor meshes stay separate.

Blender 4.5: blender -b -t 4 --python-exit-code 1 --python scripts/art/author-story-street.py
Sources: credited CC0 Poly Haven PBR and Racoon Media CC-BY car. No humans are generated.
"""
import bpy, math, json, struct, hashlib, sys
from pathlib import Path
from mathutils import Vector, Matrix

ROOT=Path(__file__).resolve().parents[2]
SRC=ROOT.parent/'100gate-art-sources/story-street'
OUT=ROOT/'outputs/story-intro/street'
OUT.mkdir(parents=True,exist_ok=True)
P='StoryStreet_'
markers={}

def mat(name,color,rough=.65,metal=0,emit=0):
    m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*color,1)
    b=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value=(*color,1);b.inputs['Roughness'].default_value=rough;b.inputs['Metallic'].default_value=metal
    if emit:b.inputs['Emission Color'].default_value=(*color,1);b.inputs['Emission Strength'].default_value=emit
    return m
def pbr(name,color,normal,rough):
    m=mat(name,(.5,.5,.5));ns=m.node_tree.nodes;ls=m.node_tree.links;b=next(n for n in ns if n.type=='BSDF_PRINCIPLED')
    for path,socket in ((color,'Base Color'),(normal,'Normal'),(rough,'Roughness')):
        if not path or not path.exists():continue
        n=ns.new('ShaderNodeTexImage');n.image=bpy.data.images.load(str(path),check_existing=True)
        if socket!='Base Color':n.image.colorspace_settings.name='Non-Color'
        if socket=='Normal':
            nm=ns.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.45;ls.new(n.outputs['Color'],nm.inputs['Color']);ls.new(nm.outputs['Normal'],b.inputs['Normal'])
        else:ls.new(n.outputs['Color'],b.inputs[socket])
    return m
def uv(o,tile=1):
    layer=o.data.uv_layers.active or o.data.uv_layers.new()
    for f in o.data.polygons:
        axis=max(range(3),key=lambda i:abs(f.normal[i]));u,v=((1,2),(0,2),(0,1))[axis]
        for li in f.loop_indices:
            p=o.data.vertices[o.data.loops[li].vertex_index].co+o.location
            layer.data[li].uv=(p[u]/tile,p[v]/tile)
def empty(name,pos,extras=None):
    o=bpy.data.objects.new(P+name,None);bpy.context.collection.objects.link(o);o.location=pos
    if extras:
        for k,v in extras.items():o[k]=v
    markers[name]=o;return o
def box(name,pos,size,m,edge=.015,tile=None,parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1,location=pos);o=bpy.context.object;o.name=name
    for v in o.data.vertices:v.co=Vector((v.co.x*size[0],v.co.y*size[1],v.co.z*size[2]))
    o.data.update();o.data.materials.append(m)
    if tile:uv(o,tile)
    if edge:
        mod=o.modifiers.new('Manufactured edge','BEVEL');mod.width=edge;mod.segments=2
        mod=o.modifiers.new('Weighted normals','WEIGHTED_NORMAL');mod.keep_sharp=True
    if parent:o.parent=parent
    return o
def cyl(name,pos,r,depth,m,n=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=r,depth=depth,location=pos);o=bpy.context.object;o.name=name;o.data.materials.append(m)
    for f in o.data.polygons:f.use_smooth=len(f.vertices)==4
    return o
def line(name,points,r,m):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.bevel_depth=r;c.bevel_resolution=2
    s=c.splines.new('POLY');s.points.add(len(points)-1)
    for p,v in zip(s.points,points):p.co=(*v,1)
    o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);o.data.materials.append(m);return o
def text(name,words,pos,size,m):
    c=bpy.data.curves.new(name,'FONT');c.body=words;c.size=size;c.align_x='CENTER';c.extrude=.003;c.bevel_depth=.001
    font=Path('C:/Windows/Fonts/arial.ttf')
    if font.exists():c.font=bpy.data.fonts.load(str(font))
    o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);o.location=pos;o.rotation_euler=(math.pi/2,0,0);o.data.materials.append(m);return o
def aim(o,target):o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
def cam(name,pos,target,lens=30):
    d=bpy.data.cameras.new(P+name);o=bpy.data.objects.new(P+name,d);bpy.context.collection.objects.link(o);o.location=pos;d.lens=lens;aim(o,target);markers[name]=o;return o
def light(name,kind,pos,power,color,size,target=None):
    d=bpy.data.lights.new(P+name,kind);d.energy=power;d.color=color
    if kind=='AREA':d.shape='DISK';d.size=size
    elif kind=='POINT':d.shadow_soft_size=size
    o=bpy.data.objects.new(P+name,d);bpy.context.collection.objects.link(o);o.location=pos
    if target:aim(o,target)
    return o
def batch():
    groups={}
    for o in list(bpy.context.scene.objects):
        if o.type in ('FONT','CURVE'):
            bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH')
    for o in bpy.context.scene.objects:
        if o.type=='MESH' and not o.parent and len(o.data.materials)==1:groups.setdefault(o.data.materials[0].name,[]).append(o)
    for name,objs in groups.items():
        if len(objs)<2:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs:o.select_set(True)
        bpy.context.view_layer.objects.active=objs[0];bpy.ops.object.convert(target='MESH');bpy.ops.object.join();bpy.context.object.name='Static street batch | '+name
def material_convert(o):
    for i,old in enumerate(o.data.materials):
        if old.name in converted:o.data.materials[i]=converted[old.name];continue
        name=old.name.lower();col=tuple(old.diffuse_color[:3]);rough=.52;metal=0;emit=0
        if 'carmaterial' in name:col=(.045,.060,.079);rough=.25;metal=.48
        if 'metal' in name:col=(.20,.22,.25);metal=.82;rough=.28
        if 'tires' in name:col=(.018,.020,.022);rough=.85
        if 'lights' in name:col=(.75,.76,.58);emit=1.5
        if 'lights.red' in name:col=(.72,.013,.006);emit=1.1
        if 'lights.orange' in name:col=(.95,.21,.015);emit=.4
        if name=='windows':col=(.12,.17,.20);rough=.12;metal=.15
        new=mat('Racoon car | '+old.name,col,rough,metal,emit)
        if name=='windows':
            b=next(n for n in new.node_tree.nodes if n.type=='BSDF_PRINCIPLED');b.inputs['Alpha'].default_value=.4;new.surface_render_method='DITHERED'
        converted[old.name]=new;o.data.materials[i]=new

def audit_paths(scene):
    door_l=bpy.data.objects[P+'ShopDoorHingeL'];door_r=bpy.data.objects[P+'ShopDoorHingeR']
    def hit(a,b):
        a,b=Vector(a),Vector(b);d=b-a
        found,point,normal,index,obj,matrix=scene.ray_cast(bpy.context.evaluated_depsgraph_get(),a,d.normalized(),distance=d.length)
        return obj.name if found else None
    closed=hit((2,1.7,1.3),(2,4.65,1.3))
    door_l.rotation_euler.z=1.45;door_r.rotation_euler.z=-1.45;bpy.context.view_layer.update()
    path=[Vector(p) for p in [(-8,1.7,.12),(-3,1.7,.12),(2,1.7,.12),(2,4.65,.12)]]
    failures=[];count=0
    for a,b in zip(path,path[1:]):
        d=(b-a).normalized();side=Vector((-d.y,d.x,0))
        for height in (.18,.72,1.12,1.55,1.70):
            for width in (-.17,0,.17):
                offset=side*width+Vector((0,0,height));name=hit(a+offset,b+offset);count+=1
                if name:failures.append(name)
    door_l.rotation_euler.z=0;door_r.rotation_euler.z=0;bpy.context.view_layer.update()
    assert closed,'Closed grocery doors must block the entrance'
    assert not failures,failures
    return {'closedEntranceBlocks':closed,'openDoorPathSamples':count,'openDoorPathHits':failures}

def car_asset():
    """Retain original articulated car parts and pivot tree; retouch materials only."""
    global converted
    converted={}
    source=SRC/'car/vehicles_asset_v2.blend'
    with bpy.data.libraries.load(str(source),link=False) as (a,b):
        keep={'car_box','Cylinder.001','steering_wheel','Empty','Empty.001','door_L','door_R','car_trunk'}
        b.objects=[n for n in a.objects if n.startswith('car-normal-red') or n in keep]
    objs=[o for o in b.objects if o]
    for o in objs:bpy.context.collection.objects.link(o)
    bpy.context.view_layer.update()
    worlds={o:o.matrix_world.copy() for o in objs}
    oldroot=next(o for o in objs if o.name=='car_box')
    for o in objs:
        for c in list(o.constraints):o.constraints.remove(c)
        o.matrix_world=worlds[o]
        if o.type=='MESH':material_convert(o)
        o.hide_render=False;o.hide_viewport=False
    root=empty('Car',(0,0,0),{'assetAuthor':'Racoon Media / eracoon','assetPage':'https://lpc.opengameart.org/content/rigged-car'})
    for o in objs:
        if o is oldroot:continue
        if o.parent is oldroot or o.parent not in objs:
            o.parent=root;o.matrix_world=worlds[o]
    bpy.data.objects.remove(oldroot,do_unlink=True);objs.remove(oldroot)
    bpy.context.view_layer.update()
    pts=[o.matrix_world@Vector(p) for o in objs if o.type=='MESH' for p in o.bound_box]
    lo=Vector([min(p[i] for p in pts) for i in range(3)]);hi=Vector([max(p[i] for p in pts) for i in range(3)])
    scale=4.25/(hi.x-lo.x);root.scale=(scale,)*3
    root.location=Vector((-1.4,-2.2,0))-Vector(((hi.x+lo.x)/2,(hi.y+lo.y)/2,lo.z))*scale
    bpy.context.view_layer.update()
    # Put the authoring pivot at the actual ground-centre, keeping every source
    # child's world transform intact; runtime brake offsets now use metres.
    children_world={o:o.matrix_world.copy() for o in root.children}
    root.location=(-1.4,-2.2,0);root.scale=(1,1,1)
    bpy.context.view_layer.update()
    for o,matrix in children_world.items():o.matrix_world=matrix
    doors={}
    for side in ('L','R'):
        o=next(o for o in objs if o.name=='door_'+side);o.name=P+'CarDoorHinge'+side;markers['CarDoorHinge'+side]=o;doors[side]=o
        o['openRadiansLocalZ']=-1.05 if side=='L' else 1.05
    # Exterior fixes retain source topology: weighted bevels, no replacement car.
    for o in objs:
        if o.type!='MESH':continue
        mod=o.modifiers.new('Subtle sheet-metal edge glint','BEVEL');mod.width=.005;mod.segments=2
        mod=o.modifiers.new('Weighted panel normals','WEIGHTED_NORMAL');mod.keep_sharp=True
    return root,objs,doors

def build():
    bpy.ops.wm.read_factory_settings(use_empty=True);s=bpy.context.scene;s.name='100gate | Night grocery street'
    s.unit_settings.system='METRIC';s.render.engine='CYCLES';s.cycles.samples=24;s.cycles.use_denoising=True
    s.render.resolution_x=1280;s.render.resolution_y=720;s.render.resolution_percentage=100
    s.world=bpy.data.worlds.new('Night world');s.world.use_nodes=True
    s.world.node_tree.nodes.get('Background').inputs[0].default_value=(.045,.064,.12,1);s.world.node_tree.nodes.get('Background').inputs[1].default_value=.35
    s.view_settings.view_transform='AgX';s.render.image_settings.file_format='PNG'
    asphalt=pbr('Poly Haven asphalt 02',SRC/'asphalt-diffuse.jpg',SRC/'asphalt-nor_gl.jpg',SRC/'asphalt-rough.jpg')
    plaster=pbr('Poly Haven worn plaster',ROOT/'public/textures/plaster-diff.jpg',ROOT/'public/textures/plaster-nor_gl.jpg',ROOT/'public/textures/plaster-rough.jpg')
    brickroot=ROOT.parent/'100gate-art-sources/red_brick_plaster_patch_02'
    brick=pbr('Poly Haven exposed brick',brickroot/'Diffuse.jpg',brickroot/'nor_gl.jpg',brickroot/'Rough.jpg')
    concrete=mat('Pale worn concrete',(.29,.31,.31),.92);curb=mat('Kerb granite',(.22,.25,.26),.88)
    mortar=mat('Paving joints',(.07,.075,.078));paint=mat('Faded cream road paint',(.55,.51,.35),.86)
    dark=mat('Powder coated metal',(.025,.038,.044),.38,.65);frame=mat('Shop aluminium',(.23,.28,.29),.34,.78)
    shopwarm=mat('Shop warm enamel',(.78,.76,.65),.51);wood=mat('Shop shelf birch',(.31,.20,.12),.61)
    glass=mat('Night blue glass',(.055,.085,.12),.12,.12)
    b=next(n for n in glass.node_tree.nodes if n.type=='BSDF_PRINCIPLED');b.inputs['Alpha'].default_value=.17;glass.surface_render_method='DITHERED'
    window=mat('Apartment glass',(.035,.055,.075),.21,.12);lit=mat('Occupied warm windows',(.76,.48,.20),.38,emit=.7)
    whiteglow=mat('Grocery sign ivory light',(.72,.82,.73),.48,emit=1.5);sign=mat('Grocery sign green',(.035,.13,.105),.48)
    red=mat('Product oxblood',(.38,.07,.045));yellow=mat('Product wheat',(.60,.39,.12));green=mat('Bottle green',(.055,.16,.09),.26)
    paper=mat('Product offwhite labels',(.73,.68,.51));steel=mat('Lamp galvanised steel',(.12,.15,.17),.37,.67)
    box('Asphalt bounded road',(0,-2.65,-.09),(27,5.3,.18),asphalt,.01,3)
    box('Sidewalk underbed',(0,1.78,.012),(27,3.42,.15),mortar,.005)
    # Separate bevelled paving slabs with staggered expansion joints, not a flat cube.
    for ix in range(36):
        for iy in range(4):
            x=-13.2+ix*.75+(iy%2)*.15;y=.54+iy*.78
            box('Concrete sidewalk slab',(x,y,.105),(.736,.765,.03),concrete,.007)
    for x in range(-13,14):box('Dressed granite kerb',(x,.09,.085),(.98,.18,.17),curb,.018)
    for x in range(-12,13,3):box('Faded lane marker',(x,-3.0,.004),(1.25,.08,.006),paint,.004)
    # Raised utility inspection cover + inset grating away from the actor strip.
    for x in (-7,6):
        box('Storm drain recess',(x,-.20,.004),(.57,.34,.014),dark,.01)
        for i in range(9):box('Drain parallel steel slat',(x-.24+i*.06,-.20,.015),(.019,.32,.025),steel,.005)
    # Distinct rendered frontage sections, recessed window frames, cornice and drain pipes.
    for x,w in [(-9,7),(-3.5,3.8),(8.5,7)]:
        box('Street frontage upper plaster',(x,4.01,5.0),(w,.55,4.5),plaster,.03,2)
        box('Street frontage masonry base',(x,4.01,1.35),(w,.55,2.7),brick,.025,2.4)
        box('Deep stone cornice',(x,3.65,3.12),(w+.15,.35,.19),concrete,.025)
        for xx in [x-w*.31,x,x+w*.31]:
            for z in (4.2,6.1):
                box('Recessed apartment window dark reveal',(xx,3.69,z),(1.12,.08,1.47),dark,.012)
                box('Apartment glazing',(xx,3.63,z),(1.0,.035,1.35),lit if (int(xx*10)+int(z*10))%3==0 else window,.005)
                for dx in (-.55,0,.55):box('Painted window vertical mullion',(xx+dx,3.59,z),(.045,.06,1.47),shopwarm,.008)
                for dz in (-.73,.73):box('Window head and sill',(xx,3.58,z+dz),(1.19,.16,.07),concrete,.009)
        cyl('Rainwater downpipe',(x-w*.46,3.54,3.4),.045,6.8,dark,12)
    # Grocery has a real envelope and open entrance, rather than a blank building.
    box('Grocery floor',(2,5.70,.075),(6.6,4.6,.09),shopwarm,.015)
    for x in (-1.30,5.30):box('Shop side return',(x,5.7,1.67),(.14,4.6,3.1),plaster,.02,2)
    box('Shop back wall',(2,8.0,1.67),(6.7,.14,3.1),plaster,.02,2)
    box('Shop ceiling',(2,5.7,3.24),(6.7,4.6,.14),shopwarm,.02)
    box('Grocery upper frontage',(2,4.03,5.02),(6.8,.6,3.45),plaster,.03,2)
    box('Storefront fascia signboard',(2,3.48,2.96),(6.64,.23,.57),sign,.035)
    text('Grocery illuminated lettering','ПРОДУКТЫ',(2,3.345,2.84),.36,whiteglow)
    for a,b in [(-1.25,1.12),(2.88,5.25)]:
        center=(a+b)/2;wid=b-a
        box('Storefront plinth',(center,3.6,.32),(wid,.20,.40),brick,.015,2)
        box('Grocery display glazing',(center,3.56,1.57),(wid,.025,2.05),glass,.0)
        for xx in (a,b):box('Shop vertical aluminium frame',(xx,3.53,1.5),(.055,.09,2.75),frame,.008)
        box('Shop glazing upper rail',(center,3.53,2.61),(wid,.09,.05),frame,.008)
        box('Shop glazing transom',(center,3.53,1.9),(wid,.07,.04),frame,.008)
    for side,x,direction in [('L',1.15,1),('R',2.85,-1)]:
        hinge=empty('ShopDoorHinge'+side,(x,3.60,.12),{'openRadiansLocalZ':direction*1.45})
        leaf=empty('ShopDoorLeaf'+side,(0,0,0));leaf.parent=hinge
        for xx in (0,direction*.85):box('Shop door side stile',(xx,0,1.18),(.055,.08,2.36),frame,.007,parent=leaf)
        for z in (.025,2.34):box('Shop door header rail',(direction*.425,0,z),(.85,.08,.05),frame,.007,parent=leaf)
        box('Shop door glass',(direction*.425,0,1.18),(.795,.018,2.28),glass,0,parent=leaf)
        box('Shop door push plate',(direction*.70,-.06,1.02),(.05,.028,.35),steel,.012,parent=leaf)
    # Interior shelves parallel to frontage; the central aisle is unobstructed.
    for x in (-.35,4.35):
        for z in (.38,.85,1.33,1.80):
            box('Grocery shelf',(x,4.70,z),(1.45,.52,.045),wood,.014)
            for row in range(5):
                xx=x-.54+row*.26
                if z<1.5:
                    cyl('Stocked preserve jar',(xx,4.67,z+.145),.085,.24,red if row%2 else yellow,12)
                    cyl('Paper jar label',(xx,4.67,z+.14),.086,.10,paper,12)
                    cyl('Jar metal cap',(xx,4.67,z+.272),.09,.018,frame,12)
                else:
                    box('Food carton',(xx,4.67,z+.15),(.18,.24,.25),paper if row%2 else green,.01)
        for xx in (x-.7,x+.7):box('Shelf uprights',(xx,4.7,1.1),(.045,.5,1.8),dark,.007)
    box('Grocery counter',(4.1,6.8,.61),(1.6,.65,.98),wood,.035)
    box('Grocery till screen',(4.1,6.84,1.17),(.26,.14,.2),dark,.018)
    text('Store schedule','ЕЖЕДНЕВНО  08–24',(-.22,3.51,1.45),.10,paper)
    # Cables, lamps, bus-stop-scale furniture and real reused bench make this a place.
    for x in (-9,-1.5,7.2):
        cyl('Streetlamp tapered foot',(x,.57,.22),.16,.20,steel)
        cyl('Streetlamp mast',(x,.57,2.35),.055,4.3,steel)
        line('Streetlamp bent bracket',[(x,.57,4.45),(x,.43,4.61),(x,-.20,4.61)],.045,steel)
        box('Streetlamp hood',(x,-.24,4.56),(.45,.68,.13),dark,.045)
        box('Streetlamp luminous lens',(x,-.24,4.49),(.36,.55,.012),whiteglow,.02)
        light('RoadLamp'+str(x),'AREA',(x,-.24,4.45),140,(.88,.76,.53),.65,(x,-.6,0))
    line('Overhead utility cable',[(-13,3.46,6.65),(-6.5,3.45,6.35),(0,3.45,6.20),(7,3.45,6.35),(13,3.45,6.65)],.016,dark)
    # Functional world markers; actor geometry comes from the existing real human assets.
    for name,pos in [('WalkStart',(-8,1.7,.12)),('WalkMid',(-3,1.7,.12)),('ShopApproach',(2,1.7,.12)),('ShopInterior',(2,4.65,.12)),('ReturnEnd',(-6.5,1.7,.12)),('AbductionHero',(-3.8,1.7,.12)),('Unknown1',(-2.2,.6,.12)),('Unknown2',(-5.2,.6,.12))]:empty(name,pos)
    light('StoreFrontFill','AREA',(2,4.25,2.8),175,(.87,.92,.79),3,(2,1.5,0))
    light('ShopInteriorFill','AREA',(2,6,3.04),125,(1,.91,.73),2,(2,6,0))
    light('NightSoft','AREA',(-5,-3,8),220,(.30,.42,.67),8,(0,2,0))
    s.camera=cam('Establish',(-8,-8,3.2),(1.2,3.8,2.0),28)
    cam('ShopEntry',(-1.3,.1,1.7),(2,4.8,1.3),24)
    cam('Return',(5,-4.1,1.9),(-3,1.7,1.2),31)
    car,parts,doors=car_asset()
    path_audit=audit_paths(s)
    bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'story-street.blend'))
    s.render.filepath=str(OUT/'story-street.png')
    if '--export-only' not in sys.argv:
        bpy.ops.render.render(write_still=True)
        original_camera=s.camera;s.camera=bpy.data.objects[P+'ShopEntry']
        for side,angle in [('L',1.45),('R',-1.45)]:bpy.data.objects[P+'ShopDoorHinge'+side].rotation_euler.z=angle
        s.render.filepath=str(OUT/'story-street-shop-open.png');bpy.ops.render.render(write_still=True)
        for side in ('L','R'):bpy.data.objects[P+'ShopDoorHinge'+side].rotation_euler.z=0
        s.camera=original_camera
    # Runtime copy: batch only truly static non-parented material groups.
    batch()
    for img in bpy.data.images:
        if img.name in {'Render Result','Viewer Node'}:continue
        w,h=img.size
        if max(w,h)>1024:img.scale(max(1,round(w*1024/max(w,h))),max(1,round(h*1024/max(w,h))));img.pixels[0]=img.pixels[0]
    bpy.ops.export_scene.gltf(filepath=str(OUT/'story-street.glb'),export_format='GLB',export_cameras=True,export_lights=False,export_animations=False,export_apply=True,export_extras=True,export_image_format='JPEG',export_jpeg_quality=88)
    binary=(OUT/'story-street.glb').read_bytes();n=struct.unpack_from('<I',binary,12)[0];g=json.loads(binary[20:20+n]);pr=[p for m in g['meshes'] for p in m['primitives']]
    bpy.context.view_layer.update()
    contract={'units':'metres','coordinateConversion':'Blender (x,y,z) to glTF (x,z,-y)','markerWorldBlender':{name:list(o.matrix_world.translation) for name,o in markers.items()},'actorForward':'source actor -Y Blender; use yaw +pi/2 to walk +X','walkPathBlender':[[-8,1.7,.12],[-3,1.7,.12],[2,1.7,.12],[2,4.65,.12]],'doorOpenLocalZ':{'ShopDoorHingeL':1.45,'ShopDoorHingeR':-1.45,'CarDoorHingeL':1.05,'CarDoorHingeR':-1.05},'car':'Separate authored root and real source door pivots; no procedural replacement','lighting':{o.name:{'positionBlender':list(o.location),'color':list(o.data.color),'power':o.data.energy,'type':o.data.type} for o in s.objects if o.type=='LIGHT'},'budget':{'bytes':len(binary),'triangles':sum(g['accessors'][p.get('indices',p['attributes']['POSITION'])]['count']//3 for p in pr),'primitives':len(pr),'materials':len(g['materials']),'images':len(g.get('images',[]))},'provenance':[{'asset':'Asphalt 02','url':'https://polyhaven.com/a/asphalt_02','license':'CC0-1.0'},{'asset':'Worn Plaster Wall','url':'https://polyhaven.com/a/worn_plaster_wall','license':'CC0-1.0'},{'asset':'Red Brick Plaster Patch 02','url':'https://polyhaven.com/a/red_brick_plaster_patch_02','license':'CC0-1.0'},{'asset':'Rigged Car','author':'Racoon Media / eracoon / www.racoon-media.nl','url':'https://lpc.opengameart.org/content/rigged-car','license':'CC-BY-3.0 on source page; CC-BY-4.0 attribution notice included in archive','archiveSha256':hashlib.sha256((SRC/'rigged-car.zip').read_bytes()).hexdigest(),'modifications':'Rescaled to 4.25m length; PBR panel, tyre, metal, window materials replaced; bevel edge glints; original meshes and opening-door hierarchy preserved'}]}
    contract['doorOpenLocalZ'].update({'CarDoorHingeL':-1.05,'CarDoorHingeR':1.05})
    contract['carTransform']={'rootStopBlender':[-1.4,-2.2,0],'rootStartBlender':[-10.0,-2.2,0],
        'frontAxis':'+X','metreRootScale':1,'brakeWindowSeconds':3.0,
        'note':'Translate root from start to stop using eased velocity, do not replace its child matrices.'}
    contract['unknownExitPathsBlender']={
        'nearSide':[[-1.4,-1.90,.36],[-2.05,-.45,0],[-2.05,.85,.12],[-3.0,1.7,.12]],
        'farSide':[[-1.4,-2.50,.36],[-1.4,-3.70,0],[-4.10,-3.70,0],[-4.10,.60,.12],[-4.6,1.7,.12]],
        'note':'Far-side actor must route around the rear x=-4.10; never through the car body.'}
    contract['sourceSha256']={f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in SRC.glob('*.jpg')}
    contract['geometryAudit']=path_audit
    (OUT/'story-street.json').write_text(json.dumps(contract,indent=2),encoding='utf8')
    print('STREET_EXPORTED',contract['budget'],flush=True)

if __name__=='__main__':build()
