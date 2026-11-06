"""New BOUND-only hemp restraints, calibrated to actual wrist/wood surfaces.

Two independent, continuous ropes: wrist turns, an overhand knot, taut tether,
chair hitch and finite ends. This is NOT the release/fall/removal animation.
"""
import bpy,json,math,numpy as np,sys
from pathlib import Path
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from cinematic_geometry import getmesh
root=Path.cwd();out=root/'outputs/cinematic-intro';s=bpy.context.scene;s.frame_set(1)
r=next(o for o in s.objects if o.type=='ARMATURE');body=next(o for o in s.objects if o.type=='MESH' and o.name.endswith('MakeHuman body') and not o.get('authoring_archive'))
shirt=next(o for o in s.objects if o.type=='MESH' and 'fisherman' in o.name and not o.get('authoring_archive'));chair=next(o for o in s.objects if o.type=='MESH' and o.name=='old-chair')
rope_radius=.0032
def update():bpy.context.view_layer.update()
def rail_surface():
    deps=bpy.context.evaluated_depsgraph_get();ev=chair.evaluated_get(deps);m=ev.to_mesh();m.calc_loop_triangles();vs=[ev.matrix_world@v.co for v in m.vertices]
    faces=[tuple(t.vertices) for t in m.loop_triangles
        if all(.525<vs[i].z<.605 for i in t.vertices)
        and abs(sum(vs[i].x for i in t.vertices)/3)<.15
        and sum(vs[i].y for i in t.vertices)/3>.23]
    selected=[vs[i] for f in faces for i in f];center=Vector((0,(min(v.y for v in selected)+max(v.y for v in selected))/2,(min(v.z for v in selected)+max(v.z for v in selected))/2))
    planes=[]
    for face in faces:
        a,b,c=(vs[i] for i in face);n=(b-a).cross(c-a).normalized()
        if abs(n.x)>.1:continue
        if n.dot((a+b+c)/3-center)<0:n=-n
        planes.append((a,n))
    ev.to_mesh_clear();return BVHTree.FromPolygons(vs,faces,all_triangles=True),center,planes
def curve(points,steps):
    # Catmull-Rom, used only to author the fixed knot/tether transitions.
    ps=[Vector(p) for p in points];result=[]
    for i in range(len(ps)-1):
        a,b,c,d=ps[max(0,i-1)],ps[i],ps[i+1],ps[min(len(ps)-1,i+2)]
        for j in range(steps):
            t=j/steps;result.append((2*b+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t)*.5)
    result.append(ps[-1]);return result
def resample(points,spacing=.0014):
    lengths=[0.]
    for a,b in zip(points,points[1:]):lengths.append(lengths[-1]+(b-a).length)
    targets=np.linspace(0,lengths[-1],max(3,math.ceil(lengths[-1]/spacing)))
    result=[];j=0
    for t in targets:
        while j+1<len(lengths)-1 and lengths[j+1]<t:j+=1
        result.append(points[j].lerp(points[j+1],(t-lengths[j])/max(1e-12,lengths[j+1]-lengths[j])))
    return result,float(lengths[-1])
def material():
    mat=bpy.data.materials.new('Cine | worn hemp · authored fibers');mat.use_nodes=True
    bs=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED');bs.inputs['Roughness'].default_value=.91
    width,height=256,512;u,v=np.meshgrid(np.linspace(0,1,width,endpoint=False),np.linspace(0,1,height,endpoint=False))
    rng=np.random.default_rng(100);h=.45*np.sin(u*math.tau*29+.55*np.sin(v*math.tau*3))+.17*np.sin(u*math.tau*67+v*math.tau*2)+rng.normal(0,.08,(height,width))
    col=np.empty((height,width,4));col[:,:,:3]=np.array([.47,.35,.20])*(1+h[:,:,None]*.15);col[:,:,3]=1
    dx=np.gradient(h,axis=1);dy=np.gradient(h,axis=0);normal=np.stack((-dx*1.3,-dy*.8,np.ones_like(h)),axis=-1);normal/=np.linalg.norm(normal,axis=-1)[:,:,None]
    rgba=np.concatenate((normal*.5+.5,np.ones((height,width,1))),axis=-1)
    for name,pixels,color,input_name in [('Hemp fibers · base color',col,True,'Base Color'),('Hemp fibers · tangent normal',rgba,False,'Normal')]:
        image=bpy.data.images.new(name,width=width,height=height);image.colorspace_settings.name='sRGB' if color else 'Non-Color';image.pixels.foreach_set(pixels.astype(np.float32).ravel());image.pack()
        tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image;tex.extension='REPEAT'
        if color:mat.node_tree.links.new(tex.outputs['Color'],bs.inputs[input_name])
        else:
            node=mat.node_tree.nodes.new('ShaderNodeNormalMap');node.inputs['Strength'].default_value=.45;mat.node_tree.links.new(tex.outputs['Color'],node.inputs['Color']);mat.node_tree.links.new(node.outputs['Normal'],bs.inputs['Normal'])
    return mat
mat=material();rail,rail_center,rail_planes=rail_surface();reports=[]

def cuff_hull(side,center,axis,u,v):
    # Exact triangle/plane sections of the native skin and garment. The rope
    # follows their convex tension envelope at EACH axial position, not the
    # widest section of a 3 cm slab (which visibly floated around the wrist).
    sections=[]
    names={'lowerarm_'+side,'hand_'+side}
    names.update(b.name for b in r.data.bones if b.name.endswith('_'+side) and b.name.startswith(('thumb_','index_','middle_','ring_','pinky_')))
    for obj in (body,shirt):
        posed,tris=getmesh(obj)
        use=[sum(g.weight for g in vertex.groups if obj.vertex_groups[g.group].name in names)>.45 for vertex in obj.data.vertices]
        for tri in tris:
            if not all(use[i] for i in tri):continue
            points=[posed[i]-center for i in tri];axials=[p.dot(axis) for p in points]
            if min(axials)>.017 or max(axials)<-.017:continue
            if max((p-axis*a).length for p,a in zip(points,axials))>.10:continue
            sections.append((points,axials))
    def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    def half(ps):
        h=[]
        for p in ps:
            while len(h)>1 and cross(h[-2],h[-1],p)<=0:h.pop()
            h.append(p)
        return h
    result=[];counts=[]
    for i in range(181):
        t=i/180;axial=(t-.5)*.012;points=[]
        # A finite rope is NOT an infinitesimal plane. Include the actual
        # triangular surface throughout its axial radius, otherwise a tube
        # can cross a sloping sleeve even when every centre-plane is clear.
        lo_axial=axial-rope_radius-.001;hi_axial=axial+rope_radius+.001
        for ps,aa in sections:
            if min(aa)>hi_axial or max(aa)<lo_axial:continue
            for p,a in zip(ps,aa):
                if lo_axial<=a<=hi_axial:points.append((p.dot(u),p.dot(v)))
            for cut in (lo_axial,hi_axial):
                for j,k in ((0,1),(1,2),(2,0)):
                    if (aa[j]-cut)*(aa[k]-cut)<0:
                        p=ps[j].lerp(ps[k],(cut-aa[j])/(aa[k]-aa[j]));points.append((p.dot(u),p.dot(v)))
        points=sorted(set(points));hull=half(points)[:-1]+half(points[::-1])[:-1]
        assert len(hull)>8,'Missing actual wrist section'
        counts.append(len(hull));origin=np.array(hull).mean(axis=0)
        def distance(p):
            nearest=1e9;inside=True
            for a,b in zip(hull,hull[1:]+hull[:1]):
                a=np.array(a);b=np.array(b);d=b-a;fraction=max(0,min(1,float(np.dot(p-a,d)/np.dot(d,d))))
                nearest=min(nearest,float(np.linalg.norm(p-a-d*fraction)))
                if cross(a,b,p)<0:inside=False
            return -nearest if inside else nearest
        angle=t*math.tau*2.12;direction=np.array([math.cos(angle),math.sin(angle)])
        lo=0.;hi=.13
        for _ in range(22):
            radius=(lo+hi)/2
            if distance(origin+direction*radius)<rope_radius+.0009:lo=radius
            else:hi=radius
        xy=origin+direction*hi
        result.append(center+u*float(xy[0])+v*float(xy[1])+axis*axial)
    return result,len(sections),max(counts)

for side,sign in (('r',-1),('l',1)):
    hand=r.pose.bones['hand_'+side];fore=r.pose.bones['lowerarm_'+side]
    wrist=r.matrix_world@hand.head;axis=(r.matrix_world.to_3x3()@(fore.tail-fore.head)).normalized()
    # Keep the physically fitted garment unchanged. Earlier local projection
    # collapsed knitted folds into the wrist and left the rope query stale.
    # Fit the rope OUTSIDE the evaluated native skin and sleeve instead.
    compressed=[]
    u=Vector((0,1,0));u=(u-axis*u.dot(axis)).normalized();v=axis.cross(u).normalized()
    # A compact two-turn anatomical band just proximal to the hand crease.
    # Keep the turns one rope-diameter apart, not widely spaced loose bracelets.
    center=wrist-axis*.026
    coil,section_vertices,section_hull_vertices=cuff_hull(side,center,axis,u,v)
    misses=[]
    # Small, open trefoil overhand knot outside the wrist, not a severed span.
    radial=(coil[-1]-(center+axis*.009)).normalized();across=axis.cross(radial).normalized();knot_center=coil[-1]+radial*.023
    knot=[]
    for i in range(111):
        a=(i/110)*math.tau*.94;R=.0105+.004*math.cos(3*a)
        knot.append(knot_center+axis*(R*math.cos(2*a))+across*(R*math.sin(2*a))+radial*(.004*math.sin(3*a)))
    hitch=[];hc=rail_center.copy();hc.x=sign*.105
    for i in range(111):
        t=i/110;a=math.pi+t*math.tau*1.18;d=Vector((0,math.cos(a),math.sin(a)));c=hc+Vector(((t-.5)*.012,0,0))
        hit,_,_,_=rail.ray_cast(c+d*.13,-d,.26)
        if hit is None:raise RuntimeError(f'Missing wood rail profile {side}/{i}')
        # Rounded finite-tube offset of the ACTUAL slat, not a loose inflated
        # rectangle. Bisection on its nearest-surface distance preserves close
        # contact at corners without clipping or a visible floating 3 mm gap.
        low=(hit-c).dot(d);high=low+.05;clearance=rope_radius+.0005
        if low<=0:raise RuntimeError('Slat profile origin is outside its convex section')
        for _ in range(22):
            radius=(low+high)/2;distance=rail.find_nearest(c+d*radius)[3]
            if distance<clearance:low=radius
            else:high=radius
        radius=high
        hitch.append(c+d*radius)
    tail=[coil[0]+u*.018+Vector((0,0,-.016)),coil[0]+u*.012+Vector((0,0,-.007)),coil[0]]
    knot_entry=curve([coil[-1],coil[-1]+radial*.006,knot[0]],6)
    tether=curve([knot[-1],knot[-1]+Vector((0,.018,-.008)),hitch[0]+Vector((0,-.014,.014)),hitch[0]],15)
    path=curve(tail,6)+coil[1:]+knot_entry[1:]+knot[1:]+tether[1:]+hitch[1:]+curve([hitch[-1],hitch[-1]+Vector((sign*.015,.01,-.005)),hitch[-1]+Vector((sign*.025,.008,-.025))],8)[1:]
    path,length=resample(path);max_projection=0
    vertices=[];faces=[];uvs=[];arcs=[0.]
    for a,b in zip(path,path[1:]):arcs.append(arcs[-1]+(b-a).length)
    frames=[];normal=None
    for i,p in enumerate(path):
        tangent=(path[min(i+1,len(path)-1)]-path[max(0,i-1)]).normalized()
        if normal is None:normal=tangent.cross(Vector((0,0,1)) if abs(tangent.z)<.8 else Vector((1,0,0))).normalized()
        normal=(normal-tangent*normal.dot(tangent)).normalized();binormal=tangent.cross(normal).normalized();frames.append((normal.copy(),binormal))
    sides=8;N=len(path)
    for strand in range(3):
        offset=len(vertices)
        for i,p in enumerate(path):
            n,b=frames[i];angle=arcs[i]/.019*math.tau+strand*math.tau/3;c=p+n*(.0016*math.cos(angle))+b*(.0016*math.sin(angle))
            for j in range(sides):
                theta=j/sides*math.tau;vertices.append(c+n*(.0016*math.cos(theta))+b*(.0016*math.sin(theta)));uvs.append((j/sides,arcs[i]/.035))
        for i in range(N-1):
            for j in range(sides):a=offset+i*sides+j;z=offset+i*sides+(j+1)%sides;faces.append((a,z,z+sides,a+sides))
        for j in range(1,sides-1):
            faces.append((offset,offset+j+1,offset+j))
            faces.append((offset+(N-1)*sides,offset+(N-1)*sides+j,offset+(N-1)*sides+j+1))
    mesh=bpy.data.meshes.new('Continuous three-ply hemp '+side);mesh.from_pydata(vertices,[],faces);mesh.update();layer=mesh.uv_layers.new(name='RopeFiberUV')
    for p in mesh.polygons:
        p.use_smooth=True
        for li in p.loop_indices:
            index=mesh.loops[li].vertex_index
            if len(p.vertices)==3:
                angle=(index%sides)/sides*math.tau;layer.data[li].uv=(.5+.5*math.cos(angle),.5+.5*math.sin(angle))
            else:
                u,v=uvs[index]
                # Do not interpolate the wrap seam across the whole texture.
                if u==0 and any(uvs[j][0]>.8 for j in p.vertices):u=1
                layer.data[li].uv=(u,v)
    obj=bpy.data.objects.new('Cine | '+side+' intact wrist-to-chair rope',mesh);s.collection.objects.link(obj);mesh.materials.append(mat)
    obj.parent=chair;obj.matrix_parent_inverse=chair.matrix_world.inverted();obj.matrix_basis=Matrix.Identity(4)
    obj['restraint_role']='BOUND_ONLY · intact independent wrist lashing and chair hitch';obj['centerline_length_m']=length
    reports.append({'side':side,'lengthM':arcs[-1],'vertices':len(vertices),'cuffProfileMisses':misses,'wrist':list(wrist),'woodHitchCenter':list(hc),'maxCenterlineProjectionMm':max_projection*1000,'clothPressureVertices':len(compressed),'actualSectionVertices':section_vertices,'convexSectionVertices':section_hull_vertices})
s.frame_start=s.frame_end=1;s['bound_restraints_only']=True;s.name='100gate | Bound restraint STATIC gate'
(out/'bound-restraint-geometry.json').write_text(json.dumps(reports,indent=2));bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(out/'cinematic-bound-restraints.blend'),compress=True)
print('BOUND-only intact ropes saved; ground/release rope states are NOT authored here.',json.dumps(reports),flush=True)
