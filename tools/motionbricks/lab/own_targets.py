# SPDX-License-Identifier: Apache-2.0
"""Our own animation  ->  SOMA target poses for MotionBricks (replaces NVIDIA's evaluation-licence sample clips).

    node tools/motionbricks/export-hero-poses.mjs            # hero Walk/Run (Blender-authored) -> out/own-*.hero.json
    cd C:/Users/libde/motionbricks-lab/motionbricks
    uv run --system-certs python C:/Users/libde/100gate/tools/motionbricks/lab/own_targets.py

Mirror of tools/motionbricks/retarget.mjs: for every mapped bone both rigs build the frame (bone direction + body lateral
axis); the SOMA bone gets  W = F_hero_pose * F_soma_rest^-1 * W_soma_rest.  Hero and SOMA share the axes (Y up, +Z forward,
left = +X), so no axis conversion is needed. Fingers, toes, neck2, jaw and eyes keep SOMA's reference rotations.
Output: out/own-<gait>.targets.npy  float32 [frames, joints, 7] (position xyz + quaternion xyzw, local), 30 Hz, LOOPS loops
with the hips travelling +Z at the clip's own ground speed (the engine derives heading and speed from that travel).
"""
import json
import sys
from pathlib import Path

import numpy as np
import warp as wp
from scipy.spatial.transform import Rotation as R

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "out"
MAP = json.loads((HERE.parent / "soma-map.json").read_text(encoding="utf8"))
LOOPS = 8
ANKLE_REST = 0.072     # SOMA reference ankle height (metres) = hero rest ankle height


def basis(aim, lateral):
    x = aim / np.linalg.norm(aim)
    y = lateral - x * np.dot(lateral, x)
    y /= np.linalg.norm(y)
    return R.from_matrix(np.stack([x, y, np.cross(x, y)], axis=1))


def load_skeleton():
    sys.path.insert(0, str(Path.cwd() / "docs" / "examples"))
    from motionbricks.io.usd import load_skeleton_from_usd
    from motionbricks.io.utils import SOMA_SKELETON_PRIM_PATH, get_asset_file

    wp.init()
    return load_skeleton_from_usd(get_asset_file("human", "soma_base_skel_minimal_no_root.usd"), SOMA_SKELETON_PRIM_PATH)


def fk(names, par, local):
    pos, rot = np.zeros((len(names), 3)), [None] * len(names)
    for i in range(len(names)):
        q = R.from_quat(local[i, 3:7])
        if par[i] < 0:
            pos[i], rot[i] = local[i, :3], q
        else:
            pos[i] = pos[par[i]] + rot[par[i]].apply(local[i, :3])
            rot[i] = rot[par[i]] * q
    return pos, rot


def convert(skel, gait: str):
    src = json.loads((OUT / f"own-{gait}.hero.json").read_text())
    names, par = skel.joint_names, skel._np_parent_indices
    idx = {n: i for i, n in enumerate(names)}
    ref = skel.reference_local_transforms.numpy().astype(np.float64)
    rpos, rrot = fk(names, par, ref)
    rpos_d = {n: rpos[i] for n, i in idx.items()}
    rpos_d["EyesMid"] = (rpos[idx["LeftEye"]] + rpos[idx["RightEye"]]) / 2
    lat_rest = {"pelvis": rpos[idx["LeftLeg"]] - rpos[idx["RightLeg"]], "chest": rpos[idx["LeftShoulder"]] - rpos[idx["RightShoulder"]]}
    rest_frame = {e["soma"]: basis(rpos_d[e["somaAim"]] - rpos_d[e["soma"]], lat_rest[e["lateral"]]) for e in MAP["bones"]}
    mapped = {e["soma"]: e for e in MAP["bones"]}

    f0 = src["frames"][0]["pos"]
    hleg = np.linalg.norm(np.array(f0["thigh_l"]) - f0["calf_l"]) + np.linalg.norm(np.array(f0["calf_l"]) - f0["foot_l"])
    sleg = np.linalg.norm(rpos[idx["LeftLeg"]] - rpos[idx["LeftShin"]]) + np.linalg.norm(rpos[idx["LeftShin"]] - rpos[idx["LeftFoot"]])
    k = sleg / hleg                                              # hero -> SOMA length scale
    head_rest_q = R.from_quat(src["headRestQ"])
    head_vec = np.array(src["headRestAim"])

    frames_local, hips_xz = [], []
    for fr in src["frames"]:
        p = {n: np.array(v) for n, v in fr["pos"].items()}
        lat = {"pelvis": p["thigh_l"] - p["thigh_r"], "chest": p["clavicle_l"] - p["clavicle_r"]}
        local, world = ref.copy(), [None] * len(names)
        for i, n in enumerate(names):
            if n in mapped:
                e = mapped[n]
                if "heroAimVector" in e:
                    aim = (R.from_quat(fr["rot"]["head"]) * head_rest_q.inv()).apply(head_vec)
                else:
                    aim = p[e["heroAim"]] - p[e["hero"]]
                W = basis(aim, lat[e["lateral"]]) * rest_frame[n].inv() * rrot[i]
            else:
                pw = world[par[i]] if par[i] >= 0 else None
                W = pw * (rrot[par[i]].inv() * rrot[i]) if pw is not None else rrot[i]
            world[i] = W
            local[i, 3:7] = (world[par[i]].inv() * W if par[i] >= 0 else W).as_quat()
        hips = np.array(fr["pos"]["pelvis"]) * k
        hips_xz.append(hips[[0, 2]])
        local[0, :3] = hips
        frames_local.append(local)
    frames_local = np.array(frames_local)
    mean_xz = np.mean(hips_xz, axis=0)
    frames_local[:, 0, 0] -= mean_xz[0]
    frames_local[:, 0, 2] -= mean_xz[1]

    # ground: the lowest ankle of the loop stands on the SOMA reference ankle height (keeps the source's bob)
    ankle = [min(fk(names, par, f)[0][[idx["LeftFoot"], idx["RightFoot"]], 1]) for f in frames_local]
    frames_local[:, 0, 1] += ANKLE_REST - min(ankle)

    # unroll LOOPS loops, hips travelling forward (+Z) at the clip's own ground speed
    n, speed = len(frames_local), src["speedMps"]
    out = np.tile(frames_local, (LOOPS, 1, 1))
    out[:, 0, 2] += speed * np.arange(len(out)) / src["fps"]
    # report: how closely do SOMA bone directions follow the hero's own
    errs = []
    for t in range(0, n, 3):
        sp, _ = fk(names, par, frames_local[t])
        p = {nm: np.array(v) for nm, v in src["frames"][t]["pos"].items()}
        for e in MAP["bones"]:
            if "heroAimVector" in e:
                continue
            a = sp[idx[e["somaAim"]]] - sp[idx[e["soma"]]]
            b = p[e["heroAim"]] - p[e["hero"]]
            errs.append(np.degrees(np.arccos(np.clip(a @ b / np.linalg.norm(a) / np.linalg.norm(b), -1, 1))))
    stats = {"gait": gait, "frames": len(out), "speed_mps": speed, "scale": k, "aim_error_deg": {"mean": float(np.mean(errs)), "max": float(np.max(errs))},
             "hips_y": [float(frames_local[:, 0, 1].min()), float(frames_local[:, 0, 1].max())]}
    np.save(OUT / f"own-{gait}.targets.npy", out.astype(np.float32))
    (OUT / f"own-{gait}.targets.json").write_text(json.dumps(stats))
    print(json.dumps(stats))


if __name__ == "__main__":
    skeleton = load_skeleton()
    for g in sys.argv[1:] or ["walk", "run"]:
        convert(skeleton, g)
