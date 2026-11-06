"""Local left rail failure + wrapped left-arm clearance, NOT knife/cut/stand.

Uses the existing chair's actual surface/UVs and native actor. Only the left
end of the lower back rail detaches. Original continuous left rope remains
visible: cuff follows wrist, hitch follows the carried broken rail fragment.
Right rope/hand stay attached to the unbroken chair.
"""
import bpy,bmesh,sys,math,json
from pathlib import Path
from mathutils import Vector,Matrix,Quaternion
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from native_pose_tools import two_bone_ik,set_pose_matrix
from cinematic_geometry import getmesh

s=bpy.context.scene;assert s.get('tailored_native_wardrobe');s.frame_set(1)
r=next(o for o in s.objects if o.type=='ARMATURE');chair=s.objects['old-chair']
actor=[o for o in s.objects if o.type=='MESH' and o.name.startswith('Alexei | original MakeHuman body') and not o.get('authoring_archive')]
eye_camera=s.objects['Cine · First person']
assert not s.get('left_rail_failure'), 'Do not apply twice'
neutral=chair.matrix_world.copy();inv=neutral.inverted()
rope=next(o for o in s.objects if 'l intact wrist-to-chair rope' in o.name)
rope_world=rope.matrix_world.copy()
old_mesh=chair.data
uv=old_mesh.uv_layers.active
original_mats=list(old_mesh.materials)

# Clip ORIGINAL rail faces and their interpolated UVs at an oblique fracture.
def cut_x(p):return .052+.17*(p.z-.562)
def clip(points,positive):
    result=[]
    for a,b in zip(points,points[1:]+points[:1]):
        da=a[0].x-cut_x(a[0]);db=b[0].x-cut_x(b[0])
        ina=da>=-1e-8 if positive else da<=1e-8
        inb=db>=-1e-8 if positive else db<=1e-8
        if ina:result.append(a)
        if ina!=inb:
            t=da/(da-db);result.append((a[0].lerp(b[0],t),a[1].lerp(b[1],t)))
    return result
main=[];piece=[];selected=0;boundary=[]
for poly in old_mesh.polygons:
    points=[(neutral@old_mesh.vertices[old_mesh.loops[li].vertex_index].co,uv.data[li].uv.copy()) for li in poly.loop_indices]
    is_rail=(all(.535<p[0].z<.592 and .270<p[0].y<.296 for p in points)
             and max(p[0].x for p in points)-min(p[0].x for p in points)>.3)
    if is_rail:
        selected+=1
        for dest,positive in ((main,False),(piece,True)):
            ps=clip(points,positive)
            if len(ps)>=3:dest.append((ps,poly.material_index,poly.use_smooth))
            boundary.extend(p for p,_ in ps if abs(p.x-cut_x(p))<1e-5)
    else:main.append((points,poly.material_index,poly.use_smooth))
assert selected==8 and piece,('Expected eight original rail triangles',selected)
# Fresh oblique endgrain, closed matching surfaces, no replacement chair.
unique={tuple(round(c,5) for c in p):p for p in boundary};ring=list(unique.values())
center=sum(ring,Vector())/len(ring)
ring.sort(key=lambda p:math.atan2(p.z-center.z,p.y-center.y))
cap=[(p,Vector(((p.y-.27)/.027,(p.z-.535)/.057))) for p in ring]
fresh=bpy.data.materials.new('Fresh exposed rail endgrain');fresh.use_nodes=True
bs=next(n for n in fresh.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
bs.inputs['Base Color'].default_value=(.19,.115,.058,1);bs.inputs['Roughness'].default_value=.91
noise=fresh.node_tree.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=120
bump=fresh.node_tree.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.2;bump.inputs['Distance'].default_value=.0007
fresh.node_tree.links.new(noise.outputs['Fac'],bump.inputs['Height']);fresh.node_tree.links.new(bump.outputs['Normal'],bs.inputs['Normal'])
main.append((cap,len(original_mats),False));piece.append((list(reversed(cap)),len(original_mats),False))
def make_mesh(name,polygons):
    vs=[];fs=[];uvs=[]
    for points,_,_ in polygons:
        fs.append(tuple(range(len(vs),len(vs)+len(points))))
        for p,tex in points:vs.append(inv@p);uvs.append(tex)
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vs,[],fs);mesh.update()
    for m in original_mats+[fresh]:mesh.materials.append(m)
    layer=mesh.uv_layers.new(name=uv.name)
    for poly,(_,mat,smooth) in zip(mesh.polygons,polygons):
        poly.material_index=mat;poly.use_smooth=smooth
        for li in poly.loop_indices:layer.data[li].uv=uvs[mesh.loops[li].vertex_index]
    bm=bmesh.new();bm.from_mesh(mesh)
    bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
    return mesh
chair.data=make_mesh('Original chair except detached left rail end',main)
fragment=bpy.data.objects.new('Left rail | impact fracture fragment',make_mesh('Original left rail surface and fracture cap',piece))
s.collection.objects.link(fragment);fragment.matrix_world=neutral
fragment['role']='Left wrist hitch remains around THIS broken wood; right rail remains intact'

# Independent prop skin: actual original rope surface, UVs and topology retained.
data=bpy.data.armatures.new('Left restraint prop controls');prop=bpy.data.objects.new('Left restraint | cuff and broken hitch',data);s.collection.objects.link(prop)
bpy.context.view_layer.objects.active=prop;prop.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
for name in ('Cuff','Hitch','RightCuff','RightHitch'):
    bone=data.edit_bones.new(name);bone.head=(0,0,0);bone.tail=(0,0,.10)
bpy.ops.object.mode_set(mode='OBJECT')
rope.parent=None;rope.matrix_world=rope_world
rope.parent=prop;rope.matrix_parent_inverse=prop.matrix_world.inverted()
groups={n:rope.vertex_groups.new(name=n) for n in ('Cuff','Hitch')}
def smooth(x):
    x=max(0,min(1,x));return x*x*x*(10+x*(-15+6*x))
for v in rope.data.vertices:
    p=rope_world@v.co
    cuff=smooth((p.z-.607)/.070)
    if cuff>0:groups['Cuff'].add([v.index],cuff,'REPLACE')
    if cuff<1:groups['Hitch'].add([v.index],1-cuff,'REPLACE')
mod=rope.modifiers.new('Original continuous rope deformation','ARMATURE');mod.object=prop
rope['restraint_role']='Intact LEFT wrist wrap + tether + hitch on detached original rail; NOT released from cuff'
right_rope=next(o for o in s.objects if 'r intact wrist-to-chair rope' in o.name)
right_world=right_rope.matrix_world.copy();right_rope.parent=prop;right_rope.matrix_world=right_world
right_groups={n:right_rope.vertex_groups.new(name=n) for n in ('RightCuff','RightHitch')}
for v in right_rope.data.vertices:
    cuff=smooth(((right_world@v.co).z-.607)/.065)
    if cuff>0:right_groups['RightCuff'].add([v.index],cuff,'REPLACE')
    if cuff<1:right_groups['RightHitch'].add([v.index],1-cuff,'REPLACE')
mod=right_rope.modifiers.new('Fixed right hitch with rotating native forearm cuff','ARMATURE');mod.object=prop

# Snapshot authored native poses before writing any changes. No source overwrite.
poses=[]
for frame in range(1,794):
    s.frame_set(frame);bpy.context.view_layer.update()
    poses.append((r.matrix_world.copy(),chair.matrix_world.copy(),{p.name:p.matrix_basis.copy() for p in r.pose.bones},eye_camera.matrix_world.copy()))
r.animation_data.action=r.animation_data.action.copy();r.animation_data.action.name='Native fall + left rail partial release WIP'
for marker in list(s.timeline_markers):
    if marker.name.startswith(('Impact','Ground')):s.timeline_markers.remove(marker)
for name,t in [('Left rail failure',12.5),('Wrapped left arm clears chair',13.1),('Partial release ONLY · knife pending',16.5)]:s.timeline_markers.new(name,frame=1+round(t*48))
rows=[]
for frame,(root,wood,basis,eye_source) in enumerate(poses,1):
    s.frame_set(frame);t=(frame-1)/48
    r.matrix_world=root;chair.matrix_world=wood
    for p in r.pose.bones:p.matrix_basis=basis[p.name]
    bpy.context.view_layer.update()
    source_hand=r.matrix_world@r.pose.bones['hand_l'].matrix
    source_fore=r.matrix_world@r.pose.bones['lowerarm_l'].matrix
    right=r.matrix_world@r.pose.bones['hand_r'].matrix
    source_right_fore=r.matrix_world@r.pose.bones['lowerarm_r'].matrix
    right_pole=r.matrix_world@r.pose.bones['lowerarm_r'].head
    left_pole=r.matrix_world@r.pose.bones['lowerarm_l'].head
    delta=wood@inv
    clear=smooth((t-13.1)/2.3)
    fracture=smooth((t-12.50)/.50)
    # A human recovery roll, independent of the chair. The right restraint is
    # solved back to its original wood anchor. This opens space for the lower
    # left arm; moving that arm alone was mechanically blocked by the back rails.
    hip=r.matrix_world@r.pose.bones['pelvis'].head
    pivot_body=Vector((hip.x,hip.y,0))
    body_delta=Matrix.Translation(pivot_body)@Quaternion((1,0,0),math.radians(16*clear)).to_matrix().to_4x4()@Matrix.Translation(-pivot_body)
    r.matrix_world=body_delta@root;bpy.context.view_layer.update()
    if clear:
        minimum=min(p.z for obj in actor for p in getmesh(obj)[0])
        body_delta.translation.z+=max(0,-minimum)
        r.matrix_world=body_delta@root;bpy.context.view_layer.update()
        two_bone_ik(r,'r',right.translation,body_delta@right_pole,right.to_3x3())
        bpy.context.view_layer.update()
    if fracture or clear:
        # Body recovery opens space behind the restrained pose. A direct pull
        # through the torso/rails is invalid. Knife reach is not authored yet.
        goal=body_delta@source_hand.translation+Vector((-.020*fracture,0,.015*fracture))
        shoulder=r.matrix_world@r.pose.bones['upperarm_l'].head
        reach=sum(r.data.bones[n].length for n in ('upperarm_l','lowerarm_l'))*.998
        if (goal-shoulder).length>reach:
            # Constrain the TARGET, never scale the native bones or stretch skin.
            lo=0.;hi=1.;start=source_hand.translation.copy();move=goal-start
            for _ in range(24):
                fraction=(lo+hi)/2
                if (start+move*fraction-shoulder).length<=reach:lo=fraction
                else:hi=fraction
            goal=start+move*lo
        orientation=body_delta.to_3x3()@source_hand.to_3x3()
        pole=body_delta@left_pole+Vector((-.025,0,.015))*fracture
        two_bone_ik(r,'l',goal,pole,orientation)
        bpy.context.view_layer.update()
        # The wrap sits proximal to the wrist, on the forearm. Keep the native
        # hand/forearm joint relation rather than twisting the wrist against it.
        fore=r.matrix_world@r.pose.bones['lowerarm_l'].matrix
        natural=fore@source_fore.inverted()@source_hand
        set_pose_matrix(r.pose.bones['hand_l'],r.matrix_world.inverted()@natural)
        bpy.context.view_layer.update()
    hand=r.matrix_world@r.pose.bones['hand_l'].matrix
    # Cuff follows the native forearm frame. The broken hitch leaves its socket
    # independently. Neither rope nor fragment vanishes.
    fore=r.matrix_world@r.pose.bones['lowerarm_l'].matrix
    cuff=(fore@source_fore.inverted())@delta
    hitch=delta.copy()
    # Detached timber leaves its socket backwards, while its original hitch
    # remains visible. Do not swing the timber through the middle back rail.
    hitch.translation+=(cuff@Vector((.16,.195,.69))-delta@Vector((.16,.195,.69)))
    # Separate the fractured socket in the source rail direction after impact.
    hitch.translation+=Vector((0,.090,.035))*fracture
    prop.pose.bones['Cuff'].matrix=cuff@data.bones['Cuff'].matrix_local
    prop.pose.bones['Hitch'].matrix=hitch@data.bones['Hitch'].matrix_local
    right_fore=r.matrix_world@r.pose.bones['lowerarm_r'].matrix
    right_cuff=(right_fore@source_right_fore.inverted())@delta
    prop.pose.bones['RightCuff'].matrix=right_cuff@data.bones['RightCuff'].matrix_local
    prop.pose.bones['RightHitch'].matrix=delta@data.bones['RightHitch'].matrix_local
    fragment.matrix_world=hitch@neutral
    eye_camera.matrix_world=body_delta@eye_source
    bpy.context.view_layer.update()
    # Keep the visible wood above the floor without moving the whole character.
    fp,_=getmesh(fragment);minimum=min(p.z for p in fp)
    if minimum<0:
        hitch.translation.z-=minimum
        prop.pose.bones['Hitch'].matrix=hitch@data.bones['Hitch'].matrix_local
        fragment.matrix_world=hitch@neutral
    for p in r.pose.bones:
        for attr in ('location','rotation_quaternion','scale'):p.keyframe_insert(attr,frame=frame,group=p.name)
    for attr in ('location','rotation_quaternion','scale'):
        r.keyframe_insert(attr,frame=frame);eye_camera.keyframe_insert(attr,frame=frame)
    for p in prop.pose.bones:
        p.rotation_mode='QUATERNION'
        for attr in ('location','rotation_quaternion','scale'):p.keyframe_insert(attr,frame=frame,group=p.name)
    fragment.rotation_mode='QUATERNION'
    for attr in ('location','rotation_quaternion','scale'):fragment.keyframe_insert(attr,frame=frame)
    rows.append({'time':t,'leftClearance':clear,'leftWrist':list(hand.translation),'rightWrist':list(right.translation),'leftWrapped':True,'rightChairBound':True,'knifePickedUp':False})
for obj in (r,prop,fragment,eye_camera):
    action=obj.animation_data.action
    for slot in action.slots:
        for layer in action.layers:
            for strip in layer.strips:
                bag=strip.channelbag(slot)
                if bag:
                    for fc in bag.fcurves:
                        for key in fc.keyframe_points:key.interpolation='LINEAR'
# At the recovery roll the fixed right cuff compresses the wool. The old
# seated-only sleeve corrective otherwise bulges through the cord. Fit the
# GARMENT locally to the real native forearm; do not inflate or hide the rope.
s.frame_set(793);bpy.context.view_layer.update()
shirt=next(o for o in actor if 'fisherman' in o.name)
ref=next(o for o in s.objects if o.get('cloth_reference'))
refmods={m:m.show_viewport for m in ref.modifiers}
for m in ref.modifiers:
    if m.type=='ARMATURE':m.show_viewport=True
bpy.context.view_layer.update();skin=BVHTree.FromPolygons(*getmesh(ref),all_triangles=True)
posed,_=getmesh(shirt);wrist=r.matrix_world@r.pose.bones['hand_r'].head
axis=(r.matrix_world.to_3x3()@(r.pose.bones['lowerarm_r'].tail-r.pose.bones['lowerarm_r'].head)).normalized()
base=shirt.data.shape_keys.key_blocks['Basis'];key=shirt.shape_key_add(name='Cine · Right cuff pressure on recovery',from_mix=False)
world=shirt.matrix_world;to_arm=r.matrix_world.inverted()@world;from_arm=world.inverted()@r.matrix_world
compressed=0
for i,v in enumerate(shirt.data.vertices):
    p=posed[i];axial=(p-wrist).dot(axis);radial=(p-wrist-axis*axial).length
    if not -.085<axial<.005 or radial>.065:continue
    strength=smooth((axial+.085)/.025)*(1-smooth((axial+.015)/.020))
    hit,normal,_,distance=skin.find_nearest(p)
    if hit is None or distance>.03:continue
    desired=p.lerp(hit+normal*.002,strength)
    weights=[(shirt.vertex_groups[g.group].name,g.weight) for g in v.groups if shirt.vertex_groups[g.group].name in r.data.bones]
    blend=Matrix(((0,0,0,0),)*4);total=sum(w for _,w in weights)
    for name,w in weights:blend+=(r.pose.bones[name].matrix@r.data.bones[name].matrix_local.inverted())*(w/total)
    key.data[i].co=base.data[i].co+(world@from_arm@blend@to_arm).to_3x3().inverted()@(desired-p)
    compressed+=1
for frame,value in ((1,0),(630,0),(688,1),(793,1)):
    key.value=value;key.keyframe_insert('value',frame=frame)
for m,on in refmods.items():m.show_viewport=on
print('Native right cuff pressure vertices:',compressed,flush=True)
out=Path.cwd()/'outputs/body-postfall'
(out/'left-break-states.json').write_text(json.dumps({'partial':True,'scope':'fall, local left rail break, wrapped left arm clears chair ONLY; no knife/cut/drop/stand','rows':rows},indent=2))
s['left_rail_failure']=True;s['cinematic_export_stem']='intro-left-rail-partial';s.name='100gate | Left rail partial release · WIP';s.frame_set(1)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(out/'intro-left-rail-partial.blend'),compress=True)
print('Saved partial left-rail scene; knife pickup and release cuts NOT authored.',flush=True)
