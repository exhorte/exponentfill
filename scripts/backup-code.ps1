# Backup of the code repository (the repo has no remote and, until the first commit, no history).
# Copies the working tree WITHOUT regenerable or heavy folders (node_modules, .venv, models, dist, .output, .wxt, out, .git is kept).
#   pwsh scripts/backup-code.ps1                      -> C:\Ebrain_os\sauvegardes\exponent-fill\<yyyy-MM-dd-HHmm>
#   pwsh scripts/backup-code.ps1 -Destination D:\bk   -> D:\bk\<yyyy-MM-dd-HHmm>
param([string]$Destination = "C:\Ebrain_os\sauvegardes\exponent-fill")

$ErrorActionPreference = "Stop"
$source = Split-Path -Parent $PSScriptRoot
$target = Join-Path $Destination (Get-Date -Format "yyyy-MM-dd-HHmm")
New-Item -ItemType Directory -Force -Path $target | Out-Null

robocopy $source $target /E /XD node_modules .venv models dist .output .wxt out .pytest_cache .ruff_cache test-results playwright-report __pycache__ /XF *.log /NFL /NDL /NJH /NJS /NP | Out-Null
# robocopy exit codes 0-7 are success
if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE" }

$files = (Get-ChildItem -Recurse -File $target | Measure-Object)
"{0} files, {1:N1} MB -> {2}" -f $files.Count, ((Get-ChildItem -Recurse -File $target | Measure-Object Length -Sum).Sum / 1MB), $target
