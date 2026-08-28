# Prepare Resumora platform video variants (requires ffmpeg)
param(
  [Parameter(Mandatory = $true)][string]$Input,
  [string]$Id = "",
  [string]$Langs = "en,fr,es"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  Write-Host "ffmpeg missing. Install with: winget install --id=Gyan.FFmpeg -e"
  exit 1
}

$argsList = @(".\scripts\prepare-platform-videos.mjs", "--input", $Input, "--langs", $Langs)
if ($Id) { $argsList += @("--id", $Id) }
node @argsList
