# Upsert Bilibili cookies into GCP Secret Manager (non-empty payloads only).
# Never prints secret values.
#
# Expected secret NAMES (must match Cloud Functions defineSecret):
#   BILIBILI_SESSDATA
#   BILIBILI_BILI_JCT
#   BILIBILI_DEDE_USER_ID
#
# Source file (gitignored): bilibili_secrets.env  OR use .env.local keys
# Format (one per line, no quotes required):
#   BILIBILI_SESSDATA=...
#   BILIBILI_BILI_JCT=...
#   BILIBILI_DEDE_USER_ID=...
# Aliases accepted: SESSDATA, bili_jct / BILIBILI_JCT, DedeUserID / BILIBILI_DEDEUSERID
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\upsert-bilibili-secrets.ps1
#   powershell -ExecutionPolicy Bypass -File .\scripts\upsert-bilibili-secrets.ps1 -SecretsFile .\bilibili_secrets.env

param(
  [string]$Project = "resumora-live",
  [string]$SecretsFile = "",
  [string]$Region = "us-central1"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Write-Info([string]$msg) {
  Write-Host "[upsert-bilibili-secrets] $msg"
}

function Get-EnvMapFromFile([string]$path) {
  $map = @{}
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Secrets file not found: $path"
  }
  foreach ($raw in Get-Content -LiteralPath $path -Encoding UTF8) {
    $line = $raw.Trim()
    if (-not $line -or $line.StartsWith("#")) { continue }
    $idx = $line.IndexOf("=")
    if ($idx -lt 1) { continue }
    $key = $line.Substring(0, $idx).Trim()
    $val = $line.Substring($idx + 1).Trim()
    if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) {
      $val = $val.Substring(1, $val.Length - 2)
    }
    if ($key) { $map[$key] = $val }
  }
  return $map
}

function Resolve-SecretValue($map, [string[]]$keys) {
  foreach ($k in $keys) {
    if ($map.ContainsKey($k) -and -not [string]::IsNullOrWhiteSpace([string]$map[$k])) {
      return [string]$map[$k].Trim()
    }
  }
  return ""
}

function Ensure-SecretExists([string]$name) {
  gcloud secrets describe $name --project=$Project 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Info "Creating secret $name"
    gcloud secrets create $name --project=$Project --replication-policy=automatic | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to create secret $name" }
  } else {
    Write-Info "Secret exists: $name"
  }
}

function Add-SecretVersion([string]$name, [string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Refusing empty payload for $name (Secret Payload cannot be empty)"
  }
  $tmp = Join-Path $env:TEMP ("resumora-" + $name + "-" + [guid]::NewGuid().ToString("N") + ".tmp")
  try {
    # Write bytes without trailing newline noise
    [System.IO.File]::WriteAllText($tmp, $value)
    $len = (Get-Item -LiteralPath $tmp).Length
    if ($len -lt 1) { throw "Refusing empty file payload for $name" }
    Write-Info "Adding version for $name (bytes=$len)"
    gcloud secrets versions add $name --project=$Project --data-file=$tmp | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "versions add failed for $name" }
    Write-Info "OK: $name"
  }
  finally {
    if (Test-Path -LiteralPath $tmp) {
      Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    }
  }
}

# Resolve secrets file
if (-not $SecretsFile) {
  $candidates = @(
    (Join-Path $Root "bilibili_secrets.env"),
    (Join-Path $Root "bilibili_secrets.txt"),
    (Join-Path $Root ".env.local")
  )
  foreach ($c in $candidates) {
    if (Test-Path -LiteralPath $c) { $SecretsFile = $c; break }
  }
}
if (-not $SecretsFile) {
  throw "No secrets file found. Create bilibili_secrets.env with BILIBILI_SESSDATA / BILIBILI_BILI_JCT / BILIBILI_DEDE_USER_ID"
}

Write-Info "Reading secrets file (values not printed)"
$map = Get-EnvMapFromFile $SecretsFile

$sess = Resolve-SecretValue $map @("BILIBILI_SESSDATA", "SESSDATA")
$jct = Resolve-SecretValue $map @("BILIBILI_BILI_JCT", "BILIBILI_JCT", "bili_jct", "BILI_JCT")
$dede = Resolve-SecretValue $map @("BILIBILI_DEDE_USER_ID", "BILIBILI_DEDEUSERID", "DedeUserID", "DEDE_USER_ID")

$missing = @()
if (-not $sess) { $missing += "BILIBILI_SESSDATA" }
if (-not $jct) { $missing += "BILIBILI_BILI_JCT" }
if (-not $dede) { $missing += "BILIBILI_DEDE_USER_ID" }
if ($missing.Count -gt 0) {
  throw "Empty or missing required keys in secrets file: $($missing -join ', ')"
}

Ensure-SecretExists "BILIBILI_SESSDATA"
Ensure-SecretExists "BILIBILI_BILI_JCT"
Ensure-SecretExists "BILIBILI_DEDE_USER_ID"

Add-SecretVersion "BILIBILI_SESSDATA" $sess
Add-SecretVersion "BILIBILI_BILI_JCT" $jct
Add-SecretVersion "BILIBILI_DEDE_USER_ID" $dede

# Grant default compute SA accessor (idempotent)
$projectNumber = gcloud projects describe $Project --format="value(projectNumber)"
if (-not $projectNumber) { throw "Could not resolve project number" }
$sa = "$projectNumber-compute@developer.gserviceaccount.com"
foreach ($s in @("BILIBILI_SESSDATA", "BILIBILI_BILI_JCT", "BILIBILI_DEDE_USER_ID")) {
  gcloud secrets add-iam-policy-binding $s --project=$Project `
    --member="serviceAccount:$sa" `
    --role="roles/secretmanager.secretAccessor" `
    --quiet 2>$null | Out-Null
}
Write-Info "IAM accessor ensured for runtime SA"
Write-Info "Done. Redeploy distributeMasterVideo next."
