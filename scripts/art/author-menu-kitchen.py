"""Author and render the 100gate kitchen menu plates in Blender 4.5.

Run: blender -b --disable-autoexec --python-exit-code 1 --python
scripts/art/author-menu-kitchen.py [-- --draft]. Editable packed .blend and
lossless evidence go to outputs; only compressed plates ship to the browser.
"""
from __future__ import annotations
from math import cos, sin, pi
from mathutils import Vector
from pathlib import Path
from random import Random
import json
from hashlib import sha256
import shutil
import subprocess
import sys
import bpy

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT.parent / '100gate-art-sources'
TEXTURES = ROOT / 'public/textures'
OUT = ROOT / 'outputs/menu-kitchen'
PUBLIC = ROOT / 'public/assets/menu'
DRAFT = '--draft' in sys.argv
OUT.mkdir(parents=True, exist_ok=True)
PUBLIC.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
scene = bpy.context.scene
scene.name = '100gate | Kitchen at 02:16'
rng = Random(100216)


def new(name, color, rough=.65, metal=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    return m, b


def image(m, path, srgb=True):
    n = m.node_tree.nodes.new('ShaderNodeTexImage')
    n.image = bpy.data.images.load(str(path), check_existing=True)
    if not srgb:
        n.image.colorspace_settings.name = 'Non-Color'
    return n


def mapped(name, paths, tint=(1,1,1), strength=.55):
    m,b = new(name, (.3,.3,.3))
    nodes,links = m.node_tree.nodes,m.node_tree.links
    c = image(m,paths[0])
    mix = nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY'
    mix.inputs[0].default_value=1
    mix.inputs[2].default_value=(*tint,1)
    links.new(c.outputs['Color'],mix.inputs[1]);links.new(mix.outputs[0],b.inputs['Base Color'])
    n = image(m,paths[1],False); nm = nodes.new('ShaderNodeNormalMap')
    nm.inputs['Strength'].default_value=strength
    links.new(n.outputs['Color'],nm.inputs['Color']);links.new(nm.outputs[0],b.inputs['Normal'])
    rough = image(m,paths[2],False);links.new(rough.outputs['Color'],b.inputs['Roughness'])
    return m


def aged(name, color, damaged, rough=.52, metal=0, coarse=5.5, threshold=.59, detail=190, depth=.024):
    m,b=new(name,color,rough,metal)
    nodes,links=m.node_tree.nodes,m.node_tree.links
    co=nodes.new('ShaderNodeTexCoord')
    low=nodes.new('ShaderNodeTexNoise');low.inputs['Scale'].default_value=coarse
    low.inputs['Detail'].default_value=5;low.inputs['Roughness'].default_value=.73
    links.new(co.outputs['Object'],low.inputs['Vector'])
    c=nodes.new('ShaderNodeValToRGB');c.color_ramp.elements.remove(c.color_ramp.elements[1])
    c.color_ramp.elements[0].position=.17
    c.color_ramp.elements[0].color=(*(v*.46 for v in color),1)
    for pos,col in ((.43,color),(threshold-.025,color),(threshold,damaged),(.82,tuple(v*.33 for v in damaged))):
        e=c.color_ramp.elements.new(pos);e.color=(*col,1)
    links.new(low.outputs['Fac'],c.inputs[0]);links.new(c.outputs[0],b.inputs['Base Color'])
    hi=nodes.new('ShaderNodeTexNoise');hi.inputs['Scale'].default_value=detail;hi.inputs['Detail'].default_value=2
    links.new(co.outputs['Object'],hi.inputs['Vector'])
    bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.26
    bump.inputs['Distance'].default_value=depth
    links.new(hi.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs[0],b.inputs['Normal'])
    ramp=nodes.new('ShaderNodeMapRange')
    ramp.inputs['To Min'].default_value=max(.08,rough-.2);ramp.inputs['To Max'].default_value=min(1,rough+.35)
    links.new(low.outputs['Fac'],ramp.inputs['Value']);links.new(ramp.outputs[0],b.inputs['Roughness'])
    return m


def uv(o, tile):
    layer=o.data.uv_layers.active or o.data.uv_layers.new()
    for f in o.data.polygons:
        normal=f.normal
        axis=max(range(3),key=lambda i:abs(normal[i]))
        u,v=((1,2),(0,2),(0,1))[axis]
        for li in f.loop_indices:
            p=o.data.vertices[o.data.loops[li].vertex_index].co+o.location
            layer.data[li].uv=(p[u]/tile,p[v]/tile)


def bevel(o,w,n=3):
    if not w: return
    m=o.modifiers.new('Rounded wear edge','BEVEL');m.width=w;m.segments=n
    o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')


def box(name,p,size,m,r=.008,tile=None):
    bpy.ops.mesh.primitive_cube_add(size=1,location=p)
    o=bpy.context.object;o.name=name
    for v in o.data.vertices: v.co=Vector(tuple(a*b for a,b in zip(v.co,size)))
    o.data.update();o.data.materials.append(m);bevel(o,r)
    if tile:uv(o,tile)
    return o


def cyl(name,p,r,d,m,rotation=(0,0,0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=40,radius=r,depth=d,location=p,rotation=rotation)
    o=bpy.context.object;o.name=name;o.data.materials.append(m)
    for f in o.data.polygons:f.use_smooth=len(f.vertices)==4
    bevel(o,.003,2)
    return o


def pipe(name,coords,r,m):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.bevel_depth=r;c.bevel_resolution=4
    s=c.splines.new('BEZIER');s.bezier_points.add(len(coords)-1)
    for p,v in zip(s.bezier_points,coords):
        p.co=v;p.handle_left_type='AUTO';p.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,c);scene.collection.objects.link(o);o.data.materials.append(m)
    return o


def round_loop(x,y,z,dx,dy,r):
    result=[]
    for cx,cy,start in ((dx*.5-r,dy*.5-r,0),(-dx*.5+r,dy*.5-r,90),(-dx*.5+r,-dy*.5+r,180),(dx*.5-r,-dy*.5+r,270)):
        for j in range(9):
            a=pi*(start+90*j/8)/180
            result.append((x+cx+r*cos(a),y+cy+r*sin(a),z))
    return result


def shell(name,rings,m,cap_bottom=True):
    n=len(rings[0])
    verts=sum(rings,[])
    faces=[(k*n+i,k*n+(i+1)%n,(k+1)*n+(i+1)%n,(k+1)*n+i)
           for k in range(len(rings)-1) for i in range(n)]
    if cap_bottom:faces.append(tuple(range(len(verts)-n,len(verts))))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new(name,mesh);scene.collection.objects.link(o);mesh.materials.append(m)
    for p in mesh.polygons:p.use_smooth=len(p.vertices)==4
    return o


def lathe(name,p,profiles,m):
    x,y,z=p
    return shell(name,[[(x+r*cos(i*2*pi/48),y+r*sin(i*2*pi/48),z+h) for i in range(48)] for r,h in profiles],m)


def linen_towel(m):
    cols,rows=45,31
    verts=[];faces=[]
    for v in range(rows):
        t=v/(rows-1)
        for i in range(cols):
            u=i/(cols-1)
            wave=.015*cos(u*pi*12+t*.61)+.009*sin(u*pi*5-t*.39)
            x=1.48+u*(.305+.019*t)+t*.041
            y=1.650 + wave*(.4+t*.75)+.042*(t**4)
            z=.724-.395*t+.018*sin(u*pi*3.6+.2)*t+.004*sin(u*pi*14)*t
            verts.append((x,y,z))
    for v in range(rows-1):
        for i in range(cols-1):
            n=v*cols+i;faces.append((n,n+1,n+1+cols,n+cols))
    mesh=bpy.data.meshes.new('Draped kitchen linen')
    mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new(mesh.name,mesh);scene.collection.objects.link(o);mesh.materials.append(m)
    for p in mesh.polygons:p.use_smooth=True
    o.modifiers.new('Fabric selvage thickness','SOLIDIFY').thickness=.002


def scanned(name,slug,h,xy,angle):
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE/slug/(slug+'_1k.gltf')))
    objs=set(bpy.data.objects)-before
    bpy.context.view_layer.update()
    from mathutils import Matrix
    items=[o for o in objs if o.type=='MESH']
    verts=[o.matrix_world@Vector(p) for o in items for p in o.bound_box]
    lo=Vector(tuple(min(v[i] for v in verts) for i in range(3)))
    hi=Vector(tuple(max(v[i] for v in verts) for i in range(3)))
    mid=(lo+hi)*.5;mid.z=lo.z
    xf=Matrix.Translation((*xy,0))@Matrix.Rotation(angle,4,'Z')@Matrix.Scale(h/(hi.z-lo.z),4)@Matrix.Translation(-mid)
    for o in objs:
        if o.parent not in objs:o.matrix_world=xf@o.matrix_world
    for o in items:o.name=name+' | '+o.name


plaster=mapped('Worn damp plaster • Poly Haven', [TEXTURES/f'plaster-{x}.jpg' for x in ('diff','nor_gl','rough')],(.59,.61,.53),.78)
boards=mapped('Dark stained floorboards', [TEXTURES/f'wood-{x}.jpg' for x in ('color','normal','rough')],(.46,.39,.31),.7)
agedwood=aged('Pitch-stained door jamb',(.034,.023,.017),(.012,.010,.008),.68,coarse=13,threshold=.51,detail=180)
tile=[aged(f'Crackled old cream glaze {i+1}',(v,v*.92,v*.79),(.06,.054,.042),.43,coarse=14,threshold=.63,depth=.012)
      for i,v in enumerate((.32,.36,.39,.42,.46))]
grout=aged('Dirty recessed grout',(.075,.068,.052),(.028,.026,.023),.95,coarse=13,threshold=.5)
paint=aged('Peeling sage kitchen paint',(.092,.127,.099),(.13,.071,.036),.63,coarse=9,threshold=.57)
enamel=aged('Nicotine-aged chipped enamel',(.47,.43,.32),(.12,.054,.022),.54,coarse=13,threshold=.62,depth=.013)
steel=aged('Oxidized brushed steel',(.19,.18,.164),(.105,.056,.030),.40,.86,coarse=10,threshold=.55,detail=224,depth=.01)
black=aged('Dried rubber',(.024,.022,.017),(.010,.009,.007),.88,coarse=9,threshold=.48)
bakelite=aged('Old brown Bakelite',(.038,.018,.011),(.094,.061,.031),.45,coarse=13,threshold=.57)
ceramic=aged('Cracked ivory cup glaze',(.39,.326,.218),(.068,.041,.025),.46,coarse=17,threshold=.64)

# Camera at the open door. Left side is negative space; the right wall
# and boards give perspective without an ultra-wide distorted silhouette.
box('Joists under floor',(0,0,-.06),(5.8,7,.12),boards,.001,1.8)
for i in range(25):
    for j in range(5):
        x=-2.76+i*.229
        y=-3.21+j*1.45+(i%3)*.12
        box('Oak floorboard', (x,y,.002+rng.uniform(-.002,.002)),(.226,1.447,.018),boards,.002,2.25)
box('Ceiling', (0,0,2.86), (5.8,6.9,.16),plaster,.006,1.9)
box('Right wall',(2.74,0,1.43),(.12,6.9,2.86),plaster,.004,1.8)
box('Left wall',(-2.8,0,1.43),(.12,6.9,2.86),plaster,.004,1.8)
window_x=1.06; window_w=.79; sill=1.29; lintel=2.35; back=2.58
def backseg(a,b,c,d):
    box('Exterior plaster section',((a+b)/2,back,(c+d)/2),(b-a,.19,d-c),plaster,.004,1.8)
backseg(-2.8,window_x-window_w/2,0,2.86)
backseg(window_x+window_w/2,2.8,0,2.86)
backseg(window_x-window_w/2,window_x+window_w/2,0,sill)
backseg(window_x-window_w/2,window_x+window_w/2,lintel,2.86)
box('Far baseboard',(0,2.453,.07),(5.4,.06,.133),agedwood)
box('Right baseboard',(2.654,0,.07),(.056,5.65,.133),agedwood)

# Actual open window with thick reveals, sill, inner bead and a faint exterior.
for x in (window_x-window_w/2+.032,window_x+window_w/2-.032):
    box('Distressed window stile',(x,2.559,(sill+lintel)/2),(.060,.184,lintel-sill),agedwood)
for z in (sill+.029,(sill+lintel)/2,lintel-.029):
    box('Distressed window rail',(window_x,2.549,z),(window_w-.066,.140,.055),agedwood)
box('Deep sill',(window_x,2.46,sill),(.95,.32,.065),agedwood)
glass,bs=new('Dirt on thin window glass',(.26,.31,.32),.27)
bs.inputs['Transmission Weight'].default_value=.87;bs.inputs['IOR'].default_value=1.42
box('Window pane',(window_x,2.62,(sill+lintel)/2),(window_w-.122,.006,lintel-sill-.124),glass,0)
night,nb=new('Exterior sky',(.017,.025,.033),.88)
nb.inputs['Emission Color'].default_value=(.012,.023,.039,1);nb.inputs['Emission Strength'].default_value=.25
box('Exterior dark yard',(window_x,4,1.75),(4,.08,3.4),night)
for i in range(4):
    x=.24+i*.52
    pipe('Exterior bare branch',[(x,3.55,1.27),(x-.07,3.6,1.68),(x+.095,3.52,1.97),(x+.027,3.56,2.41)],.011,agedwood)

# Main cabinet run, inset doors with worn frames, porcelain back splash.
for i in range(16):
    for j in range(4):
        x=-.47+i*.169
        z=1.00+j*.156
        box('Tile recessed bed',(x,2.466,z),(.169,.024,.156),grout,.001)
        if not ((i,j) in {(2,2),(13,1),(14,3)}):
            o=box('Glazed earthenware tile',(x,2.445-rng.uniform(0,.003),z),(.163,.025,.150),rng.choice(tile),.003)
            o.rotation_euler.y=rng.uniform(-.012,.012)
box('Cabinet carcass',(.79,2.124,.463),(2.67,.66,.726),agedwood,.020)
box('Cabinet upper left brace',(-.02,2.124,.865),(1.05,.66,.085),agedwood,.009)
box('Cabinet upper right brace',(1.99,2.124,.865),(.26,.66,.085),agedwood,.009)
box('Toe recess',(.79,1.936,.085),(2.53,.279,.166),black)
for i,x in enumerate((-.225,.445,1.115,1.785)):
    box('Enamel cabinet face', (x,1.771,.535),(.616,.052,.704),paint,.018)
    box('Inset panel', (x,1.735,.514),(.488,.031,.487),paint,.019)
    for side in (-1,1):
        box('Mitered stile', (x+side*.271,1.722,.537),(.038,.025,.658),paint,.008)
    for z in (.236,.835):
        box('Mitered rail',(x,1.721,z),(.503,.025,.044),paint,.007)
    p=x+.203
    pipe('Oxidized handle',[(p,1.712,.726),(p,1.668,.723),(p,1.668,.620),(p,1.712,.616)],.010,steel)
    for z in (.617,.727):
        cyl('Handle rivet',(p,1.715,z),.015,.009,steel,(pi/2,0,0))
    for z in (.281,.790):
        cyl('Barrel hinge',(x-.293,1.724,z),.014,.064,steel)
counter=aged('End-grain counter under grease',(.09,.060,.030),(.032,.023,.017),.57,coarse=8,threshold=.55)
for x,w in ((-.035,1.33),(1.91,.43)):
    box('Counter with rounded edge',(x,2.11,.958),(w,.72,.077),counter,.013)
for y,w in ((1.832,.15),(2.391,.112)):
    box('Counter beside inset sink',(1.17,y,.958),(1.11,w,.077),counter,.013)
shell('Pressed metal bowl: rim, shoulder and true inset basin',
      [round_loop(1.17,2.13,z,w,d,r) for z,w,d,r in (
          (.991,1.10,.50,.053),(1.005,1.075,.478,.057),(1.005,.80,.403,.068),
          (.970,.748,.366,.071),(.825,.656,.283,.089),(.799,.600,.236,.09))],steel)
cyl('Sink drain flange',(1.165,2.145,.800),.051,.006,steel)
cyl('Sink drain deep cap',(1.165,2.145,.806),.026,.007,black)
for i in range(7):
    ang=i*2*pi/7
    cyl('Drain perforation',(1.165+cos(ang)*.035,2.145+sin(ang)*.035,.805),.004,.007,black)
cyl('Mixer body',(1.18,2.378,1.040),.034,.116,steel)
pipe('Gooseneck spout',[(1.18,2.378,1.070),(1.18,2.38,1.209),(1.18,2.306,1.265),(1.18,2.202,1.222),(1.18,2.183,1.173)],.013,steel)
cyl('Faucet aerator',(1.18,2.183,1.175),.016,.026,steel)
for x in (1.088,1.271):
    cyl('Tap valves',(x,2.376,1.033),.024,.064,steel)
    pipe('Cross tap handle',[(x-.043,2.376,1.070),(x,2.376,1.077),(x+.043,2.376,1.070)],.012,bakelite)
pipe('Exposed plumbing',[(1.80,2.424,.014),(1.80,2.424,.17),(2.43,2.424,.176),(2.43,2.424,.90)],.015,steel)

# Under-door silhouette of a rounded period refrigerator, door seams, latch,
# logo plate, hinge lugs and rubber. No contemporary printed brand.
box('Refrigerator case',(2.31,1.480,.966),(.682,.690,1.875),enamel,.063)
for p in ((2.11,1.24,.040),(2.53,1.23,.040),(2.12,1.71,.040),(2.53,1.71,.040)):
    cyl('Rubber level foot',p,.040,.07,black)
for z,h in ((.655,1.171),(1.607,.683)):
    box('Refrigerator compressed rubber seal',(2.31,1.124,z),(.655,.051,h),black,.042)
    box('Stamped enamel door',(2.31,1.068,z),(.668,.096,h-.009),enamel,.050)
    for zz in (z-.093,z+.091):
        box('Fridge handle mount',(2.086,1.001,zz),(.050,.068,.042),bakelite,.013)
    pipe('Curved cast fridge pull',[(2.086,.976,z-.108),(2.078,.950,z-.048),(2.078,.950,z+.057),(2.086,.976,z+.101)],.017,steel)
    for zz in (z-.20,z+.20):
        box('Stamped hinge cap',(2.629,1.080,zz),(.043,.124,.068),steel,.011)
for i in range(9):
    box('Fridge kickplate slot',(2.07+i*.055,1.124,.101),(.029,.017,.010),black,.004)
box('Anonymous patinated refrigerator badge',(2.494,1.013,1.827),(.085,.006,.018),steel,.004)

# Background cupboard and open shelf are built as joinery, with wall
# brackets and individual bowls. Worn table and chairs are Poly Haven meshes.
for x,w,z,h in ((-.87,.82,1.983,.68),(.02,.67,2.009,.62)):
    box('Upper cupboard case',(x,2.258,z),(w,.398,h),agedwood,.022)
    box('Inset raised outer frame',(x,2.040,z),(w-.046,.056,h-.045),paint,.016)
    box('Recessed center',(x,2.005,z),(w-.156,.033,h-.163),paint,.013)
    pipe('Cupboard pull',[(x+w*.31,1.982,z-.126),(x+w*.31,1.949,z-.139),
                          (x+w*.31,1.949,z-.205),(x+w*.31,1.982,z-.216)],.008,steel)
box('Open crockery shelf',(-.68,2.253,1.445),(.99,.377,.055),agedwood,.015)
for x in (-1.03,-.28):
    pipe('Shelf iron bracket',[(x,2.43,1.441),(x,2.421,1.245),(x,2.277,1.398),(x,2.10,1.439)],.012,steel)
for i in range(3):
    lathe('Stack of stoneware on shelf',(-.89,2.224,1.476+i*.027),
          [(.115,.035),(.104,.033),(.067,.006),(.037,.002),(.001,.002)],ceramic)

scanned('Scanned timber table','painted_wooden_table',.758,(.73,-.19),-.15)
scanned('Chair close / askew','painted_wooden_chair_02',.924,(.47,-1.04),.44)
scanned('Chair by window','painted_wooden_chair_02',.899,(1.62,.50),-1.85)
cup=(.872,-.139,.756)
lathe('Enamel coffee cup with inner wall',cup,
      [(.042,.003),(.047,.012),(.054,.087),(.055,.093),(.052,.095),(.048,.092),(.045,.030),(.036,.017),(.001,.017)],ceramic)
pipe('Small cup handle',[(.921,-.139,.831),(.950,-.139,.842),(.964,-.139,.807),(.942,-.139,.781),(.917,-.139,.785)],.007,ceramic)
lathe('Shallow scuffed plate',(.523,-.205,.755),
      [(.074,.001),(.092,.006),(.114,.023),(.111,.028),(.099,.022),(.075,.010),(.001,.010)],ceramic)
pipe('Tarnished tablespoon',[(.992,-.337,.766),(1.082,-.372,.767),(1.128,-.388,.768)],.006,steel)
lathe('Spoon bowl',(1.151,-.398,.763),[(.018,.002),(.022,.009),(.018,.011),(.009,.006),(.001,.004)],steel).scale.x=1.56
paper=aged('Tea-stained paper',(.22,.179,.115),(.109,.072,.044),.91,coarse=15,threshold=.62,depth=.009)
note=box('Unprinted curled note',(.50,.080,.762),(.190,.130,.002),paper,.001)
note.rotation_euler.z=-.23
towel=aged('Grease stained coarse towel',(.164,.132,.078),(.051,.038,.022),.84,coarse=20,threshold=.62,detail=265,depth=.012)
pipe('Cabinet towel rail',[(1.49,1.714,.721),(1.49,1.646,.728),
                         (1.82,1.648,.728),(1.82,1.714,.721)],.011,steel)
linen_towel(towel)

# Lamp with actual glass outline, opaque base and emissive filament. Lighting
# is sampled analytically by Cycles with physically correct distance falloff.
lamp=(.86,.25,2.176)
pipe('Stranded pendant wire',[(.84,.245,2.82),(.87,.26,2.63),(.875,.246,2.39),(.86,.25,2.245)],.007,black)
cyl('Ceiling mount',(.84,.245,2.792),.073,.033,bakelite)
lathe('Pendant socket ribs',(.86,.25,2.217),[(.034,.006),(.034,.017),(.040,.020),(.036,.026),(.040,.031),(.036,.038),(.039,.042),(.035,.062),(.021,.073),(.001,.073)],bakelite)
bulb,b=new('Warm frosted bulb glow',(.62,.28,.072),.30)
b.inputs['Emission Color'].default_value=(1,.47,.14,1);b.inputs['Emission Strength'].default_value=4.4
lathe('Bare rounded light bulb',lamp,[(.001,-.047),(.025,-.044),(.042,-.024),(.046,-.006),(.040,.016),(.029,.036),(.024,.050),(.001,.051)],bulb)
def light(name,typ,pos,energy,color,size,target=None):
    data=bpy.data.lights.new(name,typ);data.energy=energy;data.color=color
    if typ=='AREA':data.shape='DISK';data.size=size
    else:data.shadow_soft_size=size
    o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=pos
    if target:o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
    return data
LAMP_WATTS=62
primary=light('Bare bulb physical light','POINT',(.86,.25,2.129),LAMP_WATTS,(1,.76,.47),.052)
light('Window cool exterior spill','AREA',(1.07,2.48,1.86),8,(.42,.59,1),.78,(.66,-1.3,.95))
light('Doorway bounced sky, low level','AREA',(-1.45,-3.46,1.83),4.9,(.52,.62,.71),1.8,(.47,.21,.9))
scene.world=bpy.data.worlds.new('Moonless air')
scene.world.use_nodes=True
background=scene.world.node_tree.nodes.get('Background')
background.inputs[0].default_value=(.10,.145,.21,1);background.inputs[1].default_value=.04

# Cropped, defocused doorframe gives depth and room for the HTML labels.
box('Near jamb dark silhouette',(-1.91,-2.56,1.39),(.23,.20,2.82),agedwood,.015)
box('Near jamb weatherstrip',(-1.776,-2.56,1.39),(.037,.255,2.79),black,.009)
camd=bpy.data.cameras.new('Doorway, 31 mm');cam=bpy.data.objects.new(camd.name,camd)
scene.collection.objects.link(cam);scene.camera=cam
cam.location=(-1.55,-3.20,1.44)
target=Vector((.18,1.18,1.22))
cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
camd.lens=31
camd.dof.use_dof=True
camd.dof.focus_distance=(Vector((.83,.21,1.05))-cam.location).length
camd.dof.aperture_fstop=3.5;camd.dof.aperture_blades=7
scene.render.engine='CYCLES';scene.cycles.samples=10 if DRAFT else 42
scene.cycles.use_denoising=True
scene.cycles.max_bounces=7;scene.cycles.diffuse_bounces=4;scene.cycles.glossy_bounces=4
scene.render.resolution_x,scene.render.resolution_y=(720,405) if DRAFT else (1440,810)
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB'
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
scene.view_settings.exposure=.21

def render(name):
    path=OUT/(name+'.png')
    scene.render.filepath=str(path)
    bpy.ops.render.render(write_still=True)
    return path

if DRAFT:
    render('kitchen-draft')
else:
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'kitchen.blend'),compress=True)
    first=render('kitchen-steady')
    primary.energy=LAMP_WATTS*.16
    b.inputs['Emission Strength'].default_value=4.4*.13
    second=render('kitchen-dim')
    ffmpeg=shutil.which('ffmpeg')
    if not ffmpeg:raise RuntimeError('ffmpeg is required to encode WebP menu plates')
    plates={}
    for src,name in ((first,'kitchen.webp'),(second,'kitchen-dim.webp')):
        dst=PUBLIC/name
        subprocess.run([ffmpeg,'-y','-v','error','-i',str(src),'-c:v','libwebp',
                        '-quality','87','-compression_level','6','-frames:v','1',str(dst)],check=True)
        assert 0<dst.stat().st_size<700_000,(name,dst.stat().st_size)
        plates[name]={'bytes':dst.stat().st_size,'sha256':sha256(dst.read_bytes()).hexdigest()}
    manifest=json.dumps({
        'render':{'engine':'Blender 4.5 / Cycles','samples':42,'denoised':True,
                  'viewTransform':'AgX / Medium High Contrast','lensMm':31,'fStop':3.5,
                  'steadyLampWatts':LAMP_WATTS,'dimLampFraction':.16,'sameCamera':True},
        'resolution':[1440,810],
        'source':'scripts/art/author-menu-kitchen.py',
        'plates':plates,
        'licensed':[
            {'asset':'Painted Wooden Chair 02','author':'Kirill Sannikov','source':'https://polyhaven.com/a/painted_wooden_chair_02','license':'CC0-1.0'},
            {'asset':'Painted Wooden Table','author':'Kirill Sannikov','source':'https://polyhaven.com/a/painted_wooden_table','license':'CC0-1.0'},
            {'asset':'Worn Plaster Wall','author':'Dimitrios Savva','source':'https://polyhaven.com/a/worn_plaster_wall','license':'CC0-1.0'},
            {'asset':'Wood Planks','author':'Amal Kumar','source':'https://polyhaven.com/a/wood_planks','license':'CC0-1.0'},
        ],
        'authored':'Original kitchen architecture, cabinetry, cast fittings, porcelain, enamel, and lighting.'
    },indent=2)+'\n'
    (OUT/'asset-provenance.json').write_text(manifest,encoding='utf-8')
    (PUBLIC/'kitchen-sources.json').write_text(manifest,encoding='utf-8')
