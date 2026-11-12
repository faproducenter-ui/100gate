# Isolated MotionBricks lab. Nothing here touches the game project or the system Python.
# Needs ~3 GB of disk: LFS models (SOMA fp16 380 MB, fp32 758 MB), Python 3.12 (uv fetches it), warp 150 MB,
# TensorRT 10.8 for CUDA 12 (~1 GB, resolved through pypi.nvidia.com), newton/usd/numpy/scipy.
#
#   powershell -ExecutionPolicy Bypass -File tools/motionbricks/lab/setup.ps1
$ErrorActionPreference = 'Stop'
$lab = 'C:\Users\libde\motionbricks-lab'
New-Item -ItemType Directory -Force $lab | Out-Null
Set-Location $lab
if (-not (Test-Path motionbricks)) {
  $env:GIT_LFS_SKIP_SMUDGE = '1'
  git clone --depth 1 https://github.com/NVlabs/motionbricks.git
  Remove-Item Env:GIT_LFS_SKIP_SMUDGE
}
Set-Location motionbricks
# only what the locomotion prototype needs (LFS): SOMA FP16 model, the SOMA skeleton and the walk/jog clips
git lfs pull --include="motionbricks/assets/onnx/soma/mmm_v6_soma_fp16.onnx,motionbricks/assets/human/**,assets/motions/soma/locomotion/**"
uv sync --python 3.12            # creates .venv inside the lab folder only
uv run python ..\..\100gate\tools\motionbricks\lab\probe_gpu.py
