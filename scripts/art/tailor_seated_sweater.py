"""Local pose-space wardrobe corrective; retains the real actor and garment.

The previous fitted key pulls the hem upward by 14 cm and leaves excess front
volume. Preserve the cuffs/shoulders; tailor the torso against the evaluated
native male skin, then invert the actual four-weight skinning for glTF.
"""
import bpy,sys,json,hashlib,math
from pathlib import Path
from mathutils import Matrix,Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from cinematic_geometry import getmesh

s=bpy.context.scene;s.frame_set(1);r=next(o for o in s.objects if o.type=='ARMATURE')
shirt=next(o for o in s.objects if 'fisherman' in o.name and not o.get('authoring_archive'))
ref=next(o for o in s.objects if o.get('cloth_reference'))
pants=next(o for o in s.objects if 'cargo' in o.name and not o.get('authoring_archive'))
chair=s.objects['old-chair'];keys=shirt.data.shape_keys
uv_before=hashlib.sha256(bytes(str([tuple(x.uv) for x in shirt.data.uv_layers.active.data]),'utf8')).hexdigest()
assert 'Cine · Tailored seated wool' not in keys.key_blocks
def smooth(x):
    x=max(0,min(1,x));return x*x*(3-2*x)
# The garment's clavicle weights dragged the thorax with the restrained arms,
# making a horizontal underarm ridge. Preserve shoulder/arm weights; redirect
# only the central thoracic panel to its anatomical spine bone.
weight_changes=0
for v in shirt.data.vertices:
    z=v.co.z;x=abs(v.co.x)
    influence=(1-smooth((x-.11)/.08))*smooth((z-1.13)/.07)*(1-smooth((z-1.34)/.09))
    if influence<=0:continue
    weights={shirt.vertex_groups[g.group].name:g.weight for g in v.groups}
    moved=0
    for name in ('clavicle_l','clavicle_r'):
        amount=weights.get(name,0)*influence
        if amount>1e-7:
            shirt.vertex_groups[name].add([v.index],weights[name]-amount,'REPLACE');moved+=amount
    if moved:
        shirt.vertex_groups['spine_03'].add([v.index],weights.get('spine_03',0)+moved,'REPLACE');weight_changes+=1
keys.animation_data_clear()
for k in keys.key_blocks:k.value=0
old=keys.key_blocks['Cine · Bound skin clearance'];old.value=1
bpy.context.view_layer.update();previous,_=getmesh(shirt)
old.value=0;bpy.context.view_layer.update();baseline,tris=getmesh(shirt)
# Full native skin is a hidden authoring reference, not a second rendered human.
mods={m:m.show_viewport for m in ref.modifiers}
for m in ref.modifiers:
    if m.type=='ARMATURE':m.show_viewport=True
bpy.context.view_layer.update()
skin=BVHTree.FromPolygons(*getmesh(ref),all_triangles=True)
trouser=BVHTree.FromPolygons(*getmesh(pants),all_triangles=True)
wood=BVHTree.FromPolygons(*getmesh(chair),all_triangles=True)
base=keys.key_blocks['Basis'];desired=[];region=[]
for i,v in enumerate(shirt.data.vertices):
    names={shirt.vertex_groups[g.group].name:g.weight for g in v.groups}
    torso=sum(w for n,w in names.items() if n in ('pelvis','spine_01','spine_02','spine_03'))
    mask=smooth((torso-.68)/.30)
    z=base.data[i].co.z
    waist=.38*mask*(1-smooth((z-1.06)/.12))
    p=previous[i].lerp(baseline[i],waist)
    chest=mask*smooth((z-1.06)/.12)*(1-smooth((z-1.38)/.10))
    if chest and p.y<.035:
        hit,normal,_,_=skin.ray_cast(Vector((p.x,-.5,p.z)),Vector((0,1,0)),.65)
        if hit and normal.y<-.25:
            # 12–18 mm of wool/ease over the real pectoral profile; no flat plane.
            target_y=hit.y-.006-.004*(1-min(1,abs(p.x)/.18))
            p.y+=(target_y-p.y)*chest*smooth((.04-p.y)/.10)
    region.append(mask)
    # Smooth ribbed hem above the trouser waistband, not a hanging central flap.
    hem=mask*(1-smooth((z-1.00)/.12))
    p.z+=(.655+(z-.94)*.8-p.z)*hem
    desired.append(p)
# Contact correction is local and minimal, not a globally inflated sweater.
adj=[set() for _ in baseline]
for e in shirt.data.edges:
    a,b=e.vertices;adj[a].add(b);adj[b].add(a)
for iteration in range(12):
    if iteration<5:
        delta=[p-q for p,q in zip(desired,baseline)]
        for i,ns in enumerate(adj):
            if region[i]>.01 and ns:
                mean=sum((delta[j] for j in ns),Vector())/len(ns)
                desired[i]+=(mean-delta[i])*(.25*region[i])
    for i,p in enumerate(desired):
        if region[i]<.01:continue
        for tree,gap in ((skin,.005),(wood,.002)):
            hit,normal,_,dist=tree.find_nearest(p)
            if hit is not None and dist<.08 and (p-hit).dot(normal)<gap:
                # Native reference includes inner surfaces; only local torso points.
                p+=normal*(gap-(p-hit).dot(normal))
new=shirt.shape_key_add(name='Cine · Tailored seated wool',from_mix=False)
world=shirt.matrix_world;to_arm=r.matrix_world.inverted()@world
from_arm=world.inverted()@r.matrix_world
for i,v in enumerate(shirt.data.vertices):
    weights=[(shirt.vertex_groups[g.group].name,g.weight) for g in v.groups if shirt.vertex_groups[g.group].name in r.data.bones]
    blend=Matrix(((0,0,0,0),)*4);total=sum(w for _,w in weights)
    for name,w in weights:blend+=(r.pose.bones[name].matrix@r.data.bones[name].matrix_local.inverted())*(w/total)
    new.data[i].co=base.data[i].co+(world@from_arm@blend@to_arm).to_3x3().inverted()@(desired[i]-baseline[i])
new.value=1
for m,on in mods.items():m.show_viewport=on
bpy.context.view_layer.update()
report={'source':bpy.data.filepath,'vertices':len(shirt.data.vertices),'uvSha256':uv_before,'thoracicWeightCorrections':weight_changes,'materialNames':[m.name for m in shirt.data.materials],
 'maxChangeVsOldMm':max((a-b).length for a,b in zip(desired,previous))*1000,'correction':'pose-space native male fit; no actor bone/mesh/UV replacement'}
out=Path.cwd()/'outputs/body-postfall';out.mkdir(exist_ok=True,parents=True)
(out/'tailoring.json').write_text(json.dumps(report,indent=2))
s['cinematic_export_stem']='intro-tailored-fall';s['tailored_native_wardrobe']=True
s.name='100gate | Native tailored fall · WIP'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(out/'intro-tailored-fall.blend'),compress=True)
print(json.dumps(report),flush=True)
