"""New intro blocking on the approved original MPFB actor.

Static contact gates FIRST. These holds are NOT exported as a finished intro.
Source mesh, UV, materials, shape keys and approved hand weights are retained.
"""
import bpy,json,math,sys
from pathlib import Path
from mathutils import Matrix,Vector,Quaternion
from mathutils.bvhtree import BVHTree
root=Path.cwd();out=root/'outputs/cinematic-intro';out.mkdir(parents=True,exist_ok=True)
s=bpy.context.scene;s.frame_set(241);bpy.context.view_layer.update()
r=next(o for o in s.objects if o.type=='ARMATURE')
body=next(o for o in s.objects if o.type=='MESH' and o.name.endswith('MakeHuman body'))
wardrobe=[o for o in s.objects if o.type=='MESH' and o.name.startswith(body.name+'.')]
knife=next(o for o in s.objects if o.type=='EMPTY')
chair=next(o for o in s.objects if o.type=='MESH' and 'chair' in o.name.lower())
# The existing prop's 52.7 cm seat is too high for this actor's 43.5 cm shins
# with planted soles. Calibrate the CHAIR uniformly, never the human anatomy.
chair.matrix_world=chair.matrix_world@Matrix.Scale(.88,4)
chair_rest=chair.matrix_world.copy();actor_rest=r.matrix_world.copy()
H=r.matrix_world@r.pose.bones['hand_r'].matrix;grip_socket=H.inverted()@knife.matrix_world
grip={p.name:p.rotation_quaternion.copy() for p in r.pose.bones if p.name.endswith('_r') and p.name.startswith(('thumb_','index_','middle_','ring_','pinky_'))}
native_hand_normal={}
N=H.to_3x3().inverted()@knife.matrix_world.to_3x3().col[1]
N0=r.data.bones['hand_r'].matrix_local.to_3x3()@N
native_hand_normal['r']=N;native_hand_normal['l']=r.data.bones['hand_l'].matrix_local.to_3x3().inverted()@Vector((-N0.x,N0.y,N0.z))
controls=json.loads(s['new_static_grip_hinges'])
# Rear hem is cloth over the pelvis, not a continuation of the thigh. Stock
# transferred thigh weights were dragging little triangles into the trousers.
shirt=next(o for o in wardrobe if 'fisherman' in o.name)
# The stock garment transfer differs from the native shoulder blend. Rebind
# only the shoulder/sleeve transition to the actual shaped bind-space skin,
# using triangle barycentrics, not a posed nearest-vertex approximation.
def repair_shoulder_weights():
    from mathutils.geometry import barycentric_transform
    toggles={m:m.show_viewport for m in body.modifiers if m.type=='ARMATURE' or (m.type=='MASK' and m.name!='Hide helpers')}
    for m in toggles:m.show_viewport=False
    bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();ev=body.evaluated_get(deps)
    mesh=ev.to_mesh(preserve_all_data_layers=True,depsgraph=deps);mesh.calc_loop_triangles()
    points=[ev.matrix_world@v.co for v in mesh.vertices];tris=[tuple(t.vertices) for t in mesh.loop_triangles]
    names={g.index:g.name for g in body.vertex_groups if g.name in r.data.bones}
    weights=[{names[g.group]:g.weight for g in v.groups if g.group in names} for v in mesh.vertices]
    tree=BVHTree.FromPolygons(points,tris,all_triangles=True);ev.to_mesh_clear()
    for m,on in toggles.items():m.show_viewport=on
    changed=[]
    for v in shirt.data.vertices:
        old={shirt.vertex_groups[g.group].name:g.weight for g in v.groups if shirt.vertex_groups[g.group].name in r.data.bones}
        shoulder=sum(w for n,w in old.items() if n.startswith(('clavicle_','upperarm_')))
        if shoulder<.08:continue
        p=shirt.matrix_world@v.co;q,_,index,dist=tree.find_nearest(p)
        if dist>.045:continue
        a,b,c=tris[index];bc=barycentric_transform(q,points[a],points[b],points[c],Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1)))
        new={}
        for vertex,factor in zip((a,b,c),bc):
            for n,w in weights[vertex].items():new[n]=new.get(n,0)+w*max(0,factor)
        total=sum(new.values())
        if total<.9:continue
        for n in old:shirt.vertex_groups[n].remove([v.index])
        for n,w in new.items():
            if n not in shirt.vertex_groups:shirt.vertex_groups.new(name=n)
            if w>1e-8:shirt.vertex_groups[n].add([v.index],w/total,'REPLACE')
        changed.append(v.index)
    s['shoulder_cloth_rebound_vertices']=json.dumps(changed)
    bpy.context.view_layer.update()
repair_shoulder_weights()
hem_repairs=[]
for v in shirt.data.vertices:
    if v.co.z>1.12 or v.co.y<.015:continue
    factor=max(0,min(1,(v.co.y-.015)/.055))*max(0,min(1,(1.12-v.co.z)/.10))
    transfer=0.
    for g in list(v.groups):
        vg=shirt.vertex_groups[g.group]
        if vg.name in ('thigh_r','thigh_l'):
            delta=g.weight*factor;transfer+=delta;vg.add([v.index],g.weight-delta,'REPLACE')
    if transfer:
        shirt.vertex_groups['pelvis'].add([v.index],transfer,'ADD');hem_repairs.append(v.index)
# Thumb-web skin distal to the wrist must follow the hand/metacarpal frame,
# not twist with the forearm. Preserve geometry and total deform weights.
web_repairs=[]
for side in ('r','l'):
    lower=body.vertex_groups['lowerarm_'+side];hand_group=body.vertex_groups['hand_'+side]
    for v in body.data.vertices:
        ws={body.vertex_groups[g.group].name:g.weight for g in v.groups}
        thumb=sum(ws.get(f'thumb_0{j}_{side}',0) for j in (1,2,3))
        amount=ws.get(lower.name,0)
        if thumb>.05 and amount>1e-7:
            lower.remove([v.index]);hand_group.add([v.index],amount,'ADD');web_repairs.append(v.index)
for o in (r,knife):o.animation_data_clear()
for p in r.pose.bones:p.rotation_mode='QUATERNION'
knife.rotation_mode='QUATERNION';r.rotation_mode='QUATERNION';chair.rotation_mode='QUATERNION'
if chair.animation_data:chair.animation_data_clear()
def update():bpy.context.view_layer.update()
def mesh_points(obj):
    deps=bpy.context.evaluated_depsgraph_get();ev=obj.evaluated_get(deps);m=ev.to_mesh();v=[ev.matrix_world@x.co for x in m.vertices];ev.to_mesh_clear();return v
def region_points(obj,names):
    deps=bpy.context.evaluated_depsgraph_get();ev=obj.evaluated_get(deps);m=ev.to_mesh(preserve_all_data_layers=True,depsgraph=deps)
    groups={g.index:g.name for g in obj.vertex_groups if g.name in r.data.bones};points=[]
    for v in m.vertices:
        weights=[(g.weight,groups[g.group]) for g in v.groups if g.group in groups]
        if max(weights,default=(0,''))[1] in names:points.append(ev.matrix_world@v.co)
    ev.to_mesh_clear();return points
def reset():
    for p in r.pose.bones:p.matrix_basis=Matrix.Identity(4)
    r.matrix_world=Matrix.Identity(4);chair.matrix_world=chair_rest;update()
def aim(name,direction):
    p=r.pose.bones[name];m=p.matrix.copy();a=m.translation
    q=(p.tail-p.head).rotation_difference(Vector(direction));p.matrix=Matrix.Translation(a)@q.to_matrix().to_4x4()@Matrix.Translation(-a)@m;update()
def rotate(name,axis,deg):
    p=r.pose.bones[name];m=p.matrix.copy();a=m.translation
    p.matrix=Matrix.Translation(a)@Quaternion(Vector(axis),math.radians(deg)).to_matrix().to_4x4()@Matrix.Translation(-a)@m;update()
def hand_orientation(side,forward,normal):
    b=r.data.bones['hand_'+side];heads=[r.data.bones[f'{d}_01_{side}'].head_local for d in ('index','middle','ring','pinky')]
    f=b.matrix_local.to_3x3().inverted()@(sum(heads,Vector())/4-b.head_local);f.normalize()
    n=native_hand_normal[side].copy();n=(n-f*n.dot(f)).normalized();a=f.cross(n).normalized()
    target_f=Vector(forward).normalized();target_n=Vector(normal);target_n=(target_n-target_f*target_n.dot(target_f)).normalized();target_a=target_f.cross(target_n).normalized()
    return Matrix((target_a,target_f,target_n)).transposed()@Matrix((a,f,n)).transposed().inverted()
def ik(side,target,pole,kind='arm',orientation=None):
    a_name=('upperarm_' if kind=='arm' else 'thigh_')+side;b_name=('lowerarm_' if kind=='arm' else 'calf_')+side
    a,b=r.pose.bones[a_name],r.pose.bones[b_name];inv=r.matrix_world.inverted();p=inv@Vector(target);h=a.head.copy();d=p-h;length=d.length;d.normalize()
    if not abs(a.length-b.length)+.001<length<a.length+b.length-.001:raise RuntimeError(f'{kind}/{side} unreachable {length:.4f} vs {a.length+b.length:.4f}')
    x=(a.length*a.length+length*length-b.length*b.length)/(2*length)
    n=inv@Vector(pole)-h;n=(n-d*n.dot(d)).normalized();elbow=h+d*x+n*math.sqrt(max(0,a.length*a.length-x*x))
    aim(a.name,elbow-h)
    if kind=='arm':
        # Resolve the humeral axial rotation from the anatomical elbow plane.
        # A position-only IK solution leaves this unconstrained, previously
        # forcing >110 degrees of all pronation into the sleeve's elbow seam.
        u=(a.bone.tail_local-a.bone.head_local).normalized();v=(b.bone.tail_local-b.bone.head_local).normalized()
        native=a.bone.matrix_local.to_3x3().inverted()@u.cross(v).normalized()
        axis=(elbow-h).normalized();current=a.matrix.to_3x3()@native
        goal=(elbow-h).cross(p-elbow).normalized()
        current=(current-axis*current.dot(axis)).normalized();goal=(goal-axis*goal.dot(axis)).normalized()
        angle=math.atan2(axis.dot(current.cross(goal)),current.dot(goal))
        old=a.matrix.copy();a.matrix=Matrix.Translation(h)@Quaternion(axis,angle).to_matrix().to_4x4()@Matrix.Translation(-h)@old;update()
    aim(b.name,p-b.head)
    endpoint=r.pose.bones[('hand_' if kind=='arm' else 'foot_')+side]
    if orientation is not None:
        # Put pronation into the forearm, not an impossible wrist twist.
        local_rot=r.matrix_world.to_3x3().inverted()@orientation
        if kind=='arm':
            native_relation=b.bone.matrix_local.to_3x3().inverted()@endpoint.bone.matrix_local.to_3x3()
            desired=local_rot@native_relation.inverted();axis=(p-b.head).normalized()
            swing=(desired@Vector((0,1,0))).rotation_difference(axis)
            lower=Matrix.Translation(b.head)@(swing.to_matrix()@desired).to_4x4();b.matrix=lower;update()
        endpoint.matrix=Matrix.Translation(p)@local_rot.to_4x4();update()
    return r.matrix_world@elbow
def relax_hands():
    for side in ('r','l'):
        for d,values in {'index':(12,18,10),'middle':(16,22,12),'ring':(20,25,15),'pinky':(24,28,16)}.items():
            for j,v in enumerate(values,1):
                name=f'{d}_0{j}_{side}';axis=Vector(controls[d][j-1]['axis'])
                if side=='l':
                    world=r.data.bones[f'{d}_0{j}_r'].matrix_local.to_3x3()@axis
                    world=Vector((-world.x,world.y,world.z));axis=-(r.data.bones[name].matrix_local.to_3x3().inverted()@world)
                r.pose.bones[name].rotation_quaternion=Quaternion(axis,math.radians(v))
        for j,angle in ((1,12),(2,15),(3,12)):
            p=r.pose.bones[f'thumb_0{j}_{side}'];p.rotation_quaternion=Quaternion(Vector((1,0,0)),math.radians(angle))
    update()
def flat_feet():
    for side,sign in (('l',1),('r',-1)):
        f=r.data.bones['foot_'+side]
        ik(side,(.185*sign,-.37,ankle_height),(.22*sign,-.83,.55),kind='leg',orientation=f.matrix_local.to_3x3())
def seated():
    reset();r.matrix_world=Matrix.Translation((0,.045,-.365));update()
    rotate('pelvis',(1,0,0),-3);rotate('spine_01',(1,0,0),8);rotate('spine_02',(1,0,0),3)
    rotate('neck_01',(1,0,0),4);rotate('head',(1,0,0),-3)
    flat_feet()
    pants=next(o for o in wardrobe if 'cargo' in o.name)
    vs=[v for v in mesh_points(pants) if abs(v.x)<.19 and v.y>-.015 and .4<v.z<.7]
    bottom=min(v.z for v in vs);r.location.z+=seat_z+.001-bottom;update();flat_feet()
    # Modest retraction while both forearms reach the lumbar/seat-back gap.
    rotate('clavicle_r',(0,0,1),-4);rotate('clavicle_l',(0,0,1),4)
    ik('r',(-.14,.185,.64),(-.38,.12,.66),orientation=hand_orientation('r',(1,.05,-.20),(0,1,0)))
    ik('l',(.14,.185,.69),(.38,.12,.66),orientation=hand_orientation('l',(-1,.05,-.20),(0,1,0)))
    relax_hands()

def sculpt_seated_hem():
    """Contact-derived cloth corrective, keeping the original Basis intact."""
    pants=next(o for o in wardrobe if 'cargo' in o.name)
    deps=bpy.context.evaluated_depsgraph_get();ev=pants.evaluated_get(deps);m=ev.to_mesh();m.calc_loop_triangles()
    tree=BVHTree.FromPolygons([ev.matrix_world@v.co for v in m.vertices],[tuple(t.vertices) for t in m.loop_triangles],all_triangles=True);ev.to_mesh_clear()
    if not shirt.data.shape_keys:shirt.shape_key_add(name='Basis',from_mix=False)
    key=shirt.shape_key_add(name='Cine · Seated waist cloth clearance',from_mix=False);key.value=0
    world=shirt.matrix_world;to_arm=r.matrix_world.inverted()@world;from_arm=world.inverted()@r.matrix_world
    observed=mesh_points(shirt);adjusted=[]
    for v in shirt.data.vertices:
        if v.co.z>1.12:continue
        weights={shirt.vertex_groups[g.group].name:g.weight for g in v.groups if shirt.vertex_groups[g.group].name in r.data.bones}
        if sum(w for n,w in weights.items() if n=='pelvis' or n.startswith('spine_'))<.55:continue
        point=observed[v.index];hip=r.matrix_world@r.pose.bones['pelvis'].head
        axis_point=Vector((hip.x,hip.y,point.z));radial=point-axis_point
        if radial.length<.03:continue
        radial.normalize()
        # Query the OUTER actual pants surface. Nearest normals can select the
        # inside of the open waistband and push cloth into the trousers.
        q,n,_,distance=tree.ray_cast(axis_point+radial*.45,-radial,.5)
        if q is None:continue
        target=q+radial*.004
        if (target-point).dot(radial)<=0 or (target-point).length>.04:continue
        total=sum(weights.values());skin=Matrix(((0,0,0,0),)*4)
        for name,w in weights.items():skin+=(r.pose.bones[name].matrix@r.data.bones[name].matrix_local.inverted())*(w/total)
        linear=(world@from_arm@skin@to_arm).to_3x3()
        delta=linear.inverted()@(target-point)
        if delta.length>.04:continue
        key.data[v.index].co+=delta;adjusted.append(v.index)
    key.value=1;update();s['seated_hem_corrective_vertices']=json.dumps(adjusted)
    return key

def sculpt_skin_clearance(key,ground=False):
    """Local garment corrective against the ACTUAL complete posed body.

    Temporarily expose covered skin for the query, restore all source masks,
    preserve the shirt's original Basis/UV/materials and invert exact LBS.
    """
    saved={m:m.show_viewport for m in body.modifiers if m.type=='MASK' and m.name!='Hide helpers'}
    for m in saved:m.show_viewport=False
    update();deps=bpy.context.evaluated_depsgraph_get();ev=body.evaluated_get(deps);m=ev.to_mesh();m.calc_loop_triangles()
    skin_tree=BVHTree.FromPolygons([ev.matrix_world@v.co for v in m.vertices],[tuple(t.vertices) for t in m.loop_triangles],all_triangles=True);ev.to_mesh_clear()
    for m,enabled in saved.items():m.show_viewport=enabled
    update();observed=mesh_points(shirt);world=shirt.matrix_world;to_arm=r.matrix_world.inverted()@world;from_arm=world.inverted()@r.matrix_world
    altered=[]
    for v in shirt.data.vertices:
        point=observed[v.index];q,n,_,distance=skin_tree.find_nearest(point)
        if distance>.035 or (point-q).dot(n)>=.008:continue
        # A coarse control cage is smoothed before skinning for the browser.
        # Keep a knit-thickness envelope rather than an almost skin-tight fit
        # whose interpolated faces cut through the rounded deltoid.
        target=q+n*.008
        if ground:target.z=max(target.z,.008)
        weights={shirt.vertex_groups[g.group].name:g.weight for g in v.groups if shirt.vertex_groups[g.group].name in r.data.bones}
        total=sum(weights.values());matrix=Matrix(((0,0,0,0),)*4)
        for name,w in weights.items():matrix+=(r.pose.bones[name].matrix@r.data.bones[name].matrix_local.inverted())*(w/total)
        delta=(world@from_arm@matrix@to_arm).to_3x3().inverted()@(target-point)
        if delta.length>.04:continue
        key.data[v.index].co+=delta;altered.append(v.index)
    key.value=1;update()
    # Vertex-only clearance missed skin poking through the middle of coarse
    # shoulder faces. Resolve face-interior contact too, distributing pressure
    # to the editable cage and inverting its exact skin deformation. Never
    # hide skin or replace the source garment to conceal that defect.
    shirt.data.calc_loop_triangles();faces=[tuple(t.vertices) for t in shirt.data.loop_triangles]
    inverses=[]
    for v in shirt.data.vertices:
        ws={shirt.vertex_groups[g.group].name:g.weight for g in v.groups if shirt.vertex_groups[g.group].name in r.data.bones}
        skin=Matrix(((0,0,0,0),)*4);total=sum(ws.values())
        for name,w in ws.items():skin+=(r.pose.bones[name].matrix@r.data.bones[name].matrix_local.inverted())*(w/total)
        inverses.append((world@from_arm@skin@to_arm).to_3x3().inverted())
    samples=((1/3,1/3,1/3),(.5,.5,0),(.5,0,.5),(0,.5,.5))
    for _ in range(4):
        observed=mesh_points(shirt);pressure=[Vector() for v in observed];counts=[0. for v in observed]
        for face in faces:
            for bc in samples:
                point=sum((observed[i]*w for i,w in zip(face,bc)),Vector())
                q,n,_,distance=skin_tree.find_nearest(point)
                if distance>.025 or (point-q).dot(n)>=.008:continue
                displacement=q+n*.008-point
                if ground:displacement.z=max(displacement.z,.008-point.z)
                if displacement.length>.025:continue
                norm=sum(w*w for w in bc)
                for i,w in zip(face,bc):
                    if w:pressure[i]+=displacement*(w/norm);counts[i]+=1
        for i,total in enumerate(counts):
            if total:
                delta=inverses[i]@(pressure[i]/total)
                key.data[i].co+=delta
        update()
    s[key.name+' vertices']=json.dumps(altered)

# Resolve the actual seat and native sole height, rather than guessed offsets.
reset();boots=next(o for o in wardrobe if 'boots' in o.name);native_boot_min=min(v.z for v in mesh_points(boots))
ankle_height=r.data.bones['foot_r'].head_local.z-native_boot_min+.001
deps=bpy.context.evaluated_depsgraph_get();ev=chair.evaluated_get(deps);m=ev.to_mesh();seat_candidates=[]
for p in m.polygons:
    n=(ev.matrix_world.to_3x3()@p.normal).normalized();c=ev.matrix_world@p.center
    if n.z>.9 and .45<c.z<.6 and p.area>.02:seat_candidates.append(c.z)
ev.to_mesh_clear();seat_z=sum(seat_candidates)/len(seat_candidates)
seated();hem_key=sculpt_seated_hem();seat_matrix=r.matrix_world.copy();seat_bases={p.name:p.matrix_basis.copy() for p in r.pose.bones}
ground_cloth_key=shirt.shape_key_add(name='Cine · Ground cloth contact',from_mix=False);ground_cloth_key.value=0
skin_keys={name:shirt.shape_key_add(name='Cine · '+name+' skin clearance',from_mix=False) for name in ('Bound','Ground','Grip','Stand')}
for key in skin_keys.values():key.value=0
sculpt_skin_clearance(skin_keys['Bound'])
knife.rotation_euler=(0,0,0);knife.matrix_world=Matrix.Translation((1.18,-.47,.016))@Matrix(((0,-1,0),(0,0,-1),(1,0,0))).transposed().to_4x4()
knife_floor=knife.matrix_world.copy();knife.location.z+=.003-min(v.z for child in knife.children_recursive if child.type=='MESH' for v in mesh_points(child));knife_floor=knife.matrix_world.copy()
s.name='100gate | New intro · static contact blocking';s.frame_start=1;s.frame_end=241;s.render.fps=24
pose_meta={}
def hold_pose(frame,label):
    for p in r.pose.bones:
        for prop in ('location','rotation_quaternion','scale'):p.keyframe_insert(prop,frame=frame,group=p.name)
    for o in (r,chair,knife):
        for prop in ('location','rotation_quaternion','scale'):o.keyframe_insert(prop,frame=frame)
    hem_key.keyframe_insert('value',frame=frame)
    ground_cloth_key.keyframe_insert('value',frame=frame)
    for key in skin_keys.values():key.keyframe_insert('value',frame=frame)
    update();boneheads={name:list(r.matrix_world@r.pose.bones[name].head) for name in ('pelvis','head','hand_r','hand_l','foot_r','foot_l')}
    pose_meta[str(frame)]={'name':label,'joints':boneheads,'actorMatrix':[list(row) for row in r.matrix_world]}
    marker=s.timeline_markers.new(label,frame=frame)
    print('POSE',label,boneheads,flush=True)
hold_pose(1,'BOUND · both wrists behind back')

# Ground contact is staged on the left side; no ragdoll or animation claim.
s.frame_set(81)
for key in skin_keys.values():key.value=0
fall_pivot=Vector((max(v.x for v in mesh_points(chair)),.08,0));fall=Matrix.Translation(fall_pivot)@Quaternion((0,1,0),math.pi/2).to_matrix().to_4x4()@Matrix.Translation(-fall_pivot)
for p in r.pose.bones:p.matrix_basis=seat_bases[p.name]
r.matrix_world=Matrix.Translation((0,-.28,0))@fall@seat_matrix;chair.matrix_world=fall@chair_rest;update()
hip=r.matrix_world@r.pose.bones['pelvis'].head
semi_prone=Matrix.Translation(hip)@Quaternion((1,0,0),math.radians(25)).to_matrix().to_4x4()@Matrix.Translation(-hip)
r.matrix_world=semi_prone@r.matrix_world;update()
support_names={'pelvis','spine_01','spine_02','spine_03'}
support=region_points(shirt,support_names)+region_points(next(o for o in wardrobe if 'cargo' in o.name),{'pelvis'})
ground_min=min(v.z for v in support);r.location.z+=.002-ground_min;update()
# Limbs must fit the body-supported pose; a stray elbow/finger must never
# raise the whole body off the floor. Both feet are solved independently.
ground_rotation=r.matrix_world.to_3x3()
for side,target,pole in [('l',(.42,-.72,.10),(.80,-.70,.10)),('r',(.32,-.59,.13),(.78,-.58,.23))]:
    rotation=ground_rotation@r.data.bones['foot_'+side].matrix_local.to_3x3()
    for _ in range(2):
        ik(side,target,pole,kind='leg',orientation=rotation)
        boot_points=region_points(boots,{'foot_'+side,'ball_'+side,'calf_'+side})
        target=(target[0],target[1],target[2]+.002-min(v.z for v in boot_points))
    ik(side,target,pole,kind='leg',orientation=rotation)
ground_matrix=r.matrix_world.copy()
# The right arm is still restricted behind the lumbar region at recovery;
# it must not appear already reaching freely over the chest before pickup.
# Controlled scapular retraction makes the floor-side arm clear the torso's
# support plane. Solve the actual visible surface, not a root-height mask.
clavicle_base=r.pose.bones['clavicle_l'].matrix_basis.copy();selected_retraction=30
for angle in range(0,31,2):
    r.pose.bones['clavicle_l'].matrix_basis=clavicle_base;update();rotate('clavicle_l',(0,0,1),angle)
    ik('l',(1.05,.04,.24),(1.2,.20,.18))
    minimum=min(v.z for o in (body,shirt) for v in region_points(o,{'clavicle_l','upperarm_l'}))
    if minimum>=.001:selected_retraction=angle;break
s['floor_side_scapula_retraction_deg']=selected_retraction
# A relaxed lateral head bend lowers the cheek toward the floor. Do not
# translate the skull or allow it to become the floor-penetrating support.
head_bases={n:r.pose.bones[n].matrix_basis.copy() for n in ('neck_01','head')};best_angle=0
for angle in range(0,36,5):
    for n,m in head_bases.items():r.pose.bones[n].matrix_basis=m
    update();rotate('neck_01',(0,1,0),angle/3);rotate('head',(0,1,0),angle*2/3)
    if min(v.z for v in region_points(body,{'head','neck_01'}))>=.002:best_angle=angle
for n,m in head_bases.items():r.pose.bones[n].matrix_basis=m
update();rotate('neck_01',(0,1,0),best_angle/3);rotate('head',(0,1,0),best_angle*2/3)
sculpt_skin_clearance(skin_keys['Ground'],ground=True)
# A small cloth-only corrective handles soft floor compression. Human body
# geometry and its grounded pose are not moved to hide the fabric contact.
observed=mesh_points(shirt);world=shirt.matrix_world;to_arm=r.matrix_world.inverted()@world;from_arm=world.inverted()@r.matrix_world
floor_cloth=[]
for v in shirt.data.vertices:
    point=observed[v.index]
    if point.z>=.008:continue
    weights={shirt.vertex_groups[g.group].name:g.weight for g in v.groups if shirt.vertex_groups[g.group].name in r.data.bones}
    total=sum(weights.values());skin=Matrix(((0,0,0,0),)*4)
    for name,w in weights.items():skin+=(r.pose.bones[name].matrix@r.data.bones[name].matrix_local.inverted())*(w/total)
    delta=(world@from_arm@skin@to_arm).to_3x3().inverted()@Vector((0,0,.008-point.z))
    ground_cloth_key.data[v.index].co+=delta;floor_cloth.append(v.index)
ground_cloth_key.value=1;update();s['floor_cloth_corrective_vertices']=json.dumps(floor_cloth)
knife.matrix_world=knife_floor
hold_pose(81,'GROUND · left-side recovery, wrists still cuffed')

# A complete grip must be above the floor; this is the held-contact static gate,
# not a fake floor pickup. Approach/tilt/lift will be authored only after review.
s.frame_set(161)
for key in skin_keys.values():key.value=0
# The last keyed hold is the ground pose. It must evaluate before new IK.
K=knife_floor.copy();K.translation.z+=.055;H=K@grip_socket.inverted()
ik('r',H.translation,(.90,-.65,.10),orientation=H.to_3x3())
for name,q in grip.items():r.pose.bones[name].rotation_quaternion=q
knife.matrix_world=K;update()
sculpt_skin_clearance(skin_keys['Grip'],ground=True)
hold_pose(161,'GROUND GRIP · original closed hand/knife contact')

s.frame_set(241)
hem_key.value=0;ground_cloth_key.value=0;reset();r.matrix_world=Matrix.Translation((.82,-.80,-native_boot_min+.001));update()
for key in skin_keys.values():key.value=0
for side,sign in (('r',-1),('l',1)):
    ik(side,(.82+sign*.22,-.90,.91),(.82+.30*sign,-.78,1.17),orientation=hand_orientation(side,(0,-.08,-1),(-sign,0,0)))
relax_hands();chair.matrix_world=fall@chair_rest;knife.matrix_world=knife_floor
sculpt_skin_clearance(skin_keys['Stand'])
hold_pose(241,'STANDING · planted feet, relaxed arms')
for o in (r,chair,knife):
    o.animation_data.action.name='BLOCKING_ONLY | contact holds, not motion'
    for slot in o.animation_data.action.slots:
        for layer in o.animation_data.action.layers:
            for strip in layer.strips:
                bag=strip.channelbag(slot)
                if bag:
                    for fc in bag.fcurves:
                        for key in fc.keyframe_points:key.interpolation='CONSTANT'
if shirt.data.shape_keys.animation_data:
    action=shirt.data.shape_keys.animation_data.action
    for slot in action.slots:
        for layer in action.layers:
            for strip in layer.strips:
                bag=strip.channelbag(slot)
                if bag:
                    for fc in bag.fcurves:
                        for key in fc.keyframe_points:key.interpolation='CONSTANT'
s['blocking_only']=True;s['cinematic_poses']=json.dumps(pose_meta);s['approved_grip_socket']=json.dumps([list(row) for row in grip_socket]);s['seat_surface_z']=seat_z
s['rear_hem_weight_vertices']=json.dumps(hem_repairs)
s['thumb_web_weight_vertices']=json.dumps(web_repairs)
s['restraint_design']='Independent intact wrist wraps; short chair hitches hold both wrists behind back. Fall releases right chair hitch, not wrist wrap. Left hitch remains until a real blade draw; then knife is put down before both cuffs are peeled off.'

# New dedicated cameras; old diagnostic cameras/sources remain intact.
for name,pos,target in [('Cine · Front',(0,-3.3,1.13),(0,0,.85)),('Cine · Back',(0,3.3,1.13),(0,.12,.85)),
    ('Cine · Side',(3.3,-.25,1.13),(0,.02,.85)),('Cine · Bound wrists',(.43,.80,.85),(0,.185,.69)),
    ('Cine · Ground',(2.5,-2.3,1.8),(.95,-.2,.22)),('Cine · Ground side',(.8,-2.5,.55),(1,-.1,.23)),
    ('Cine · Top',(1,-.1,3.2),(.95,-.1,.15)),
    ('Cine · Grip close',(1.38,-.75,.32),(1.18,-.43,.08)),
    ('Cine · Grip reverse',(.98,-.15,.27),(1.18,-.43,.08))]:
    data=bpy.data.cameras.new(name);cam=bpy.data.objects.new(name,data);s.collection.objects.link(cam);data.lens=42;data.clip_start=.008
    cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
# A real head/eye-space diagnostic, not a full-body orbit pretending to be
# first person. Static exports evaluate this camera at the selected pose.
data=bpy.data.cameras.new('Cine · First person');fp=bpy.data.objects.new(data.name,data);s.collection.objects.link(fp)
data.lens=24;data.clip_start=.025
eyes=next(o for o in wardrobe if 'low-poly' in o.name)
for frame in (1,81,161,241):
    s.frame_set(frame);update();head=r.pose.bones['head']
    rotation=r.matrix_world.to_3x3()@head.matrix.to_3x3()@head.bone.matrix_local.to_3x3().inverted()
    forward=(rotation@Vector((0,-1,0))).normalized();up=(rotation@Vector((0,0,1))).normalized()
    points=mesh_points(eyes);eye=sum(points,Vector())/len(points);fp.location=eye+forward*.035
    if frame in (81,161):direction=knife_floor.translation-fp.location
    else:direction=forward*math.cos(math.radians(45 if frame==1 else 15))-up*math.sin(math.radians(45 if frame==1 else 15))
    z=-direction.normalized();x=up.cross(z).normalized();y=z.cross(x).normalized()
    fp.rotation_euler=Matrix((x,y,z)).transposed().to_euler()
    fp.keyframe_insert('location',frame=frame);fp.keyframe_insert('rotation_euler',frame=frame)
fp['diagnostic_only']='Pose gate eye-space camera; no runtime camera adapter yet'
s.camera=next(o for o in s.objects if o.name=='Cine · Front');s.frame_set(1)
# Keep the editable source cage. Bake its pre-skin subdivision into runtime
# exports so sleeve curvature and weights interpolate like the human skin.
detail=shirt.modifiers.new('Knit garment · bind-space interpolation','SUBSURF');detail.levels=detail.render_levels=2
bpy.context.view_layer.objects.active=shirt
while list(shirt.modifiers).index(detail)>0:bpy.ops.object.modifier_move_up(modifier=detail.name)
s.render.resolution_x=1280;s.render.resolution_y=960;s.render.resolution_percentage=100
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(out/'cinematic-blocking.blend'),compress=True)
(out/'blocking-poses.json').write_text(json.dumps({'seatZ':seat_z,'nativeBootMinZ':native_boot_min,'ankleHeight':ankle_height,'poses':pose_meta},indent=2))
print('Saved STATIC holds only. No finished cinematic or interpolation is claimed.',flush=True)
