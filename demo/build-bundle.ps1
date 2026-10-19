# Builds the POS demo bundle: a zip with the server images (no source code),
# the start/stop scripts, the README and the desktop installer.
#   powershell -ExecutionPolicy Bypass -File demo\build-bundle.ps1
# Requires Docker running and the GitHub CLI (gh) signed in.
param(
  [string]$DesktopVersion = "0.2.4",
  [string]$OutZip = (Join-Path ([Environment]::GetFolderPath("Desktop")) "POS-Demo.zip")
)
$ErrorActionPreference = "Stop"
$repo = Split-Path $PSScriptRoot -Parent
$stage = Join-Path $PSScriptRoot "dist\POS-Demo"

function Run($exe, [string[]]$argv) {
  & $exe @argv
  if ($LASTEXITCODE -ne 0) { throw "$exe $($argv -join ' ') failed ($LASTEXITCODE)" }
}

Write-Host "Building the API image..."
Run docker @("build", "-f", (Join-Path $repo "apps\api\Dockerfile"), "-t", "pos-demo-api:latest", $repo)
Run docker @("pull", "postgres:16-alpine")

if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force (Join-Path $stage "images") | Out-Null

# Scripts and README with Windows line endings (cmd.exe misparses LF-only .bat files).
foreach ($f in "start-demo.bat", "stop-demo.bat", "README-DEMO.txt", "docker-compose.yml") {
  $text = [IO.File]::ReadAllText((Join-Path $PSScriptRoot $f)) -replace "`r?`n", "`r`n"
  [IO.File]::WriteAllText((Join-Path $stage $f), $text, (New-Object Text.UTF8Encoding $false))
}

Write-Host "Saving the images..."
Run docker @("save", "-o", (Join-Path $stage "images\pos-demo-images.tar"), "pos-demo-api:latest", "postgres:16-alpine")

Write-Host "Downloading POS-Setup-$DesktopVersion.exe..."
Run gh @("release", "download", "v$DesktopVersion", "--repo", "AhmedGhaben/POS", "-p", "POS-Setup-$DesktopVersion.exe", "-D", $stage)

Write-Host "Zipping..."
if (Test-Path $OutZip) { Remove-Item -Force $OutZip }
Push-Location (Split-Path $stage -Parent)
try { Run tar @("-a", "-c", "-f", $OutZip, "POS-Demo") } finally { Pop-Location }
Write-Host "Done: $OutZip ($([math]::Round((Get-Item $OutZip).Length / 1MB)) MB)"
