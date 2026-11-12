# SPDX-License-Identifier: Apache-2.0
"""Can this machine run MotionBricks? Prints facts and builds nothing large.

    cd C:/Users/libde/motionbricks-lab/motionbricks && uv run python C:/Users/libde/100gate/tools/motionbricks/lab/probe_gpu.py

Checks: Warp sees the CUDA device, its compute capability and free memory, the TensorRT Python package imports,
and (optional --build) that the SOMA FP16 plan builds in the available VRAM, with the time one generation takes.
"""

import argparse
import sys
import time

import warp as wp


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--build", action="store_true", help="build the SOMA FP16 TensorRT plan and time a generation")
    a = ap.parse_args()
    wp.init()
    dev = wp.get_cuda_device()
    free, total = dev.get_memory_info() if hasattr(dev, "get_memory_info") else (0, 0)
    print(f"device {dev.name}  sm_{dev.arch}  VRAM {total / 2**30:.1f} GiB, free {free / 2**30:.1f} GiB")
    try:
        import tensorrt as trt

        print("tensorrt", trt.__version__)
    except Exception as e:  # noqa: BLE001
        print("tensorrt import FAILED:", e)
        return 1
    if not a.build:
        return 0
    from pathlib import Path

    sys.path.insert(0, str(Path.cwd() / "docs" / "examples"))
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from generate_locomotion import GAITS  # noqa: PLC0415,F401  (same folder)
    from generate_locomotion import load_soma_rig  # noqa: PLC0415

    t0 = time.time()
    rig = load_soma_rig(GAITS["walk"][0], fp16=True)           # builds / loads the cached TensorRT plan
    with rig.engine as eng:
        print(f"FP16 plan ready in {time.time() - t0:.0f} s")
        eng.create_input(rig.skeleton), eng.create_input(rig.skeleton), eng.create_output(rig.skeleton)
        free2, _ = dev.get_memory_info() if hasattr(dev, "get_memory_info") else (0, 0)
        print(f"buffers created; VRAM in use by the engine ~ {(free - free2) / 2**20:.0f} MiB. Run generate_locomotion.py --fp16 for timings")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
