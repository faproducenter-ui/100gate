"""Actual morphed/skinned native motion correspondence, not a visual pass."""
import bpy,json,sys
from pathlib import Path
from mathutils import Vector
from mathutils.kdtree import KDTree
sys.path.insert(0,str(Path(__file__).resolve().parent));from cinematic_geometry import getmesh
fall='--fall' in sys.argv;continuous='--continuous' in sys.argv
out=Path.cwd()/('outputs/cinematic-intro/continuous-performance' if continuous else 'outputs/cinematic-intro/fall-performance' if fall else 'outputs/cinematic-intro/bound-performance');s=bpy.context.scene
assert s.get('bound_performance_partial')
actors=[o for o in s.objects if o.type=='MESH' and o.name.startswith('Alexei | original MakeHuman body') and not o.get('authoring_archive')]
ropes=[o for o in s.objects if o.type=='MESH' and 'intact wrist-to-chair rope' in o.name]
assert len(actors)==5 and len(ropes)==2, 'Missing native actor/restraint meshes'
report=[]
for frame in ((505,553,565,589,601,649,793) if continuous else (289,301,313,325,349,397) if fall else (1,49,97,145,193,289)):
    s.frame_set(frame);bpy.context.view_layer.update();data=json.loads((out/f'runtime-frame-{frame}.json').read_text())['meshes'];row={'frame':frame,'meshes':[]}
    for obj in actors+ropes:
        name=obj.name.replace(' ','_').replace('.','');mesh=next(m for m in data if m['name']==name)
        points,_=getmesh(obj);tree=KDTree(len(points))
        for i,p in enumerate(points):tree.insert(p,i)
        tree.balance();errors=[tree.find(Vector(p))[2]*1000 for p in mesh['positions']]
        reverse=KDTree(len(mesh['positions']))
        for i,p in enumerate(mesh['positions']):reverse.insert(Vector(p),i)
        reverse.balance();back=[reverse.find(p)[2]*1000 for p in points]
        row['meshes'].append({'name':obj.name,'maxMm':max(max(errors),max(back)),'importToSourceMaxMm':max(errors),'sourceToImportMaxMm':max(back),'meanMm':sum(errors)/len(errors)})
    report.append(row)
maximum=max(m['maxMm'] for r in report for m in r['meshes'])
(out/'source-runtime-motion-match.json').write_text(json.dumps({'maxMm':maximum,'limitMm':1,'passed':maximum<1,'frames':report},indent=2))
print('MOTION SKIN maximum actual source/runtime error:',maximum,'mm',flush=True)
assert maximum<1,'Animated import differs from source; do not promote'
