"""Evaluated source geometry and watertight-component queries; never edit meshes."""
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

def getmesh(obj):
    deps=bpy.context.evaluated_depsgraph_get();ev=obj.evaluated_get(deps);m=ev.to_mesh(preserve_all_data_layers=True,depsgraph=deps);m.calc_loop_triangles()
    points=[ev.matrix_world@v.co for v in m.vertices];tris=[tuple(t.vertices) for t in m.loop_triangles];ev.to_mesh_clear();return points,tris

def closed_parts(points,tris):
    """Containment is valid per watertight board, NOT on the composite chair.

    Disconnected/open decoration made whole-chair ray parity report a bogus
    107 mm penetration even when surfaces did not cross. Keep open components
    visible in the report and test their surfaces, never pretend they enclose.
    """
    # UV/normal seams split indices, not physical board surfaces. Weld only
    # the diagnostic copy at a micron; never edit the source chair mesh.
    unique={};remap={};welded=[]
    for i,p in enumerate(points):
        key=tuple(round(x,6) for x in p)
        if key not in unique:unique[key]=len(welded);welded.append(p)
        remap[i]=unique[key]
    points=welded;tris=[tuple(remap[i] for i in t) for t in tris]
    tris=[t for t in tris if len(set(t))==3]
    adjacency={i:set() for t in tris for i in t}
    for t in tris:
        for i in t:adjacency[i].update(t)
    unseen=set(adjacency);components=[]
    while unseen:
        todo=[unseen.pop()];ids=set(todo)
        while todo:
            for j in adjacency[todo.pop()]:
                if j in unseen:unseen.remove(j);ids.add(j);todo.append(j)
        components.append(ids)
    closed=[];opened=[]
    for ids in components:
        faces=[t for t in tris if t[0] in ids];edges={}
        for t in faces:
            for a,b in zip(t,(t[1],t[2],t[0])):
                k=tuple(sorted((a,b)));edges[k]=edges.get(k,0)+1
        if not all(v==2 for v in edges.values()):opened.append(len(faces));continue
        tree=BVHTree.FromPolygons(points,faces,all_triangles=True)
        lo=Vector(tuple(min(points[i][j] for i in ids) for j in range(3)));hi=Vector(tuple(max(points[i][j] for i in ids) for j in range(3)))
        closed.append((tree,lo,hi))
    return closed,opened
