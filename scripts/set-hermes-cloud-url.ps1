#Requires -Version 5.1
<#
.SYNOPSIS
  Set HERMES_API_URL on Hermes-related Cloud Run services (resumora-live).

.DESCRIPTION
  Cloud Run cannot reach localhost / 127.0.0.1 on your laptop. Pass a
  Cloud-reachable HTTPS (or internal VPC) URL only.

.PARAMETER ApiUrl
  Base URL of the OpenAI-compatible Hermes gateway (no trailing slash).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\set-hermes-cloud-url.ps1 -ApiUrl "https://hermes.example.com"
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string] $ApiUrl,
  [string] $ProjectId = 'resumora-live',
  [string] $Region = 'us-central1',
  [string[]] $Services = @(
    'postadminhermescommand',
    'sendchatmessage',
    'gethermesstatus',
    'sethermeschat',
    'gethermesinsights'
  )
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$trimmed = $ApiUrl.Trim().TrimEnd('/')
if (-not $trimmed) { throw 'ApiUrl is empty.' }

$lower = $trimmed.ToLowerInvariant()
if (
  $lower -match 'localhost' -or
  $lower -match '127\.0\.0\.1' -or
  $lower -match '0\.0\.0\.0' -or
  $lower -match '\[::1\]'
) {
  throw @"
REFUSED: '$trimmed' is not reachable from Cloud Run.
Start a cloud-reachable Hermes gateway (Cloud Run service, HTTPS load balancer,
or a secure tunnel to your PC), then re-run with that public/internal URL.
Local gateway default is http://127.0.0.1:8642 — use only for laptop tests, never as Cloud Run HERMES_API_URL.
"@
}

if ($trimmed -notmatch '^https?://') {
  throw "ApiUrl must start with http:// or https://"
}

Write-Host "Project:  $ProjectId"
Write-Host "Region:   $Region"
Write-Host "HERMES_API_URL: (set; value not echoed beyond host)"
try {
  $uri = [Uri]$trimmed
  Write-Host "Host:     $($uri.Host)"
} catch {
  Write-Host "Host:     (parse skipped)"
}

foreach ($svc in $Services) {
  Write-Host "Updating $svc ..."
  & gcloud run services update $svc `
    --project=$ProjectId `
    --region=$Region `
    --update-env-vars="HERMES_API_URL=$trimmed" `
    --quiet
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "Failed to update $svc (exit $LASTEXITCODE). Continue with remaining services."
  } else {
    Write-Host "OK: $svc"
  }
}

Write-Host ""
Write-Host "Optional: mount bearer secret (create secret first if missing):"
Write-Host "  gcloud secrets create HERMES_API_SERVER_KEY --project=$ProjectId --replication-policy=automatic"
Write-Host "  gcloud secrets versions add HERMES_API_SERVER_KEY --project=$ProjectId --data-file=-"
Write-Host "  gcloud run services update SERVICE --project=$ProjectId --region=$Region --update-secrets=HERMES_API_SERVER_KEY=HERMES_API_SERVER_KEY:latest"
Write-Host ""
Write-Host "Prefer Functions redeploy via GitHub Actions after secrets exist so Gen2 defineSecret mounts stay consistent."
Write-Host "Verify: Master Admin → Hermes Chat → free-form question; engine should be hermes (not gemini)."
