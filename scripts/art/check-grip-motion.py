"""Measure actual evaluated finger surfaces throughout the isolated grip clip.

Run against the review .blend, not against a production scene. Negative values
are geometric penetration into the prop's measured capped oval profile.
This is not a substitute for viewing the movement and does not test anatomy.
"""
import bpy
import json
import numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

scene=bpy.context.scene
body=next(o for o in scene.objects if o.type=='MESH' and o.name.endswith('MakeHuman body'))
rig=next(o for o in scene.objects if o.type=='ARMATURE')
knife=next(o for o in scene.objects if o.type=='EMPTY' and o.name.startswith('Cinematic field knife'))
finger_groups={g.index:g.name.split('_')[0] for g in body.vertex_groups
               if g.name.endswith('_r') and g.name.startswith(('index_','middle_','ring_','pinky_','thumb_'))}
deform_groups={g.index for g in body.vertex_groups if g.name in rig.data.bones}
rings=np.array([[-62,6,5],[-58,10,8],[-46,12,11],[-22,11,12],
                [11,11,12],[35,12,11],[52,11,8],[57,8,5]])
results=[]
scene.frame_set(scene.frame_end)
bpy.context.view_layer.update()
blade=next(o for o in scene.objects if o.type=='MESH' and o.name.startswith('Satin blade'))
local=knife.matrix_world.inverted()@blade.matrix_world
blade_tree=BVHTree.FromPolygons([local@v.co for v in blade.data.vertices],
    [p.vertices[:] for p in blade.data.polygons],all_triangles=True)
for frame in range(1,49):
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    ev=body.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh=ev.data
    M=knife.matrix_world.inverted()@body.matrix_world
    verts=np.array([v.co for v in mesh.vertices])
    points=(verts@np.array(M.to_3x3()).T+np.array(M.translation))*1000
    x,y,z=points.T
    a=np.interp(z,rings[:,0],rings[:,1])
    b=np.interp(z,rings[:,0],rings[:,2])
    radial=(np.sqrt((x/a)**2+(y/b)**2)-1)*np.minimum(a,b)
    axial=np.maximum(z-56,-61-z)
    distances=np.sqrt(np.maximum(radial,0)**2+np.maximum(axial,0)**2)+np.minimum(np.maximum(radial,axial),0)
    fingers={digit:[] for digit in ('thumb','index','middle','ring','pinky')}
    for v in mesh.vertices:
        candidates=[g for g in v.groups if g.group in deform_groups]
        if candidates:
            major=max(candidates,key=lambda g:g.weight)
            if major.group in finger_groups:
                fingers[finger_groups[major.group]].append(v.index)
    clearances={digit:round(float(distances[indices].min()),3) for digit,indices in fingers.items()}
    closest_blade=0.
    blade_contact=None
    for digit,indices in fingers.items():
        for i in indices:
            p=points[i]
            if .055<p[2]/1000<.186 and abs(p[0])<17 and abs(p[1])<4:
                v=Vector(p/1000)
                hit,normal,_,distance=blade_tree.find_nearest(v)
                if hit is not None and (v-hit).dot(normal)<0:
                    # A nearest-triangle normal alone does not establish
                    # containment near the tapered spine/cap.
                    ray=Vector((.23,.81,.19)).normalized()
                    origin=v.copy()
                    count=0
                    for _ in range(32):
                        loc,_,_,_=blade_tree.ray_cast(origin,ray)
                        if loc is None:break
                        count+=1;origin=loc+ray*1e-7
                    if count%2:
                        if -distance*1000<closest_blade:
                            closest_blade=-distance*1000
                            blade_contact={'digit':digit,'localMm':p.tolist()}
    results.append({'frame':frame,'signedClearanceMm':clearances,'bladePenetrationMm':round(closest_blade,3),
                    'bladeContact':blade_contact})
Path('outputs/mpfb-character/grip-motion-contact.json').write_text(json.dumps(results,indent=2))
print(json.dumps({digit:min((r['signedClearanceMm'][digit],r['frame']) for r in results)
                  for digit in results[0]['signedClearanceMm']}))
worst=min(v for sample in results for v in sample['signedClearanceMm'].values())
if worst<-.8:
    raise RuntimeError(f'Unacceptable shaft penetration during grip study: {worst:.3f} mm')
worst_blade=min(r['bladePenetrationMm'] for r in results)
if worst_blade<-.4:
    raise RuntimeError(f'Finger intersects cutting blade: {worst_blade:.3f} mm')
