"""Exact evaluated-mesh audit helpers. All distances are in metres.

Unlike check-grip-motion.py, this uses every actual knife component, the palm,
triangle overlap and containment. No ellipsoid/profile surrogate is accepted.
"""
import bpy
import json
import math
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

DIGITS=('thumb','index','middle','ring','pinky')

def snapshot(body, rig, knife,side='r'):
    bpy.context.view_layer.update()
    deps=bpy.context.evaluated_depsgraph_get()
    ev=body.evaluated_get(deps)
    mesh=ev.to_mesh(preserve_all_data_layers=True,depsgraph=deps)
    mesh.calc_loop_triangles()
    transform=knife.matrix_world.inverted()@ev.matrix_world
    vertices=[transform@v.co for v in mesh.vertices]
    groups={g.index:g.name for g in body.vertex_groups if g.name in rig.data.bones}
    labels=[];members={d:[] for d in (*DIGITS,'palm')}
    for v in mesh.vertices:
        weights=[(g.weight,groups[g.group]) for g in v.groups if g.group in groups]
        _,name=max(weights,default=(0,''))
        digit=next((d for d in DIGITS if name.startswith(d+'_') and name.endswith('_'+side)),None)
        label=digit or ('palm' if name=='hand_'+side else None)
        labels.append(label)
        if label:members[label].append(v.index)
    tris=[tuple(t.vertices) for t in mesh.loop_triangles]
    ev.to_mesh_clear()
    return vertices,tris,labels,members

def closed_inside(tree, point):
    # Two oblique rays avoid classifying a shared edge or a nearest concave face
    # as penetration. Report ambiguous containment instead of silently passing it.
    votes=[]
    for direction in (Vector((.237,.823,.341)).normalized(),Vector((-.427,.219,.887)).normalized()):
        origin=point.copy();count=0
        for _ in range(64):
            hit,_,_,_=tree.ray_cast(origin,direction)
            if hit is None:break
            count+=1;origin=hit+direction*2e-8
        votes.append(bool(count%2))
    return votes[0] and votes[1],votes[0]!=votes[1]

class KnifeSurface:
    def __init__(self,knife):
        bpy.context.view_layer.update()
        deps=bpy.context.evaluated_depsgraph_get()
        self.parts=[]
        for obj in knife.children_recursive:
            if obj.type!='MESH':continue
            ev=obj.evaluated_get(deps)
            mesh=ev.to_mesh();mesh.calc_loop_triangles()
            matrix=knife.matrix_world.inverted()@ev.matrix_world
            vertices=[matrix@v.co for v in mesh.vertices]
            triangles=[tuple(t.vertices) for t in mesh.loop_triangles]
            ev.to_mesh_clear()
            tree=BVHTree.FromPolygons(vertices,triangles,all_triangles=True)
            low=Vector(tuple(min(v[i] for v in vertices) for i in range(3)))
            high=Vector(tuple(max(v[i] for v in vertices) for i in range(3)))
            self.parts.append((obj.name,tree,low,high))

    @classmethod
    def from_data(cls,parts):
        result=cls.__new__(cls);result.parts=[]
        for part in parts:
            vertices=[Vector(p) for p in part['positions']]
            tree=BVHTree.FromPolygons(vertices,part['triangles'],all_triangles=True)
            low=Vector(tuple(min(v[i] for v in vertices) for i in range(3)))
            high=Vector(tuple(max(v[i] for v in vertices) for i in range(3)))
            result.parts.append((part['name'],tree,low,high))
        return result

    def distance(self,p,exact=True,blade=True):
        closest=float('inf');deepest=0.;which=None;ambiguous=0
        for name,tree,low,high in self.parts:
            if not blade and name.startswith('Satin blade'):continue
            point,normal,_,distance=tree.find_nearest(p)
            closest=min(closest,distance)
            if any(p[i]<low[i]-1e-8 or p[i]>high[i]+1e-8 for i in range(3)):continue
            if exact:
                inside,uncertain=closed_inside(tree,p);ambiguous+=int(uncertain)
            else:
                inside=(p-point).dot(normal)<0
            if inside and -distance<deepest:deepest=-distance;which=name
        return (deepest if deepest<0 else closest),which,ambiguous

def audit(body,rig,knife,intersections=True,side='r'):
    points,tris,labels,members=snapshot(body,rig,knife,side)
    surface=KnifeSurface(knife)
    return audit_arrays(points,tris,labels,surface,intersections)

def audit_arrays(points,tris,labels,surface,intersections=True):
    members={d:[] for d in (*DIGITS,'palm')}
    for i,label in enumerate(labels):
        if label in members:members[label].append(i)
    report={}
    hand_ids=set(i for ids in members.values() for i in ids)
    tri_ids=list(range(len(tris)))
    tree=BVHTree.FromPolygons(points,[tris[i] for i in tri_ids],all_triangles=True)
    crossings={d:{} for d in (*members,'other')}
    if intersections:
        for name,part,_,_ in surface.parts:
            for a,b in tree.overlap(part):
                for label in {labels[v] for v in tris[tri_ids[a]]}:
                    key=label or 'other'
                    crossings[key][name]=crossings[key].get(name,0)+1
    for label,ids in members.items():
        samples=[(surface.distance(points[i]),i) for i in ids]
        if not samples:continue
        ordered=sorted(samples,key=lambda x:x[0][0])
        report[label]={
            'minSignedMm':round(ordered[0][0][0]*1000,4),
            'insideVertices':sum(item[0][0]<-1e-5 for item in samples),
            'ambiguousQueries':sum(item[0][2] for item in samples),
            'worstComponent':ordered[0][0][1],
            'worstVertex':ordered[0][1],
            'worstPointMm':[round(v*1000,3) for v in points[ordered[0][1]]],
            'surfaceCrossings':crossings[label],
        }
    other=[]
    for i,p in enumerate(points):
        if labels[i]:continue
        if any(all(low[j]<=p[j]<=high[j] for j in range(3)) for _,_,low,high in surface.parts):
            d,part,uncertain=surface.distance(p)
            if d<-1e-5:other.append({'vertex':i,'signedMm':d*1000,'part':part})
    report['other']={'insideVertices':len(other),'surfaceCrossings':crossings['other'],'inside':other}
    return report

def self_crossings(body,rig,knife):
    points,tris,labels,members=snapshot(body,rig,knife)
    return self_crossings_arrays(points,tris,labels)

def self_crossings_arrays(points,tris,labels):
    regions={d:[tri for tri in tris if all(labels[i]==d for i in tri)] for d in DIGITS}
    trees={d:BVHTree.FromPolygons(points,faces,all_triangles=True) for d,faces in regions.items()}
    result={}
    for i,a in enumerate(DIGITS):
        for b in DIGITS[i+1:]:
            hits=trees[a].overlap(trees[b])
            if hits:
                result[a+'/'+b]={'pairs':len(hits),'exampleTriangleA':list(regions[a][hits[0][0]]),
                                'exampleTriangleB':list(regions[b][hits[0][1]])}
    return result

def whole_hand_self_crossings(points,tris,labels,weld=None):
    """Also detect thumb–palm and folds within the same digit.

    Shared vertices are the original continuous skin, not collisions. All
    non-adjacent triangles are tested, regardless of their dominant bone.
    """
    faces=[tuple(f) for f in tris if any(labels[i] for i in f)]
    # glTF duplicates vertices at UV seams. Only precomputed bind-position +
    # identical-skin-weight identities may restore this original adjacency.
    # Never weld moving surfaces merely because they currently touch.
    sets=[set(weld[i] if weld is not None else i for i in f) for f in faces]
    tree=BVHTree.FromPolygons(points,faces,all_triangles=True)
    hits=[(a,b) for a,b in tree.overlap(tree) if a<b and not sets[a].intersection(sets[b])]
    return {'pairs':len(hits),'examples':[{'a':faces[a],'b':faces[b],
        'labelsA':[labels[i] for i in faces[a]],'labelsB':[labels[i] for i in faces[b]]} for a,b in hits[:8]]}

if __name__=='__main__':
    from pathlib import Path
    scene=bpy.context.scene;scene.frame_set(48)
    rig=next(o for o in scene.objects if o.type=='ARMATURE')
    body=next(o for o in scene.objects if o.type=='MESH' and o.name.endswith('MakeHuman body'))
    knife=next(o for o in scene.objects if o.type=='EMPTY')
    result=audit(body,rig,knife)
    out=Path.cwd()/'outputs/hand-mesh-rework'
    out.mkdir(parents=True,exist_ok=True)
    (out/'baseline-actual-mesh.json').write_text(json.dumps(result,indent=2))
    print(json.dumps(result))
