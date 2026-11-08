"""Probe original body and cloth on the actual upright escape animation."""
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

OUT = Path.cwd() / "outputs/quality-overhaul/sleeves"
OUT.mkdir(parents=True, exist_ok=True)
SUFFIX = "candidate" if "--candidate" in sys.argv else "baseline"
SCENE = bpy.context.scene
RIG = bpy.data.objects["StoryEscape_Alexei"]
BODY = next(o for o in RIG.children if o.type == "MESH" and o.name.endswith("MakeHuman body"))
SWEATER = next(o for o in RIG.children if "sweater" in o.name.lower())


def evaluated(o, dg):
    ev = o.evaluated_get(dg)
    me = ev.to_mesh()
    me.calc_loop_triangles()
    vertices = [ev.matrix_world @ v.co for v in me.vertices]
    tris = [tuple(t.vertices) for t in me.loop_triangles]
    ev.to_mesh_clear()
    return vertices, tris


def bones(o, i):
    return {o.vertex_groups[g.group].name: g.weight for g in o.data.vertices[i].groups}


def side_indices(o, side, threshold=.55):
    names = {part+"_"+side for part in ("clavicle", "upperarm", "lowerarm")}
    return {v.index for v in o.data.vertices
            if sum(g.weight for g in v.groups if o.vertex_groups[g.group].name in names) >= threshold}


def deformations(o):
    return {
        "verts": len(o.data.vertices), "faces": len(o.data.polygons),
        "keys": [b.name for b in o.data.shape_keys.key_blocks] if o.data.shape_keys else [],
        "modifiers": [{"name": m.name, "type": m.type,
                       "dualQuaternion": getattr(m, "use_deform_preserve_volume", None),
                       "vertexGroup": getattr(m, "vertex_group", None),
                       "invert": getattr(m, "invert_vertex_group", None)}
                      for m in o.modifiers],
    }


def load_pose(seconds):
    f = SCENE.frame_start + seconds*SCENE.render.fps
    SCENE.frame_set(int(f), subframe=f-int(f))
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    return evaluated(BODY, dg), evaluated(SWEATER, dg)


def arm_position(side, label):
    return RIG.matrix_world @ RIG.pose.bones[label+"_"+side].head


def arm_rays(side, bvhs, nrad=48):
    """Distances to outer skin/cloth measured along transverse arm sections."""
    shoulder, elbow, wrist = (arm_position(side, k) for k in ("upperarm", "lowerarm", "hand"))
    out = []
    for label, start, end, fractions in (
        ("upper", shoulder, elbow, [.24, .40, .56, .72, .80, .88, .94, .99]),
        ("lower", elbow, wrist, [.01, .06, .12, .20, .28, .36, .46, .56, .66, .76, .84]),
    ):
        axis = (end-start).normalized()
        u = axis.cross(Vector((1, 0, 0)))
        if u.length < .15:
            u = axis.cross(Vector((0, 1, 0)))
        u.normalize()
        v = axis.cross(u)
        for t in fractions:
            c = start.lerp(end, t)
            for j in range(nrad):
                normal = math.cos(j*math.tau/nrad)*u + math.sin(j*math.tau/nrad)*v
                hits = [tree.ray_cast(c+normal*.18, -normal, .18) for tree in bvhs]
                if any(p is None for p, *_ in hits):
                    continue
                if any(n.dot(normal) < .2 for _, n, *_ in hits):
                    continue
                skin, cloth = hits
                # Folded limbs can place two different arm sections in the
                # same ray. Use only neighboring surfaces, not crossed limbs.
                if abs(cloth[-1]-skin[-1]) > .022:
                    continue
                out.append({"section": label, "fraction": t, "angle": j, "side": side,
                            "exposureMm": round((cloth[-1]-skin[-1])*1000, 3),
                            "position": list(skin[0]), "face": cloth[2], "normal": list(normal)})
    return out


def visible_elbow_rays(side, bvhs):
    """Sample coverage from the same perspective as the proof cameras."""
    elbow = arm_position(side, "lowerarm")
    wrist = arm_position(side, "hand")
    target = elbow.lerp(wrist, .23)
    eye = bpy.data.objects["StoryEscape_Eye"]
    origin = target+.405*((eye.matrix_world.translation-target).normalized() if side=="l"
                           else Vector((-.87,-.25,.38)).normalized())
    forward=(target-origin).normalized()
    right=forward.cross(Vector((0,0,1))).normalized()
    up=right.cross(forward).normalized()
    tested=visible=0
    for ix in range(-20,21):
        for iy in range(-20,21):
            aim=(target+right*(ix*.004)+up*(iy*.004)-origin).normalized()
            skin=bvhs[0].ray_cast(origin,aim,.59)
            if skin[0] is None or (skin[0]-elbow).length>.082 or skin[1].dot(aim)>-.15:
                continue
            cloth=bvhs[1].ray_cast(origin,aim,.59)
            tested+=1
            if cloth[0] is None or skin[-1]+.001<cloth[-1]:
                visible+=1
    return {"testedRays":tested,"skinBeforeSweater":visible}


def audit():
    sample_times = [0., 3.8, 6.5, 8.0, 9.8, 10.4, 10.8, 11.15, 11.45, 11.8, 12.25, 12.9,
                    13.55, 14.15, 14.65, 15.5, 16.15, 16.8, 17.25, 17.6, 17.9,
                    18.15, 18.6, 19.05, 19.7, 20.7, 21.5, 22.3, 23.2]
    report = {"body": deformations(BODY), "sweater": deformations(SWEATER), "frames": []}
    regions = {side:tuple(side_indices(o, side) for o in (BODY, SWEATER)) for side in "lr"}
    for sec in sample_times:
        (s, st), (c, ct) = load_pose(sec)
        rec = {"seconds": sec, "sides": {}}
        camera_cloth = BVHTree.FromPolygons(c,ct,all_triangles=True)
        for side in "lr":
            skins, sleeves = regions[side]
            ss = [t for t in st if len(skins.intersection(t)) >= 2]
            cs = [t for t in ct if len(sleeves.intersection(t)) >= 2]
            bvh = [BVHTree.FromPolygons(p, t, all_triangles=True) for p,t in ((s, ss), (c, cs))]
            rays = arm_rays(side, bvh)
            pairs = bvh[0].overlap(bvh[1])
            garment_faces = sorted({j for _,j in pairs})
            fail = sorted((q for q in rays if q["exposureMm"] > .5),
                          key=lambda q: q["exposureMm"], reverse=True)
            rec["sides"][side] = {"measuredRays": len(rays), "exposed": len(fail),
                                 "worstRays": fail[:8], "maxExposureMm": fail[0]["exposureMm"] if fail else 0,
                                 "intersectingTrianglePairs": len(pairs), "garmentTriangles": len(garment_faces),
                                 "proofCamera": visible_elbow_rays(side, (bvh[0], camera_cloth)),
                                 "garmentVertices": sorted({i for j in garment_faces for i in cs[j]})}
        report["frames"].append(rec)
        print(sec, [(k, v["exposed"],v["maxExposureMm"],v["intersectingTrianglePairs"])
                    for k,v in rec["sides"].items()], flush=True)
    (OUT / f"sleeve-{SUFFIX}.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    if "--gate" in sys.argv:
        for sec in (11.45,17.9):
            rec=next(r for r in report["frames"] if r["seconds"]==sec)["sides"]["l"]
            visible=rec["proofCamera"]["skinBeforeSweater"]
            assert visible<=3, f"{sec}s left elbow still exposes skin on {visible} camera rays (limit 3)"


if __name__ == "__main__":
    audit()
