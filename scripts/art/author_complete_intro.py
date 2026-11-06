"""Extend the existing native performance to a complete, playable 42s intro.

Original MPFB geometry, repaired finger articulation, wardrobe and rail failure
are retained. Authored native FK/IK is baked; no procedural replacement human.
The left cut is on an exterior load-bearing tail, not on the knife wrist.
"""
import bpy,math,json,sys
from pathlib import Path
from mathutils import Matrix,Vector,Quaternion
from mathutils.kdtree import KDTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from native_pose_tools import two_bone_ik,set_pose_matrix
from cinematic_geometry import getmesh
out=Path.cwd()/'outputs/complete-intro';out.mkdir(parents=True,exist_ok=True)
s=bpy.context.scene;assert s.get('left_rail_failure')
r=next(o for o in s.objects if o.type=='ARMATURE' and 'MPFB' in o.name)
prop=next(o for o in s.objects if o.type=='ARMATURE' and o!=r)
chair=s.objects['old-chair'];wood=s.objects['Left rail | impact fracture fragment']
knife=s.objects['Cinematic field knife'];camera=s.objects['Cine · First person']
actor=[o for o in s.objects if o.type=='MESH' and o.name.startswith('Alexei | original MakeHuman body') and not o.get('authoring_archive')]
body=next(o for o in actor if o.name.endswith('MakeHuman body'))
ropes={side:next(o for o in s.objects if f'{side} intact wrist-to-chair rope' in o.name) for side in ('l','r')}
grip=json.loads(Path('art/provenance/native-left-grip-contract.json').read_text());S=Matrix.Diagonal((-1,1,1,1));F=S.copy()
hr=Matrix(grip['handRest']);hl=r.data.bones['hand_l'].matrix_local
socket=hl.inverted()@S@hr@Matrix(grip['socket'])@F
left_grip={}
left_finger_basis={}
for name,data in grip['bones'].items():
    nl=name[:-1]+'l';br=Matrix(data['rest']);pr=Matrix(data['pose'])
    posed=S@hr@Matrix(grip['handPose']).inverted()@pr@br.inverted()@S@r.data.bones[nl].matrix_local
    left_grip[nl]=hl.inverted()@posed
for name,relative in left_grip.items():
    bone=r.data.bones[name];parent=bone.parent
    parent_pose=hl@left_grip[parent.name] if parent.name in left_grip else hl
    left_finger_basis[name]=bone.convert_local_to_pose(hl@relative,bone.matrix_local,parent_matrix=parent_pose,parent_matrix_local=parent.matrix_local,invert=True)

# Mirror the already repaired native right-hand weights onto matching left-hand
# source vertices. Topology, positions and UVs are not replaced or scaled.
tree=KDTree(len(body.data.vertices))
for v in body.data.vertices:tree.insert(v.co,v.index)
tree.balance();handnames={'hand_l'}|set(left_grip)
for v in body.data.vertices:
    if sum(g.weight for g in v.groups if body.vertex_groups[g.group].name in handnames)<.35:continue
    _,i,d=tree.find(S.to_3x3()@v.co)
    if d>.0007:continue
    weights=[(body.vertex_groups[g.group].name,g.weight) for g in body.data.vertices[i].groups if g.weight>1e-8]
    for g in list(v.groups):body.vertex_groups[g.group].remove([v.index])
    for name,w in weights:
        nl=name[:-1]+'l' if name.endswith('_r') else name
        if nl in body.vertex_groups:body.vertex_groups[nl].add([v.index],w,'REPLACE')

def ease(t,a,b):
    x=max(0,min(1,(t-a)/(b-a)));return x*x*x*(10+x*(-15+6*x))
def blend(a,b,x):
    p,q,sc=a.decompose();p1,q1,sc1=b.decompose()
    return Matrix.LocRotScale(p.lerp(p1,x),q.slerp(q1,x),sc.lerp(sc1,x))
def rotate(name,axis,degrees):
    p=r.pose.bones[name];local=p.bone.matrix_local.to_3x3().inverted()@Vector(axis)
    p.rotation_quaternion=p.rotation_quaternion@Quaternion(local.normalized(),math.radians(degrees))
def minimum(objects):return min(p.z for o in objects for p in getmesh(o)[0])
def cutting_hand(point,draw=0,right=False):
    rot=(Quaternion((0,0,1),0 if right else math.pi)@Quaternion((1,0,0),-math.pi/2-.18)).to_matrix()
    return (Matrix.Translation(Vector(point)-rot@Vector((.010,0,.115-draw)))@rot.to_4x4())@socket.inverted()
def arm(side,goal,orientation,pole):
    shoulder=r.matrix_world@r.pose.bones['upperarm_'+side].head
    reach=sum(r.data.bones[n+side].length for n in ('upperarm_','lowerarm_'))
    distance=(goal-shoulder).length
    if distance>reach-.001:raise ValueError(f'Unreachable {side}: {distance:.4f}/{reach:.4f}; change staging, not bone length')
    two_bone_ik(r,side,goal,pole,orientation);bpy.context.view_layer.update()

# Snapshot first 16.5s before editing any action, resampling its actual 48fps.
owners=[r,chair,wood,camera,prop]
cache=[]
for i in range(397):
    s.frame_set(1+2*i);bpy.context.view_layer.update()
    cache.append(({o.name:o.matrix_world.copy() for o in owners},
      {p.name:p.matrix_basis.copy() for p in r.pose.bones},
      {p.name:p.matrix_basis.copy() for p in prop.pose.bones}))
initial=cache[-1];base=initial[1];base_root=initial[0][r.name]
s.frame_set(793);bpy.context.view_layer.update()
fore0={side:r.matrix_world@r.pose.bones['lowerarm_'+side].matrix for side in ('l','r')}
hand0={side:r.matrix_world@r.pose.bones['hand_'+side].matrix for side in ('l','r')}
foot0={side:r.matrix_world@r.pose.bones['foot_'+side].matrix for side in ('l','r')}
elbow0={side:r.matrix_world@r.pose.bones['lowerarm_'+side].head for side in ('l','r')}
props0={p.name:p.matrix.copy() for p in prop.pose.bones}
wood0=wood.matrix_world.copy()
Kfloor=Matrix.Translation((1.18,-.31,.02))@(Quaternion((0,0,1),math.pi)@Quaternion((1,0,0),-math.pi/2-.18)).to_matrix().to_4x4()
knife.animation_data_clear();knife.rotation_mode='QUATERNION';knife.matrix_world=Kfloor;bpy.context.view_layer.update()
Kfloor.translation.z+=.004-minimum([o for o in knife.children if o.type=='MESH'])
Hfloor=Kfloor@socket.inverted()
print('LEFT FLOOR WRIST',list(Hfloor.translation),'socket',list(socket.translation),flush=True)
for o in owners:
    o.animation_data_clear();o.rotation_mode='QUATERNION'
for p in r.pose.bones:p.rotation_mode='QUATERNION'
for p in prop.pose.bones:p.rotation_mode='QUATERNION'

# Open each original three-ply tether at a duplicated centreline ring. The
# surfaces are exactly joined before cutting; the two capped ends separate only
# at their cut event. The cuff geometry itself is not deleted.
cuts={}
for side,obj in ropes.items():
    mesh=obj.data;group_names=[g.name for g in obj.vertex_groups];N=len(mesh.vertices)//24
    assert N*24==len(mesh.vertices),'Expected the original three-ply rope topology'
    rings=[sum((obj.matrix_world@mesh.vertices[strand*N*8+i*8+j].co for strand in range(3) for j in range(8)),Vector())/24 for i in range(N)]
    # An exposed standing part, away from flesh and the hitch knot.
    candidates=[i for i,p in enumerate(rings) if (.623<p.z<.658 if side=='l' else .608<p.z<.624)]
    # Right standing part is clear of the restrained fingers and wooden rail.
    # Ring624 selected by evaluated body/knife/chair BVH tests, not camera hiding.
    cut=min(candidates,key=lambda i:abs(rings[i].z-.642)) if side=='l' else 624
    verts=[v.co.copy() for v in mesh.vertices];weights=[[(g.group,g.weight) for g in v.groups] for v in mesh.vertices]
    faces=[];old_uv=mesh.uv_layers.active;face_uv=[]
    duplicates={}
    for strand in range(3):
        for j in range(8):
            old=strand*N*8+cut*8+j;duplicates[old]=len(verts);verts.append(verts[old].copy());weights.append(weights[old][:])
    for poly in mesh.polygons:
        ids=list(poly.vertices);forward=any((v//8)%N>cut for v in ids)
        faces.append([duplicates.get(v,v) if forward else v for v in ids]);face_uv.append([old_uv.data[li].uv.copy() for li in poly.loop_indices])
    for strand in range(3):
        ids=[strand*N*8+cut*8+j for j in range(8)]
        for j in range(1,7):
            for tri in ((ids[0],ids[j+1],ids[j]),(duplicates[ids[0]],duplicates[ids[j]],duplicates[ids[j+1]])):
                faces.append(tri);face_uv.append([Vector((0,0)),Vector((1,0)),Vector((0,1))])
    new=bpy.data.meshes.new('Native '+side+' restraint with closed cut seam');new.from_pydata(verts,[],faces);new.update()
    for m in mesh.materials:new.materials.append(m)
    layer=new.uv_layers.new(name=old_uv.name)
    for p,uvs in zip(new.polygons,face_uv):
        p.use_smooth=True
        for li,uv in zip(p.loop_indices,uvs):layer.data[li].uv=uv
    obj.data=new
    # Blender stores deform-group definitions with the replaced mesh datablock.
    obj.vertex_groups.clear()
    for name in group_names:obj.vertex_groups.new(name=name)
    for g in obj.vertex_groups:g.remove(list(range(len(verts))))
    for i,ws in enumerate(weights):
        for group,w in ws:obj.vertex_groups[group].add([i],w,'REPLACE')
    obj.shape_key_add(name='Basis');key=obj.shape_key_add(name='Actual severed ends')
    for i in range(len(verts)):
        original=i if i<len(mesh.vertices) else next(k for k,v in duplicates.items() if v==i)
        ring=(original//8)%N;dist=abs(ring-cut)
        if dist>25:continue
        tangent=(rings[min(N-1,cut+1)]-rings[max(0,cut-1)]).normalized()
        direction=1 if i>=len(mesh.vertices) or ring>cut else -1
        key.data[i].co+=obj.matrix_world.to_3x3().inverted()@tangent*(direction*.016*math.exp(-(dist/12)**2))
    for t,v in ((0,0),(26.15 if side=='l' else 30.35,0),(26.4 if side=='l' else 30.6,1),(42,1)):
        key.value=v;key.keyframe_insert('value',frame=1+t*24)
    ids=[strand*N*8+cut*8+j for strand in range(3) for j in range(8)]
    hw=sum(sum(w for group,w in weights[i] if group_names[group]==('Hitch' if side=='l' else 'RightHitch')) for i in ids)/24
    cuts[side]={'point':rings[cut].copy(),'ring':cut,'ids':ids,'hitchWeight':hw}

markers={}
for side in ('l','r'):
    marker=bpy.data.objects.new('LeftCutContact' if side=='l' else 'RightCutContact',None);s.collection.objects.link(marker);markers[side]=marker
def rope_point(side):
    ev=ropes[side].evaluated_get(bpy.context.evaluated_depsgraph_get());m=ev.to_mesh()
    p=sum((ev.matrix_world@m.vertices[i].co for i in cuts[side]['ids']),Vector())/24;ev.to_mesh_clear();return p
for obj in ropes.values():obj.data.shape_keys.key_blocks['Actual severed ends'].value=0
bpy.context.view_layer.update();right_contact=rope_point('r')

# Old garment morph timings are frame-indexed; resample them from 48 to 24fps.
for obj in actor:
    keys=obj.data.shape_keys
    if not keys or not keys.animation_data or not keys.animation_data.action:continue
    for layer in keys.animation_data.action.layers:
        for strip in layer.strips:
            for slot in keys.animation_data.action.slots:
                bag=strip.channelbag(slot)
                if bag:
                    for fc in bag.fcurves:
                        for k in fc.keyframe_points:
                            k.co.x=1+(k.co.x-1)/2;k.handle_left.x=1+(k.handle_left.x-1)/2;k.handle_right.x=1+(k.handle_right.x-1)/2

def pose_body(t):
    # Three anatomical staging poses: side-lying, supported kneel, half-kneel,
    # standing. The native skeleton is interpolated; hands/soles are then solved.
    end=Matrix.Translation((.42,-.42,.016))
    kneel=Matrix.Translation((.72,-.46,-.51))
    half=Matrix.Translation((.55,-.45,-.30))
    if t<36:return base_root.copy(),base
    poses={}
    for name,p in r.pose.bones.items():poses[name]=Matrix.Identity(4)
    if t<38:
        x=ease(t,36,38);root=blend(base_root,kneel,x)
        for name in poses:poses[name]=blend(base[name],Matrix.Identity(4),x)
        return root,poses
    return (blend(kneel,half,ease(t,38,40)) if t<40 else blend(half,end,ease(t,40,42))),poses

s.render.fps=24;s.frame_start=1;s.frame_end=1009
timeline=[]
release_hitch=None;rise_feet=foot0.copy();rise_knees={side:r.matrix_world@r.pose.bones['calf_'+side].head for side in ('l','r')}
for frame in range(1,1010):
    t=(frame-1)/24;s.frame_set(frame)
    if t<=16.5:
        worlds,pose,pp=cache[frame-1]
        for o in owners:o.matrix_world=worlds[o.name]
        for p in r.pose.bones:p.matrix_basis=pose[p.name]
        for p in prop.pose.bones:p.matrix_basis=pp[p.name]
        knife.matrix_world=Kfloor
    else:
        root,pose=pose_body(t);r.matrix_world=root
        for p in r.pose.bones:p.matrix_basis=pose[p.name]
        chair.matrix_world=initial[0][chair.name]
        push=ease(t,34.8,36)
        chair.matrix_world.translation.y+=.50*push
        bpy.context.view_layer.update()
        if t>=36:
            pitch=75*ease(t,36,38)*(1-ease(t,38,42))
            rotate('spine_01',(1,0,0),pitch*.55);rotate('spine_02',(1,0,0),pitch*.30);rotate('spine_03',(1,0,0),pitch*.15)
            bpy.context.view_layer.update()
        if t<36:
            lift=ease(t,20.5,22)*(1-ease(t,31,34))
            rotate('neck_01',(0,1,0),-18*lift);rotate('head',(0,1,0),-22*lift)
            bpy.context.view_layer.update()
            right_pose=hand0['r'].copy()
            if t>=31.9:
                contact=Hfloor.copy();contact.translation+=Vector((0,.045,.19))
                right_pose=blend(right_pose,contact,ease(t,31.9,32.9)*(1-ease(t,34,35.8)))
            arm('r',right_pose.translation,right_pose.to_3x3(),elbow0['r'])
            over=Hfloor.copy();over.translation=Vector((1.41,.14,.60))
            front=Hfloor.copy();front.translation=Vector((1.41,-.25,.55))
            if t<17.5:h=blend(hand0['l'],over,ease(t,16.5,17.5))
            elif t<18.5:h=blend(over,front,ease(t,17.5,18.5))
            else:h=blend(front,Hfloor,ease(t,18.5,19.4))
            if t>=20.5:h=Hfloor.copy();h.translation.z+=.12*ease(t,20.5,22)
            elif t>=19.4:h.translation.z+=.030*(1-ease(t,19.4,20.45))
            if 22<=t<31:
                a=Vector((1.05,-.32,.23)) if t<26.5 else right_contact.copy()
                phase=ease(t,22,23) if t<26.5 else ease(t,26.5,27.5)
                draw=.030*math.sin(max(0,t-(23 if t<26.5 else 27.5))*math.tau*1.5)*phase*(1-ease(t,26.15 if t<26.5 else 30.35,26.5 if t<26.5 else 31))
                target=cutting_hand(a,draw,right=t>=26.5)
                start=Hfloor.copy();start.translation.z+=.12
                if t>=26.5:start=cutting_hand((1.05,-.32,.23))
                h=blend(start,target,phase)
                if t>=26.5:h.translation.z+=.18*math.sin(math.pi*phase)
            if 31<=t<34:
                h=blend(cutting_hand(right_contact,right=True),Hfloor,ease(t,31,31.9))
                h.translation.z+=.16*ease(t,31.9,32.5)
            if t>=34:
                above=Hfloor.copy();above.translation.z+=.16
                h=blend(above,hand0['l'],ease(t,34,35.8))
            pole=Vector((1.50,.12,.40)).lerp(Vector((1.40,-.10,.10 if t<20.5 else .32)),ease(t,18.5,19.4))
            if 26.5<=t<31:pole=Vector((.85,.05,.48))
            arm('l',h.translation,h.to_3x3(),pole)
            # Original mirrored per-phalanx power grip, staggered digit closure.
            for name,relative in left_grip.items():
                digit=name.split('_')[0];offset={'index':0,'middle':-.08,'ring':-.15,'pinky':-.20,'thumb':.12}[digit]
                joint=int(name.split('_')[1])
                if digit=='thumb':
                    closure=ease(t,18.8,19.2)*(.65+.35*ease(t,19.9,20.45)) if joint==1 else ease(t,19.9,20.45)
                else:
                    start,end={1:(19,19.8),2:(19.4,20.3),3:(19.8,20.4)}[joint]
                    closure=ease(t,start+offset,end+offset)
                closure*=1-ease(t,31.9,32.3)
                r.pose.bones[name].matrix_basis=blend(base[name],left_finger_basis[name],closure)
            bpy.context.view_layer.update()
            if t<20.5:knife.matrix_world=Kfloor
            elif t<31.9:knife.matrix_world=r.matrix_world@r.pose.bones['hand_l'].matrix@socket
            else:knife.matrix_world=Kfloor
            if t>=34:
                goal=foot0['r'].translation.lerp(Vector((.45,-.14,.13)),ease(t,34,34.8))+Vector((0,.50*push,0))
                two_bone_ik(r,'r',goal,Vector((.72,-.44,.31)),foot0['r'].to_3x3(),kind='leg',align_hinge=True)
                bpy.context.view_layer.update()
            rise_feet={side:r.matrix_world@r.pose.bones['foot_'+side].matrix for side in ('l','r')}
            rise_knees={side:r.matrix_world@r.pose.bones['calf_'+side].head for side in ('l','r')}
        else:
            # Native feet support the kneel, then one foot bears the half rise.
            for side,sign in (('l',1),('r',-1)):
                standing=Vector((.42,-.42,.016))+r.data.bones['foot_'+side].head_local
                foot=Vector((.72+sign*.12,.12,.075)).lerp(standing,ease(t,38 if side=='r' else 40,42))
                if t<38:foot=rise_feet[side].translation.lerp(foot,ease(t,36,38))
                pole=Vector((.72+sign*.12,-.28,.12)).lerp(Vector((standing.x,-.44,.55)),ease(t,38,42))
                if t<38:pole=rise_knees[side].lerp(pole,ease(t,36,38))
                two_bone_ik(r,side,foot,pole,r.matrix_world.to_3x3()@r.data.bones['foot_'+side].matrix_local.to_3x3(),kind='leg',align_hinge=True)
            bpy.context.view_layer.update()
            for side,sign in (('l',1),('r',-1)):
                floor_hand=Vector((.72+sign*.22,-.65,.13))
                shoulder=r.matrix_world@r.pose.bones['upperarm_'+side].head
                relaxed=shoulder+Vector((sign*.025,-.055,-.45))
                hand=floor_hand.lerp(relaxed,ease(t,38,39.2))
                if t<38:hand=hand0[side].translation.lerp(floor_hand,ease(t,36,38))
                reach=sum(r.data.bones[n+side].length for n in ('upperarm_','lowerarm_'))*.98
                if (hand-shoulder).length>reach:hand=shoulder+(hand-shoulder).normalized()*reach
                # Keep original forearm/hand relation for a supported open palm.
                orient=hand0[side].to_quaternion().slerp((r.matrix_world@r.data.bones['hand_'+side].matrix_local).to_quaternion(),ease(t,36,38)).to_matrix()
                arm(side,hand,orient,Vector((.72+sign*.30,-.45,.45)))
            knife.matrix_world=Kfloor
        bpy.context.view_layer.update()
        # Restraints follow forearms until removal, then slide over open hands
        # and fall/settle. The cut caps remain separated; nothing disappears.
        drop=ease(t,34,35.8)
        for side,prefix in (('l',''),('r','Right')):
            fore=r.matrix_world@r.pose.bones['lowerarm_'+side].matrix
            cuff=fore@fore0[side].inverted()@props0[prefix+'Cuff']
            hitch=(fore@fore0[side].inverted()@props0[prefix+'Hitch']) if side=='l' and t<22 else props0[prefix+'Hitch'].copy()
            if side=='l' and release_hitch is not None and t>26.15:hitch=release_hitch.copy()
            if side=='l' and 22<=t<26.4:
                point=cuts['l']['point'];w=.5
                a=Vector((1.05,-.32,.23));hitch.translation+=(a-(cuff@point)*w-(hitch@point)*(1-w))/(1-w)*ease(t,22,23)
            loose=ease(t,26.3 if side=='l' else 30.5,33.8)
            centre=Vector((.16 if side=='l' else -.16,.195,.70))
            drop_q=Quaternion((1,0,0),math.pi/2)
            floor_cuff=Matrix.Translation((.25 if side=='l' else .55,.16,.035))@drop_q.to_matrix().to_4x4()@Matrix.Translation(-centre)@prop.data.bones[prefix+'Cuff'].matrix_local
            cuff=blend(cuff,floor_cuff,drop)
            # Expand only the rope loop, never the native fingers.
            if loose and not drop:
                anchor=r.matrix_world@r.pose.bones['hand_'+side].head
                expand=Matrix.Diagonal((1+.65*loose,1+.65*loose,1+.65*loose,1))
                cuff=Matrix.Translation(anchor)@expand@Matrix.Translation(-anchor)@cuff
                cuff.translation+=(fore.to_3x3()@Vector((0,1,0))).normalized()*(.10*ease(t,32.4,34))
            if t>=31:
                floor_hitch=Matrix.Translation((.35 if side=='l' else .65,.30,.035))@Quaternion((0,1,0),-math.pi/2).to_matrix().to_4x4()@Matrix.Translation((-.105 if side=='l' else .105,-.283,-.562))@prop.data.bones[prefix+'Hitch'].matrix_local
                hitch=blend(hitch,floor_hitch,ease(t,31,35.8))
            prop.pose.bones[prefix+'Cuff'].matrix=cuff
            prop.pose.bones[prefix+'Hitch'].matrix=hitch
            bpy.context.view_layer.update()
            if side=='l' and 23<=t<=26.15:
                actual=rope_point('l');hitch.translation+=(Vector((1.05,-.32,.23))-actual)/cuts['l']['hitchWeight']
                prop.pose.bones['Hitch'].matrix=hitch
                release_hitch=hitch.copy()
        wood.matrix_world=prop.pose.bones['Hitch'].matrix@props0['Hitch'].inverted()@wood0
        bpy.context.view_layer.update()
        for side,obj in ropes.items():
            if t>=34:
                low=min(p.z for p in getmesh(obj)[0])
                if low<.005:
                    prefix='' if side=='l' else 'Right'
                    for n in ('Cuff','Hitch'):
                        pb=prop.pose.bones[prefix+n];m=pb.matrix.copy();m.translation.z+=.005-low;pb.matrix=m
        if t>=36:
            low=minimum(actor)
            if low<0:r.matrix_world.translation.z-=low
        low=minimum([wood])
        if low<.003:
            wood.matrix_world.translation.z+=.003-low
            m=prop.pose.bones['Hitch'].matrix.copy();m.translation.z+=.003-low;prop.pose.bones['Hitch'].matrix=m
        bpy.context.view_layer.update()
        # Eye follows the actual head, then faces naturally forward while rising.
        head=r.pose.bones['head'];rot=r.matrix_world.to_3x3()@head.matrix.to_3x3()@head.bone.matrix_local.to_3x3().inverted()
        forward=(rot@Vector((0,-1,0))).normalized();up=(rot@Vector((0,0,1))).normalized()
        eyes=next(o for o in actor if 'low-poly' in o.name);ep,_=getmesh(eyes)
        camera.location=sum(ep,Vector())/len(ep)+forward*.075
        # Look at the working hand during cuts; supported rise returns to FPS.
        target=(r.matrix_world@r.pose.bones['hand_l'].head)+Vector((0,-.05,-.02)) if t<36 else camera.location+forward*2-up*(.18*(1-ease(t,40,42)))
        camera.rotation_quaternion=cache[-1][0][camera.name].to_quaternion().slerp((target-camera.location).to_track_quat('-Z','Y'),ease(t,16.5,18))
    bpy.context.view_layer.update()
    for side,marker in markers.items():
        marker.location=rope_point(side);marker.keyframe_insert('location',frame=frame)
    for p in r.pose.bones:
        for attr in ('location','rotation_quaternion','scale'):p.keyframe_insert(attr,frame=frame,group=p.name)
    for p in prop.pose.bones:
        for attr in ('location','rotation_quaternion','scale'):p.keyframe_insert(attr,frame=frame,group=p.name)
    for o in owners+[knife]:
        for attr in ('location','rotation_quaternion','scale'):o.keyframe_insert(attr,frame=frame)
    if frame%24==1:print('FULL INTRO',round(t,2),flush=True)
    timeline.append({'time':t,'knife':list(knife.matrix_world.translation),'eye':list(camera.matrix_world.translation)})

for o in owners+[knife]:
    for slot in o.animation_data.action.slots:
        for layer in o.animation_data.action.layers:
            for strip in layer.strips:
                bag=strip.channelbag(slot)
                if bag:
                    for fc in bag.fcurves:
                        for k in fc.keyframe_points:k.interpolation='LINEAR'
s['complete_native_intro']=True;s['cinematic_export_stem']='intro-native-v2';s.name='100gate | Complete native intro v2'
for o in s.objects:
    if o.name.startswith('Review stage') or o.type=='LIGHT':o['authoring_archive']=True;o.hide_render=True
s.frame_set(1);bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(out/'intro-native-v2.blend'),compress=True)
(out/'timeline.json').write_text(json.dumps(timeline))
