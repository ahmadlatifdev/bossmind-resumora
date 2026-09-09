<#
.SYNOPSIS
  One-time notes for Phase 3 personalization schedulers.
.DESCRIPTION
  Firebase `onSchedule` creates Cloud Scheduler jobs automatically on Functions deploy.
  This script is optional verification / manual HTTP triggers (private invoker).
#>
$ErrorActionPreference = 'Stop'
$Project = 'resumora-live'
$Region = 'us-central1'

Write-Host "Phase 3 schedulers are defined in code:"
Write-Host "  computeEmbeddings        — 0 2 * * * UTC"
Write-Host "  computeRecommendations   — 30 2 * * * UTC"
Write-Host ""
Write-Host "After GHA deploy, verify:"
Write-Host "  gcloud scheduler jobs list --location=$Region --project=$Project"
Write-Host ""
Write-Host "Manual private triggers (identity token required):"
Write-Host "  computeEmbeddingsHttp / computeRecommendationsHttp"
Write-Host ""
Write-Host "Optional Pub/Sub topics are NOT required when using onSchedule."
