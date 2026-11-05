"""Refine the actual thumb skeleton against palm/web as well as the knife.

No geometry, weights, scale or topology changes. Full non-adjacent hand
triangle pairs are checked, including intra-digit folds and thumb–palm.
"""
import bpy,numpy as np,math,json,sys
from pathlib import Path
from mathutils import Vector,Quaternion,Matrix
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from hand_mesh_audit import KnifeSurface,snapshot,audit,self_crossings
out=Path.cwd()/'outputs/hand-mesh-rework';s=bpy.context.scene
r=next(o for o in s.objects if o.type=='ARMATURE');b=next(o for o in s.objects if o.type=='MESH' and o.name.endswith('MakeHuman body'));k=next(o for o in s.objects if o.type=='EMPTY')
surface=KnifeSurface(k);names=[f'thumb_0{j}_r' for j in (1,2,3)]
controls=json.loads(s['new_static_grip_hinges']);parameters=json.loads(s['new_static_grip_parameters'])
for name in names:r.pose.bones[name].matrix_basis=Matrix.Identity(4)
bpy.context.view_layer.update();neutral={p.name:p.matrix.copy() for p in r.pose.bones}
_,faces,labels,_=snapshot(b,r,k)
skin=next(m for m in b.modifiers if m.type=='ARMATURE');skin.show_viewport=False;bpy.context.view_layer.update()
deps=bpy.context.evaluated_depsgraph_get();ev=b.evaluated_get(deps);mesh=ev.to_mesh(preserve_all_data_layers=True,depsgraph=deps)
groups={g.index:g.name for g in b.vertex_groups if g.name in r.data.bones}
weights=[]
for v in mesh.vertices:
    w={groups[g.group]:g.weight for g in v.groups if g.group in groups};total=sum(w.values())
    weights.append({name:val/total for name,val in w.items()})
coords=np.array([v.co[:] for v in mesh.vertices]);ev.to_mesh_clear();skin.show_viewport=True;bpy.context.view_layer.update()
faces=[tuple(f) for f in faces if any(labels[i] for i in f)];ids=np.unique(faces)
lookup={int(i):j for j,i in enumerate(ids)};local_faces=[tuple(lookup[i] for i in f) for f in faces]
face_sets=[set(f) for f in local_faces];local_labels=[labels[i] for i in ids]
thumb_ids=np.array([j for j,i in enumerate(ids) if sum(weights[i].get(n,0) for n in names)>.003])
free_ids=np.array([j for j,i in enumerate(ids) if weights[i].get(names[2],0)>.65])
inv={n:r.data.bones[n].matrix_local.inverted() for n in names}
rel={n:r.data.bones[n].parent.matrix_local.inverted()@r.data.bones[n].matrix_local for n in names}
to_knife=np.array(k.matrix_world.inverted()@b.matrix_world)
constant=np.zeros((len(ids),3));warr={n:np.array([weights[i].get(n,0) for i in ids]) for n in names}
for name in {n for i in ids for n in weights[i] if n not in names}:
    w=np.array([weights[i].get(name,0) for i in ids]);M=np.array(neutral[name]@r.data.bones[name].matrix_local.inverted())
    constant+=(coords[ids]@M[:3,:3].T+M[:3,3])*w[:,None]
parent=neutral[names[0]].copy();parent=r.pose.bones[names[0]].parent.matrix.copy()
thumb_neutral=neutral[names[0]].to_3x3();direction0=(r.pose.bones[names[0]].tail-r.pose.bones[names[0]].head).normalized()
knife_to_rig=r.matrix_world.to_3x3().inverted()@k.matrix_world.to_3x3()
def matrices(a):
    az,el,roll=map(math.radians,a[:3]);direction=knife_to_rig@Vector((math.cos(el)*math.cos(az),math.cos(el)*math.sin(az),math.sin(el)))
    q=Quaternion(direction,roll)@direction0.rotation_difference(direction)
    q=(thumb_neutral.inverted()@q.to_matrix()@thumb_neutral).to_quaternion()
    quats=[q]+[Quaternion(Vector(c['axis']),math.radians(v)) for v,c in zip(a[3:],controls['thumb'][3:])]
    m=parent.copy();ms=[]
    for n,q in zip(names,quats):m=m@rel[n]@q.to_matrix().to_4x4();ms.append(m.copy())
    return ms,quats
def deform(a):
    ms,quats=matrices(a);points=constant.copy()
    for n,m in zip(names,ms):
        M=np.array(m@inv[n]);points+=(coords[ids]@M[:3,:3].T+M[:3,3])*warr[n][:,None]
    return points@to_knife[:3,:3].T+to_knife[:3,3],quats
index_faces=[f for f in local_faces if all(local_labels[i]=='index' for i in f)]
points,_=deform(parameters['thumb']);index=BVHTree.FromPolygons(points.tolist(),index_faces,all_triangles=True)
ip=r.pose.bones['index_01_r'];center=k.matrix_world.inverted()@r.matrix_world@((ip.head+ip.tail)/2)
target,normal,_,_=index.ray_cast(Vector((center.x,-.15,center.z)),Vector((0,1,0)))
target+=normal*.00025
bounds=[(-35,85),(15,70),(-65,65),(0,60),(0,65)]
calls=0
def objective(a,detail=False):
    global calls
    points,_=deform(a);vs=[Vector(p) for p in points]
    tree=BVHTree.FromPolygons(vs,local_faces,all_triangles=True)
    crossings=[(i,j) for i,j in tree.overlap(tree) if i<j and not face_sets[i].intersection(face_sets[j])]
    values=np.array([surface.distance(vs[i],False)[0]*1000 for i in thumb_ids])
    pen=np.minimum(values-.12,0)
    # Opposing pad contacts the outside of index, not the same cylinder
    # surface occupied by the four closed fingers.
    distances=np.array([index.find_nearest(Vector(points[i]))[3]*1000 for i in free_ids])
    nearest=np.sort(distances)[:8]
    score=len(crossings)*10000+np.dot(pen,pen)*1000+float(pen.min())**2*20000+np.mean((nearest-.25)**2)*30
    nearest_points=sorted(free_ids,key=lambda i:index.find_nearest(Vector(points[i]))[3])[:8]
    center=np.mean(points[nearest_points],axis=0)
    score+=np.sum((center-np.array(target))**2)*100000*.04
    score+=np.mean((a-np.array([-8,46,0,25,20]))**2)*.003
    calls+=1
    if detail:return float(score),len(crossings),float(values.min()),nearest.tolist()
    return float(score)
def descent(start):
    a=np.array(start,dtype=float);best=objective(a)
    for step in (14,7,3,1,.4):
        for _ in range(2):
            for i,(lo,hi) in enumerate(bounds):
                selected=a
                for sign in (-1,1):
                    v=a.copy();v[i]=np.clip(v[i]+step*sign,lo,hi);score=objective(v)
                    if score<best:best=score;selected=v
                a=selected
        print('THUMB',step,a.tolist(),objective(a,True),flush=True)
    return best,a
starts=[parameters['thumb'],(-15,60,10,30,35),(-35,55,10,35,35),(-15,45,-10,35,45),(-5,60,20,35,40)]
score,a=min((descent(v) for v in starts),key=lambda x:x[0])
points,quats=deform(a)
for n,q in zip(names,quats):r.pose.bones[n].rotation_quaternion=q
bpy.context.view_layer.update();actual,_,_,_=snapshot(b,r,k)
error=max((Vector(points[j])-actual[i]).length*1000 for j,i in enumerate(ids));assert error<.01,error
parameters['thumb']=a.tolist();s['new_static_grip_parameters']=json.dumps(parameters)
for c,(lo,hi) in zip(controls['thumb'],bounds):c['minDeltaDeg']=lo;c['maxDeltaDeg']=hi
s['new_static_grip_hinges']=json.dumps(controls)
contact=audit(b,r,k);d={'score':score,'parameters':parameters,'selfDetail':objective(a,True),
    'actual':contact,'digitSelf':self_crossings(b,r,k),'fkErrorMm':error,'calls':calls}
(out/'thumb-anatomy-mesh.json').write_text(json.dumps(d,indent=2))
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(out/'static-thumb-anatomy.blend'),compress=True)
print('FINAL THUMB',json.dumps(d),flush=True)
if d['selfDetail'][1] or any(v['insideVertices'] or v['surfaceCrossings'] for v in contact.values()):raise RuntimeError('Still intersects; do not animate')
