"""Dense actual mesh QA, anatomy bounds, attachment continuity, source integrity.

This is technical evidence, NOT a substitute for inspecting the recorded movie.
"""
import bpy,sys,json,hashlib,struct,time,os,math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from hand_mesh_audit import audit_arrays,self_crossings_arrays,whole_hand_self_crossings,snapshot,KnifeSurface
root=Path.cwd();out=root/'outputs/hand-mesh-rework';s=bpy.context.scene
r=next(o for o in s.objects if o.type=='ARMATURE')
b=next(o for o in s.objects if o.type=='MESH' and o.name.endswith('MakeHuman body'))
k=next(o for o in s.objects if o.type=='EMPTY')
surface=KnifeSurface(k)
report=[];bad=[];start=time.monotonic()
frames=[float(f) for f in range(1,290)]
# Half-frame sampling additionally covers contact, curl and maximal flexion.
frames+= [f+.5 for f in range(73,218)]
if os.environ.get('GATE_INTEGRITY_ONLY')=='1':
    previous=json.loads((out/'motion-source-dense.json').read_text())
    if not previous.get('complete'):raise RuntimeError('Dense motion sampling has not completed')
    report=previous['frames'];bad=previous['failures'];frames=[]
for i,f in enumerate(sorted(frames)):
    s.frame_set(int(f),subframe=f%1)
    points,tris,labels,_=snapshot(b,r,k)
    contact=audit_arrays(points,tris,labels,surface)
    self_hits=self_crossings_arrays(points,tris,labels)
    whole=whole_hand_self_crossings(points,tris,labels)
    if whole['pairs']:self_hits['wholeHand']=whole
    issues={d:v for d,v in contact.items() if v['insideVertices'] or v['surfaceCrossings']}
    if issues or self_hits:bad.append({'frame':f,'contact':issues,'selfCrossings':self_hits})
    report.append({'frame':f,'minimumSignedMm':{d:v.get('minSignedMm') for d,v in contact.items()},
                   'contactFailures':issues,'selfCrossings':self_hits})
    if i%24==0 or issues or self_hits:print('DENSE',i+1,'/',len(frames),'frame',f,'issues',json.dumps(issues),'self',json.dumps(self_hits),flush=True)
    # Preserve partial diagnostic results if interrupted.
    if i%48==0:(out/'motion-source-dense.json').write_text(json.dumps({'frames':report,'failures':bad,'complete':False},indent=2))

def fingerprint(scene):
    objects=sorted([o for o in scene.objects if o.type=='MESH' and 'MakeHuman body' in o.name],key=lambda o:o.name)
    result=[]
    for obj in objects:
        mesh=obj.data;h=hashlib.sha256();uvh=hashlib.sha256();wh=hashlib.sha256();sh=hashlib.sha256()
        for v in mesh.vertices:
            h.update(struct.pack('<3f',*v.co))
            for g in v.groups:wh.update(struct.pack('<If',g.group,g.weight))
        for poly in mesh.polygons:
            h.update(struct.pack('<I',len(poly.vertices)));h.update(struct.pack('<'+'I'*len(poly.vertices),*poly.vertices))
        for layer in mesh.uv_layers:
            for v in layer.data:uvh.update(struct.pack('<2f',*v.uv))
        if mesh.shape_keys:
            for key in mesh.shape_keys.key_blocks:
                sh.update(key.name.encode('utf8'));sh.update(struct.pack('<f',key.value))
                for v in key.data:sh.update(struct.pack('<3f',*v.co))
        images=sorted({hashlib.sha256(bytes(n.image.packed_file.data)).hexdigest() if n.image.packed_file
                       else hashlib.sha256(Path(bpy.path.abspath(n.image.filepath)).read_bytes()).hexdigest()
                       for mat in mesh.materials if mat and mat.use_nodes
                       for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image})
        result.append({'verts':len(mesh.vertices),'polys':len(mesh.polygons),'meshSha256':h.hexdigest(),
                       'uvSha256':uvh.hexdigest(),'shapeKeysSha256':sh.hexdigest(),
                       'weightsSha256':wh.hexdigest(),'textureBytesSha256':images})
    return sorted(result,key=lambda x:(x['verts'],x['meshSha256']))
current=fingerprint(s)
with bpy.data.libraries.load(str(root/'art/character-mpfb-review.blend'),link=False) as (available,loaded):loaded.scenes=available.scenes[:1]
original=fingerprint(loaded.scenes[0])
unchanged=([{k:v for k,v in item.items() if k!='weightsSha256'} for item in current]==
           [{k:v for k,v in item.items() if k!='weightsSha256'} for item in original])
weight_record=json.loads(s.get('local_hand_weight_repair','{}'))
weight_changes=[{'vertices':a['verts'],'original':a['weightsSha256'],'current':z['weightsSha256']}
    for a,z in zip(original,current) if a['weightsSha256']!=z['weightsSha256']]
weights_documented=not weight_changes or bool(weight_record.get('changedBaseVertices'))
reference=next(o for o in loaded.scenes[0].objects if o.type=='MESH' and len(o.data.vertices)==len(b.data.vertices))
reference_rig=next(o for o in loaded.scenes[0].objects if o.type=='ARMATURE')
def rig_fingerprint(rig):
    h=hashlib.sha256()
    for bone in rig.data.bones:
        h.update(bone.name.encode());h.update((bone.parent.name if bone.parent else '').encode())
        h.update(struct.pack('<16f',*(v for row in bone.matrix_local for v in row)))
    return h.hexdigest()
rest_rig_unchanged=rig_fingerprint(r)==rig_fingerprint(reference_rig)
def weight_dict(obj,vertex):return {obj.vertex_groups[g.group].name:g.weight for g in vertex.groups}
changed=[];unexpected=[]
for va,vz in zip(reference.data.vertices,b.data.vertices):
    a,z=weight_dict(reference,va),weight_dict(b,vz)
    names=[n for n in set(a)|set(z) if abs(a.get(n,0)-z.get(n,0))>1e-6]
    if names:changed.append(va.index)
    for n in names:
        if not(n=='hand_r' or (n.endswith('_r') and n.startswith(('thumb_','index_','middle_','ring_','pinky_')))):
            unexpected.append({'vertex':va.index,'group':n})
controls=json.loads(s['new_static_grip_hinges']);parameters=json.loads(s['new_static_grip_parameters'])
bounds=[]
for digit,values in parameters.items():
    for v,c in zip(values,controls[digit]):
        bounds.append({'digit':digit,'bone':c['bone'],'valueDeg':v,'limitsDeg':[c['minDeltaDeg'],c['maxDeltaDeg']],
                       'withinAuthoringLimit':c['minDeltaDeg']-1e-5<=v<=c['maxDeltaDeg']+1e-5})
result={'complete':True,'frames':report,'failures':bad,'seconds':time.monotonic()-start,
        'meshUVShapeKeysTexturesUnchanged':unchanged,'weightRepair':weight_record,'weightChanges':weight_changes,
        'actualChangedBaseVertices':len(changed),'unexpectedWeightChanges':unexpected,
        'originalRestRigUnchanged':rest_rig_unchanged,'boneCount':len(r.data.bones),
        'original':original,'current':current,'authoredJointLimits':bounds,
        'qualification':'Zero crossings do not establish visual/anatomical acceptance. Review multi-angle 1x video.'}
(out/'motion-source-dense.json').write_text(json.dumps(result,indent=2))
print('DENSE RESULT',len(report),'frames, failures',len(bad),'mesh integrity',unchanged,flush=True)
if bad or not unchanged or not rest_rig_unchanged or not weights_documented or unexpected or not all(c['withinAuthoringLimit'] for c in bounds):raise RuntimeError('Motion/integrity gate failed')
