"""Verify true evaluated shoe meshes across the three native stop clips."""
import json
import sys
from importlib import import_module
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0,str(Path(__file__).resolve().parent))
from story_actor_tools import actor_meshes

scene=bpy.context.scene
rig=next(o for o in scene.objects if o.type=="ARMATURE")
boot=next(o for o in actor_meshes(rig) if "ankle_boot" in o.name)
Shoe=import_module("author-story-walk-mocap").Shoe
shoes={s:Shoe(rig,boot,s) for s in "lr"}
results={}
for n,(name,side,pivot) in enumerate((("stop-0","l","heel"),("stop-80","r","heel"),("stop-95","r","toe"))):
    rows=[]
    for f in range(0,67,2):
        scene.frame_set(1+60*n+f//2)
        deps=bpy.context.evaluated_depsgraph_get()
        current=boot.evaluated_get(deps)
        def point(i):return current.matrix_world@current.data.vertices[i].co
        shoe=shoes[side]
        rows.append((point(shoe.heel_index if pivot=="heel" else shoe.toe_index),
            {s:min(point(i).z for i in shoes[s].indices) for s in "lr"}))
    drift=max(Vector((p.x-rows[0][0].x,p.y-rows[0][0].y)).length for p,_ in rows)
    floor={s:min(z[s] for _,z in rows) for s in "lr"}
    final=rows[-1][1]
    results[name]={"support":side,"pivot":pivot,"maxDriftMm":1000*drift,
        "minimumFloorMm":{s:1000*v for s,v in floor.items()},
        "idleSoleHeightMm":{s:1000*v for s,v in final.items()}}
    assert drift<.012,(name,results[name])
    assert min(floor.values())>-.012 and max(abs(z) for z in final.values())<.012,(name,results[name])
path=Path(bpy.data.filepath).parent/"stop-geometry.json"
path.write_text(json.dumps(results,indent=2)+"\n",encoding="utf-8")
print("PASS",json.dumps(results),flush=True)
