#Requires -Version 5.1
<#
.SYNOPSIS
  Document / create placeholder Secret Manager IDs for BossMind harness (names only).

.DESCRIPTION
  Creates empty secret *containers* in GCP Secret Manager when missing.
  Does NOT print or set secret values. Add versions yourself with:
    echo VALUE | gcloud secrets versions add SECRET_ID --data-file=- --project=resumora-live

  Note: This repo historically had no setup-secrets.ps1; use this for harness key names.
  Prefer scripts/bootstrap-secrets.ps1 for GitHub Actions Firebase SA upload.

.PARAMETER ProjectId
  GCP project (default resumora-live).

.PARAMETER WhatIf
  Print planned secret IDs without calling gcloud.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\setup-secrets.ps1 -WhatIf
#>
[CmdletBinding()]
param(
  [string] $ProjectId = 'resumora-live',
  [switch] $WhatIf
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$secretIds = @(
  'HERMES_API_KEY',
  'HERMES_API_SERVER_KEY',
  'API_SERVER_KEY',
  'GEMINI_API_KEY',
  'ADMIN_REFUND_PASSWORD',
  'ALPHA_VANTAGE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET'
)

Write-Host "Project: $ProjectId"
Write-Host "Secret IDs (names only — never print values):"
$secretIds | ForEach-Object { Write-Host "  - $_" }

if ($WhatIf) {
  Write-Host "WhatIf: no gcloud calls."
  exit 0
}

foreach ($id in $secretIds) {
  $exists = & gcloud secrets describe $id --project=$ProjectId 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "EXISTS $id"
    continue
  }
  Write-Host "CREATE $id (empty container)"
  & gcloud secrets create $id --project=$ProjectId --replication-policy=automatic
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "Failed to create $id — check IAM / gcloud auth"
  }
}

Write-Host "Done. Add versions locally; never commit secret values."
Write-Host "Also run scripts/setup-deploy-iam.ps1 so Cloud Functions can access secrets."
