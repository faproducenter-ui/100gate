"""Run on the editable quality-overhaul apartment blend, not the live scene."""
from collections import Counter
import json
from pathlib import Path

import bpy
from mathutils import Vector


scene = bpy.context.scene
camera = bpy.data.objects["StoryHome_Dialogue"].location.copy()
deps = bpy.context.evaluated_depsgraph_get()
hits = Counter()
for ix in range(19):
    for iz in range(13):
        aperture = Vector((-1.13+ix*(1.94/18), 2.55, .97+iz*(1.11/12)))
        direction = (aperture-camera).normalized()
        hit, _, _, _, obj, _ = scene.ray_cast(deps, aperture, direction, distance=35)
        assert hit and obj.name.startswith("City | "), (aperture, obj)
        hits[obj.name.split(" | ")[1]] += 1

assert hits["backdrop beyond both rows"]>=.05*sum(hits.values()), hits
assert sum(hits[n] for n in ("West stairwell","East residential"))>24, hits
assert sum(hits[n] for n in ("Far west","Far middle","Far east"))>8, hits

hinge=bpy.data.objects["StoryHome_DoorHinge"]
hinge.rotation_euler.z=1.42
bpy.context.view_layer.update()
routes=floor=0
for y in (.85,1.08,1.31):
    for z in (.22,.64,1.11,1.57,1.82):
        hit, _, _, _, obj, _=scene.ray_cast(deps,Vector((2.42,y,z)),Vector((1,0,0)),distance=1.19)
        assert not hit, (y,z,obj.name)
        routes+=1
    for x in (2.49,2.73,2.79,2.88,3.08,3.44,3.60):
        hit, contact, _, _, obj, _=scene.ray_cast(deps,Vector((x,y,.14)),Vector((0,0,-1)),distance=.18)
        assert hit and abs(contact.z)<.021, (x,y,contact,obj)
        floor+=1

report={"cityRayHits":dict(hits),"unblockedDoorRays":routes,"continuousFloorRays":floor}
path=Path(bpy.data.filepath).parent/"geometry-audit.json"
path.write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
print("PASS: "+json.dumps(report),flush=True)
