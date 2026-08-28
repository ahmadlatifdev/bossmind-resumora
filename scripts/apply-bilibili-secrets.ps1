# Apply Bilibili cookies to GCP Secret Manager (create if missing, then add version).
# Never prints secret values.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\apply-bilibili-secrets.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\apply-bilibili-secrets.ps1 -Path .\bilibili_secrets.env

param(
  [string]$Path = ".\bilibili_secrets.env",
  [string]$Project = "resumora-live"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not [System.IO.Path]::IsPathRooted($Path)) {
  $Path = Join-Path $Root ($Path -replace '^\.[\\/]', '')
}

$SecretNames = @(
  "BILIBILI_SESSDATA",
  "BILIBILI_BILI_JCT",
  "BILIBILI_DEDE_USER_ID"
)

function Write-Info([string]$msg) {
  Write-Host "[apply-bilibili-secrets] $msg"
}

function Get-GcloudCmdPath {
  $cmd = Get-Command gcloud.cmd -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) { return $cmd.Source }
  $ps1 = Get-Command gcloud -ErrorAction SilentlyContinue
  if ($ps1 -and $ps1.Source) {
    $dir = Split-Path -Parent $ps1.Source
    $candidate = Join-Path $dir "gcloud.cmd"
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  $fallback = Join-Path $env:LOCALAPPDATA "Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
  if (Test-Path -LiteralPath $fallback) { return $fallback }
  throw "gcloud.cmd not found on PATH"
}

$script:GcloudCmd = Get-GcloudCmdPath

function Invoke-Gcloud {
  param([Parameter(Mandatory = $true)][string[]]$GcloudArgs)
  # Prefer gcloud.cmd (not gcloud.ps1) so native stderr cannot disturb the PowerShell session.
  $argLine = ($GcloudArgs | ForEach-Object {
      if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ }
    }) -join ' '
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $script:GcloudCmd
  $psi.Arguments = $argLine
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true
  $proc = [System.Diagnostics.Process]::Start($psi)
  $null = $proc.StandardOutput.ReadToEnd()
  $null = $proc.StandardError.ReadToEnd()
  $proc.WaitForExit()
  return $proc.ExitCode
}

if (-not (Test-Path -LiteralPath $Path)) {
  throw "Missing $Path - create it with BILIBILI_SESSDATA / BILIBILI_BILI_JCT / BILIBILI_DEDE_USER_ID"
}

Write-Info "Project=$Project"
Write-Info "Reading secrets file (values not printed): $Path"

$map = @{}
foreach ($raw in Get-Content -LiteralPath $Path -Encoding UTF8) {
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

function Resolve-One($mapObj, [string[]]$keys) {
  foreach ($k in $keys) {
    if ($mapObj.ContainsKey($k) -and -not [string]::IsNullOrWhiteSpace([string]$mapObj[$k])) {
      return [string]$mapObj[$k].Trim()
    }
  }
  return ""
}

$payloads = @{
  "BILIBILI_SESSDATA"     = (Resolve-One $map @("BILIBILI_SESSDATA", "SESSDATA"))
  "BILIBILI_BILI_JCT"     = (Resolve-One $map @("BILIBILI_BILI_JCT", "BILIBILI_JCT", "bili_jct", "BILI_JCT"))
  "BILIBILI_DEDE_USER_ID" = (Resolve-One $map @("BILIBILI_DEDE_USER_ID", "BILIBILI_DEDEUSERID", "DedeUserID", "DEDE_USER_ID"))
}

$missing = @($SecretNames | Where-Object { -not $payloads[$_] })
if ($missing.Count -gt 0) {
  throw "Empty or missing required keys: $($missing -join ', ')"
}

$sessLen = $payloads["BILIBILI_SESSDATA"].Length
if ($sessLen -lt 40) {
  Write-Info "WARNING: BILIBILI_SESSDATA length=$sessLen (<40). Cookie may be incomplete."
} else {
  Write-Info "BILIBILI_SESSDATA length=$sessLen (OK)"
}

foreach ($secretName in $SecretNames) {
  $secretPayload = [string]$payloads[$secretName]
  if ([string]::IsNullOrWhiteSpace($secretPayload)) {
    throw "Refusing empty payload for $secretName"
  }

  Write-Info "Checking secret: $secretName"
  $describeCode = Invoke-Gcloud -GcloudArgs @("secrets", "describe", $secretName, "--project=$Project")
  if ($describeCode -ne 0) {
    Write-Info "Secret not found - creating: $secretName"
    $createCode = Invoke-Gcloud -GcloudArgs @("secrets", "create", $secretName, "--project=$Project", "--replication-policy=automatic")
    if ($createCode -ne 0) {
      $describeAgain = Invoke-Gcloud -GcloudArgs @("secrets", "describe", $secretName, "--project=$Project")
      if ($describeAgain -ne 0) {
        throw "Failed to create secret $secretName"
      }
      Write-Info "Secret now exists (created concurrently): $secretName"
    } else {
      Write-Info "Created secret: $secretName"
    }
  } else {
    Write-Info "Secret exists: $secretName"
  }

  $tmp = Join-Path $env:TEMP ("resumora-" + $secretName + "-" + [guid]::NewGuid().ToString("N") + ".tmp")
  try {
    [System.IO.File]::WriteAllText($tmp, $secretPayload)
    $len = (Get-Item -LiteralPath $tmp).Length
    if ($len -lt 1) { throw "Refusing empty file payload for $secretName" }
    Write-Info "Adding new version for $secretName (bytes=$len)"
    $addCode = Invoke-Gcloud -GcloudArgs @("secrets", "versions", "add", $secretName, "--project=$Project", "--data-file=$tmp")
    if ($addCode -ne 0) {
      throw "gcloud secrets versions add failed for $secretName (exit $addCode)"
    }
    Write-Info "SUCCESS: $secretName updated in Secret Manager"
  }
  finally {
    if (Test-Path -LiteralPath $tmp) {
      Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    }
  }
}

$pnTmp = Join-Path $env:TEMP ("resumora-pn-" + [guid]::NewGuid().ToString("N") + ".txt")
try {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $script:GcloudCmd
  $psi.Arguments = "projects describe $Project --format=value(projectNumber)"
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true
  $proc = [System.Diagnostics.Process]::Start($psi)
  $projectNumber = ($proc.StandardOutput.ReadToEnd()).Trim()
  $null = $proc.StandardError.ReadToEnd()
  $proc.WaitForExit()
} finally {
  if (Test-Path -LiteralPath $pnTmp) { Remove-Item $pnTmp -Force -ErrorAction SilentlyContinue }
}

if ($projectNumber) {
  $sa = "$projectNumber-compute@developer.gserviceaccount.com"
  foreach ($secretName in $SecretNames) {
    $null = Invoke-Gcloud -GcloudArgs @(
      "secrets", "add-iam-policy-binding", $secretName,
      "--project=$Project",
      "--member=serviceAccount:$sa",
      "--role=roles/secretmanager.secretAccessor",
      "--quiet"
    )
  }
  Write-Info "IAM secretAccessor ensured for compute SA"
}

Write-Info "Done. All three Bilibili secrets are present with a non-empty version."
Write-Info "Next: firebase deploy --only functions:resumora-checkout:generateGoogleVideo --project resumora-live"
