"""Static-only grip authoring on the existing MPFB body.

FK finger hinges + actual knife surfaces. No new hand mesh, morph, scale,
opacity change or animation is produced by this script.
"""
import bpy,sys,json,math,os
import numpy as np
from pathlib import Path
from mathutils import Matrix,Vector,Quaternion
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from hand_mesh_audit import KnifeSurface,audit,DIGITS,snapshot,self_crossings

root=Path.cwd();out=root/'outputs/hand-mesh-rework';out.mkdir(parents=True,exist_ok=True)
scene=bpy.context.scene;scene.frame_set(48);bpy.context.view_layer.update()
rig=next(o for o in scene.objects if o.type=='ARMATURE')
body=next(o for o in scene.objects if o.type=='MESH' and o.name.endswith('MakeHuman body'))
knife=next(o for o in scene.objects if o.type=='EMPTY')
K0=knife.matrix_world.copy()
if rig.animation_data:rig.animation_data.action=None
for bone in rig.pose.bones:
    if bone.name.endswith('_r') and any(bone.name.startswith(d+'_') for d in DIGITS):
        bone.matrix_basis=Matrix.Identity(4)
bpy.context.view_layer.update()
# Seat the unchanged prop just outside the actual palmar surface, not in tissue.
knife.parent=None;knife.matrix_world=K0@Matrix.Translation((.010,.0094,0))
bpy.context.view_layer.update()
surface=KnifeSurface(knife)
skin=next(m for m in body.modifiers if m.type=='ARMATURE')
skin.show_viewport=False;bpy.context.view_layer.update()
deps=bpy.context.evaluated_depsgraph_get();ev=body.evaluated_get(deps)
mesh=ev.to_mesh(preserve_all_data_layers=True,depsgraph=deps)
mesh.calc_loop_triangles()
triangles=np.array([t.vertices[:] for t in mesh.loop_triangles],dtype=int)
coords=np.array([v.co[:] for v in mesh.vertices])
normals=np.array([v.normal[:] for v in mesh.vertices])
group_names={g.index:g.name for g in body.vertex_groups if g.name in rig.data.bones}
weights=[{group_names[g.group]:g.weight for g in v.groups if g.group in group_names} for v in mesh.vertices]
for w in weights:
    total=sum(w.values())
    if total:
        for name in w:w[name]/=total
ev.to_mesh_clear();skin.show_viewport=True;bpy.context.view_layer.update()
bone_names=[p.name for p in rig.pose.bones]
rest_inv={p.name:np.array(p.bone.matrix_local.inverted()) for p in rig.pose.bones}
neutral_pose={p.name:p.matrix.copy() for p in rig.pose.bones}
relatives={p.name:np.array(p.bone.parent.matrix_local.inverted()@p.bone.matrix_local)
           for p in rig.pose.bones if p.parent}
offset=knife.matrix_world.inverted()@body.matrix_world
to_knife=np.array(offset);to_knife3=to_knife[:3,:3]
axis_world=(rig.matrix_world.to_3x3().inverted()@knife.matrix_world.to_3x3().col[2]).normalized()

def rotation(axis,degrees):
    return np.array(Quaternion(Vector(axis),math.radians(float(degrees))).to_matrix().to_4x4())

def deform(ids,matrices):
    points=np.zeros((len(ids),3))
    for name in {name for i in ids for name in weights[i]}:
        w=np.array([weights[i].get(name,0) for i in ids])
        T=np.array(matrices[name])@rest_inv[name]
        q=coords[ids]@T[:3,:3].T+T[:3,3]
        points+=q*w[:,None]
    return points@to_knife3.T+to_knife[:3,3]

matrices={name:np.array(pose) for name,pose in neutral_pose.items()}
parameters={};axis_records={};reports={}
seed=json.loads(Path(os.environ['GATE_FIT_SEED']).read_text())['parameters'] if os.environ.get('GATE_FIT_SEED') else {}
for digit in ('index','middle','ring','pinky','thumb'):
    names=[f'{digit}_0{i}_r' for i in (1,2,3)]
    ids=np.array([i for i,w in enumerate(weights) if sum(w.get(name,0) for name in names)>.003])
    incident=triangles[np.any(np.isin(triangles,ids),axis=1)]
    ids=np.unique(incident)
    # Include the actual pads, not the nail surfaces, as contact targets.
    last=rig.pose.bones[names[-1]]
    forward=(last.tail-last.head).normalized()
    axis=axis_world-forward*axis_world.dot(forward)
    axis.normalize()
    palmar=axis.cross(forward).normalized()
    if digit=='thumb':
        # The source thumb's own MCP/IP bending plane differs from the fingers'.
        u=(rig.pose.bones[names[1]].tail-rig.pose.bones[names[1]].head).normalized()
        v=(last.tail-last.head).normalized()
        thumb_axis=u.cross(v).normalized()
        if thumb_axis.length>.01:axis=thumb_axis;palmar=axis.cross(forward).normalized()
    projection=(coords-np.array(last.head))@np.array(forward)/last.length
    facing=normals@np.array(palmar)
    pads=np.array([i for i in ids if weights[i].get(names[-1],0)>.40 and .2<projection[i]<1.05 and facing[i]>.1])
    if len(pads)<8:
        pads=np.array([i for i in ids if weights[i].get(names[-1],0)>.60])
    lookup={int(i):j for j,i in enumerate(ids)}
    local_triangles=np.array([[lookup[int(i)] for i in tri] for tri in incident])
    pad_local=np.array([lookup[int(i)] for i in pads])
    local_axes=[]
    for name in names:
        p=rig.pose.bones[name];d=(p.tail-p.head).normalized()
        hinge=axis_world-d*axis_world.dot(d) if digit!='thumb' else axis
        hinge.normalize()
        local_axes.append(p.matrix.to_3x3().inverted()@hinge)
    parent=np.array(rig.pose.bones[names[0]].parent.matrix)
    neighbor=None;thumb_goal=None;neighbor_ids=None
    if digit!='thumb':
        specs=[(0,local_axes[0],0,70),(1,local_axes[1],0,84),(2,local_axes[2],0,65)]
        initial=np.array([53.,60.,30.])
    else:
        # CMC opposition/abduction, MCP flexion and IP flexion only.
        p=rig.pose.bones[names[0]]
        axes=[p.matrix.to_3x3().inverted()@(rig.matrix_world.to_3x3().inverted()@
              knife.matrix_world.to_3x3().col[j]).normalized() for j in (0,1,2)]
        specs=[(0,axes[0],-25,85),(0,axes[1],15,65),(0,axes[2],-65,65),
               (1,local_axes[1],0,38),(2,local_axes[2],0,35)]
        initial=np.array([-8.,46.,0.,15.,15.])
        thumb_neutral_matrix=rig.pose.bones[names[0]].matrix.to_3x3().copy()
        thumb_neutral_direction=(rig.pose.bones[names[0]].tail-rig.pose.bones[names[0]].head).normalized()
        knife_to_rig=rig.matrix_world.to_3x3().inverted()@knife.matrix_world.to_3x3()
        # In a power grip the thumb pad opposes/presses the index's outside,
        # not through it onto the cylinder. Use the actual index surface.
        vertices,faces,labels,_=snapshot(body,rig,knife)
        own_faces=[tri for tri in faces if all(labels[i] in ('index','middle','ring','pinky') for i in tri)]
        neighbor=BVHTree.FromPolygons(vertices,own_faces,all_triangles=True)
        ip=rig.pose.bones['index_01_r'];M=knife.matrix_world.inverted()@rig.matrix_world
        center=M@((ip.head+ip.tail)/2)
        origin=Vector((center.x,-.15,center.z))
        hit,normal,_,_=neighbor.ray_cast(origin,Vector((0,1,0)))
        if hit is None:hit,normal,_,_=neighbor.find_nearest(origin)
        thumb_goal=np.array(hit+normal*.00025)*1000
        neighbor_ids=np.array([j for j,i in enumerate(ids) if sum(weights[i].get(n,0) for n in names[1:])>.50])
        nverts=[vertices[i] for tri in own_faces for i in tri]
        neighbor_low=Vector(tuple(min(p[i] for p in nverts) for i in range(3)))
        neighbor_high=Vector(tuple(max(p[i] for p in nverts) for i in range(3)))
        print('THUMB OPPOSITION TARGET',thumb_goal.tolist(),flush=True)
    base={name:matrices[name].copy() for name in names}
    def apply(a):
        R=[np.identity(4) for _ in names]
        if digit=='thumb':
            az,el,roll=map(math.radians,a[:3])
            direction=knife_to_rig@Vector((math.cos(el)*math.cos(az),math.cos(el)*math.sin(az),math.sin(el)))
            aim=thumb_neutral_direction.rotation_difference(direction)
            Q=Quaternion(direction,roll)@aim
            local=thumb_neutral_matrix.inverted()@Q.to_matrix()@thumb_neutral_matrix
            R[0]=np.array(local.to_4x4())
            for angle,(j,axis,lo,hi) in zip(a[3:],specs[3:]):R[j]=R[j]@rotation(axis,angle)
        else:
            for angle,(j,axis,lo,hi) in zip(a,specs):R[j]=R[j]@rotation(axis,angle)
        m=parent
        for j,name in enumerate(names):
            m=m@relatives[name]@R[j];matrices[name]=m.copy()
        return R
    calls=0
    def objective(a):
        apply(a)
        xyz=deform(ids,matrices)
        values=np.array([surface.distance(Vector(p),False)[0]*1000 for p in xyz])
        near_faces=local_triangles[np.min(values[local_triangles],axis=1)<2.0]
        virtual=[]
        if len(near_faces):
            v=xyz[near_faces]
            virtual=np.concatenate([v.mean(axis=1),(v[:,0]+v[:,1])/2,(v[:,1]+v[:,2])/2,(v[:,2]+v[:,0])/2])
        virtual_d=np.array([surface.distance(Vector(p),False)[0]*1000 for p in virtual])
        pen=np.minimum(np.concatenate([values,virtual_d])-.15,0)
        def neighbor_distance(point):
            p=Vector(point);q,n,_,d=neighbor.find_nearest(p)
            if any(p[i]<neighbor_low[i] or p[i]>neighbor_high[i] for i in range(3)):return d*1000
            return d*1000*(1 if (p-q).dot(n)>=0 else -1)
        if digit=='thumb':
            pad_distances=np.array([neighbor_distance(p) for p in xyz[pad_local]])
        else:
            pad_distances=np.array([surface.distance(Vector(p),False,False)[0]*1000 for p in xyz[pad_local]])
        closest=np.argsort(pad_distances)[:max(6,len(pads)//12)]
        tips=pad_distances[closest]
        # Only tiny positive-clearance contacts; no penetration allowance.
        score=np.dot(pen,pen)*1.5+float(pen.min())**2*500+np.mean((tips-.22)**2)*8
        pad_center=xyz[pad_local][closest].mean(axis=0)*1000
        target=thumb_goal if digit=='thumb' else np.array([-5.,9.,pad_center[2]])
        score+=float(np.sum((pad_center-target)**2))*(.35 if digit=='thumb' else .08)
        if digit=='thumb':
            near=np.array([neighbor_distance(p) for p in xyz[neighbor_ids]])
            coll=np.minimum(near-.12,0)
            score+=np.dot(coll,coll)*2+float(coll.min())**2*700
        # Discourage a fingertip-only pinch and extreme/inverted curl.
        score+=np.mean((a-initial)**2)*.006
        if digit!='thumb':score+=max(0,a[2]-.85*a[1])**2*.10
        return score
    def descent(start):
        a=start.copy();best=objective(a)
        for step in ((2,.8,.25) if digit in seed and digit!='thumb' else (16,9,4,2,.8,.25)):
            for _ in range(2):
                for i,(_,_,lo,hi) in enumerate(specs):
                    selected=a
                    for sign in (1,-1):
                        v=a.copy();v[i]=np.clip(v[i]+sign*step,lo,hi)
                        score=objective(v)
                        if score<best:best=score;selected=v
                    a=selected
        return best,a
    starts=[initial]
    if digit=='thumb':
        starts.extend([np.array(v,dtype=float) for v in [(-8,46,-45,15,15),(-8,46,45,15,15),
            (20,35,0,25,20),(35,45,35,30,25),(0,40,-25,20,15)]])
    else:
        starts.extend([np.array(v,dtype=float) for v in [(0,0,0),(25,35,25),(35,70,35),(60,35,45)]])
    if digit in seed and digit!='thumb':starts=[np.array(seed[digit])]
    score,a=min((descent(start) for start in starts),key=lambda t:t[0])
    R=apply(a)
    for name,rot in zip(names,R):
        bone=rig.pose.bones[name];bone.rotation_mode='QUATERNION'
        bone.rotation_quaternion=Matrix(rot.tolist()).to_quaternion()
    bpy.context.view_layer.update()
    parameters[digit]=a.tolist()
    axis_records[digit]=[{'bone':names[j],'axis':list(axis),'minDeltaDeg':lo,'maxDeltaDeg':hi}
                          for j,axis,lo,hi in specs]
    # Check that the optimizer's LBS coordinates agree with Blender's actual skin.
    actual=body.evaluated_get(bpy.context.evaluated_depsgraph_get()).data
    predicted=deform(ids,matrices)
    observed=np.array([offset@actual.vertices[int(i)].co for i in ids])
    delta=float(np.max(np.linalg.norm(predicted-observed,axis=1)))
    reports[digit]={'score':score,'maxBlenderFkErrorMm':delta*1000}
    print(digit,json.dumps(reports[digit]),a.tolist(),flush=True)
    if delta>.00001:raise RuntimeError('FK proxy differs from Blender; stop fitting.')

scene['new_static_grip_parameters']=json.dumps(parameters)
scene['new_static_grip_hinges']=json.dumps(axis_records)
result=audit(body,rig,knife)
(out/'static-actual-mesh.json').write_text(json.dumps({'contact':result,'parameters':parameters,'fit':reports,'selfCrossings':self_crossings(body,rig,knife)},indent=2))
print('ACTUAL CONTACT',json.dumps(result),flush=True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(out/'static-hand-contact.blend'),compress=True)
