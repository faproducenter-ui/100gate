"""Non-destructive evaluated surface audit of the authored BOUND fragment.

Only real triangle intersections are reported. Counts are diagnostics, not
artistic acceptance, nor proof about un-authored escape phases.
"""
import bpy, json, sys, hashlib
from pathlib import Path
from mathutils.bvhtree import BVHTree
sys.path.insert(0, str(Path(__file__).resolve().parent))
from cinematic_geometry import getmesh

s = bpy.context.scene
assert s.get('bound_performance_partial'), 'Expected the native BOUND motion source'
actor = [o for o in s.objects if o.type == 'MESH' and not o.get('authoring_archive')
         and 'MakeHuman body' in o.name]
ropes = [o for o in s.objects if o.type == 'MESH' and 'intact wrist-to-chair rope' in o.name]
assert len(ropes) == 2, 'Both actual restraints must exist; an empty audit is NOT a pass'
assert len(actor) == 5, 'Expected the original five native skinned meshes'
chair = s.objects['old-chair']
results = []
fall='--fall' in sys.argv;continuous='--continuous' in sys.argv
assert not continuous or s.get('continuous_rock_fall'), 'Wrong source for continuous transition audit'
frames = ([193+i*.5 for i in range(1201)] if '--dense' in sys.argv else [1+t*48 for t in (4,4.65,5.35,6.02,7.38,8.74,10.18,10.91,11.5,11.8,12.1,12.38,12.5,12.65,13,14,16.5)]) if continuous else (([289+i*.5 for i in range(217)] if '--dense' in sys.argv else (289,295,303,311,319,326,330,337,349,373,397)) if fall else ([1+i*.5 for i in range(577)] if '--dense' in sys.argv else (1,49,97,145,193,241,289)))
for frame in frames:
    s.frame_set(int(frame), subframe=frame-int(frame))
    bpy.context.view_layer.update()
    geometry = {o.name: getmesh(o) for o in [chair] + actor + ropes}
    trees = {n: BVHTree.FromPolygons(p, t, all_triangles=True) for n, (p, t) in geometry.items()}
    row = {'frame': frame, 'timeSeconds': (frame-1)/(s.render.fps/s.render.fps_base), 'contacts': [],
           'minimumFloorMm': {n: min(p.z for p in points)*1000 for n, (points, _) in geometry.items()}}
    pairs = [(a.name, chair.name) for a in actor]
    pairs += [(rope.name, other.name) for rope in ropes for other in actor + [chair]]
    for a, b in pairs:
        overlaps = trees[a].overlap(trees[b])
        witnesses = []
        for ia, ib in overlaps[:5]:
            witnesses.append({'aTriangle': ia, 'bTriangle': ib,
                              'aWorld': [list(geometry[a][0][i]) for i in geometry[a][1][ia]],
                              'bWorld': [list(geometry[b][0][i]) for i in geometry[b][1][ib]]})
        row['contacts'].append({'a': a, 'b': b, 'triangleCrossings': len(overlaps), 'witnesses': witnesses})
    results.append(row)
    failures=[c for c in row['contacts'] if c['triangleCrossings']]
    if failures or frame==int(frame) and int(frame)%24==1:print('BOUND_CONTACT', frame, [(c['a'], c['b'], c['triangleCrossings']) for c in failures], flush=True)
out = Path.cwd()/('outputs/cinematic-intro/continuous-performance' if continuous else 'outputs/cinematic-intro/fall-performance' if fall else 'outputs/cinematic-intro/bound-performance')/'evaluated-contact-audit.json'
out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps({'scope': 'Continuous rocking/fall surfaces; not visual acceptance' if continuous else 'Authored fall/ground surfaces; not full escape or visual acceptance' if fall else 'ONLY authored BOUND idle/struggle; surface diagnostic, not visual acceptance', 'sourceSha256':hashlib.sha256(Path(bpy.data.filepath).read_bytes()).hexdigest(),'sampleCount':len(results),'samples': results}, indent=2))
print('Saved', out, flush=True)
assert not any(c['triangleCrossings'] for row in results for c in row['contacts']), 'Actual contacts still cross; do not promote this source'
assert all(mm> -1 for row in results for mm in row['minimumFloorMm'].values()), 'Surface tunnels through floor'
