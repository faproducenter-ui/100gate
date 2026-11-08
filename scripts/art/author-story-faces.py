"""Add CC0 MPFB face shapes to the *existing* 100gate apartment actors.

Run in Blender with story-hero-home.blend or story-partner-home.blend open.
The original topology, materials, masks, source bodies and skeletal performance
remain intact. Runtime facial cues are layered separately on the exported shapes.
"""
import hashlib
import json
import math
import struct
import sys
from pathlib import Path
from zipfile import ZipFile

import bpy
from mathutils import Quaternion, Vector

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT.parent/"100gate-art-sources"
OUT=ROOT/"outputs/quality-overhaul/dialogue"
OUT.mkdir(exist_ok=True,parents=True)
P=bpy.context.scene
R=next(o for o in P.objects if o.type=="ARMATURE")
PARTNER=R.name=="StoryPartner"
assert PARTNER or R.name=="StoryHero",R.name
stem="story-partner-home-face" if PARTNER else "story-hero-home-face"
actor=R.name
meshes=[o for o in P.objects if o.type=="MESH" and any(m.type=="ARMATURE" and m.object==R for m in o.modifiers)]
body=max(meshes,key=lambda o:len(o.data.vertices))
eye=next(o for o in meshes if o.name in ("StoryPartner_Eyes","Alexei | original MakeHuman body.low-poly"))
assert len(body.data.vertices)==19158 and len(R.data.bones)==53
assert len(eye.data.vertices)==96
P.frame_set(P.frame_start)
bpy.context.view_layer.update()
created={}
metadata={"role":"Partner" if PARTNER else "Alexei","source":Path(bpy.data.filepath).name,
          "sourceSha256":hashlib.sha256(Path(bpy.data.filepath).read_bytes()).hexdigest(),
          "basisVertices":len(body.data.vertices),"bones":len(R.data.bones),"targets":{}}


def unpack():
    path=SOURCE/"story-face/faceunits01.zip"
    sha=hashlib.sha256(path.read_bytes()).hexdigest()
    assert sha=="d113107bd7eb59f3af4df6fc0ec29bfcc593f496d0b336aec14f086a80ce7146"
    metadata["faceunits"]={"sha256":sha,"source":"https://static.makehumancommunity.org/assets/assetpacks/faceunits01.html"}
    result={}
    with ZipFile(path) as z:
        catalog=json.loads(z.read("packs/faceunits01.json"))
        for name in ("eyeBlinkLeft","eyeBlinkRight","browInnerUp","jawOpen","mouthPucker"):
            entry=catalog[name]
            assert entry["license"]=="CC0"
            metadata["targets"][name]={"license":"CC0","author":entry["author"]}
            moves={}
            for line in z.read(f"targets/faceunits/{name}.target").decode().splitlines():
                fields=line.split()
                if not fields or fields[0][0] in ('#','"'):
                    continue
                i,x,z_,minus_y=fields
                # MPFB legacy target decimetres use x,z,-y, native body metres x,y,z.
                moves[int(i)]=.1*Vector((float(x),-float(minus_y),float(z_)))
            assert max(v.length for v in moves.values())<.065
            result[name]=moves
    return result


def add(obj,name,delta):
    if not delta or max(v.length for v in delta.values()) < .00002:
        return
    if not obj.data.shape_keys:
        obj.shape_key_add(name="Basis",from_mix=False)
    basis=obj.data.shape_keys.reference_key
    assert name not in obj.data.shape_keys.key_blocks
    k=obj.shape_key_add(name=name,from_mix=False)
    for i,d in delta.items():
        k.data[i].co=basis.data[i].co+d
    k.value=0
    created.setdefault(obj,[]).append(k)


def proxy_bind(path,expected):
    # Fit actual MHCLO attachments with their original direct/helper vertex
    # or barycentric references. Offsets of the attachments stay unchanged.
    text=path.read_text(encoding="utf8")
    assert "released as CC0" in text
    inside=False
    values=[]
    for line in text.splitlines():
        fields=line.split()
        if not fields or fields[0].startswith("#"):
            continue
        if fields[0]=="verts":
            inside=True
            continue
        if not inside:
            continue
        if not fields[0][0].isdigit():
            break
        if len(fields)==1:
            values.append(((int(fields[0]),1.),))
        else:
            assert len(fields)==9,(path,fields)
            weights=[float(w) for w in fields[3:6]]
            assert abs(sum(weights)-1)<.002,(path,fields)
            values.append(tuple(zip((int(i) for i in fields[:3]),weights)))
    assert len(values)==expected,(path,len(values),expected)
    return values


shapes=unpack()
for name,offsets in shapes.items():
    add(body,name,offsets)
if PARTNER:
    for part,subpath in (
        ("StoryPartner_Brows","eyebrows/eyebrow001/eyebrow001.mhclo"),
        ("StoryPartner_Lashes","eyelashes/eyelashes01/eyelashes01.mhclo"),
    ):
        obj=bpy.data.objects[part]
        bind=proxy_bind(SOURCE/"story-partner/system"/subpath,len(obj.data.vertices))
        to_proxy=obj.matrix_world.inverted().to_3x3()@body.matrix_world.to_3x3()
        for name,offsets in shapes.items():
            delta={i:to_proxy@sum((offsets.get(j,Vector())*w for j,w in row),Vector())
                   for i,row in enumerate(bind)}
            add(obj,name,delta)

# The source low-poly eyes are two separate fitted spherical shells in one
# object. Rotate each shell around its own measured rest centre, not the face
# origin. The tiny range stays well within the lids.
to_body=body.matrix_world.inverted()@eye.matrix_world
to_eye=to_body.inverted().to_3x3()
eye_groups=[[v for v in eye.data.vertices if side*(to_body@v.co).x>0] for side in (1,-1)]
assert [len(g) for g in eye_groups]==[48,48]
eyes_in_body={v.index:to_body@v.co for v in eye.data.vertices}
centers=[]
for group in eye_groups:
    v=[eyes_in_body[p.index] for p in group]
    center=(Vector(tuple(min(p[j] for p in v) for j in range(3)))+
            Vector(tuple(max(p[j] for p in v) for j in range(3))))*.5
    centers.append(center)
for name,axis,deg in (("gazeLeft",(0,0,1),5.0),("gazeRight",(0,0,1),-5.0),("gazeDown",(1,0,0),4.0)):
    rot=Quaternion(axis,math.radians(deg))
    delta={}
    for group,center in zip(eye_groups,centers):
        for vertex in group:
            rel=eyes_in_body[vertex.index]-center
            delta[vertex.index]=to_eye@(rot@rel-rel)
    assert max(v.length for v in delta.values())<.0025
    add(eye,name,delta)
    metadata["targets"][name]={"degrees":deg,"source":"original fitted MPFB eye shell rotation"}


def coords(obj):
    deps=bpy.context.evaluated_depsgraph_get()
    evaluated=obj.evaluated_get(deps)
    me=evaluated.to_mesh()
    points=[v.co.copy() for v in me.vertices]
    evaluated.to_mesh_clear()
    return points


def stage(original):
    arm=next(m for m in original.modifiers if m.type=="ARMATURE")
    assert arm.show_viewport
    arm.show_viewport=False
    bpy.context.view_layer.update()
    deps=bpy.context.evaluated_depsgraph_get()
    mesh=bpy.data.meshes.new_from_object(original.evaluated_get(deps),depsgraph=deps,preserve_all_data_layers=True)
    neutral=[v.co.copy() for v in mesh.vertices]
    deformed={}
    for key in created.get(original,[]):
        key.value=1
        bpy.context.view_layer.update()
        points=coords(original)
        key.value=0
        assert len(points)==len(neutral), (original.name,key.name,len(points),len(neutral))
        assert max((a-b).length for a,b in zip(neutral,points))>.00002
        deformed[key.name]=points
    arm.show_viewport=True
    obj=bpy.data.objects.new(actor+'_'+original.name.split('body')[-1].strip('. ') if 'body' in original.name else actor+'_'+original.name,mesh)
    P.collection.objects.link(obj)
    obj.parent=R
    obj.matrix_world=original.matrix_world
    for vg in original.vertex_groups:
        obj.vertex_groups.new(name=vg.name)
    skin=obj.modifiers.new("Native original weights","ARMATURE")
    skin.object=R
    assert any(v.groups for v in mesh.vertices)
    target_info={}
    for name,points in deformed.items():
        if not obj.data.shape_keys:
            obj.shape_key_add(name="Basis",from_mix=False)
        key=obj.shape_key_add(name=name,from_mix=False)
        moved=0
        for i,p in enumerate(points):
            if (p-neutral[i]).length > .000001:
                key.data[i].co=p
                moved+=1
        target_info[name]=moved
    return obj,target_info


def render_review():
    """Frontal proof only: no change to the authored story camera."""
    bpy.context.view_layer.update()
    deps=bpy.context.evaluated_depsgraph_get()
    eyes=eye.evaluated_get(deps)
    eye_world=sum((eyes.matrix_world@v.co for v in eyes.data.vertices),Vector())/len(eye.data.vertices)
    head=R.pose.bones["head"]
    world=R.matrix_world.to_3x3()@head.matrix.to_3x3()@head.bone.matrix_local.to_3x3().inverted()
    forward=(world@Vector((0,-1,0))).normalized()
    up=(world@Vector((0,0,1))).normalized()
    focus=eye_world-up*.019
    data=bpy.data.cameras.new("Face proof camera")
    camera=bpy.data.objects.new(data.name,data)
    P.collection.objects.link(camera)
    camera.location=focus+forward*.47+up*.015
    camera.rotation_euler=(focus-camera.location).to_track_quat("-Z","Y").to_euler()
    camera.data.lens=59
    P.camera=camera
    P.world=bpy.data.worlds.new("Face proof ambient")
    P.world.use_nodes=True
    P.world.node_tree.nodes["Background"].inputs["Strength"].default_value=.42
    l=bpy.data.lights.new("Face proof area","AREA")
    light=bpy.data.objects.new(l.name,l)
    P.collection.objects.link(light)
    light.location=camera.location+up*.24
    light.rotation_euler=(focus-light.location).to_track_quat("-Z","Y").to_euler()
    l.energy=27;l.size=.44
    P.render.engine="CYCLES"
    P.cycles.samples=9
    P.cycles.use_denoising=True
    P.render.resolution_x=415;P.render.resolution_y=470
    P.render.resolution_percentage=100
    for label,weight in (
        ("neutral",{}),
        ("blink",{"eyeBlinkLeft":1.,"eyeBlinkRight":1.}),
        ("speak",{"jawOpen":.28,"mouthPucker":.16,"browInnerUp":.25,"gazeDown":.42}),
    ):
        for keys in created.values():
            for k in keys:k.value=weight.get(k.name,0.)
        bpy.context.view_layer.update()
        P.render.filepath=str(OUT/f"{stem}-{label}.png")
        bpy.ops.render.render(write_still=True)


P["FacialStudy"]="Original native casts, CC0 MPFB morphs, original fitted MHCLO face accessories"
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(stem+".blend")),compress=True)
if "--proof" in sys.argv:
    render_review()
    for keys in created.values():
        for k in keys:k.value=0
    bpy.context.view_layer.update()
staged=[stage(original) for original in meshes]
metadata["runtimeMeshes"]={obj.name:info for obj,info in staged if info}
assert all(name in set().union(*(set(i) for _,i in staged)) for name in metadata["targets"])
for image in bpy.data.images:
    if image.type=="IMAGE" and max(image.size)>1024:
        w,h=image.size
        image.scale(round(w*1024/max(w,h)),round(h*1024/max(w,h)))
        image.pixels[0]=image.pixels[0]
bpy.ops.object.select_all(action="DESELECT")
for obj in [R,*(o for o,_ in staged)]:obj.select_set(True)
bpy.context.view_layer.objects.active=R
target=OUT/(stem+".glb")
bpy.ops.export_scene.gltf(filepath=str(target),use_selection=True,
    export_animations=True,export_animation_mode="SCENE",export_anim_scene_split_object=False,
    export_anim_slide_to_zero=True,export_force_sampling=True,export_frame_range=True,
    export_rest_position_armature=True,export_skins=True,export_morph=True,
    export_morph_normal=True,export_try_sparse_sk=True,export_try_omit_sparse_sk=True,
    export_tangents=True,export_cameras=False,export_extras=True,
    export_image_format="JPEG",export_jpeg_quality=88)
data=target.read_bytes()
gltf=json.loads(data[20:20+struct.unpack_from("<I",data,12)[0]])
assert len(gltf["animations"])==1
target_names={n for m in gltf["meshes"] for n in m.get("extras",{}).get("targetNames",[])}
assert target_names==set(metadata["targets"]),(target_names,metadata["targets"])
metadata["export"]={"bytes":len(data),"sha256":hashlib.sha256(data).hexdigest(),"animations":1,"names":sorted(target_names)}
(OUT/(stem+".json")).write_text(json.dumps(metadata,indent=2)+"\n",encoding="utf8")
print("FACE_GLTF_EXPORTED",stem,metadata["export"],flush=True)
