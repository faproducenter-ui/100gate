param(
    [string]$Blender = 'C:/Program Files/Blender Foundation/Blender 4.5/blender.exe',
    [switch]$DenseContacts
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $root
try {
    if (-not (Test-Path -LiteralPath $Blender -PathType Leaf)) { throw "Missing Blender: $Blender" }
    function Invoke-ArtStage([string]$Source, [string[]]$Scripts) {
        if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) { throw "Missing source: $Source" }
        $arguments = @('-b', $Source, '--python-exit-code', '1')
        foreach ($script in $Scripts) { $arguments += @('--python', $script) }
        & $Blender @arguments
        if ($LASTEXITCODE -ne 0) { throw "Blender art stage FAILED ($LASTEXITCODE): $Source" }
    }
    # The canonical sources are inputs only. Every intermediate goes to outputs/.
    Invoke-ArtStage 'art/intro-cinematic-blocking.blend' @('scripts/art/prepare_runtime_skin.py')
    Invoke-ArtStage 'outputs/cinematic-intro/cinematic-runtime-skin.blend' @('scripts/art/solve_restrained_shoulders.py')
    Invoke-ArtStage 'outputs/cinematic-intro/cinematic-shoulders-solved.blend' @('scripts/art/align_bound_wrists.py')
    Invoke-ArtStage 'outputs/cinematic-intro/cinematic-neutral-wrists.blend' @('scripts/art/fit_bound_cloth_physics.py')
    Invoke-ArtStage 'outputs/cinematic-intro/cinematic-cloth-physical.blend' @('scripts/art/refine_field_knife.py')
    Invoke-ArtStage 'outputs/cinematic-intro/cinematic-props-refined.blend' @('scripts/art/author_bound_restraints.py')
    Invoke-ArtStage 'outputs/cinematic-intro/cinematic-bound-restraints.blend' @('scripts/art/author_bound_performance.py','scripts/art/export_bound_performance.py')
    $arguments = @('-b','outputs/cinematic-intro/bound-chair-performance-partial.blend','--python-exit-code','1','--python','scripts/art/audit_bound_performance.py')
    if ($DenseContacts) { $arguments += @('--','--dense') }
    & $Blender @arguments
    if ($LASTEXITCODE -ne 0) { throw 'Evaluated surface contact gate FAILED' }
    Write-Output 'BOUND fragment only: build and contact gates passed. Visual review and browser tests are still required.'
} finally { Pop-Location }
