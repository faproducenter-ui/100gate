# SPDX-License-Identifier: Apache-2.0  (adapted from NVlabs/motionbricks docs/examples/locomotion_loop.py)
"""Generate straight-line SOMA walking / running with MotionBricks and dump the joint world positions as JSON.

Verified on RTX 2050 (FP16): ~22 ms per generation.
generation half of the prototype; tools/motionbricks/retarget.mjs consumes its output unchanged (the stand-in BVH
reader produces the same structure).

Run from the cloned official repo (so its `docs/examples/_rig.py` helpers are importable):

    cd C:/Users/libde/motionbricks-lab/motionbricks
    uv run python C:/Users/libde/100gate/tools/motionbricks/lab/generate_locomotion.py --gait walk --seconds 8
    uv run python C:/Users/libde/100gate/tools/motionbricks/lab/generate_locomotion.py --gait run  --seconds 8

Output: tools/motionbricks/out/<gait>.soma.json
    { "fps": 30, "joints": [30 names], "frames": [ [[x,y,z] per joint], ... ] }   metres, SOMA world space, Y up
"""

import argparse
import json
import math
import sys
import time
from pathlib import Path

import numpy as np
import warp as wp

REPO = Path.cwd()
sys.path.insert(0, str(REPO / "docs" / "examples"))

from _rig import ASSETS, JOG, WALK, Rig, root_positions, sample_window  # noqa: E402  (official helper)
from motionbricks.inference.builder import TensorRTBuildOptions  # noqa: E402
from motionbricks.io.bvh import load_bvh  # noqa: E402
from motionbricks.io.usd import load_skeleton_from_usd  # noqa: E402
from motionbricks.io.utils import SOMA_SKELETON_PRIM_PATH, get_asset_file  # noqa: E402
from motionbricks.model.contract import MODEL_POSES_PER_TOKEN  # noqa: E402
from motionbricks.model.soma.contract import SOMA_N1_FP16_ONNX_PATH, SOMA_N1_FP32_ONNX_PATH  # noqa: E402
from motionbricks.model.soma.engine import MotionBricksSOMAEngine  # noqa: E402
from motionbricks.utils.space_conversion_utils import FacingDirectionType, SpaceConverter  # noqa: E402
from motionbricks.runtime.motion_player import GeneratedMotionPlayer  # noqa: E402
from motionbricks.runtime.target_pose import (  # noqa: E402
    TargetPoseInferenceParams,
    adjust_target_pose_speed,
    place_target_poses,
)

OUT = Path(__file__).resolve().parents[1] / "out"
UPDATE_RATE = 60.0
# Target clip + the ground speed the targets are scaled to. The game's own gaits are ~1.4 m/s (walk) and ~2.7 m/s (run).
GAITS = {"walk": (WALK, 1.4), "run": (JOG, 2.7), "crouch": (WALK, 0.9)}   # crouch exists only with --targets own
LEAD_SECONDS = 1.0
TRANSITION_EARLY_BY = 4


def canonical_target(rig, clip_time: float, speed: float, poses: wp.array) -> None:
    """The target poses of the example, at the origin facing +X, scaled to `speed` (see locomotion_loop.canonical_target)."""
    sample_window(rig, clip_time, poses)
    roots = root_positions(poses)
    offset = roots[-1, :2] - roots[0, :2]
    heading = math.atan2(offset[1], offset[0])
    origin = wp.transform(wp.vec3(roots[0, 0], roots[0, 1], 0.0), wp.quat_from_axis_angle(wp.vec3(0.0, 0.0, 1.0), heading))
    sample_window(rig, clip_time, poses, root_offset=wp.transform_inverse(origin))
    adjust_target_pose_speed(poses, speed, stream=rig.engine.stream)


def load_soma_rig(clip_name: str, fp16: bool) -> Rig:
    """Same as the official _rig.load_rig('soma'), but with the mixed-FP16 engine (the FP32 model is 758 MB; FP16 380 MB)."""
    skeleton = load_skeleton_from_usd(get_asset_file("human", "soma_base_skel_minimal_no_root.usd"), SOMA_SKELETON_PRIM_PATH)
    clip = load_bvh(str(ASSETS / "soma" / f"{clip_name}.bvh"), skeleton)
    to_runtime = SpaceConverter(FacingDirectionType.MUJOCO).convert_transform(wp.transform_identity())
    engine = MotionBricksSOMAEngine(
        SOMA_N1_FP16_ONNX_PATH if fp16 else SOMA_N1_FP32_ONNX_PATH, model_to_runtime=to_runtime,
        build_options=TensorRTBuildOptions(enable_fp16=fp16),
    )
    return Rig(engine, clip, skeleton, skeleton.reference_local_transforms, to_runtime)


def own_clip(skeleton, gait: str):
    """Our own Walk/Run (out/own-<gait>.targets.npy from lab/own_targets.py) as the target clip instead of NVIDIA's samples."""
    from motionbricks.animation.animation_buffer import AnimationBuffer

    poses = np.load(OUT / f"own-{gait}.targets.npy")
    speed = json.loads((OUT / f"own-{gait}.targets.json").read_text())["speed_mps"]
    return AnimationBuffer(skeleton, 30.0, wp.array(poses, dtype=wp.transform)), speed


def run(gait: str, seconds: float, fp16: bool, own: bool = False) -> dict:
    wp.init()
    wp.set_device("cuda:0")
    clip_name, speed = GAITS[gait]
    rig = load_soma_rig(clip_name, fp16)
    if own:                                                    # targets from our own animation (no NVIDIA sample data)
        rig.clip, speed = own_clip(rig.skeleton, gait)
    frames = []
    t0 = time.time()
    with rig.engine as engine, wp.ScopedStream(engine.stream):
        print(f"engine ready after {time.time() - t0:.1f} s (first launch builds the TensorRT plan)")
        player = GeneratedMotionPlayer(engine, rig.skeleton)
        jog = wp.empty((MODEL_POSES_PER_TOKEN, *rig.reference_pose.shape), dtype=rig.reference_pose.dtype)
        canonical_target(rig, 1.8, speed, jog)
        target = wp.empty_like(jog)
        settings = TargetPoseInferenceParams(transition_early_by_frames=TRANSITION_EARLY_BY, num_poses_to_use=4)
        current = wp.clone(jog[MODEL_POSES_PER_TOKEN - 1])
        player.seed_history_from_pose(current)
        contacts = wp.zeros(4, dtype=wp.float32)
        world = wp.zeros(rig.skeleton.num_joints, dtype=wp.transform)
        direction = wp.vec3(1.0, 0.0, 0.0)
        gens, gen_ms = 0, []
        dt = 1.0 / UPDATE_RATE
        for step in range(round(seconds * UPDATE_RATE)):
            pos = root_positions(current.reshape((1, -1)))[0] * np.array([1.0, 1.0, 0.0])
            if gens == 0 or player.time_to_transition <= dt:
                ground = pos + np.array([1.0, 0.0, 0.0]) * speed * LEAD_SECONDS
                g0 = time.time()
                place_target_poses(wp.vec3(*ground), direction, jog, target, stream=engine.stream)
                player.generate(target, settings)
                engine.synchronize()
                gen_ms.append((time.time() - g0) * 1000)
                gens += 1
            player.sample(dt, current, contacts)
            player.record_pose(dt, current)
            if step % 2 == 0:                                   # 60 Hz loop -> 30 Hz clip
                rig.skeleton.compute_world_transforms(current, world, rig.model_to_runtime)
                engine.synchronize()
                t = world.numpy()                               # [joint, 7] = x y z + quaternion; world space is Z up
                frames.append(t[:, :3].tolist())
    # Raw engine/world output is kept as is; the axis convention is detected and fixed in tools/motionbricks/soma-json.mjs.
    OUT.mkdir(exist_ok=True)
    payload = {"fps": 30, "joints": list(rig.skeleton.joint_names), "frames": frames,
               "meta": {"gait": gait, "targets": "own" if own else "nvidia-samples", "speed_mps": speed, "precision": "fp16" if fp16 else "fp32",
                        "generations": gens, "generation_ms": {"mean": float(np.mean(gen_ms)), "max": float(np.max(gen_ms))}}}
    (OUT / f"{'own-' if own else ''}{gait}.soma.json").write_text(json.dumps(payload))
    print(json.dumps(payload["meta"], indent=1))
    return payload


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--gait", choices=list(GAITS), default="walk")
    ap.add_argument("--seconds", type=float, default=8.0)
    ap.add_argument("--fp16", action="store_true", help="mixed FP16 model (380 MB, recommended for a 4 GB card); default is FP32 (758 MB)")
    ap.add_argument("--targets", choices=["nvidia", "own"], default="nvidia", help="own = target poses from our hero animation (stage 4)")
    a = ap.parse_args()
    run(a.gait, a.seconds, a.fp16, a.targets == "own")
