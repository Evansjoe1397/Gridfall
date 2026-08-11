$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$script = Join-Path $root "gridfall_scene.py"

if (-not (Get-Command blender -ErrorAction SilentlyContinue)) {
  Write-Host "Blender was not found in PATH."
  Write-Host "Install Blender or add blender.exe to PATH, then rerun this script."
  exit 1
}

blender --background --python $script

