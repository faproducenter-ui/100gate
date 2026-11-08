"""Fit localized sleeve correctives to the already animated native skin.

Run in Blender on outputs/story-intro/escape/story-upright-escape.blend.
The authored poses, chair, body mesh, cuffs and baseline files stay intact.
"""
import hashlib
import json
import runpy
import struct
import sys
from collections import defaultdict
from pathlib import Path
from types import SimpleNamespace

import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

A = SimpleNamespace(**runpy.run_path(str(Path(__file__).with_name("audit-story-sleeves.py"))))
s,r,shirt,body = A.SCENE,A.RIG,A.SWEATER,A.BODY
out = A.OUT
assert Path(bpy.data.filepath).resolve() == (Path.cwd()/"outputs/story-intro/escape/story-upright-escape.blend").resolve()
assert s.render.fps == 48
keys = shirt.data.shape_keys
assert keys and not keys.animation_data
base = keys.reference_key


def uv_digest(obj):
    uv = obj.data.uv_layers.active
    return hashlib.sha256(b"".join(struct.pack("<2f", *v.uv) for v in uv.data)).hexdigest()


uv_before = uv_digest(shirt)
regions = {side: tuple(A.side_indices(o, side, .52) for o in (body,shirt)) for side in "lr"}
neighbors = [set() for _ in shirt.data.vertices]
for edge in shirt.data.edges:
    a,b = edge.vertices
    neighbors[a].add(b)
    neighbors[b].add(a)

# This original high-poly garment is already split for UVs. Weld only the
# corrective offsets at exact co-located points; do not touch topology/UVs.
seams = defaultdict(list)
for v in shirt.data.vertices:
    seams[tuple(round(p,6) for p in base.data[v.index].co)].append(v.index)
for indices in seams.values():
    if len(indices)>1:
        for i in indices:
            neighbors[i].update(j for j in indices if j!=i)

blend_map = []
regional_mask = []
for v in shirt.data.vertices:
    influences = sorted(((g.weight, shirt.vertex_groups[g.group].name)
                         for g in v.groups if shirt.vertex_groups[g.group].name in r.data.bones),
                        reverse=True)
    blend_map.append(influences)
    names = {name:w for w,name in influences}
    regional_mask.append(max(
        min(1., 2.7*min(names.get("upperarm_"+side,0), names.get("lowerarm_"+side,0)))
        + .55*min(1., 2.7*min(names.get("upperarm_"+side,0), names.get("clavicle_"+side,0)))
        + .6*min(1., 2.7*min(names.get("lowerarm_"+side,0), names.get("hand_"+side,0)))
        for side in "lr"
    ))
assert all(blend_map), "The native wardrobe must be fully skinned"
deform = next(m for m in shirt.modifiers if m.type=="ARMATURE")


def fit(sec):
    (sv, st), (original, gt) = A.load_pose(sec)
    deform.use_deform_preserve_volume=True
    bpy.context.view_layer.update()
    dq, _ = A.evaluated(shirt,bpy.context.evaluated_depsgraph_get())
    deform.use_deform_preserve_volume=False
    bpy.context.view_layer.update()
    # Preserve volume only around the original mixed-weight elbows, wrists
    # and shoulders. This resolves the LBS collapse rather than inflating
    # whole limbs. Bake the difference back onto the usual glTF linear rig.
    alpha = min(1., max(0., (sec-10.2)/.85))
    alpha = alpha*alpha*(3.-2.*alpha)
    gv = [p.lerp(q,min(1.,m)*alpha) for p,q,m in zip(original,dq,regional_mask)]
    world_offsets = {}
    stats = {}
    for side, (skin_ids, wool_ids) in regions.items():
        skin_tris = [t for t in st if len(skin_ids.intersection(t)) >= 2]
        wool_tris = [t for t in gt if len(wool_ids.intersection(t)) >= 2]
        skin_tree = BVHTree.FromPolygons(sv,skin_tris,all_triangles=True)
        wool_tree = BVHTree.FromPolygons(gv,wool_tris,all_triangles=True)
        overlap = skin_tree.overlap(wool_tree)
        seeds = {i for _,f in overlap for i in wool_tris[f]}
        originals = len(skin_tree.overlap(BVHTree.FromPolygons(original,wool_tris,all_triangles=True)))
        if not seeds:
            stats[side] = {"intersectionsBefore":originals,"intersectionsAfterVolume":0,
                           "intersectionsAfter":0,"vertices":0}
            continue

        # Restrict work to a geodesic patch around actual crossings. Expand
        # through the dense original mesh, letting neighboring fabric move
        # together as pressure falls off toward untouched knit.
        active = set(seeds)
        for _ in range(8):
            active |= {j for i in active for j in neighbors[i] if j in wool_ids}
        interior = {i for i in active if neighbors[i].issubset(active)}
        faces = [t for t in wool_tris if all(i in active for i in t)]
        delta = {i:Vector() for i in active}
        coords = {i:gv[i].copy() for i in active}

        def pressure(p, limit=.034):
            q,n,_,distance = skin_tree.find_nearest(p,limit)
            if q is None:
                return None
            signed = (p-q).dot(n)
            return n*min(.031,.0027-signed) if signed < .0027 else None

        for iteration in range(9):
            if iteration < 7:
                smooth = {}
                for i in interior:
                    ns = neighbors[i]
                    if ns:
                        mean = sum((delta[j] for j in ns),Vector())/len(ns)
                        smooth[i] = delta[i].lerp(mean,.26)
                delta.update(smooth)
                for i in active:
                    coords[i] = gv[i]+delta[i]
            for i in active:
                push = pressure(coords[i])
                if push is not None:
                    delta[i] += push
                    coords[i] += push
            # Surface constraints also test the triangle center; moving the
            # triangle's vertices just clear of skin is not enough at a bend.
            accum = defaultdict(Vector)
            votes = defaultdict(int)
            for tri in faces:
                a,b,c = (coords[i] for i in tri)
                for p,ids in (((a+b+c)/3,tri),((a+b)*.5,tri[:2]),
                              ((a+c)*.5,(tri[0],tri[2])),((b+c)*.5,tri[1:])):
                    push = pressure(p)
                    if push is not None:
                        for i in ids:
                            accum[i] += push
                            votes[i] += 1
            for i,push in accum.items():
                delta[i] += push/votes[i]
            for i in active:
                if delta[i].length > .039:
                    delta[i] = delta[i].normalized()*.039
                coords[i] = gv[i]+delta[i]

        # Fair the residual projection across the knitted surface. Without
        # this, individually projected triangles can spike where the inner
        # elbow changes to the outer side at maximum flexion.
        for _ in range(10):
            smooth={}
            for i in active:
                ns=neighbors[i]
                if ns:
                    smooth[i]=delta[i].lerp(sum((delta.get(j,Vector()) for j in ns),Vector())/len(ns),.58)
            delta.update(smooth)
        for ids in seams.values():
            if len(ids)>1 and any(i in delta for i in ids):
                avg = sum((delta.get(i,Vector()) for i in ids),Vector())/len(ids)
                for i in ids:
                    delta[i] = avg
        for i,d in delta.items():
            if d.length > .00003 and (i not in world_offsets or d.length > world_offsets[i].length):
                world_offsets[i] = d
        after = gv.copy()
        for i,d in delta.items():
            after[i] = gv[i]+d
        left = len(skin_tree.overlap(BVHTree.FromPolygons(after,wool_tris,all_triangles=True)))
        stats[side] = {"intersectionsBefore":originals,"intersectionsAfterVolume":len(overlap),
                       "intersectionsAfter":left,"vertices":len(active)}

    for i,(p,q) in enumerate(zip(gv,original)):
        d=p-q
        if d.length>.00003:
            world_offsets[i]=world_offsets.get(i,Vector())+d

    if not world_offsets:
        return None,stats
    arm_world,mesh_world = r.matrix_world.copy(),shirt.matrix_world.copy()
    into = arm_world.inverted()@mesh_world
    skin_matrix = {p.name:(p.matrix@p.bone.matrix_local.inverted()) for p in r.pose.bones}
    key = shirt.shape_key_add(name=f"Upright sleeve collision fit {sec:05.2f}s",from_mix=False)
    for i,d in world_offsets.items():
        influences = blend_map[i]
        total = sum(w for w,_ in influences)
        skin = Matrix(((0.,0.,0.,0.),)*4)
        for w,name in influences:
            skin += skin_matrix[name]*(w/total)
        inv = (arm_world@skin@into).to_3x3().inverted_safe()
        key.data[i].co = base.data[i].co+inv@d
    key.value = 0
    stats["maxLocalFitMm"] = round(max(d.length for d in world_offsets.values())*1000,2)
    return key,stats


# Bound pose uses its original physical fit and has no crossings. Denser
# support samples cover the quick elbow fold on the way down/up to the floor.
times = [10.15,10.4,10.65,10.8,10.96,11.15,11.30,11.45,11.59,11.82,
         12.95,13.24,13.55,14.15,15.5,17.0,17.28,17.58,17.73,17.9,18.12,
         18.36,18.60,19.05,19.7,21.2,21.66,22.3,22.82,23.2]
if "--fast" in sys.argv:
    times = [11.45,11.82,14.15,17.9,23.2]
fits = []
for sec in times:
    key,stats = fit(sec)
    fits.append((sec,key))
    print("FIT",sec,stats,flush=True)

for idx,(sec,key) in enumerate(fits):
    if key is None:
        continue
    for t,w in ((fits[idx-1][0] if idx else 9.8,0),
                (sec,1),
                (fits[idx+1][0] if idx+1<len(fits) else sec,0)):
        if t == sec and w == 0:
            continue
        key.value = w
        key.keyframe_insert("value",frame=s.frame_start+t*s.render.fps,group="Upright native sleeve fitting")
for action in [keys.animation_data.action]:
    for slot in action.slots:
        for layer in action.layers:
            for strip in layer.strips:
                bag = strip.channelbag(slot)
                if bag:
                    for curve in bag.fcurves:
                        for p in curve.keyframe_points:
                            p.interpolation = "LINEAR"
s.frame_set(s.frame_start)
assert uv_digest(shirt)==uv_before
s["UprightSleeveStudy"] = "Localized fit after original skin deformation; Blender, WebGL use the same native clip"
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(out/"story-upright-escape.blend"),compress=True)
if "--export" not in sys.argv:
    sys.exit(0)

# Keep visible torso fit, discard only the old zero-valued *fall*-pose keys
# from the runtime copy. Editable .blend above retains all original keys.
for key in list(keys.key_blocks):
    if key.name.startswith("Cine · ") and key.name != "Cine · Bound skin clearance":
        assert not key.value
        shirt.shape_key_remove(key)
for image in bpy.data.images:
    if image.type=="IMAGE" and max(image.size)>1024:
        w,h = image.size
        image.scale(round(w*1024/max(w,h)),round(h*1024/max(w,h)))
        image.pixels[0] = image.pixels[0]
path = out/"story-upright-escape.glb"
bpy.ops.export_scene.gltf(filepath=str(path),export_animations=True,export_animation_mode="SCENE",
    export_anim_scene_split_object=False,export_force_sampling=True,export_frame_range=True,
    export_rest_position_armature=True,export_cameras=True,export_morph=True,export_skins=True,
    export_tangents=True,export_morph_normal=False,export_try_sparse_sk=True,export_try_omit_sparse_sk=True,
    export_image_format="JPEG",export_jpeg_quality=90,export_extras=True)
data=path.read_bytes()
gltf=json.loads(data[20:20+struct.unpack_from("<I",data,12)[0]])
assert len(gltf["animations"])==1
assert all(any(n["name"]==f"StoryEscape_{name}" for n in gltf["nodes"])
           for name in ("Knife","Chair","RightCutContact","Eye"))
(out/"export-sleeves.json").write_text(json.dumps({"bytes":len(data),"animations":len(gltf["animations"]),
    "correctiveKeys":sum(k is not None for _,k in fits),"nativeBones":len(r.data.bones),"uvSha256":uv_before,
    "sha256":hashlib.sha256(data).hexdigest()},indent=2),encoding="utf-8")
print("UPRIGHT_SLEEVE_VARIANT_EXPORTED",flush=True)
