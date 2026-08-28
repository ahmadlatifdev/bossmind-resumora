<#
.SYNOPSIS
  Generate 4 Video Library EN masters with Veo 3 (functions/veo.js).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\generate-library-masters-veo.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\generate-library-masters-veo.ps1 -Only vid-resume-writing
#>

[CmdletBinding()]
param(
  [ValidateSet('direct', 'http')]
  [string]$Mode = 'direct',
  [string]$Only = '',
  [int]$DurationSeconds = 8
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

if (-not $env:GOOGLE_CLOUD_PROJECT) { $env:GOOGLE_CLOUD_PROJECT = 'resumora-live' }
if (-not $env:GCS_BUCKET_NAME -and -not $env:VEO_OUTPUT_BUCKET) {
  $env:GCS_BUCKET_NAME = 'resumora-videos'
}

# Prefer ADC from gcloud; optional SA JSON from Secret Manager (never echoed)
$secretNames = @('VEO_SERVICE_ACCOUNT_KEY', 'VEO_SERVICE_ACCOUNT_JSON')
foreach ($name in $secretNames) {
  if ($env:VEO_SERVICE_ACCOUNT_KEY -or $env:VEO_SERVICE_ACCOUNT_JSON) { break }
  $null = cmd /c "gcloud secrets describe $name --project=resumora-live 1>nul 2>nul"
  if ($LASTEXITCODE -eq 0) {
    $tmp = Join-Path $env:TEMP ("veo-sa-" + [guid]::NewGuid().ToString('N').Substring(0, 8) + '.json')
    try {
      gcloud secrets versions access latest --secret=$name --project=resumora-live --out-file=$tmp | Out-Null
      $env:VEO_SERVICE_ACCOUNT_KEY = Get-Content -Raw -Path $tmp
      Write-Host "Loaded $name into process env (value not printed)."
    } finally {
      if (Test-Path $tmp) { Remove-Item -Force $tmp }
    }
  }
}

$nodeArgs = @('scripts\generate-library-masters-veo.cjs')
if ($Mode -eq 'http') { $nodeArgs += '--http' } else { $nodeArgs += '--direct' }
if ($Only) { $nodeArgs += "--only=$Only" }
$nodeArgs += "--duration=$DurationSeconds"

Write-Host "Running: node $($nodeArgs -join ' ')"
& node @nodeArgs
if ($LASTEXITCODE -ne 0) { throw "generate-library-masters-veo failed ($LASTEXITCODE)" }
