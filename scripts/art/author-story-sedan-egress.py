"""Bake native MPFB rear-seat exits in the source sedan's metric coordinates.

Run from repo:
  blender -b art/character-mpfb-review.blend -t 3 --python-exit-code 1 \
    --python scripts/art/author-story-sedan-egress.py -- --side L
Use --side R for the independently timed far door. Optional --review creates
a separate Blender scene with the matching car and several poses for inspection.
"""
import argparse
import json
import math
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "outputs/quality-overhaul/egress"
FPS = 30
END = 66
OPEN = 1.55
Z = Vector((0, 0, 1))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from native_pose_tools import set_pose_matrix, two_bone_ik
from story_actor_tools import actor_meshes, clear_pose, export_actor, floor_offset


def fade(t):
    t = min(1., max(0., t))
    return t*t*(3-2*t)


def curves(keys, t):
    """Monotone Hermite: follow through internal pose markers without a stop."""
    for index, ((a, p), (b, q)) in enumerate(zip(keys, keys[1:])):
        if t <= b:
            u=min(1.,max(0.,(t-a)/(b-a)))
            v=1.-u
            def tangent(i, axis):
                if not 0<i<len(keys)-1:
                    return 0.
                t0,x=keys[i-1]; t1,y=keys[i]; t2,z=keys[i+1]
                h0,h1=t1-t0,t2-t1
                m0,m1=(y[axis]-x[axis])/h0,(z[axis]-y[axis])/h1
                if m0*m1<=0:
                    return 0.
                w0,w1=2*h1+h0,h1+2*h0
                return (w0+w1)/(w0/m0+w1/m1)
            return Vector([v*v*(1+2*u)*x+u*u*(3-2*u)*y+(b-a)*(
                    u*v*v*tangent(index,i)-u*u*v*tangent(index+1,i))
                    for i,(x,y) in enumerate(zip(p,q))])
    return Vector(keys[-1][1])


def bounded_target(rig, side, target, kind):
    upper, lower = ("upperarm_", "lowerarm_") if kind == "arm" else ("thigh_", "calf_")
    a, b = rig.pose.bones[upper+side], rig.pose.bones[lower+side]
    head = rig.matrix_world @ a.head
    delta = target-head
    reach = a.length+b.length
    length = min(reach*.992, max(abs(a.length-b.length)+.022, delta.length))
    return head + delta.normalized()*length, (target-(head+delta.normalized()*length)).length


def rest_orientation(rig, bone, yaw):
    return Quaternion(Z, yaw).to_matrix() @ rig.data.bones[bone].matrix_local.to_3x3()


def authored_sample(rig, t, side, floor, sole):
    sign = -1 if side == "L" else 1
    lead = side.lower()
    trail = "r" if lead == "l" else "l"
    # The actors turn in opposite directions, with a slight offset in the far
    # actor's anticipation. The active foot then crosses the actual sill.
    if sign > 0:
        t = min(END/FPS, max(0., t-.055+.055*fade(t/1.8)))
    pelvis, heading = curves([
        (0., (.650, .406, .758)), (.43, (.648, .431, .752)),
        (.76, (.648, .583, .721)), (1.00, (.664, .769, .692)),
        (1.16, (.748, .912, .700)), (1.39, (.754, 1.100, .761)), (1.62, (.757, 1.286, .810)),
        (2.07, (.750, 1.393, .909)), (2.20, (.750, 1.393, .909)),
    ], t), curves([
        (0., (0, 48)), (.32, (0, 48)), (.66, (.76, 55)),
        (.95, (1, 68)), (1.35, (1, 62)), (1.64, (1, 39)),
        (2.08, (1, 4)), (2.20, (1, 4)),
    ], t)
    pelvis.y *= sign
    if side=="R":
        # The MPFB rest body is slightly asymmetric; allow the far cheek to
        # pass aft of the glass seal on that side before loading the sill.
        pelvis.x -= .030*fade((t-.39)/.11)*(1-fade((t-.65)/.10))
        pelvis.x -= .029*fade((t-.64)/.075)*(1-fade((t-.75)/.10))
    # Pass the interior card rather than swinging the trailing thigh along it.
    pelvis.x += .045*fade((t-1.01)/.14)*(1-fade((t-1.29)/.17))
    yaw = -math.pi/2 - sign*heading.x*math.pi/2
    azimuth = Quaternion(Z, yaw)
    rest_hip = rig.data.bones["pelvis"].head_local
    translation = pelvis-azimuth@rest_hip
    rig.matrix_world = Matrix.Translation(translation) @ azimuth.to_matrix().to_4x4()
    for b in rig.pose.bones:
        b.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()

    # Pelvis remains above the cushion; sequential spine lean ducks the head
    # under the flange before the load moves over the road foot.
    lean = math.radians(heading.y)
    for name, amount in (("spine_01", .62), ("spine_02", .26), ("spine_03", .12)):
        p = rig.pose.bones[name]
        axis = p.bone.matrix_local.to_3x3().inverted() @ Vector((1,0,0))
        p.rotation_quaternion = Quaternion(axis, lean*amount)
    neck = rig.pose.bones["neck_01"]
    axis = neck.bone.matrix_local.to_3x3().inverted() @ Vector((1,0,0))
    neck.rotation_quaternion = Quaternion(axis, -min(.28, lean*.28))
    # Clear the glazing with a small independent neck tilt, without moving the
    # pelvis back through the cushion. Rotation is expressed in the native rig.
    lean_away=fade((t-.48)/.07)*(1-fade((t-.60)/.13))
    away_axis=neck.bone.matrix_local.to_3x3().inverted()@(azimuth.inverted()@Vector((0,1,0)))
    neck.rotation_quaternion @= Quaternion(away_axis,(.50 if side=="R" else .22)*lean_away)
    bpy.context.view_layer.update()

    lead_path = [
        (0, (.236, .558, .412, 0)), (.39, (.236, .558, .412, 0)),
        (.63, (.680, .568, .508, .56)), (.82, (.897, .830, .517, .98)),
        (1.00, (.907, 1.210, .282, 1)), (1.16, (.907, 1.342, floor, 1)),
        (2.20, (.907, 1.342, floor, 1))]
    trail_path = [
        (0, (.235, .249, .412, 0)), (.70, (.235, .249, .412, 0)),
        (.89, (.467, .400, .532, .29)), (1.10, (.642, .620, .527, .64)),
        (1.34, (.700, .945, .513, .92)),
        (1.63, (.579, 1.465, floor, 1)), (2.20, (.579, 1.465, floor, 1))]
    clamps = []
    feet = {}
    for foot, keys in ((lead, lead_path), (trail, trail_path)):
        v = curves(keys, t)
        if foot==trail:
            v.x+=.055*fade((t-.99)/.17)*(1-fade((t-1.33)/.20))
        ankle = Vector((v.x, sign*v.y, v.z + sole[foot]))
        yaw_foot = -math.pi/2 - sign*v.w*math.pi/2
        ahead = azimuth@Vector((0,-1,0))
        lateral = azimuth@Vector((1 if foot=="l" else -1,0,0))
        lift = fade((t-.52)/.22)*(1-fade((t-1.12)/.19))
        knee = pelvis + ahead*(.62-.10*lift) + lateral*.09 + Vector((0,0,-.23+.46*lift))
        if foot==trail:
            # With the near foot already outside, the trailing shin points
            # back into the car. An outward-only pole in that pose flips the
            # knee toward the head. Steer explicitly around the true IK
            # circle, with continuous angular velocity through the sill.
            knee = pelvis+ahead*.62+lateral*.09+Vector((0,0,-.23))
            swivel=fade((t-.64)/.08)*(1-fade((t-1.45)/.16))
            if swivel>0:
                hip=rig.matrix_world@rig.pose.bones["thigh_"+foot].head
                axis=(ankle-hip).normalized()
                e1=(Vector((-1,0,0))+axis*axis.x).normalized()
                e2=axis.cross(e1)
                bend=curves([(a,(v,0)) for a,v in [
                    (.64,-61),(.72,-51),(.79,-16),(.85,-2),(1.04,0),
                    (1.12,-13),(1.18,-37),(1.25,-64),(1.33,-91),
                    (1.40,-90),(1.55,-94),(1.61,-95),
                ]],t).x
                phi=math.radians(-sign*bend)
                wanted=e1*math.cos(phi)+e2*math.sin(phi)
                default=knee-hip
                default=(default-axis*default.dot(axis)).normalized()
                knee=hip+default.lerp(wanted,swivel).normalized()
        goal, error = bounded_target(rig,foot,ankle,"leg")
        clamps.append(error)
        feet[foot] = goal
        two_bone_ik(rig, foot, goal, knee, rest_orientation(rig,"foot_"+foot,yaw_foot),
                    kind="leg", align_hinge=True)
    bpy.context.view_layer.update()

    for hand in "lr":
        s = 1 if hand=="l" else -1
        stance = rig.matrix_world @ Vector((s*.224,-.03,.943))
        thigh = feet[hand].lerp(pelvis, .55)
        thigh.z += .28 if hand==lead else .22
        squeeze=fade((t-.48)/.29)*(1-fade((t-1.2)/.32))
        thigh += azimuth@Vector((s*(.10-.070*squeeze), -.09, 0))
        settle = fade((t-1.37)/.64)
        target = thigh.lerp(stance,settle)
        pole = rig.matrix_world@Vector((s*(.38-.085*squeeze),.08,1.14))
        if side=="R" and hand==lead:
            pole.x -= .050*fade((t-.59)/.07)*(1-fade((t-.78)/.12))
        orientation = rest_orientation(rig,"hand_"+hand,yaw)
        hand_direction = (azimuth@Vector((s*.08,-.34,-1.0))).normalized()
        orientation = (orientation@Vector((0,1,0))).rotation_difference(hand_direction).to_matrix()@orientation
        goal, _ = bounded_target(rig,hand,target,"arm")
        two_bone_ik(rig,hand,goal,pole,orientation)
        for idx,finger in enumerate(("index","middle","ring","pinky")):
            for j in (1,2,3):
                p=rig.pose.bones[f"{finger}_{j:02}_{hand}"]
                p.rotation_quaternion=Quaternion((1,0,0), math.radians((5+idx*3)*[1,.76,.37][j-1]))
    bpy.context.view_layer.update()
    return max(clamps), feet, pelvis, yaw


def bake(side, pose_only=False):
    scene=bpy.context.scene
    rig=next(o for o in scene.objects if o.type=="ARMATURE")
    meshes=actor_meshes(rig)
    assert len(rig.data.bones)==53 and len(meshes)==5
    clear_pose(rig)
    for o in list(scene.objects):
        if o not in [rig,*meshes]:
            bpy.data.objects.remove(o,do_unlink=True)
    rig.name="SedanEgress_"+side
    rig["door"]=side
    rig["source"]="Original 100gate MPFB actor; IK staged against the Innerscene rear aperture"
    rig["coordinateContract"]="Direct child of StorySedan.model; authored sedan model space"
    scene.render.fps=FPS
    scene.frame_start=1
    scene.frame_end=1+END
    scene.name="Sedan rear exit | "+side
    floor=.002
    foot_offset=floor_offset(meshes)
    sole={s:rig.data.bones["foot_"+s].head_local.z+foot_offset for s in "lr"}
    max_clamp=0
    frames=[]
    old={}
    visibility=[(o,o.hide_viewport) for o in meshes]
    for obj,_ in visibility:
        obj.hide_viewport=True
    for frame in range(1, 2+END):
        scene.frame_set(frame)
        time=(frame-1)/FPS
        error, feet, pelvis, yaw=authored_sample(rig,time,side,floor,sole)
        max_clamp=max(max_clamp,error)
        for obj in (rig,*rig.pose.bones):
            q=obj.rotation_quaternion
            if obj.name in old and q.dot(old[obj.name])<0:
                obj.rotation_quaternion=-q
            old[obj.name]=obj.rotation_quaternion.copy()
            obj.keyframe_insert("location",frame=frame,group=obj.name)
            obj.keyframe_insert("rotation_quaternion",frame=frame,group=obj.name)
        frames.append({"time":time,"root":list(rig.location),"yawBlender":yaw,
                       "feet":{s:list(v) for s,v in feet.items()},"pelvis":list(pelvis),
                       "knees":{s:list(rig.matrix_world@rig.pose.bones["calf_"+s].head) for s in "lr"},
                       "headBone":list(rig.matrix_world@rig.pose.bones["head"].head),
                       "maxLegClamp":error})
    for obj,hidden in visibility:
        obj.hide_viewport=hidden
    action=rig.animation_data.action
    action.name=rig.name
    for bag in action.layers[0].strips[0].channelbags:
        for curve in bag.fcurves:
            for key in curve.keyframe_points:
                key.interpolation="LINEAR"
    OUT.mkdir(parents=True,exist_ok=True)
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.file.pack_all()
    scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f"{'probe' if pose_only else 'egress'}-{side}.blend"))
    if pose_only:
        (OUT/f"probe-{side}.json").write_text(json.dumps(frames,indent=2)+"\n",encoding="utf-8")
        return
    target=OUT/f"egress-{side}.glb"
    export_actor(rig,meshes,target,"SedanEgress"+side)
    data=target.read_bytes()
    gltf=json.loads(data[20:20+struct.unpack_from("<I",data,12)[0]])
    assert len(gltf["animations"])==1 and len(gltf["skins"][0]["joints"])==53
    def gl(v):
        return [v[0],v[2],-v[1]]
    motion={
        "side":side,"duration":END/FPS,"fps":FPS,"space":"StorySedan.model",
        "clip":gltf["animations"][0]["name"],"nativeBones":53,"bytes":len(data),
        "landingTimes":[1.16,1.63],"requiredOpenRadians":OPEN,"maxLegClampMm":max_clamp*1000,
        "lastRootGltf":gl(frames[-1]["root"]),"lastYawGltf":frames[-1]["yawBlender"],
        "approachOriginGltf":gl((.750, -1.393 if side=="L" else 1.393, floor)),
        "samples":frames,
    }
    (OUT/f"egress-{side}.json").write_text(json.dumps(motion,indent=2)+"\n",encoding="utf-8")
    print(f"EGRESS {side} {len(data)} B, max reach clamp {max_clamp*1000:.2f}mm")


def review(side, render=False, step=4):
    """Inspect the skin against the matching car, not the old street prop."""
    from mathutils.bvhtree import BVHTree
    scene=bpy.context.scene
    stem="probe" if Path(bpy.data.filepath).name.startswith("probe-") else "egress"
    rig=next(o for o in scene.objects if o.type=="ARMATURE")
    assert rig.name=="SedanEgress_"+side
    model=ROOT/"outputs/quality-overhaul/vehicle/story-sedan.blend"
    with bpy.data.libraries.load(str(model),link=False) as (src,dst):
        dst.objects=list(src.objects)
    for obj in dst.objects:
        if obj and obj.type in {"MESH","EMPTY"}:
            scene.collection.objects.link(obj)
    scene.frame_set(38)
    bpy.context.view_layer.update()
    sign=-1 if side=="L" else 1
    doors=[bpy.data.objects["Sedan_Door_Rear_"+s+"_Pivot"] for s in "LR"]
    for door in doors:
        door.animation_data_clear()
        door.rotation_euler.z=0
    cast=actor_meshes(rig)
    static=[o for o in scene.objects if o.type=="MESH" and
        o.name.startswith(("BodyShell_Real","Crowned roof","Surface integrated sedan rear roof","Flush roof side flange","Flat black B pillar",
                            "Contoured seat back","Cabin carpet"))]
    assert len(static)>=10,[o.name for o in static]

    def tree(obj, deps):
        ev=obj.evaluated_get(deps)
        mesh=ev.to_mesh()
        try:
            points=[ev.matrix_world@v.co for v in mesh.vertices]
            faces=[tuple(p.vertices) for p in mesh.polygons]
            return BVHTree.FromPolygons(points,faces,all_triangles=False),points,faces
        finally:
            ev.to_mesh_clear()

    def set_stage(frame):
        scene.frame_set(frame)
        t=(frame-1)/FPS
        for i,door in enumerate(doors):
            door.rotation_euler.z=(-1 if i==0 else 1)*OPEN*fade((t+.55)/.8)
        bpy.context.view_layer.update()

    report=[]
    boots=next(o for o in cast if "boots" in o.name)
    deps=bpy.context.evaluated_depsgraph_get()
    static_trees={o.name:tree(o,deps)[0] for o in static}
    for f in sorted({*range(1, END+2, step),END+1}):
        set_stage(f)
        deps=bpy.context.evaluated_depsgraph_get()
        open_trim=[o for o in doors["LR".index(side)].children_recursive
                   if o.type=="MESH" and any(s in o.name for s in ("OriginalShell","door glass","inner_card","Armrest"))]
        obstacles=static_trees|{o.name:tree(o,deps)[0] for o in open_trim}
        hits=[]
        sole=[]
        for skin in cast:
            if "low-poly" in skin.name:
                continue
            bvh, verts, faces=tree(skin,deps)
            if skin==boots:
                outside=[p.z for p in verts if p.y*sign>.90]
                sole=[min(outside)] if outside else []
            for name, obstacle in obstacles.items():
                pairs=bvh.overlap(obstacle)
                overlaps=len(pairs)
                if overlaps:
                    loc=[verts[v] for p in {i for i,_ in pairs} for v in faces[p]]
                    bounds=[[round(op(v[i] for v in loc),3) for i in range(3)] for op in (min,max)]
                    hits.append((skin.name.rsplit(".",1)[-1],name,overlaps,bounds))
        report.append({"frame":f,"time":(f-1)/FPS,"contacts":hits,"lowestOutsideSole":sole})
    (OUT/f"{stem}-{side}-contacts.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    if not render:
        return
    scene.render.engine="BLENDER_WORKBENCH"
    scene.render.resolution_x=840
    scene.render.resolution_y=530
    scene.render.resolution_percentage=100
    scene.display.shading.light="STUDIO"
    scene.display.shading.color_type="MATERIAL"
    scene.display.shading.show_shadows=True
    scene.display.shading.show_cavity=True
    cam=bpy.data.cameras.new("Aperture inspection")
    obj=bpy.data.objects.new("Aperture inspection",cam)
    scene.collection.objects.link(obj)
    scene.camera=obj
    obj.location=(3.35,sign*4.53,2.05)
    obj.rotation_euler=(Vector((.73,sign*.88,.77))-obj.location).to_track_quat("-Z","Y").to_euler()
    cam.lens=45
    for frame in (16,29,39,53,67):
        set_stage(frame)
        scene.render.filepath=str(OUT/f"{stem}-{side}-f{frame:02}.png")
        bpy.ops.render.render(write_still=True)
    bpy.context.preferences.filepaths.save_version=0
    set_stage(39)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f"{stem}-{side}-car-review.blend"))


if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--side",choices=("L","R"),required=True)
    parser.add_argument("--review",action="store_true")
    parser.add_argument("--render",action="store_true")
    parser.add_argument("--step",type=int,choices=(1,2,3,4),default=4)
    parser.add_argument("--pose-only",action="store_true")
    args=parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
    review(args.side,args.render,args.step) if args.review else bake(args.side,args.pose_only)
