"""Finish the final step on the exact captured 100gate skeleton.

Open the mocap walk .blend in background Blender and run this script. Bake
three terminal phases into a tiny bone-only clip for the existing web skin.
"""
import json
import math
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0,str(Path(__file__).resolve().parent))
from native_pose_tools import set_pose_matrix,two_bone_ik
from story_actor_tools import actor_meshes,export_actor,pose_relaxed
from importlib import import_module
Shoe=import_module("author-story-walk-mocap").Shoe

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/"outputs/quality-overhaul/stop"
OUT.mkdir(parents=True,exist_ok=True)
S=bpy.context.scene
rig=next(o for o in S.objects if o.type=="ARMATURE")
meshes=actor_meshes(rig)
boot=next(o for o in meshes if "ankle_boot" in o.name)
bones={p.name:p for p in rig.pose.bones}
assert len(bones)==53
update=bpy.context.view_layer.update
shoes={side:Shoe(rig,boot,side) for side in "lr"}
plan=[("stop-0",0., "l"),("stop-80",.8,"r"),("stop-95",.95,"r")]
FPS=60
FRAMES=33


def ease(u):
    u=max(0,min(1,u))
    return u*u*(3-2*u)


def capture():
    return {p.name:(p.location.copy(),p.rotation_quaternion.copy()) for p in bones.values()}


def foot(side):
    b=bones["foot_"+side]
    return b.head.copy(),b.matrix.to_quaternion()


starts={}
for key,phase,support in plan:
    f=1+phase*FPS
    S.frame_set(int(f),subframe=f%1)
    starts[key]=(capture(),{s:foot(s) for s in "lr"},bones["pelvis"].head.copy())
rig.animation_data_clear()
for p in bones.values():
    p.matrix_basis=Matrix.Identity(4)
update()
pose_relaxed(rig,0)
neutral=capture()
rest_z=bones["pelvis"].head.z


def grounded(shoe,flat,xy):
    rel=flat.to_matrix()@shoe.rest.to_3x3().inverted()
    p=Vector(xy)
    p.z=-min((rel@v).z for v in shoe.sole)
    return p


for i,(key,phase,support) in enumerate(plan):
    S.timeline_markers.new(key,frame=1+i*FPS)
    initial,feet,pelvis0=starts[key]
    swing="r" if support=="l" else "l"
    planted,rot0=feet[support]
    p0,q0=feet[swing]
    shoe,other=shoes[support],shoes[swing]
    rel0=rot0.to_matrix()@shoe.rest.to_3x3().inverted()
    pitch=(rel0@Vector((0,-1,0))).z
    flat={s:(shoes[s].rotation(0)@shoes[s].rest.to_3x3()).to_quaternion() for s in "lr"}
    point=(shoe.heel if pitch>=-.012 else shoe.toe)-shoe.rest.translation
    locked=planted+rel0@point
    plant_flat=locked-(flat[support].to_matrix()@shoe.rest.to_3x3().inverted())@point
    swing_end=grounded(other,flat[swing],(other.center_x,plant_flat.y+.12,0))
    idle_y=.5*(plant_flat.y+swing_end.y)+.015
    print(key,"plant",support,"from",list(p0),"to",list(swing_end),flush=True)
    prior={}
    for f in range(FRAMES+1):
        frame=1+i*FPS+f
        S.frame_set(frame)
        u=f/FRAMES
        blend=ease(u)
        for p in bones.values():
            l,q=initial[p.name]
            L,Q=neutral[p.name]
            p.location=l.lerp(L,blend)
            p.rotation_quaternion=q.slerp(Q,blend)
        update()
        if f:
            q=rot0.slerp(flat[support],ease(u/.63))
            rel=q.to_matrix()@shoe.rest.to_3x3().inverted()
            anchor=locked-rel@point
            v=ease(u/.84)
            q_swing=q0.slerp(flat[swing],v)
            p=p0.lerp(swing_end,v)
            p.z=max(p.z,grounded(other,q_swing,p).z)+.028*math.sin(math.pi*v)**1.3
            targets={support:(anchor,q),swing:(p,q_swing)}
            pelvis=bones["pelvis"]
            # Weight first follows the supporting boot, then distributes across
            # the final stagger. Hip height is constrained by both leg reaches.
            desired=pelvis0.lerp(Vector((0,idle_y,rest_z+.045)),blend)
            desired.x+=shoe.sign*.024*math.sin(math.pi*u)
            dz_limit=[]
            for side,(goal,_) in targets.items():
                thigh=bones["thigh_"+side]
                calf=bones["calf_"+side]
                offset=thigh.head-pelvis.head
                delta=desired+offset-goal
                reach=(thigh.bone.length+calf.bone.length)*.992
                dz_limit.append(goal.z-offset.z+math.sqrt(max(0,reach*reach-delta.x**2-delta.y**2)))
            desired.z=min(desired.z,*dz_limit)
            set_pose_matrix(pelvis,Matrix.Translation(desired-pelvis.head)@pelvis.matrix)
            update()
            for side,(goal,orient) in targets.items():
                root=bones["thigh_"+side].head
                two_bone_ik(rig,side,goal,root+Vector((.04*shoes[side].sign,-.7,.03)),
                            orient.to_matrix(),kind="leg",align_hinge=True)
        for p in bones.values():
            q=p.rotation_quaternion
            if p.name in prior and q.dot(prior[p.name])<0:p.rotation_quaternion=-q
            prior[p.name]=p.rotation_quaternion.copy()
            p.keyframe_insert("location",frame=frame,group=p.name)
            p.keyframe_insert("rotation_quaternion",frame=frame,group=p.name)

S.frame_start=1
S.frame_end=1+2*FPS+FRAMES
S.render.fps=FPS
for layer in rig.animation_data.action.layers:
    for strip in layer.strips:
        for bag in strip.channelbags:
            for curve in bag.fcurves:
                for key in curve.keyframe_points:key.interpolation="LINEAR"
S.frame_set(1)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/"story-hero-stops.blend"))
export_actor(rig,meshes,OUT/"author-export.glb","StoryHeroWalk")

data=(OUT/"author-export.glb").read_bytes()
size=struct.unpack_from("<I",data,12)[0]
glb=json.loads(data[20:20+size])
binary=28+size
animation=glb["animations"][0]
def floats(index):
    a=glb["accessors"][index];b=glb["bufferViews"][a["bufferView"]]
    assert a["componentType"]==5126 and "byteStride" not in b
    width={"SCALAR":1,"VEC3":3,"VEC4":4}[a["type"]]
    return list(struct.unpack_from("<"+"f"*(a["count"]*width),data,
        binary+b.get("byteOffset",0)+a.get("byteOffset",0)))


tracks=[]
for ch in animation["channels"]:
    target=ch["target"]
    name=glb["nodes"][target["node"]]["name"]
    path=target["path"]
    if name not in bones or path not in ("translation","rotation"):continue
    s=animation["samplers"][ch["sampler"]]
    interpolation=s.get("interpolation","LINEAR")
    assert interpolation in ("LINEAR","STEP")
    tracks.append({"name":name+(".position" if path=="translation" else ".quaternion"),
        "type":"vector" if path=="translation" else "quaternion",
        "times":floats(s["input"]),"values":floats(s["output"]),
        "interpolation":2300 if interpolation=="STEP" else 2301})
assert len(tracks)>=90 and any(t["name"]=="pelvis.position" for t in tracks)
(OUT/"story-hero-stops.json").write_text(json.dumps({"name":"100gate terminal steps","duration":2.55,
    "tracks":tracks},separators=(",",":"))+"\n",encoding="utf-8")
print("EXPORTED",len(tracks),"native bone tracks",flush=True)
