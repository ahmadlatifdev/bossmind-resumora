#Requires -Version 5.1
<#
.SYNOPSIS
  Defense-in-Depth security baseline for resumora-live (Levels 1 & 3).

.DESCRIPTION
  Automates Google Cloud Armor policy, audit logging, SCC Standard services,
  and invokes App Check setup. Safe to re-run (idempotent where APIs allow).

  Never prints sk_live_, whsec_, pk_live_, price_ IDs, or secret values.

.PARAMETER ProjectId
  GCP project (default resumora-live).

.PARAMETER GeoDenyCountries
  ISO 3166-1 alpha-2 codes to deny at edge (comma-separated). Empty = skip geo rule.

.PARAMETER WhatIf
  Print planned gcloud commands without executing.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\setup-security.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\setup-security.ps1 -GeoDenyCountries "CN,RU,KP"
#>
param(
  [string]$ProjectId = 'resumora-live',
  [string]$Domain = 'resumora.net',
  [string]$GeoDenyCountries = '',
  [string]$ArmorPolicyName = 'resumora-edge-policy',
  [string]$Region = 'us-central1',
  [switch]$SkipAppCheck,
  [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Write-Step { param([string]$Message) Write-Host "[setup-security] $Message" -ForegroundColor Cyan }
function Write-Ok { param([string]$Message) Write-Host "[setup-security] OK $Message" -ForegroundColor Green }
function Write-Warn { param([string]$Message) Write-Host "[setup-security] WARN $Message" -ForegroundColor Yellow }

function Invoke-GcloudRaw {
  param([string[]]$GcloudArgs)
  $argLine = ($GcloudArgs | ForEach-Object { if ($_ -match '\s') { "`"$_`"" } else { $_ } }) -join ' '
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'SilentlyContinue'
  try {
    $out = cmd.exe /c "gcloud $argLine 2>&1" | Out-String
    return @{ Output = $out; ExitCode = $LASTEXITCODE }
  }
  finally { $ErrorActionPreference = $prev }
}

function Invoke-Gcloud {
  param([string[]]$GcloudArgs, [string]$Label, [switch]$AllowExists)
  Write-Step $Label
  if ($WhatIf) {
    Write-Host "  gcloud $($GcloudArgs -join ' ')" -ForegroundColor DarkGray
    return
  }
  $r = Invoke-GcloudRaw -GcloudArgs $GcloudArgs
  if ($r.ExitCode -eq 0) { return }
  if ($AllowExists -and $r.Output -match 'already exists|ALREADY_EXISTS|duplicate') {
    Write-Warn "$Label (already exists)"
    return
  }
  Write-Host $r.Output
  throw "gcloud failed: $Label (exit $($r.ExitCode))"
}

try {
  Write-Host '=== Resumora Defense-in-Depth (Levels 1 & 3) ===' -ForegroundColor Yellow
  Write-Host "Project: $ProjectId | Domain: $Domain"

  if (-not $WhatIf) { $null = Get-Command gcloud -ErrorAction Stop }

  # --- Level 1: APIs ---
  Invoke-Gcloud @(
    'services', 'enable',
    'compute.googleapis.com',
    'recaptchaenterprise.googleapis.com',
    'firebaseappcheck.googleapis.com',
    'securitycenter.googleapis.com',
    'logging.googleapis.com',
    'cloudresourcemanager.googleapis.com',
    '--project', $ProjectId
  ) -Label 'Enable security APIs'

  # --- Level 1: Cloud Armor (edge policy for LB / Cloud Run backends) ---
  # Note: Firebase Hosting CDN has built-in DDoS; attach this policy when using
  # an external HTTPS load balancer in front of Cloud Run or custom origins.
  Invoke-Gcloud @(
    'compute', 'security-policies', 'create', $ArmorPolicyName,
    '--project', $ProjectId,
    '--description', "Resumora edge WAF/DDoS for $Domain"
  ) -Label "Create Cloud Armor policy $ArmorPolicyName" -AllowExists

  Invoke-Gcloud @(
    'compute', 'security-policies', 'rules', 'create', '1000',
    '--project', $ProjectId,
    '--security-policy', $ArmorPolicyName,
    '--expression', 'true',
    '--action', 'allow',
    '--description', 'Default allow (tune with geo/IP deny rules below)'
  ) -Label 'Cloud Armor default allow rule' -AllowExists

  if ($GeoDenyCountries) {
    $codes = ($GeoDenyCountries -split ',') | ForEach-Object { $_.Trim().ToUpper() } | Where-Object { $_ }
    $expr = ($codes | ForEach-Object { "origin.region_code == '$_'" }) -join ' || '
    Invoke-Gcloud @(
      'compute', 'security-policies', 'rules', 'create', '900',
      '--project', $ProjectId,
      '--security-policy', $ArmorPolicyName,
      '--expression', $expr,
      '--action', 'deny-403',
      '--description', 'Geo deny list (ISO 3166-1 alpha-2)'
    ) -Label 'Cloud Armor geo-deny rule' -AllowExists
  }
  else {
    Write-Warn 'GeoDenyCountries empty — skip geo deny rule (pass -GeoDenyCountries "CN,RU" to enable)'
  }

  # Adaptive Protection / L7 DDoS (Cloud Armor)
  Invoke-Gcloud @(
    'compute', 'security-policies', 'update', $ArmorPolicyName,
    '--project', $ProjectId,
    '--enable-layer7-ddos-defense'
  ) -Label 'Enable Cloud Armor L7 DDoS defense' -AllowExists

  Write-Ok "Cloud Armor policy $ArmorPolicyName ready (attach to backend service / URL map when using external HTTPS LB)"

  # --- Level 1: App Check (reCAPTCHA Enterprise) ---
  if (-not $SkipAppCheck) {
    Write-Step 'App Check — reCAPTCHA Enterprise (score threshold via APP_CHECK_RISK_THRESHOLD)'
    if ($WhatIf) {
      Write-Host '  node scripts/setup-app-check.mjs' -ForegroundColor DarkGray
    }
    else {
      $env:GCP_PROJECT_ID = $ProjectId
      if (-not $env:APP_CHECK_RISK_THRESHOLD) { $env:APP_CHECK_RISK_THRESHOLD = '0.5' }
      node scripts/setup-app-check.mjs
      if ($LASTEXITCODE -ne 0) { throw 'setup-app-check.mjs failed' }
      Write-Ok 'App Check key registered (store VITE_FIREBASE_APP_CHECK_SITE_KEY in GitHub Secrets — value not printed)'
    }
  }

  # --- Level 3: Security Command Center Standard services ---
  foreach ($svc in @('eventthreatdetection', 'securityhealthanalytics', 'websecurityscanner')) {
    Invoke-Gcloud @(
      'scc', 'settings', 'services', 'enable', $svc,
      '--project', $ProjectId
    ) -Label "Enable SCC service $svc" -AllowExists
  }

  # --- Level 3: Data Access audit logs (Firestore + Cloud Run + Functions) ---
  Write-Step 'Enable DATA_READ/DATA_WRITE audit logs for Firestore and Cloud Run'
  if ($WhatIf) {
    Write-Host @"
  gcloud projects get-iam-policy $ProjectId --format=json > audit-policy.json
  # Append auditConfigs for firestore.googleapis.com, run.googleapis.com, cloudfunctions.googleapis.com
  gcloud projects set-iam-policy $ProjectId audit-policy.json
"@ -ForegroundColor DarkGray
  }
  else {
    $tmpPolicy = Join-Path $env:TEMP "resumora-audit-policy-$ProjectId.json"
    $get = Invoke-GcloudRaw @('projects', 'get-iam-policy', $ProjectId, '--format=json')
    if ($get.ExitCode -ne 0) { throw 'get-iam-policy failed' }
    $policy = $get.Output | ConvertFrom-Json
    if (-not $policy.auditConfigs) { $policy | Add-Member -NotePropertyName auditConfigs -NotePropertyValue @() }
    $targets = @('firestore.googleapis.com', 'run.googleapis.com', 'cloudfunctions.googleapis.com')
    foreach ($svcName in $targets) {
      $existing = @($policy.auditConfigs | Where-Object { $_.service -eq $svcName })
      if ($existing.Count -eq 0) {
        $policy.auditConfigs += [pscustomobject]@{
          service = $svcName
          auditLogConfigs = @(
            @{ logType = 'DATA_READ' },
            @{ logType = 'DATA_WRITE' },
            @{ logType = 'ADMIN_READ' }
          )
        }
      }
    }
    $policy | ConvertTo-Json -Depth 20 | Set-Content -Path $tmpPolicy -Encoding utf8
    Invoke-Gcloud @('projects', 'set-iam-policy', $ProjectId, $tmpPolicy) -Label 'Apply project audit log config'
    Remove-Item -Force $tmpPolicy -ErrorAction SilentlyContinue
    Write-Ok 'Data Access audit logs configured for Firestore, Cloud Run, Cloud Functions'
  }

  # --- Level 3: Log sink for critical SCC-style alerts → Firestore (Admin dashboard) ---
  $sinkName = 'resumora-security-critical'
  $filter = 'severity>=CRITICAL AND (protoPayload.serviceName="firestore.googleapis.com" OR resource.type="cloud_run_revision" OR protoPayload.serviceName="run.googleapis.com")'
  Invoke-Gcloud @(
    'logging', 'sinks', 'create', $sinkName,
    "--project=$ProjectId",
    "--log-filter=$filter",
    '--description=Resumora critical security events for Admin dashboard'
  ) -Label 'Create critical security log sink' -AllowExists

  Write-Host ''
  Write-Host '=== SUCCESS: Defense-in-Depth baseline applied ===' -ForegroundColor Green
  Write-Host 'Level 2 (Firestore rules + Cloud Run IAP): see docs/SECURITY_DEFENSE_IN_DEPTH.md'
  Write-Host 'Deploy firestore.rules via CI: firebase deploy --only firestore:rules'
  Write-Host 'Admin SCC alerts: configure DEPLOY_ALERT_WEBHOOK or SECURITY_ALERT_WEBHOOK in GitHub Secrets'
}
catch {
  Write-Host "FAILURE: $($_.Exception.Message)" -ForegroundColor Red
  throw
}
