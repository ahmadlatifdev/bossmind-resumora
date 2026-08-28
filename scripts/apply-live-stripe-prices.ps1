#Requires -Version 5.1
<#
.SYNOPSIS
  Reads Live Stripe price IDs + pk_live from .env.local (never prints full secrets),
  syncs aliases, prints safe gcloud/firebase commands, and can apply Cloud Run price env vars.

.USAGE
  1) Put Live values into D:\BossMind\bossmind-resumora\.env.local (NOT into chat)
  2) powershell -ExecutionPolicy Bypass -File scripts\apply-live-stripe-prices.ps1
  3) Optional: -ApplyCloudRun  -Build  -DeployHosting
#>
param(
  [switch]$ApplyCloudRun,
  [switch]$Build,
  [switch]$DeployHosting,
  [string]$ProjectId = 'resumora-live',
  [string]$Region = 'us-central1'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$envFile = Join-Path $root '.env.local'
if (-not (Test-Path $envFile)) { throw ".env.local not found at $envFile" }

function Get-DotEnvMap([string]$path) {
  $map = @{}
  Get-Content $path | ForEach-Object {
    if ($_ -match '^\s*#') { return }
    if ($_ -match '^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$') {
      $map[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
    }
  }
  return $map
}

function Prefix10([string]$v) {
  if ([string]::IsNullOrWhiteSpace($v)) { return '(empty)' }
  return $v.Substring(0, [Math]::Min(10, $v.Length)) + '...'
}

function Assert-Price([string]$name, [string]$v) {
  if ([string]::IsNullOrWhiteSpace($v) -or $v -notmatch '^price_') {
    throw "Missing/invalid $name (must be price_... in .env.local). Got: $(Prefix10 $v)"
  }
  if ($v -match 'test') {
    Write-Warning "$name looks like a test price id: $(Prefix10 $v)"
  }
}

$map = Get-DotEnvMap $envFile

# Canonical env names used by functions/index.js + src/lib/plans.js
$basic = $map['STRIPE_PRICE_BASIC']
if (-not $basic) { $basic = $map['VITE_STRIPE_PRICE_BASIC'] }
if (-not $basic) { $basic = $map['NEXT_PUBLIC_STRIPE_PRICE_BASIC'] }

$balanced = $map['STRIPE_PRICE_BALANCED']
if (-not $balanced) { $balanced = $map['VITE_STRIPE_PRICE_BALANCED'] }
if (-not $balanced) { $balanced = $map['STRIPE_PRICE_PRO'] }
if (-not $balanced) { $balanced = $map['NEXT_PUBLIC_STRIPE_PRICE_PRO'] }
if (-not $balanced) { $balanced = $map['VITE_STRIPE_PRICE_PRO'] }

$professional = $map['STRIPE_PRICE_PROFESSIONAL_TIER']
if (-not $professional) { $professional = $map['VITE_STRIPE_PRICE_PROFESSIONAL_TIER'] }
if (-not $professional) { $professional = $map['STRIPE_PRICE_BUSINESS'] }
if (-not $professional) { $professional = $map['VITE_STRIPE_PRICE_ELITE'] }
if (-not $professional) { $professional = $map['NEXT_PUBLIC_STRIPE_PRICE_ELITE'] }

$advanced = $map['STRIPE_PRICE_ADVANCED']
if (-not $advanced) { $advanced = $map['VITE_STRIPE_PRICE_ADVANCED'] }
if (-not $advanced) { $advanced = $map['STRIPE_PRICE_ENTERPRISE'] }
if (-not $advanced) { $advanced = $map['NEXT_PUBLIC_STRIPE_PRICE_ESSENTIAL_ADVANCED'] }

$pk = $map['VITE_STRIPE_PUBLISHABLE_KEY']
if (-not $pk) { $pk = $map['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'] }

Assert-Price 'Basic($29)/STRIPE_PRICE_BASIC' $basic
Assert-Price 'Pro($49)/STRIPE_PRICE_BALANCED' $balanced
Assert-Price 'Business($79)/STRIPE_PRICE_PROFESSIONAL_TIER' $professional
Assert-Price 'Enterprise($110)/STRIPE_PRICE_ADVANCED' $advanced

if ([string]::IsNullOrWhiteSpace($pk) -or $pk -notmatch '^pk_live_') {
  throw "VITE_STRIPE_PUBLISHABLE_KEY / NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY must be pk_live_... in .env.local (got $(Prefix10 $pk))"
}

Write-Host '=== Live price cutover check (prefixes only) ==='
Write-Host "Basic       `$29  -> $(Prefix10 $basic)"
Write-Host "Pro         `$49  -> $(Prefix10 $balanced)"
Write-Host "Business    `$79  -> $(Prefix10 $professional)"
Write-Host "Enterprise  `$110 -> $(Prefix10 $advanced)"
Write-Host "Publishable       -> $(Prefix10 $pk)"

# Sync aliases into .env.local (same values, no chat)
$updates = @{
  'STRIPE_PRICE_BASIC' = $basic
  'VITE_STRIPE_PRICE_BASIC' = $basic
  'NEXT_PUBLIC_STRIPE_PRICE_BASIC' = $basic
  'STRIPE_PRICE_BALANCED' = $balanced
  'VITE_STRIPE_PRICE_BALANCED' = $balanced
  'STRIPE_PRICE_PROFESSIONAL_TIER' = $professional
  'VITE_STRIPE_PRICE_PROFESSIONAL_TIER' = $professional
  'VITE_STRIPE_PRICE_ELITE' = $professional
  'NEXT_PUBLIC_STRIPE_PRICE_ELITE' = $professional
  'STRIPE_PRICE_ADVANCED' = $advanced
  'VITE_STRIPE_PRICE_ADVANCED' = $advanced
  'NEXT_PUBLIC_STRIPE_PRICE_ESSENTIAL_ADVANCED' = $advanced
  'VITE_STRIPE_PUBLISHABLE_KEY' = $pk
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY' = $pk
}

$lines = Get-Content $envFile
$written = @{}
$out = New-Object System.Collections.Generic.List[string]
foreach ($line in $lines) {
  if ($line -match '^\s*([A-Za-z0-9_]+)\s*=') {
    $k = $Matches[1]
    if ($updates.ContainsKey($k)) {
      if (-not $written.ContainsKey($k)) {
        $out.Add("$k=$($updates[$k])")
        $written[$k] = $true
      }
      continue
    }
  }
  $out.Add($line)
}
foreach ($k in $updates.Keys) {
  if (-not $written.ContainsKey($k)) { $out.Add("$k=$($updates[$k])") }
}
[IO.File]::WriteAllLines($envFile, $out)
Write-Host "Synced aliases into .env.local"

$priceEnv = "STRIPE_PRICE_BASIC=$basic,STRIPE_PRICE_BALANCED=$balanced,STRIPE_PRICE_PROFESSIONAL_TIER=$professional,STRIPE_PRICE_ADVANCED=$advanced,VITE_STRIPE_PRICE_BASIC=$basic,VITE_STRIPE_PRICE_BALANCED=$balanced,VITE_STRIPE_PRICE_ELITE=$professional,VITE_STRIPE_PRICE_ADVANCED=$advanced,NEXT_PUBLIC_STRIPE_PRICE_BASIC=$basic,NEXT_PUBLIC_STRIPE_PRICE_ELITE=$professional,NEXT_PUBLIC_STRIPE_PRICE_ESSENTIAL_ADVANCED=$advanced"

Write-Host ''
Write-Host '=== Cloud Run price env update (secret key stays in Secret Manager) ==='
Write-Host "gcloud run services update createcheckoutsession --project=$ProjectId --region=$Region --update-env-vars=<price_* redacted> --quiet"
Write-Host "gcloud run services update stripewebhook --project=$ProjectId --region=$Region --update-env-vars=<price_* redacted> --quiet"

if ($ApplyCloudRun) {
  Write-Host 'Applying Cloud Run price env vars...'
  gcloud run services update createcheckoutsession --project=$ProjectId --region=$Region --update-env-vars=$priceEnv --quiet
  gcloud run services update stripewebhook --project=$ProjectId --region=$Region --update-env-vars=$priceEnv --quiet
  Write-Host 'Cloud Run price env updated.'
}

Write-Host ''
Write-Host '=== Frontend build / hosting ==='
Write-Host 'npm run build'
Write-Host 'npx firebase-tools deploy --only hosting --project resumora-live'
if ($Build) {
  npm run build
}
if ($DeployHosting) {
  $token = (gcloud auth print-access-token)
  npx --yes firebase-tools@latest deploy --only hosting --project resumora-live --token $token
}

Write-Host ''
Write-Host '=== Verify (expect cs_live_) ==='
Write-Host @'
$tmp = Join-Path $env:TEMP stripe-probe-body.json
Set-Content $tmp '{"planId":"basic","expectedCents":2900}' -NoNewline
curl.exe -sS -m 45 -X POST "https://us-central1-resumora-live.cloudfunctions.net/createCheckoutSession" -H "Content-Type: application/json" --data-binary "@$tmp"
curl.exe -sS -m 45 -X POST "https://resumora.net/api/create-checkout-session" -H "Content-Type: application/json" --data-binary "@$tmp"
'@

Write-Host ''
Write-Host 'SECURITY: Do not paste sk_live_ / pk_live_ / whsec_ / full price IDs into Cursor chat.'
Write-Host 'Reply in chat only: "prices ready" after .env.local is filled.'
