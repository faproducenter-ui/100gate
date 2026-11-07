"""Measure the real door passage before authoring a seated actor trajectory."""
import json
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


scene=bpy.context.scene
scene.frame_set(38)
shell=bpy.data.objects["BodyShell_RealDualRearApertures"]
assert shell and bpy.data.objects["SedanRoot"]
deps=bpy.context.evaluated_depsgraph_get()


def tree(obj):
    evaluated=obj.evaluated_get(deps)
    mesh=evaluated.to_mesh()
    try:
        points=[obj.matrix_world @ v.co for v in mesh.vertices]
        return BVHTree.FromPolygons(points,[tuple(p.vertices) for p in mesh.polygons])
    finally:
        evaluated.to_mesh_clear()


def longest(indices):
    runs=[]
    for index in indices:
        if runs and index==runs[-1][-1]+1:
            runs[-1].append(index)
        else:
            runs.append([index])
    return max(runs,key=len,default=[])


report={"units":"metres","frame":scene.frame_current,"scope":"Straight lateral rays through shell and every open door panel; not an actor collision test","doors":{}}
xs=[.245+.025*i for i in range(39)]
for side,sign in (("L",-1),("R",1)):
    pivot=bpy.data.objects[f"Sedan_Door_Rear_{side}_Pivot"]
    geometry=[tree(o) for o in [shell,*pivot.children_recursive] if o.type=="MESH"]
    direction=Vector((0,sign,0))
    profiles={}
    for z in (.34,.43,.51,.60,.71,.82,.94,1.04,1.10):
        clear=longest(i for i,x in enumerate(xs) if not any(
            b.ray_cast(Vector((x,sign*.60,z)),direction,.65)[3] is not None for b in geometry))
        profiles[str(z)]={"rangeX":[round(xs[clear[0]],3),round(xs[clear[-1]],3)] if clear else [],
            "verifiedLateralSpanX":round((len(clear)-1)*.025,3) if clear else 0}
    report["doors"][side]={"seatAnchor":list(pivot["seat_position_original_blender"]),"heightSlices":profiles}
    assert all(profiles[str(z)]["verifiedLateralSpanX"]>=.4 for z in (.43,.51,.60,.71)),(side,profiles)

target=Path(bpy.data.filepath).parent/"egress-corridor.json"
target.write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
print("PASS: measured both open portals including door cards, glass and moving trim.")
