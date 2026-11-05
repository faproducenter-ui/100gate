"""Compare actual CPU-skinned Three vertices with evaluated Blender surfaces.

This detects export/coordinate/weight-loss defects, NOT artistic acceptance.
Run the browser static reviewer first, against the matching fresh exports.
"""
import bpy,json,sys,os
from pathlib import Path
from mathutils import Vector
from mathutils.kdtree import KDTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from cinematic_geometry import getmesh
out=Path.cwd()/'outputs/cinematic-intro';scene=bpy.context.scene
body=next(o for o in scene.objects if o.type=='MESH' and o.name.endswith('MakeHuman body'))
actor=[o for o in scene.objects if o.type=='MESH' and o.name.startswith(body.name)]
poses=((1,'restraints'),) if scene.get('bound_restraints_only') else ((1,'bound'),(81,'ground'),(161,'grip'),(241,'stand'))
reports=[];limit=float(os.environ.get('CINEMATIC_IMPORT_LIMIT_MM','1'))

def distances(a,b):
    tree=KDTree(len(b))
    for i,p in enumerate(b):tree.insert(Vector(p),i)
    tree.balance();values=[tree.find(Vector(p))[2]*1000 for p in a]
    return {'maxMm':max(values),'meanMm':sum(values)/len(values),'p99Mm':sorted(values)[int(.99*(len(values)-1))]}

for frame,label in poses:
    scene.frame_set(frame);bpy.context.view_layer.update()
    runtime=json.loads((out/f'runtime-{label}-meshes.json').read_text())['meshes']
    result={'pose':label,'meshes':[]}
    for obj in actor:
        name=obj.name.replace(' ','_').replace('.','')+'_glb'
        actual=next(m for m in runtime if m['name']==name)
        source,_=getmesh(obj)
        result['meshes'].append({'mesh':obj.name,'sourceToRuntime':distances(source,actual['positions']),
            'runtimeToSource':distances(actual['positions'],source)})
    reports.append(result)
    print('IMPORT',json.dumps(result),flush=True)
failures=[{'pose':r['pose'],'mesh':m['mesh'],'maxMm':max(m[d]['maxMm'] for d in ('sourceToRuntime','runtimeToSource'))}
    for r in reports for m in r['meshes'] if max(m[d]['maxMm'] for d in ('sourceToRuntime','runtimeToSource'))>limit]
report={'qualityGatePassed':not failures,'limitMm':limit,'failures':failures,'poses':reports,
    'method':'bidirectional nearest actual evaluated vertices; detects export mismatch, not artistic acceptance'}
(out/('bound-import-match.json' if scene.get('bound_restraints_only') else 'static-import-match.json')).write_text(json.dumps(report,indent=2))
if failures:
    print('FAIL source/runtime skin correspondence. Do NOT promote these static gates to an animated production asset.',flush=True)
    raise SystemExit(1)
