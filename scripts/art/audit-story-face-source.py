"""Verify official MPFB target offsets against an existing actor's native mesh."""
import hashlib
import json
import sys
from pathlib import Path
from zipfile import ZipFile

import bpy
from mathutils import Vector


root=Path(__file__).resolve().parents[2]
source=root.parent/'100gate-art-sources/story-face'
out=root/'outputs/quality-overhaul/dialogue'
out.mkdir(parents=True,exist_ok=True)
role='Partner' if '--partner' in sys.argv else 'Alexei'
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
parts=[o for o in bpy.context.scene.objects if o.type=='MESH' and any(
    m.type=='ARMATURE' and m.object==rig for m in o.modifiers)]
body=max(parts,key=lambda o:len(o.data.vertices))
assert len(rig.data.bones)>=53 and len(body.data.vertices) in (13380,19158), (
    role,body.name,len(body.data.vertices))
head=rig.data.bones['head']
head_local=body.matrix_world.inverted() @ rig.matrix_world @ head.head_local
def point(value):
    return [round(float(v),6) for v in value]

packs={
 'faceunits01': ('d113107bd7eb59f3af4df6fc0ec29bfcc593f496d0b336aec14f086a80ce7146',
    'faceunits',('eyeBlinkLeft','eyeBlinkRight','browInnerUp','mouthPucker','jawOpen')),
 'visemes02': ('a69ab6fb95ddd5f56f70acc7e859f5f9c6ae613c527d577ea1571eff2183d29e',
    'visemes',('viseme_PP','viseme_O','viseme_aa','viseme_FF')),
}
report={'role':role,'body':body.name,'vertices':len(body.data.vertices),'head':point(head_local),
    'bones':[b.name for b in rig.data.bones if any(s in b.name for s in ('head','eye','jaw','neck'))],
    'faceAttachments':[o.name for o in parts if any(s in o.name.lower() for s in ('eye','lash','brow','teeth'))],
    'packs':{}}
for pack,(sha,folder,targets) in packs.items():
    file=source/(pack+'.zip')
    assert hashlib.sha256(file.read_bytes()).hexdigest()==sha
    report['packs'][pack]={'sha256':sha,'targets':{}}
    with ZipFile(file) as archive:
        index=json.loads(archive.read('packs/'+pack+'.json'))
        for target in targets:
            record=index[target]
            assert record['license'] in ('CC0','CC0-1.0'),record
            points=[];moves=[]
            for line in archive.read(f'targets/{folder}/{target}.target').decode().splitlines():
                if not line.strip() or line.lstrip().startswith(('#','"')):
                    continue
                idx,x,z,minus_y=line.split()
                v=body.data.vertices[int(idx)].co
                offset=.1*Vector((float(x),-float(minus_y),float(z)))
                points.append(v.copy());moves.append(offset.length)
            bounds=[point([f(p[i] for p in points) for i in range(3)]) for f in (min,max)]
            assert bounds[0][2]>head_local.z-.24 and bounds[1][2]<head_local.z+.23,(target,head_local,bounds)
            assert bounds[0][0]>-.17 and bounds[1][0]<.17,(target,bounds)
            if target.startswith('eyeBlink'):
                side=1 if target.endswith('Left') else -1
                # Targets include blended deltas across the bridge of the nose;
                # the substantial displacement must be on the named eyelid.
                weighted_x=sum(p.x*w*w for p,w in zip(points,moves))/sum(w*w for w in moves)
                assert side*weighted_x>.008,(target,bounds,weighted_x)
            assert max(moves)<.065,(target,max(moves))
            report['packs'][pack]['targets'][target]={'author':record['author'],'license':record['license'],
                'movedVertices':len(points),'boundsMeters':bounds,'peakDeltaMm':round(max(moves)*1000,2)}
(out/(role.lower()+'-face-source.json')).write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print('PASS: '+role+' official face targets match the existing native head region.')
