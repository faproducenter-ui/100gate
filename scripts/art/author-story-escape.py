"""New upright chair performance; bake the native MPFB rig, not the old fall.

Input: art/intro-bound-native-wip.blend. Uses only its original frame-one pose,
chair, calibrated hemp coils and field knife. Run in background Blender.
"""
import bpy, math, sys, json, struct
from pathlib import Path
from mathutils import Matrix, Quaternion, Vector
from mathutils.kdtree import KDTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from native_pose_tools import two_bone_ik
from story_actor_tools import ease,rotate
from cinematic_geometry import getmesh,closed_parts

ROOT=Path.cwd();OUT=ROOT/'outputs/story-intro/escape';OUT.mkdir(parents=True,exist_ok=True)
s=bpy.context.scene;s.frame_set(1);bpy.context.view_layer.update()
r=next(o for o in s.objects if o.type=='ARMATURE')
chair=s.objects['old-chair'];knife=s.objects['Cinematic field knife'];knife.name='StoryEscape_Knife'
eye=s.objects['Cine · First person'];eye.name='StoryEscape_Eye'
actor=[o for o in s.objects if o.type=='MESH' and o.parent==r and not o.get('authoring_archive')]
body=next(o for o in actor if o.name.endswith('MakeHuman body'))
eyes=next(o for o in actor if o.name.endswith('low-poly'))
# Export separate material primitives for face and eyes. They keep their
# geometry for Blender inspection and dynamic shadows, but do not intersect
# the first-person near plane in the renderer.
for o in (body,eyes):
    marked={}
    head_groups={g.index for g in o.vertex_groups if g.name in {'head','neck_01'}}
    for p in o.data.polygons:
        if o!=eyes and not any(o.data.vertices[i].co.z>1.415 or sum(g.weight for g in o.data.vertices[i].groups if g.group in head_groups)>.38 for i in p.vertices):continue
        original=p.material_index
        if original not in marked:
            m=o.data.materials[original].copy()
            m.name='StoryEscape_FPHead_'+m.name;o.data.materials.append(m)
            marked[original]=len(o.data.materials)-1
        p.material_index=marked[original]
ropes={side:next(o for o in s.objects if side+' intact wrist-to-chair rope' in o.name) for side in ('l','r')}
keep=set([r,chair,knife,eye,*actor,*knife.children,*ropes.values()])
for o in list(s.objects):
    if o not in keep:bpy.data.objects.remove(o,do_unlink=True)

update=bpy.context.view_layer.update
def bone_world(name):return r.matrix_world@r.pose.bones[name].matrix
base={p.name:p.matrix_basis.copy() for p in r.pose.bones};base_root=r.matrix_world.copy()
wrists={side:bone_world('hand_'+side) for side in ('l','r')}
coil_socket={side:bone_world('lowerarm_'+side).inverted()@wrists[side] for side in ('l','r')}
feet={side:bone_world('foot_'+side) for side in ('l','r')}
elbows={side:bone_world('lowerarm_'+side).translation.copy() for side in ('l','r')}
knees={side:bone_world('calf_'+side).translation.copy() for side in ('l','r')}
for obj in [r,chair,knife,eye,*actor]:
    obj.animation_data_clear();obj.rotation_mode='QUATERNION'
    if obj.type=='MESH' and obj.data.shape_keys:obj.data.shape_keys.animation_data_clear()
for p in r.pose.bones:p.rotation_mode='QUATERNION'
r.name='StoryEscape_Alexei';chair.name='StoryEscape_Chair'

# Same geometry/UV and authored power grip from the reviewed original right
# hand. Reflect its bone bases into the left anatomical rest frame.
contract=json.loads((ROOT/'art/provenance/native-left-grip-contract.json').read_text())
mirror=Matrix.Diagonal((-1,1,1,1))
hr=Matrix(contract['handRest']);hl=r.data.bones['hand_l'].matrix_local
socket=hl.inverted()@mirror@hr@Matrix(contract['socket'])@mirror
posed={}
for n,d in contract['bones'].items():
    left=n[:-1]+'l'
    posed[left]=mirror@hr@Matrix(contract['handPose']).inverted()@Matrix(d['pose'])@Matrix(d['rest']).inverted()@mirror@r.data.bones[left].matrix_local
grip={}
for n,m in posed.items():
    b=r.data.bones[n];p=b.parent
    grip[n]=b.convert_local_to_pose(m,b.matrix_local,parent_matrix=posed.get(p.name,hl),parent_matrix_local=p.matrix_local,invert=True).to_quaternion()
# Preserve the original skinning topology; transfer only weights with matching
# contralateral bind points. No forced movement of evaluated finger surfaces.
tree=KDTree(len(body.data.vertices))
for v in body.data.vertices:tree.insert(v.co,v.index)
tree.balance()
handnames={'hand_l',*grip}
for v in body.data.vertices:
    if sum(g.weight for g in v.groups if body.vertex_groups[g.group].name in handnames)<.35:continue
    _,i,d=tree.find(mirror.to_3x3()@v.co)
    if d>.0007:continue
    weights=[(body.vertex_groups[g.group].name,g.weight) for g in body.data.vertices[i].groups if g.weight>1e-8]
    for g in list(v.groups):body.vertex_groups[g.group].remove([v.index])
    for name,w in weights:
        nl=name[:-1]+'l' if name.endswith('_r') else name
        if nl in body.vertex_groups:body.vertex_groups[nl].add([v.index],w,'REPLACE')

def mix(a,b,u):
    pos=a.translation.lerp(b.translation,u)
    q=a.to_quaternion().slerp(b.to_quaternion(),u)
    return Matrix.Translation(pos)@q.to_matrix().to_4x4()
def translated(mat,pos):
    m=mat.copy();m.translation=Vector(pos);return m
def key(obj,frame):
    for name in ('location','rotation_quaternion','scale'):obj.keyframe_insert(name,frame=frame)
def empty(name):
    o=bpy.data.objects.new(name,None);s.collection.objects.link(o);o.rotation_mode='QUATERNION';return o

# Exactly preserve the old fitted cuff tubes, including UVs and knots. The
# split is at the knot-to-tether boundary; an animated tether starts at the
# identical sampled ring, not at an arbitrary skin or sleeve location.
data={}
for side,idx in [('l',538),('r',568)]:
    original=ropes[side];m=original.data;N=len(m.vertices)//24;old=original.matrix_world.copy()
    coords=[old@v.co for v in m.vertices]
    centers=[sum((coords[(k*N+i)*8+j] for k in range(3) for j in range(8)),Vector())/24 for i in range(N)]
    take={i for i in range(len(coords)) if (i//8)%N<=idx}
    inv=wrists[side].inverted();remap={i:j for j,i in enumerate(sorted(take))}
    polys=[p for p in m.polygons if all(i in take for i in p.vertices)]
    cuff_mesh=bpy.data.meshes.new('Original fitted cuff '+side)
    cuff_mesh.from_pydata([inv@coords[i] for i in sorted(take)],[],[[remap[i] for i in p.vertices] for p in polys]);cuff_mesh.update()
    uv=cuff_mesh.uv_layers.new(name='RopeFiberUV')
    for p,old_p in zip(cuff_mesh.polygons,polys):
        p.use_smooth=True
        for i,j in zip(p.loop_indices,old_p.loop_indices):uv.data[i].uv=m.uv_layers.active.data[j].uv
    cuff_mesh.materials.append(m.materials[0])
    cuff=bpy.data.objects.new('StoryEscape_Cuff_'+side,cuff_mesh);s.collection.objects.link(cuff)
    cuff.rotation_mode='QUATERNION';cuff.matrix_world=wrists[side]
    data[side]={'cuff':cuff,'centers':centers[idx:],'knot':inv@centers[idx],'material':m.materials[0]}
    bpy.data.objects.remove(original,do_unlink=True)

# Low-ring continuous skin for the load-bearing tether. Individual rings
# deform with their bone; both sides of the right seam coincide until cut.
class Tether:
    def __init__(self,name,centers,material,split=None):
        self.centers=centers;self.split=split
        arm=bpy.data.armatures.new(name);self.rig=bpy.data.objects.new(name,arm);s.collection.objects.link(self.rig)
        bpy.context.view_layer.objects.active=self.rig;self.rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
        for i,p in enumerate(centers):
            b=arm.edit_bones.new(f'{name}_{i:02}');b.head=p;b.tail=p+Vector((0,.01,0))
        bpy.ops.object.mode_set(mode='OBJECT')
        self.bones=list(self.rig.pose.bones)
        for p in self.bones:p.rotation_mode='QUATERNION'
        self.meshes=[]
        bounds=[(0,len(centers)-1)] if split is None else [(0,split),(split+1,len(centers)-1)]
        for j,(lo,hi) in enumerate(bounds):
            verts=[];faces=[];sides=10
            for i in range(lo,hi+1):
                p=centers[i];t=(centers[min(hi,i+1)]-centers[max(lo,i-1)]).normalized()
                n=t.cross(Vector((1,0,0)))
                if n.length<.01:n=t.cross(Vector((0,1,0)))
                n.normalize();bin=t.cross(n)
                for k in range(sides):verts.append(p+.0036*(n*math.cos(k*math.tau/sides)+bin*math.sin(k*math.tau/sides)))
            for i in range(hi-lo):
                for k in range(sides):
                    a=i*sides+k;b=i*sides+(k+1)%sides;faces.append((a,b,b+sides,a+sides))
            cap=(hi-lo)*sides
            for k in range(1,sides-1):
                faces.append((0,k+1,k));faces.append((cap,cap+k,cap+k+1))
            mesh=bpy.data.meshes.new(name+str(j));mesh.from_pydata(verts,[],faces);mesh.update();mesh.materials.append(material)
            uv=mesh.uv_layers.new(name='HempFiberUV')
            for p in mesh.polygons:
                p.use_smooth=len(p.vertices)==4
                for li in p.loop_indices:
                    n=mesh.loops[li].vertex_index;uv.data[li].uv=((n%sides)/sides,n//sides*.20)
            o=bpy.data.objects.new(name+'_mesh'+str(j),mesh);s.collection.objects.link(o);o.parent=self.rig
            for i in range(lo,hi+1):
                vg=o.vertex_groups.new(name=self.bones[i].name);vg.add(list(range((i-lo)*sides,(i-lo+1)*sides)),1,'REPLACE')
            mod=o.modifiers.new('Continuous tether deformation','ARMATURE');mod.object=self.rig
            self.meshes.append(o)
    def sample(self,ps,frame):
        for i,(b,p) in enumerate(zip(self.bones,ps)):
            a,b1=max(i-1,0),min(i+1,len(ps)-1)
            original=self.centers[b1]-self.centers[a];desired=ps[b1]-ps[a]
            q=original.rotation_difference(desired) if min(original.length,desired.length)>.00001 else Quaternion()
            transform=Matrix.Translation(p)@q.to_matrix().to_4x4()@Matrix.Translation(-self.centers[i])
            b.matrix=transform@b.bone.matrix_local
            key(b,frame)

def resample(points,n):
    # Preserve the source chair hitch at the end, in addition to the knot.
    return [points[round((len(points)-1)*i/(n-1))].copy() for i in range(n)]
left0=resample(data['l']['centers'],33)
right0=resample(data['r']['centers'],35);right0.insert(15,right0[14].copy())
def tether_fraction(i):
    return .22*min(1,i/14) if i<=15 else .22+.78*(i-15)/9
for i in range(1,24):
    u=tether_fraction(i)
    right0[i]=right0[0].lerp(right0[24],u)+Vector((-.04,0,-.265))*math.sin(math.pi*u)
tether_l=Tether('StoryEscape_LeftTether',left0,data['l']['material'])
tether_r=Tether('StoryEscape_RightTether',right0,data['r']['material'],14)
cut=empty('StoryEscape_RightCutContact')
for x in (knife,eye,cut):x.rotation_mode='QUATERNION'

# The knife lies beside the free left boot, not at the old fallen-body
# destination. Seat remains level and the feet retain their support points.
Kfloor=Matrix.Translation((.43,-.08,.025))@(Quaternion((0,0,1),-math.pi/2)@Quaternion((1,0,0),-math.pi/2)).to_matrix().to_4x4()
knife.matrix_world=Kfloor;update()
Kfloor.translation.z+=.003-min(p.z for o in knife.children for p in getmesh(o)[0])
Hfloor=Kfloor@socket.inverted()
left_side=translated(wrists['l'],(.31,.005,.69))
right_side=translated(wrists['r'],(-.28,-.395,.82))
right_free=translated(wrists['r'],(-.24,-.28,.83))
neutral={side:translated(wrists[side],(.24 if side=='l' else -.24,-.09,1.04)) for side in ('l','r')}
print('FLOOR HAND',tuple(Hfloor.translation),flush=True)

def solve(side,goal,pole,kind='arm'):
    try:two_bone_ik(r,side,goal.translation,pole,goal.to_3x3(),kind=kind,align_hinge=kind=='leg')
    except ValueError as e:
        src=bone_world(('upperarm_' if kind=='arm' else 'thigh_')+side).translation
        raise RuntimeError(f'{t:.3f}s {side} {kind} goal={tuple(goal.translation)} base={tuple(src)}: {e}') from e

FPS=48;s.render.fps=FPS;s.frame_start=1;s.frame_end=1+math.ceil(23.2*FPS)
for mark in list(s.timeline_markers):s.timeline_markers.remove(mark)
for name,seconds in [('Awake',0),('Strain',3),('Left hitch slips',6),('See the knife',8),('R · reach',10),('Grip',11.8),('R · cut',13),('Set down',17),('Unwrap',18.2),('Stand',21.2)]:
    s.timeline_markers.new(name,frame=1+round(seconds*FPS))
metrics=[];finished_cut=None
def lean_at(t):
    return ease(t,10,11.45)*(1-ease(t,13,14.25))+ease(t,17.05,17.9)*(1-ease(t,18.18,19.3))
for frame in range(1,s.frame_end+1):
    t=min(23.2,(frame-1)/FPS);s.frame_set(frame)
    stand=ease(t,21.2,23.2)
    lean=lean_at(t)
    effort=ease(t,3,3.5)*(1-ease(t,6,6.6))*math.sin((t-3)*math.tau*1.12)
    r.matrix_world=Matrix.Translation(base_root.translation.lerp(Vector((0,-.405,-.025)),stand)+Vector((.018,-.051,.033))*lean)
    for p in r.pose.bones:
        p.matrix_basis=base[p.name]
        if stand>0:p.rotation_quaternion=p.rotation_quaternion.slerp(Quaternion(),stand)
    rotate(r,'pelvis',(0,1,0),lean*26)
    rotate(r,'spine_01',(0,1,0),lean*55+effort*2.8)
    rotate(r,'spine_02',(1,0,0),lean*22+effort*1.5)
    rotate(r,'neck_01',(1,0,0),lean*-18)
    rotate(r,'spine_03',(1,0,0),10*math.sin(math.pi*stand))
    update()
    RW=mix(wrists['r'],right_side,ease(t,13.1,14.1))
    if lean>0 and t<14.1:
        # Limited right wrist motion on a finite chair tether, not a second
        # magically freed hand during the left reach.
        anchor=Vector((-.11,.269,.61));shoulder=bone_world('upperarm_r').translation
        pull=anchor+(shoulder-anchor).normalized()*.214
        RW=translated(RW,RW.translation.lerp(pull,math.sqrt(lean)))
    free_pose=translated(right_free,right_free.translation.lerp(Vector((.08,-.29,.76)),lean))
    RW=mix(RW,free_pose,ease(t,17,17.5))
    RW=mix(RW,neutral['r'],stand)
    solve('r',RW,elbows['r'].lerp(Vector((-.50,-.02,.91)),ease(t,12.9,14.1)))
    update()
    cuff_r=bone_world('lowerarm_r')@coil_socket['r']
    rc=cuff_r@data['r']['knot'];mount=right0[24]
    # Taut exposed span, below the right cuff and clear of the hand itself.
    cutpos=rc.lerp(mount,.22)
    knife_rotation=(Quaternion((0,1,0),-math.pi/2)@Quaternion((0,0,1),-.12)).to_matrix()
    blade=.122+.027*math.sin((t-14.15)*math.tau*1.15)
    Kcut=Matrix.Translation(cutpos-knife_rotation@Vector((.010,0,blade)))@knife_rotation.to_4x4()
    Hcut=Kcut@socket.inverted()
    if t<=17:finished_cut=Hcut.copy()
    LW=mix(wrists['l'],left_side,ease(t,6.65,8.0))
    LW=mix(LW,Hfloor,ease(t,10,11.8))
    # Last fraction of a millimetre of palm seating; measured slight overlap
    # before contact, not a rescale or displacement of the knife.
    settle=ease(t,11.35,11.7)*(1-ease(t,12,12.4))
    LW.translation+=Kfloor.to_3x3()@Vector((0,-.00065*settle,0))
    if t>13:LW=mix(Hfloor,Hcut,ease(t,13,14.15))
    if t>17:LW=mix(finished_cut,Hfloor,ease(t,17,18.08))
    if t>18.2:LW=mix(Hfloor,translated(left_side,(.18,-.30,.80)),ease(t,18.2,19.3))
    LW=mix(LW,neutral['l'],stand)
    solve('l',LW,elbows['l'].lerp(Vector((.57,.08,.65)),ease(t,6.65,8)))
    update()
    for side in ('l','r'):
        F=feet[side].copy();F.translation.z-=.001*stand
        solve(side,F,knees[side]+Vector((0,-.08*stand,0)),kind='leg')
    for n,q in grip.items():
        digit,j,_=n.split('_');joint=int(j)
        p=r.pose.bones[n]
        relaxed=p.rotation_quaternion.slerp(Quaternion(),ease(t,10,11.35))
        if digit=='thumb':
            opposition=ease(t,10.3,11.6)
            close=ease(t,12.60,12.97)
            amount=opposition*(.60+.40*close) if joint==1 else close
        else:
            delay={'index':0,'middle':-.035,'ring':-.065,'pinky':-.095}[digit]
            a,b={1:(11.85,12.30),2:(12.11,12.65),3:(12.35,12.78)}[joint]
            amount=ease(t,a+delay,b+delay)
        if t>=18.08:
            # Reverse closure in anatomical order: thumb clears the handle
            # before the four fingers unwrap, not one quaternion crossfade.
            if digit=='thumb':amount*=1-ease(t,18.08,18.22) if joint>1 else 1-.40*ease(t,18.08,18.22)-.60*ease(t,18.43,18.68)
            else:amount*=1-ease(t,18.22,18.60)
        p.rotation_quaternion=relaxed.slerp(q,amount)
    update()
    knife.matrix_world=bone_world('hand_l')@socket if 13<=t<18.08 else Kfloor
    cut.location=cutpos
    for side,W in [('l',bone_world('lowerarm_l')@coil_socket['l']),('r',cuff_r)]:
        cuff=data[side]['cuff'];drop=ease(t,19.1 if side=='l' else 19.8,20.6 if side=='l' else 21.15)
        floor=translated(W,(.26 if side=='l' else -.26,-.24,.041))
        cuff.matrix_world=mix(W,floor,drop)
        key(cuff,frame)
    lc=data['l']['cuff'].matrix_world@data['l']['knot']
    slip=ease(t,6,7.7)
    ps_l=[]
    for i,p in enumerate(left0):
        u=i/(len(left0)-1)
        held=p+(lc-left0[0])*(1-u)**2
        loose=lc+Vector((.095*math.sin(math.pi*u),.05*u,-min(.29,lc.z-.012)*u))
        ps_l.append(held.lerp(loose,slip))
    tether_l.sample(ps_l,frame)
    taut=ease(t,12.9,14.05);sever=ease(t,17,17.23)
    ps_r=[]
    for i,p in enumerate(right0):
        if i<=15:
            u=min(1,i/14)
            point=(p+(rc-right0[0])*(1-u)).lerp(rc.lerp(cutpos,u),taut)
            if i<=14:point+=Vector((.025,-.02,-.085))*sever*u
            else:point+=Vector((-.025,.035,-.12))*sever
        elif i<=24:
            u=(i-15)/9
            point=p.lerp(cutpos.lerp(mount,u),taut)+Vector((-.025,.035,-.12))*sever*(1-u)
        else:point=p.copy()
        ps_r.append(point)
    tether_r.sample(ps_r,frame)
    # Head-driven eye position, art-directed look target; no spinning or fall.
    head=bone_world('head');look=ease(t,8,10)*(1-ease(t,13,14.15))
    deformed_eyes,_=getmesh(eyes)
    rotation=head.to_3x3()@r.data.bones['head'].matrix_local.to_3x3().inverted()
    forward=rotation@Vector((0,-1,0));up=rotation@Vector((0,0,1))
    pos=sum(deformed_eyes,Vector())/len(deformed_eyes)+forward*.103+up*.022
    target=pos+Vector((0,-1,-.65))
    target=target.lerp(Kfloor.translation,look)
    look_cut=ease(t,13,14.3)*(1-ease(t,17,18.2))
    target=target.lerp(cutpos,look_cut)
    eye.location=pos;eye.rotation_quaternion=(target-pos).to_track_quat('-Z','Y');eye.data.lens=24
    for obj in (r,eye,knife,cut):key(obj,frame)
    for p in r.pose.bones:key(p,frame)
    if frame%12==1:
        local=knife.matrix_world.inverted()@cutpos
        metrics.append({'t':t,'edgeLocalXYZ':list(local),'eyeXYZ':list(pos),'leftWrist':list(LW.translation),'rightWrist':list(RW.translation)})
    if frame%96==1:print('Baked',round(t,2),'seconds',flush=True)

# Corrective for actual garment/seat contact at the extreme lean. Work in
# evaluated world space, then transform the displacement to the original
# weighted bind garment. Only fabric changes, not bones, shoes, or chair.
f=1+11.8*FPS;s.frame_set(int(f),subframe=f-int(f));update()
pants=next(o for o in actor if 'cargo_pants' in o.name)
world=pants.matrix_world.copy();into=r.matrix_world.inverted()@world;out=r.matrix_world
positions,triangles=getmesh(pants);parts,_=closed_parts(*getmesh(chair))
corrected={}
for i,p in enumerate(positions):
    if p.z<.40 or p.z>.60:continue
    for tree,lo,hi in parts:
        if not all(lo[j]-.0002<=p[j]<=hi[j]+.0002 for j in range(3)):continue
        q,n,_,d=tree.find_nearest(p)
        if q is None or (p-q).dot(n)>=0:continue
        surface,normal,_,_=tree.ray_cast(p,Vector((0,0,1)),.065)
        if surface is None or normal.z<.2:continue
        dz=(surface-p).z+.004
        corrected[i]=max(corrected.get(i,0),min(.034,dz))
if corrected:
    neighbors={i:set() for i in range(len(positions))}
    for e in pants.data.edges:
        i,j=e.vertices;neighbors[i].add(j);neighbors[j].add(i)
    smoothed=corrected.copy()
    for _ in range(2):
        expanded=smoothed.copy()
        for i,d in smoothed.items():
            for j in neighbors[i]:expanded[j]=max(expanded.get(j,0),d*.63)
        smoothed=expanded
    if not pants.data.shape_keys:pants.shape_key_add(name='Basis')
    shape=pants.shape_key_add(name='Seated fabric clears the real seat');shape.value=0
    for i,d in smoothed.items():
        v=pants.data.vertices[i]
        weights=[(pants.vertex_groups[g.group].name,g.weight) for g in v.groups if pants.vertex_groups[g.group].name in r.data.bones]
        total=sum(w for _,w in weights)
        if not total:continue
        skin=Matrix(((0,0,0,0),)*4)
        for name,w in weights:skin+=(r.pose.bones[name].matrix@r.data.bones[name].matrix_local.inverted())*(w/total)
        shape.data[i].co+=(out@skin@into).to_3x3().inverted_safe()@Vector((0,0,d))
    for f in range(1,s.frame_end+1,2):
        shape.value=lean_at((f-1)/FPS);shape.keyframe_insert('value',frame=f)
    print('SEAT CLOTH CORRECTIVE',len(corrected),'direct contacts',len(smoothed),'affected vertices',flush=True)
s.name='100gate | Upright escape · native performance'
s.camera=eye;s['source']='Seated rest pose only. No fall animation in this scene.'
for action in bpy.data.actions:
    for slot in action.slots:
        for layer in action.layers:
            for strip in layer.strips:
                bag=strip.channelbag(slot)
                if bag:
                    for curve in bag.fcurves:
                        for p in curve.keyframe_points:p.interpolation='LINEAR'
s.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'story-upright-escape.blend'),compress=True)
for image in bpy.data.images:
    if image.type=='IMAGE' and max(image.size)>1024:
        w,h=image.size;image.scale(round(w*1024/max(w,h)),round(h*1024/max(w,h)))
bpy.ops.export_scene.gltf(filepath=str(OUT/'story-upright-escape.glb'),export_animations=True,export_animation_mode='SCENE',
    export_anim_scene_split_object=False,export_force_sampling=True,export_frame_range=True,
    export_rest_position_armature=True,export_cameras=True,export_morph=True,export_skins=True,
    export_tangents=True,export_image_format='JPEG',export_jpeg_quality=90,export_extras=True)
(OUT/'story-upright-escape.json').write_text(json.dumps({'nativeBones':len(r.data.bones),'fps':FPS,'seconds':23.2,'source':'art/intro-bound-native-wip.blend','clipSamples':metrics},indent=2))
print('UPRIGHT_ESCAPE_EXPORTED',flush=True)
