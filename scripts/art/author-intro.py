"""Blender 4.5: independent editable intro scene + glTF for the existing chapter.
Run from the hand production scene via MCP, or with art/character-hands.blend open.
The control coordinates are chapter metres relative to (0, 3.6, 2.8), glTF Y up.
"""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Vector, Matrix, Euler, Quaternion
from mathutils.bvhtree import BVHTree
import heapq

root = Path(ROOT) if 'ROOT' in globals() else Path(__file__).resolve().parents[2]
source = bpy.data.scenes['100gate | Hand production QA']
name = '100gate | Escape choreography'
assert name not in bpy.data.scenes, 'Use a fresh authoring session or a unique scene name'
scene = bpy.data.scenes.new(name)
window = bpy.context.window
window.scene = source
deps = bpy.context.evaluated_depsgraph_get()
B = Matrix(((1,0,0),(0,0,-1),(0,1,0)))
def pos(p): return B @ Vector(p)
def rot(e): return (B @ Euler(e, 'XYZ').to_matrix() @ B.transposed()).to_quaternion()
def obj(name, data=None):
    o = bpy.data.objects.new(name, data); scene.collection.objects.link(o);o['escapeRole']=name;return o
def source_mesh(id):
    c = next(c for c in source.collection.children if c.get('100gate_asset_id') == id)
    o = next(o for o in c.objects if o.type == 'MESH')
    mesh = bpy.data.meshes.new_from_object(o.evaluated_get(deps), preserve_all_data_layers=True, depsgraph=deps)
    mesh.transform(Matrix.Scale(1/c['display_scale'],4) @ Matrix.Translation(-Vector(c['display_origin'])) @ o.matrix_world)
    return mesh

mesh=source_mesh('player-hand-open'); closed=source_mesh('player-hand-grip')
assert len(mesh.vertices)==len(closed.vertices) and all(a.vertices[:]==b.vertices[:] for a,b in zip(mesh.polygons,closed.polygons))
for name_ in [uv.name for uv in mesh.uv_layers if uv.name!='GameHandUV']:
    mesh.uv_layers.remove(mesh.uv_layers[name_])
for name_ in [attr.name for attr in mesh.color_attributes]: mesh.color_attributes.remove(mesh.color_attributes[name_])
mesh.uv_layers.active=mesh.uv_layers['GameHandUV']; mesh.uv_layers.active.active_render=True
hand=obj('IntroHand',mesh)
hand.shape_key_add(name='Basis'); grasp=hand.shape_key_add(name='Grasp')
for a,b in zip(grasp.data,closed.vertices): a.co=b.co
bpy.data.meshes.remove(closed)

def mat(name,rgb,metal,rough):
    m=bpy.data.materials.new(name); m.use_nodes=True; m.diffuse_color=(*rgb,1)
    bs=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    bs.inputs['Base Color'].default_value=(*rgb,1);bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=rough
    return m
steel=mat('Oxidized steel',(.23,.27,.28),.92,.39)
edge=mat('Worn cutting bevel',(.51,.54,.53),.97,.24)
wood=mat('Oiled walnut scales',(.079,.034,.016),.0,.52)
tang=mat('Dark full tang',(.115,.126,.123),.9,.44)
brass=mat('Patinated brass pins',(.31,.19,.065),.84,.43)
knife=obj('EscapeKnife')
def marker(name, p, parent=None):
    o=obj(name); o.empty_display_size=.04; o.parent=parent; o.location=pos(p); return o

# Model origin is grip centre. +Y points toward the tip, +X is the sharpened side.
# Cross-sections: spine, shoulder of grind, cutting bevel, and mirrored back.
verts=[]; faces=[]; mids=[]
sections=[(.049,-.010,.009,.0032),(.065,-.013,.012,.0034),(.110,-.014,.013,.0028),(.140,-.011,.010,.0021),(.167,-.002,-.001,.0006)]
for y,l,r,t in sections:
    for x,z in [(l,t),(r-.003,t*.64),(r,.00036),(r,-.00036),(r-.003,-t*.64),(l,-t)]: verts.append(pos((x,y,z)))
for i in range(len(sections)-1):
    for j in range(6): faces.append((6*i+j,6*i+(j+1)%6,6*(i+1)+(j+1)%6,6*(i+1)+j));mids.append(int(j in [1,2,3]))
faces.extend([tuple(reversed(range(6))),tuple(range(len(verts)-6,len(verts)))]);mids.extend([0,0])
def mesh_obj(name,vs,fs,parent,mats):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vs,[],fs);mesh.update()
    o=obj(name,mesh);o.parent=parent
    for m in mats: mesh.materials.append(m)
    return o
blade=mesh_obj('Drop-point blade',verts,faces,knife,[steel,edge]);
for f,i in zip(blade.data.polygons,mids): f.material_index=i
def oval(name, rings, offset, material):
    v=[pos((math.cos(j*math.tau/16)*x,y,offset+math.sin(j*math.tau/16)*z)) for y,x,z in rings for j in range(16)]
    f=[(i*16+j,(i+1)*16+j,(i+1)*16+(j+1)%16,i*16+(j+1)%16) for i in range(len(rings)-1) for j in range(16)]
    f += [tuple(range(15,-1,-1)),tuple(range(len(v)-16,len(v)))]
    o=mesh_obj(name,v,f,knife,[material]);
    for p in o.data.polygons: p.use_smooth=len(p.vertices)==4
    return o
rings=[(-.066,.006,.003),(-.061,.011,.007),(-.041,.012,.008),(.026,.011,.008),(.047,.012,.007),(.052,.008,.004)]
handle=oval('Contoured walnut handle',rings,0,wood)
# Lengthwise grain with per-corner UVs at the wrap seam. CC0 Poly Haven, see art/README.md.
uv=handle.data.uv_layers.new(name='HandleUV')
for p in handle.data.polygons:
    wrap=any(v%16==15 for v in p.vertices) and any(v%16==0 for v in p.vertices)
    for loop in p.loop_indices:
        v=handle.data.loops[loop].vertex_index; ring,j=divmod(v,16)
        uv.data[loop].uv=((rings[ring][0]+.066)/.118*.82, (16 if wrap and j==0 else j)/16*.66) if len(p.vertices)==4 else (.9+.08*math.cos(j*math.tau/16),.8+.08*math.sin(j*math.tau/16))
material_dir=root.parent.parent/'outputs/intro-animation/knife-material'
if (material_dir/'col.jpg').exists():
    nodes=wood.node_tree.nodes; links=wood.node_tree.links; bs=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
    bs.inputs['Base Color'].default_value=(1,1,1,1)
    for file,slot in [('col','Base Color'),('rough','Roughness'),('nor_gl','Normal')]:
        image=bpy.data.images.load(str(material_dir/(file+'.jpg')),check_existing=False)
        if file!='col': image.colorspace_settings.name='Non-Color'
        image.scale(256,256);image.pack()
        tex=nodes.new('ShaderNodeTexImage');tex.image=image
        if file=='nor_gl':
            normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.38
            links.new(tex.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],bs.inputs[slot])
        else: links.new(tex.outputs['Color'],bs.inputs[slot])
oval('Full tang / spine',[(y,x+.0005,.0011) for y,x,z in rings],0,tang)
for y in [-.042,.023]:
    for side in [-1,1]:
        o=oval('Flush pin', [(-.0005,.0025,.0025),(.0005,.0024,.0024)],0,brass)
        o.data.transform(Matrix.Translation(pos((0,y,.00765*side))) @ rot((math.pi/2,0,0)).to_matrix().to_4x4())
for o in knife.children:
    bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
def edge_point(y):
    for (ya,_,xa,_),(yb,_,xb,_) in zip(sections,sections[1:]):
        if ya<=y<=yb:return Vector((xa+(xb-xa)*(y-ya)/(yb-ya),y,0))
    raise ValueError('Not on cutting bevel')
edge_profile=[edge_point(y) for y in [.064,.065,.110,.138]]
blade_marker=marker('BladeEdge',edge_profile[2],knife)
blade_marker['localPoint']=edge_profile[2][:]
blade_marker['edgeProfile']=[v for p in edge_profile for v in p]
socket=marker('GripSocket',(.0,.081,-.040));socket.rotation_mode='QUATERNION';socket.rotation_quaternion=rot((0,0,math.pi/2))
socket['localPoint']=(0,.081,-.040);socket['localRotation']=(0,0,math.sqrt(.5),math.sqrt(.5))

# The original flashlight pose leaves several finger pads 10–22 mm off a narrow
# knife handle. Fit the pads to the actual knife surface, not to the first-person view.
def calibrated_grip():
    basis=hand.data.shape_keys.key_blocks[0]
    opened=[v.co.copy() for v in basis.data];closed=[v.co.copy() for v in grasp.data]
    vertices=[socket.location+socket.rotation_quaternion@v.co for v in handle.data.vertices]
    surface=BVHTree.FromPolygons(vertices,[p.vertices[:] for p in handle.data.polygons],all_triangles=True)
    digits=[('Thumb',(-.055,.068,-.067)),('Index',(-.045,.146,-.040)),('Middle',(-.008,.162,-.042)),
            ('Ring',(.021,.150,-.044)),('Little',(.040,.120,-.029))]
    adj=[[] for _ in opened]
    for e in mesh.edges:
        i,j=e.vertices;d=(opened[i]-opened[j]).length;adj[i].append((j,d));adj[j].append((i,d))
    def distances(seed,radius):
        dist={seed:0.};q=[(0.,seed)]
        while q:
            d,i=heapq.heappop(q)
            if d>dist[i]:continue
            for j,cost in adj[i]:
                a=d+cost
                if a<radius and a<dist.get(j,radius):dist[j]=a;heapq.heappush(q,(a,j))
        return dist
    def smooth(a):
        t=max(0,min(1,a));return t*t*(3-2*t)
    def signed(p):
        hit,n,_,d=surface.find_nearest(p);return (d if (p-hit).dot(n)>=0 else -d),hit,n
    correction=[Vector((0,0,0)) for _ in opened];weights=[];stats={}
    for name,target in digits:
        point=pos(target)
        pad=[i for i,p in enumerate(opened) if (p-point).length<.014]
        assert pad, name
        seed=min(pad,key=lambda i:signed(closed[i])[0]);gap,hit,n=signed(closed[seed]);
        field=distances(seed,.052 if name=='Thumb' else .050)
        offset=hit+n*.00105-closed[seed]
        for i,d in field.items():correction[i]+=offset*smooth(1-d/.050)
        weights.append({i:smooth(1-d/.047) for i,d in field.items()})
        stats[name]={'pad':pad,'beforeMm':gap*1000}
    posed=[p+d for p,d in zip(closed,correction)]
    # Make only small outward corrections where the analytic fit would enter wood.
    for i,p in enumerate(posed):
        d,hit,n=signed(p)
        if d<.00095:posed[i]=hit+n*.00095
    digit_keys=[hand.shape_key_add(name=name) for name,_ in digits]
    for i,(a,b) in enumerate(zip(opened,posed)):
        total=sum(w.get(i,0)**2 for w in weights);mix=min(1,total*2.4)
        grasp.data[i].co=a+(b-a)*(1-mix)
        for key,w in zip(digit_keys,weights):
            share=mix*w.get(i,0)**2/max(total,1e-10);key.data[i].co=a+(b-a)*share
    for entry in stats.values():
        pad=entry.pop('pad');entry['afterMm']=min(signed(posed[i])[0] for i in pad)*1000
    scene['gripPadStats']=json.dumps(stats)
    print('GRIP PAD GAPS (mm):',json.dumps(stats))
    return digit_keys

digit_keys=calibrated_grip()

left=marker('LeftWrist',(0,0,0));right=marker('RightWrist',(0,0,0));
local_knot=(.043,.017,-.006)
marker('RopeContact',local_knot,left)['localPoint']=local_knot
anchor=(.72795,.14319,-.19)
marker('RopeAnchor',anchor)['localPoint']=anchor
left.rotation_mode=right.rotation_mode='QUATERNION'
behindL=(-.093,.70,.115);behindR=(.092,.70,.115);restL=(-.085,.68,-.98);restR=(.40,.68,-1.02)
back=(-.15,0,.24); palm=(-.93,.03,.18); floor=(-math.pi/2,0,0); hold=(-.98,.20,.19)
pickup=(.64,.052,-1.28)
leftCut=(-.18,.77,-1.15);leftQ=rot(palm)
knot=tuple(Vector(leftCut)+ B.transposed() @ (leftQ @ pos(local_knot)))
direction=(Vector(anchor)-Vector(knot)).normalized()
long=Vector((-.90,.065,-.43)).normalized()
down=Vector((.30,-.91,.26));down=(down-long*down.dot(long)).normalized()
qknife=Matrix((pos(down),pos(long),pos(down.cross(long)))).transposed().to_quaternion()
qhand=qknife@socket.rotation_quaternion.inverted()
def draw(f,clearance=0):
    # Contact slides between heel and belly, never along the point. Simultaneously
    # move the contact along the tensioned span, so the motion reads as a draw cut.
    t=max(0,min(1,(f-75)/64));u=.5-.5*math.cos(t*5*math.pi)
    site=Vector(knot)+direction*(.45+.030*u)-down*(.0041+clearance)
    point=edge_point(.066+.068*u)
    wrist=pos(site)-qknife@pos(point)-qhand@socket.location
    return f,tuple(B.transposed()@wrist),qhand
def keys(o, rows):
    for f,p,e in rows:
        o.location=pos(p);o.rotation_quaternion=e if isinstance(e,Quaternion) else rot(e)
        o.keyframe_insert(data_path='location',frame=f);o.keyframe_insert(data_path='rotation_quaternion',frame=f)
    for curve in o.animation_data.action.fcurves:
        for key in curve.keyframe_points: key.handle_left_type=key.handle_right_type='AUTO_CLAMPED'

# Frame ranges: slip 1–25, pickup 25–55, cut 55–139, rise 139–169.
keys(left,[(1,behindL,back),(8,behindL,back),(15,(-.29,.56,.035),(-.40,0,.3)),(21,(-.25,.47,-.55),palm),(25,restL,palm),(55,restL,palm),
 (72,leftCut,palm),(139,leftCut,palm),(147,(-.12,.52,-.91),palm),(157,(-.31,.43,-.54),(-1.25,0,.30)),(169,(-.27,.72,-.49),(-1.42,0,.12))])
keys(right,[(1,behindR,back),(7,(.18,.66,.15),back),(13,(.36,.51,-.18),(-.42,.12,-.30)),(20,(.34,.43,-.68),hold),(25,restR,hold),
 (30,(.56,.38,-1.14),(-1.24,0,.10)),(38,pickup,floor),(41,pickup,floor),(48,(.57,.40,-1.21),(-1.19,.09,.10)),(55,restR,hold),
 draw(67,.095),draw(72,.027),*[draw(f) for f in range(75,140)],
 (146,(.38,.53,-.94),hold),(157,(.63,.39,-.62),(-1.15,0,-.2)),(169,(.65,.65,-.59),(-1.4,0,-.12))])
for n,f in [('BoundIdle / OneHandRelease',1),('ReachKnife',25),('KnifeContact',38),('FingerGrip',41),('KnifeApproach',55),('RopeTension',72),('SawCut',75),('RopeBreak / StandUp',139),('standing',169)]: scene.timeline_markers.new(n,frame=f)
scene.render.fps=30;scene.frame_start=1;scene.frame_end=169
window.scene=scene
scene.frame_set(1);bpy.context.view_layer.update()
path=root/'public/assets/chapter1/intro-escape.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_active_scene=True,export_animation_mode='SCENE',export_frame_range=True,export_force_sampling=True,export_morph=True,export_tangents=True,export_extras=True)
# Editable Blender preview: see both posed hands and the same knife follow the authored timeline.
# These preview bindings are added after the runtime export, where Three.js owns the parent switch.
hand.parent=right
other=hand.copy();other.data=hand.data.copy();other.name='Left hand preview';scene.collection.objects.link(other);other.parent=left;other.scale.x=-1
for key in list(other.data.shape_keys.key_blocks)[1:]: key.value=.12
knife.rotation_mode='QUATERNION'
scene.frame_set(38)
floor_point=right.location+right.rotation_quaternion@socket.location
floor_q=right.rotation_quaternion@socket.rotation_quaternion
for f in range(1,170):
    scene.frame_set(f)
    knife.location=right.location+right.rotation_quaternion@socket.location if f>=41 else floor_point
    knife.rotation_quaternion=right.rotation_quaternion@socket.rotation_quaternion if f>=41 else floor_q
    knife.keyframe_insert(data_path='location',frame=f);knife.keyframe_insert(data_path='rotation_quaternion',frame=f)
for key,first in zip([grasp]+digit_keys,[38,39,38,38.3,38.5,38.7]):
    for f,value in [(1,0),(first,0),(41,1),(149,1),(161,0)]:
        key.value=value;key.keyframe_insert(data_path='value',frame=f)
scene.frame_set(80)
for o in bpy.context.selected_objects: o.select_set(False)
hand.select_set(True);bpy.context.view_layer.objects.active=hand
for area in window.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_location=pos((.16,.8,-1.04));area.spaces.active.region_3d.view_distance=.58
        area.spaces.active.region_3d.view_rotation=Quaternion((.81,.53,.13,.21)).normalized()
bpy.data.libraries.write(str(root/'art/intro-escape.blend'),{scene},fake_user=True,compress=True)
print(json.dumps({'asset':str(path),'bytes':path.stat().st_size,'vertices':len(mesh.vertices),'rope_contact':knot,'pickup':pickup}))
