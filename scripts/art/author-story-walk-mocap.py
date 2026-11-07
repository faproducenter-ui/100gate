"""Retarget CMU 91_02 onto the original Alexei MPFB rig, with explicit ground contact.

Run with Blender from the repo root (run --review on the output .blend):
  blender -b art/character-mpfb-review.blend -t 4 --python-exit-code 1 \
    --python scripts/art/author-story-walk-mocap.py [-- --probe|--review]
The official raw dataset stays outside the repository; see the output manifest.
"""

import hashlib
import json
import math
import re
import struct
import sys
from pathlib import Path
from statistics import mean

import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

ROOT = Path.cwd()
SOURCE = ROOT.parent / "100gate-art-sources" / "story-motion"
OUT = ROOT / "outputs" / "quality-overhaul" / "gait"
SOURCE_HZ = 120
RECORD = "91_02"
UP = Vector((0, 0, 1))
SOURCE_UP = Vector((0, 1, 0))
START, END = 609, 726  # consecutive left heel strikes in original 1-based AMC
SOURCE_FRAMES = END - START
FPS = 60
STRIDE = 1.
MARKS = {
    # Heel strike, plantar loading, heel lift, toe off.  Right toe off wraps.
    "l": (609, 624, 661, 682),
    "r": (669, 682, 719, 743),
}
BASE = {side: (events[0] - START) / SOURCE_FRAMES for side, events in MARKS.items()}


def smooth(u):
    u = min(1., max(0., u))
    return u * u * (3. - 2. * u)


def mix(a, b, t):
    return a * (1. - t) + b * t


def rotation(values, axes="XYZ"):
    return Euler(tuple(math.radians(v) for v in values), axes).to_matrix()


def capture():
    """ASF axes are fixed in the reference frame: world = parent @ C @ R @ C^-1."""
    skeleton = (SOURCE / "91.asf").read_text(encoding="ascii")
    scale = 0.0254 / float(re.search(r":units.*?length\s+(\S+)", skeleton, re.S)[1])
    bones = {}
    for block in re.findall(r"\bbegin\s+(id\s+.*?)\bend\b", skeleton, re.S):
        fields = {w[0]: w[1:] for line in block.splitlines() if (w := line.split())}
        name, = fields["name"]
        axis = rotation(tuple(map(float, fields["axis"][:3])), fields["axis"][3])
        direction = Vector(tuple(map(float, fields["direction"])))
        bones[name] = (axis, direction * (float(fields["length"][0]) * scale),
                       fields.get("dof", ()))
    hierarchy = [line.split() for line in skeleton.split(":hierarchy")[1].splitlines()
                 if line.strip() not in ("", "begin", "end")]
    assert len(bones) == 30 and hierarchy[0][0] == "root"

    def forward(channels):
        tx, ty, tz, rx, ry, rz = channels["root"]
        positions = {"root": Vector((tx, ty, tz)) * scale}
        matrices = {"root": rotation((rx, ry, rz))}
        for parent, *children in hierarchy:
            for name in children:
                axis, displacement, dofs = bones[name]
                angles = dict(zip(dofs, channels.get(name, ())))
                local = axis @ rotation(tuple(angles.get(f"r{letter}", 0.) for letter in "xyz")) @ axis.transposed()
                matrices[name] = matrices[parent] @ local
                positions[name] = positions[parent] + matrices[name] @ displacement
        return positions, matrices

    motion = (SOURCE / f"{RECORD}.amc").read_text(encoding="ascii")
    frames, channels = [], {}
    for line in motion.splitlines():
        if not line or line.startswith(("#", ":")):
            continue
        joint, *data = line.split()
        if not data:
            if channels:
                frames.append(forward(channels))
            channels = {}
        else:
            channels[joint] = tuple(map(float, data))
    frames.append(forward(channels))
    assert len(frames) > 500 and set(frames[0][0]) == {"root", *bones}
    return frames


def probe(frames):
    for frame in range(590, 742, 3):
        positions, _ = frames[frame]
        keys = []
        for side in "lr":
            ankle, ball, toe = (positions[f"{side}{j}"] for j in ("tibia", "foot", "toes"))
            ahead = positions["root"].z - ankle.z
            pitch = math.degrees(math.atan2(ankle.y - ball.y, abs(ankle.z - ball.z)))
            keys.append(tuple(round(v, 3) for v in (ahead, ankle.y, ball.y, toe.y, pitch)))
        print(frame + 1, *keys)


class Cycle:
    def __init__(self, frames):
        self.frames = frames
        a, b = (frames[i - 1][0]["root"] for i in (START, END))
        heading = b - a
        heading.y = 0.
        self.stride = heading.length
        forward = heading.normalized()
        self.basis = Matrix((SOURCE_UP.cross(forward), -forward, SOURCE_UP))
        self.inverse = self.basis.transposed()
        self.angles_mean = {}
        self.root_mean = mean(frames[i - 1][0]["root"].y for i in range(START, END))
        for joint in ("root", "lowerback", "upperback", "thorax", "lowerneck", "head"):
            q0 = self.sample_rotation(joint, 0)
            qsum = [0.] * 4
            for i in range(60):
                q = self.sample_rotation(joint, i / 60)
                for j, value in enumerate(q):
                    qsum[j] += value if q0.dot(q) >= 0 else -value
            self.angles_mean[joint] = Quaternion(qsum).normalized()

    def at(self, f, name):
        i = math.floor(f) - 1
        return self.basis @ self.frames[i][0][name].lerp(self.frames[i + 1][0][name], f % 1)

    def relative(self, phase, joint, parent):
        def offset(p):
            f = START + p * SOURCE_FRAMES
            return self.at(f, joint) - self.at(f, parent)
        return offset(phase) - phase * (offset(1.) - offset(0.))

    def sample_rotation(self, name, phase):
        q0 = self.frames[START - 1][1][name].to_quaternion()
        q1 = self.frames[END - 1][1][name].to_quaternion()
        i = int(phase * SOURCE_FRAMES)
        q = self.frames[START - 1 + i][1][name].to_quaternion()
        r = self.frames[START + i][1][name].to_quaternion()
        return q.slerp(r, phase * SOURCE_FRAMES - i) @ Quaternion().slerp(q1.inverted() @ q0, phase)

    def angles(self, joint, phase, caps):
        dq = self.sample_rotation(joint, phase) @ self.angles_mean[joint].inverted()
        target = (self.basis @ dq.to_matrix() @ self.inverse).to_euler()
        return [max(-math.radians(lim), min(math.radians(lim), a)) for a, lim in zip(target, caps)]

    def vertical(self, phase):
        h = self.at(START + phase * SOURCE_FRAMES, "root").z
        h -= phase * (self.at(END, "root").z - self.at(START, "root").z)
        return h - self.root_mean


class Shoe:
    def __init__(self, rig, boot, side):
        self.side = side
        self.sign = 1 if side == "l" else -1
        self.rest = rig.data.bones["foot_" + side].matrix_local.copy()
        group_indices = {g.index for g in boot.vertex_groups if g.name.endswith("_" + side)}
        bind = rig.matrix_world.inverted() @ boot.matrix_world
        geometry = [(v.index, bind @ v.co) for v in boot.data.vertices
                    if any(g.group in group_indices and g.weight > .5 for g in v.groups)]
        self.indices = [i for i, _ in geometry]
        floor = min(p.z for _, p in geometry)
        sole = [(i, p) for i, p in geometry if p.z < floor + .009]
        self.sole = [p - self.rest.translation for _, p in sole]
        self.center_x = self.sign * .139
        self.yaw = Quaternion(UP, math.radians(self.sign * 5)).to_matrix()
        back, front = max(p.y for _, p in sole), min(p.y for _, p in sole)
        self.heel_index, self.heel = min(sole, key=lambda v: (abs(v[1].y - back) +
                          1.7 * abs(v[1].z - floor) + .2 * abs(v[1].x - self.rest.translation.x)))
        self.toe_index, self.toe = min(sole, key=lambda v: (abs(v[1].y - front) +
                        1.7 * abs(v[1].z - floor) + .2 * abs(v[1].x - self.rest.translation.x)))
        self.floor = floor
        self.plant = [i for i, p in sole if p.z < floor + .0025]

    def rotation(self, pitch):
        return self.yaw @ Quaternion((1, 0, 0), math.radians(pitch)).to_matrix()

    def on_ground(self, stride_time, pitch, pivot):
        R = self.rotation(pitch)
        pivot_rel = pivot - self.rest.translation
        ref = Vector((self.center_x, -.248 - stride_time * STRIDE, 0))
        xy = ref + self.yaw @ pivot_rel - R @ pivot_rel
        xy.z = -min((R @ point).z for point in self.sole)
        return xy

    def phase(self, t):
        cycle = math.floor(t - BASE[self.side])
        return t - BASE[self.side] - cycle, cycle + BASE[self.side]

    def target(self, motion, t):
        q, offset = self.phase(t)
        strike, loaded, lift, toeoff = MARKS[self.side]
        loaded, lift, toeoff = ((p - strike) / SOURCE_FRAMES for p in (loaded, lift, toeoff))
        # Locked heel → flat sole → locked forefoot. The pivot shifts only in a flat state.
        roll0, roll1 = -16., 31.
        if q < loaded:
            pitch = mix(roll0, 0, smooth(q / loaded))
            p = self.on_ground(offset, pitch, self.heel)
        elif q < lift:
            pitch = 0.
            p = self.on_ground(offset, pitch, self.heel)
        elif q <= toeoff:
            pitch = mix(0, roll1, smooth((q - lift) / (toeoff - lift)))
            p = self.on_ground(offset, pitch, self.toe)
        else:
            start = strike + toeoff * SOURCE_FRAMES
            end = strike + SOURCE_FRAMES
            f = strike + q * SOURCE_FRAMES
            # Use world-space ankle displacement, not an arbitrary cyclic slide.
            joint = self.side + "tibia"
            a, b, c = (motion.at(x, joint) for x in (start, end, f))
            u = (q - toeoff) / (1. - toeoff)
            alpha = min(1., max(0., (c.y - a.y) / (b.y - a.y)))
            alpha = mix(smooth(u), alpha, .78)
            A = self.on_ground(offset, roll1, self.toe)
            B = self.on_ground(offset + 1., roll0, self.heel)
            p = A.lerp(B, alpha)
            p.x += .68 * (c.x - mix(a.x, b.x, alpha))
            raw_z = c.z - mix(a.z, b.z, alpha)
            pitch = mix(roll1, roll0, smooth(u))
            p.z += max(-.021, min(.079, raw_z * .87))
            bottom = -min((self.rotation(pitch) @ point).z for point in self.sole)
            # Captured ankles need the avatar's thicker boot clearance near the floor.
            p.z = max(p.z, bottom + .035 * math.sin(math.pi * u) ** 1.5)
        # Drop captured forward translation. Three advances distance on its own path.
        p.y += t * STRIDE
        return p, self.rotation(pitch) @ self.rest.to_3x3()


def audit(scene, rig, boot, shoes):
    """Measure skinned sole contact on the actual asset, not goal or bone motion."""
    result = {}
    peak = {side: {"flat": [], "heel": [], "toe": [], "min": [], "swing": [], "knees": [], "roll": []} for side in "lr"}
    other_meshes = [(o, o.hide_viewport) for o in scene.objects if o.type == "MESH" and o != boot]
    for obj, _ in other_meshes:
        obj.hide_viewport = True
    # Sample between baked keyframes too: Blender's interpolation must not introduce slide.
    for k in range(121):
        if k % 60 == 0:
            print(f"Sole mesh audit {k}/120", flush=True)
        t = k / 120.
        f = scene.frame_start + t * scene.render.fps
        scene.frame_set(int(f), subframe=f % 1.)
        deps = bpy.context.evaluated_depsgraph_get()
        obj = boot.evaluated_get(deps)
        for side, shoe in shoes.items():
            q, _ = shoe.phase(t)
            _, loaded, lift, toeoff = ((p - MARKS[side][0]) / SOURCE_FRAMES for p in MARKS[side])
            phase = "heel" if q < loaded else "flat" if q < lift else "toe" if q <= toeoff else "swing"
            M = obj.matrix_world
            def world(i):
                p = M @ obj.data.vertices[i].co
                p.y -= t * STRIDE
                return p
            ground = min(world(i).z for i in shoe.indices)
            peak[side]["min"].append(ground)
            if phase == "flat":
                center = sum((world(i) for i in shoe.plant), Vector()) / len(shoe.plant)
                peak[side][phase].append((q, center))
            elif phase in ("heel", "toe"):
                peak[side][phase].append((q, world(shoe.heel_index if phase == "heel" else shoe.toe_index)))
            else:
                peak[side][phase].append(ground)
            thigh, calf, foot = (rig.pose.bones[j + "_" + side].head for j in ("thigh", "calf", "foot"))
            peak[side]["knees"].append(math.degrees((calf-thigh).angle(foot-calf)))
            orientation = rig.pose.bones["foot_" + side].matrix.to_3x3()
            forward = orientation @ shoe.rest.to_3x3().inverted() @ Vector((0, -1, 0))
            peak[side]["roll"].append(math.degrees(math.asin(max(-1, min(1, -forward.z)))))
    for side, values in peak.items():
        def max_drift(phase):
            # q=0 on the next stride is a distinct ground contact, not skating.
            data = values[phase]
            return max((math.hypot(a.x - b.x, a.y - b.y)
                        for q1, a in data for q2, b in data if abs(a.y - b.y) < .55 and abs(q1 - q2) < .5), default=0.)
        result[side] = {"flatDriftMm": round(1000 * max_drift("flat"), 3),
                        "heelDriftMm": round(1000 * max_drift("heel"), 3),
                        "toeDriftMm": round(1000 * max_drift("toe"), 3),
                        "minZMm": round(1000 * min(values["min"]), 3),
                        "peakSwingClearanceMm": round(1000 * max(values["swing"]), 3),
                        "kneeFlexionDegrees": [round(min(values["knees"]), 2), round(max(values["knees"]), 2)],
                        "solePitchDegrees": [round(min(values["roll"]), 2), round(max(values["roll"]), 2)]}
    scene.frame_set(scene.frame_start)
    for obj, was_hidden in other_meshes:
        obj.hide_viewport = was_hidden
    bpy.context.view_layer.update()
    return result


def check_contact(metrics):
    for side, m in metrics.items():
        assert m["solePitchDegrees"][0] < -10 and m["solePitchDegrees"][1] > 23, (side, "missing heel-to-toe roll", m)
        assert m["flatDriftMm"] < 3., (side, "plant slides", m)
        assert m["heelDriftMm"] < 8. and m["toeDriftMm"] < 8., (side, "roll pivot slides", m)
        assert m["minZMm"] > -3., (side, "boot penetrates ground", m)
        assert m["peakSwingClearanceMm"] > 45., (side, "scuffs during swing", m)
        assert 5. < m["kneeFlexionDegrees"][0] < 24. and m["kneeFlexionDegrees"][1] < 95., (side, "knee angle", m)


def rig_inputs():
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from story_actor_tools import actor_meshes
    scene = bpy.context.scene
    rig = next(o for o in scene.objects if o.type == "ARMATURE")
    meshes = actor_meshes(rig)
    boot = next(o for o in meshes if "ankle_boot" in o.name)
    assert len(rig.data.bones) == 53 and len(meshes) == 5
    return scene, rig, meshes, boot


def body_performance(rig, cycle, phase, offset):
    from native_pose_tools import set_pose_matrix, two_bone_ik
    from story_actor_tools import pose_relaxed

    bpy.context.view_layer.update()
    pose_relaxed(rig, 0.)

    # Retarget segment orientations against the recorded cycle mean, not T-pose
    # Euler axes. This preserves recorded counterrotation across different rigs.
    delta = cycle.relative(phase, "root", "lhipjoint").lerp(cycle.relative(phase, "root", "rhipjoint"), .5)
    pelvis = rig.pose.bones["pelvis"]
    displacement = Vector((max(-.027, min(.027, delta.x * .55)), 0., offset - .029 + cycle.vertical(phase) * .75))
    rot = Euler(tuple(cycle.angles("root", phase, (4, 5, 8)))).to_matrix()
    set_pose_matrix(pelvis, Matrix.Translation(pelvis.bone.head_local + displacement) @
                    (rot @ pelvis.bone.matrix_local.to_3x3()).to_4x4())
    bpy.context.view_layer.update()
    for name, source, cap, gain, lean in [
            ("spine_01", "lowerback", (6, 6, 10), .85, -2.5),
            ("spine_02", "upperback", (6, 6, 12), .85, -3.),
            ("spine_03", "thorax", (6, 6, 12), .92, -3.),
            ("neck_01", "lowerneck", (4, 5, 7), .52, 0.),
            ("head", "head", (3, 3, 5), .46, 0.)]:
        p = rig.pose.bones[name]
        x, y, z = [v * gain for v in cycle.angles(source, phase, cap)]
        desired = Euler((x + math.radians(lean), y, z)).to_matrix() @ p.bone.matrix_local.to_3x3()
        set_pose_matrix(p, Matrix.Translation(p.head) @ desired.to_4x4())
        bpy.context.view_layer.update()

    for side in "lr":
        sign = 1 if side == "l" else -1
        upper = rig.pose.bones["upperarm_" + side]
        lower = rig.pose.bones["lowerarm_" + side]
        hand = rig.pose.bones["hand_" + side]
        u = cycle.relative(phase, side + "humerus", side + "clavicle").normalized()
        v = cycle.relative(phase, side + "radius", side + "humerus").normalized()
        # Reuse the capture's elbow trajectory with Alexei's native limb lengths.
        elbow = upper.head + u * upper.bone.length
        wrist = elbow + v * lower.bone.length
        wrist.x = sign * max(.235, min(.34, abs(wrist.x)))
        max_reach = (upper.bone.length + lower.bone.length) * .994
        if (wrist - upper.head).length > max_reach:
            wrist = upper.head + (wrist - upper.head).normalized() * max_reach
        fore = cycle.relative(phase, side + "wrist", side + "radius").normalized()
        hand_axis = fore.lerp(Vector((sign * .03, -.10, -1.)).normalized(), .68).normalized()
        H = hand.bone.matrix_local.to_3x3()
        H = (H @ Vector((0, 1, 0))).rotation_difference(hand_axis).to_matrix() @ H
        two_bone_ik(rig, side, wrist, elbow, H)
    bpy.context.view_layer.update()


def animate(scene, rig, meshes, boot, cycle):
    from native_pose_tools import set_pose_matrix, two_bone_ik
    from story_actor_tools import clear_pose

    clear_pose(rig)
    shoes = {side: Shoe(rig, boot, side) for side in "lr"}
    offset = max(-shoe.floor for shoe in shoes.values())
    for obj in list(scene.objects):
        if obj not in [rig, *meshes]:
            bpy.data.objects.remove(obj, do_unlink=True)
    rig.name = "StoryHeroWalk"
    scene.name = "100gate | Alexei / CMU 91-02 gait + sole-lock retarget"
    scene.render.fps = FPS
    scene.frame_start = 1
    scene.frame_end = 1 + FPS
    previous = {}
    seam = {}
    max_hips_y = 0.
    visibility = [(obj, obj.hide_viewport) for obj in meshes]
    for obj, _ in visibility:
        obj.hide_viewport = True
    for frame in range(1, 2 + FPS):
        if (frame - 1) % 15 == 0:
            print(f"Baking native skeleton {frame - 1}/{FPS}", flush=True)
        scene.frame_set(frame)
        phase = (frame - 1) / FPS
        for p in rig.pose.bones:
            p.matrix_basis = Matrix.Identity(4)
        body_performance(rig, cycle, phase, offset)
        targets = {side: shoe.target(cycle, phase) for side, shoe in shoes.items()}
        # Lift the pelvis out of the permanent crouch only as far as BOTH
        # planted/rolling shoes permit. Use a smooth lower bound at the handoff
        # between supporting legs and reserve flexion before the IK singularity.
        clearance = [.052]
        for side, (ankle, _) in targets.items():
            thigh = rig.pose.bones["thigh_" + side]
            calf = rig.pose.bones["calf_" + side]
            delta = thigh.head - ankle
            reach = (thigh.bone.length + calf.bone.length) * .989
            clearance.append(math.sqrt(max(0., reach*reach-delta.x*delta.x-delta.y*delta.y))-delta.z)
        lift = clearance[0]
        for bound in clearance[1:]:
            lift = .5*(lift+bound-math.sqrt((lift-bound)**2+.009**2))
        pelvis = rig.pose.bones["pelvis"]
        set_pose_matrix(pelvis, Matrix.Translation((0., 0., max(0., lift))) @ pelvis.matrix)
        bpy.context.view_layer.update()
        for side, shoe in shoes.items():
            p, orientation = targets[side]
            # Use the native analytic two-bone solver. Extract the pole from the
            # recorded knee, with a forward minimum to exclude a flipped hinge.
            a = cycle.relative(phase, side + "femur", side + "hipjoint")
            b = cycle.relative(phase, side + "tibia", side + "hipjoint").normalized()
            knee = (a - b * a.dot(b))
            knee.x = max(-.095, min(.095, knee.x * .65))
            knee.y = min(-.072, knee.y)
            knee.z = 0.
            thigh = rig.pose.bones["thigh_" + side].head.copy()
            if (p-thigh).length > rig.pose.bones["thigh_" + side].bone.length + rig.pose.bones["calf_" + side].bone.length - 1e-5:
                raise ValueError(f"Unreachable {side} ankle at phase {phase:.4f}: {p-thigh}")
            two_bone_ik(rig, side, p, thigh + knee.normalized(), orientation,
                        kind="leg", align_hinge=True)
        bpy.context.view_layer.update()
        max_hips_y = max(max_hips_y, abs(rig.pose.bones["pelvis"].head.y))
        for p in rig.pose.bones:
            if p.name in previous:
                q = p.rotation_quaternion
                if previous[p.name].dot(q) < 0:
                    p.rotation_quaternion = -q
            previous[p.name] = p.rotation_quaternion.copy()
            if frame == 1:
                seam[p.name] = (p.location.copy(), p.rotation_quaternion.copy())
            elif frame == 1 + FPS:
                loc, q = seam[p.name]
                assert (loc - p.location).length < .0005, (p.name, "loop translation seam", loc, p.location)
                assert abs(q.dot(p.rotation_quaternion)) > .99999, (p.name, "loop rotation seam")
                # Exact terminal key, with the current quaternion hemisphere.
                p.location, p.rotation_quaternion = loc, q if q.dot(p.rotation_quaternion) >= 0 else -q
            p.keyframe_insert("location", frame=frame, group=p.name)
            p.keyframe_insert("rotation_quaternion", frame=frame, group=p.name)
    for obj, was_hidden in visibility:
        obj.hide_viewport = was_hidden
    action = rig.animation_data.action
    action.name = "StoryHero_Walk"
    for channelbag in action.layers[0].strips[0].channelbags:
        for curve in channelbag.fcurves:
            for key in curve.keyframe_points:
                key.interpolation = "LINEAR"
    assert max_hips_y < .008, max_hips_y  # no built-in travel
    scene.frame_set(1)
    return shoes


def verify_glb(path):
    """Verify the delivery binary itself (rig hierarchy, duration and animated nodes)."""
    data = path.read_bytes()
    magic, version, length = struct.unpack_from("<4sII", data)
    json_size, chunk = struct.unpack_from("<I4s", data, 12)
    assert (magic, version, length, chunk) == (b"glTF", 2, len(data), b"JSON")
    doc = json.loads(data[20:20+json_size])
    nodes = doc["nodes"]
    joints = {nodes[j]["name"] for j in doc["skins"][0]["joints"]}
    assert len(joints) == 53 and {"pelvis", "head", "foot_l", "foot_r", "hand_l", "hand_r"} <= joints
    skin_meshes = [n for n in nodes if "skin" in n]
    assert len(skin_meshes) == 5
    clip, = doc["animations"]
    names = {nodes[ch["target"]["node"]]["name"] for ch in clip["channels"]
             if ch["target"]["path"] == "rotation"}
    assert {"head", "pelvis", "spine_03", "foot_l", "foot_r", "hand_l", "hand_r"} <= names
    samples = [doc["accessors"][s["input"]] for s in clip["samplers"]]
    assert min(s["min"][0] for s in samples) == 0. and abs(max(s["max"][0] for s in samples) - 1.) < .0001
    return {"bytes": len(data), "animations": len(doc["animations"]), "clip": clip["name"],
            "channels": len(clip["channels"]), "jointCount": len(joints), "skinMeshes": len(skin_meshes)}


def author(frames):
    from story_actor_tools import export_actor

    scene, rig, meshes, boot = rig_inputs()
    cycle = Cycle(frames)
    shoes = animate(scene, rig, meshes, boot, cycle)
    metrics = audit(scene, rig, boot, shoes)
    print("MOTION CONTACT\n" + json.dumps(metrics, indent=2), flush=True)
    check_contact(metrics)
    links = {
        "91.asf": "https://mocap.cs.cmu.edu/subjects/91/91.asf",
        "91_02.amc": "https://mocap.cs.cmu.edu/subjects/91/91_02.amc",
    }
    metadata = {
        "capture": {
            "label": "CMU Graphics Lab Motion Capture Database / Subject 91 / WalkStraight 02",
            "homepage": "https://mocap.cs.cmu.edu/",
            "index": "https://mocap.cs.cmu.edu/search.php?subjectnumber=91",
            "license": "May be incorporated in commercial products; no standalone resale of capture data.",
            "credit": "The data used in this project was obtained from mocap.cs.cmu.edu.",
            "download": {f: {"url": u, "sha256": hashlib.sha256((SOURCE / f).read_bytes()).hexdigest()}
                         for f, u in links.items()},
            "sourceFps": SOURCE_HZ, "cycleFramesInclusive": [START, END],
            "rawCycleSeconds": SOURCE_FRAMES / SOURCE_HZ, "rawStrideMeters": cycle.stride,
            "eventsFramesOneBased": MARKS,
        },
        "asset": {
            "nativeRigJoints": len(rig.data.bones), "name": "StoryHero_Walk",
            "fps": FPS, "seconds": 1., "metersPerCycle": STRIDE,
            "transform": "No horizontal root motion. Blender -Y forward; Three.js +Z forward (glTF Y-up).",
            "runtimePhase": "Distance traveled in meters modulo 1.0; no clip-speed multiplier.",
            "captureRetarget": "pelvis, spine, neck, head, shoulders/elbows, wrist trajectory, knee plane, swing and stance timing",
            "avatarAdjustments": "Native MPFB lengths, foot/shoe geometry locks and wrist neutral; no mocap finger channels.",
        },
        "skinAudit": {"sampleRateHz": 120, "shoeMesh": boot.name, "metrics": metrics},
    }
    OUT.mkdir(parents=True, exist_ok=True)
    rig["capture"] = metadata["capture"]["label"]
    rig["source"] = str(links["91_02.amc"])
    rig["metersPerCycle"] = STRIDE
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                space = area.spaces.active
                space.overlay.show_overlays = False
                space.region_3d.view_perspective = "ORTHO"
                space.region_3d.view_location = (0, -.065, .91)
                space.region_3d.view_rotation = Vector((.85, -.72, .13)).to_track_quat("Z", "Y")
                space.region_3d.view_distance = 2.5
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "story-hero-walk-mocap.blend"))
    glb = OUT / "story-hero-walk-mocap.glb"
    export_actor(rig, meshes, glb, "StoryHeroWalk")
    metadata["glbAudit"] = verify_glb(glb)
    (OUT / "story-hero-walk-mocap.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")


def review():
    scene, rig, _, _ = rig_inputs()
    review_out = OUT / "review"
    review_out.mkdir(parents=True, exist_ok=True)
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 460
    scene.render.resolution_y = 530
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "AgX"
    scene.world = bpy.data.worlds.new("Review ambient")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes.get("Background").inputs["Color"].default_value = (.25, .33, .46, 1)
    scene.world.node_tree.nodes.get("Background").inputs["Strength"].default_value = .36
    bpy.ops.mesh.primitive_plane_add(size=16)
    ground = bpy.context.object
    ground.name = "Diagnostic ground"
    mat = bpy.data.materials.new("Diagnostic backdrop")
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (.042, .048, .059, 1)
    shader.inputs["Roughness"].default_value = .86
    ground.data.materials.append(mat)
    for name, position, size, energy, color in [
            ("Key", (3, -3, 4), 2.8, 340, (1., .88, .72)),
            ("Fill", (-3.4, -2, 2.8), 2.7, 155, (.72, .84, 1.)),
            ("Separation", (-1, 2, 3.1), 2., 260, (.75, .86, 1.))]:
        light = bpy.data.lights.new(name, "AREA")
        light.energy, light.shape, light.size, light.color = energy, "DISK", size, color
        obj = bpy.data.objects.new(name, light)
        scene.collection.objects.link(obj)
        obj.location = position
        obj.rotation_euler = (Vector((0, 0, 1.1)) - obj.location).to_track_quat("-Z", "Y").to_euler()
    data = bpy.data.cameras.new("Diagnostic ortho")
    data.type, data.ortho_scale = "ORTHO", 2.05
    camera = bpy.data.objects.new("Diagnostic ortho", data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    for angle, position in [("side", (3.0, -.20, 1.13)), ("front", (.05, -3.0, 1.18))]:
        camera.location = position
        camera.rotation_euler = (Vector((0, -.09, .94)) - camera.location).to_track_quat("-Z", "Y").to_euler()
        for f in (1, 15, 31, 46):
            scene.frame_set(f)
            scene.render.filepath = str(review_out / f"{angle}-{f:02d}.png")
            bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ()
    if "--probe" in args:
        probe(capture())
    elif "--audit" in args:
        scene, rig, _, boot = rig_inputs()
        metrics = audit(scene, rig, boot, {side: Shoe(rig, boot, side) for side in "lr"})
        print(json.dumps(metrics, indent=2))
        check_contact(metrics)
    elif "--review" in args:
        review()
    elif "--verify-glb" in args:
        print(json.dumps(verify_glb(OUT / "story-hero-walk-mocap.glb"), indent=2))
    else:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        author(capture())
