/**
 * Ops helper: create/import Vertex AI Search (Discovery Engine) for video_registry.
 * Prefer user credentials: gcloud auth print-access-token + X-Goog-User-Project.
 *
 *   powershell -File scripts/setup-vertex-video-search.ps1
 */
$ErrorActionPreference = 'Stop'
$Project = 'resumora-live'
$DataStoreId = 'resumora-video-search-v2'
$EngineId = 'resumora-video-search-v2'
$Collection = 'video_registry'
$Staging = 'gs://resumora-backups/discovery-import/'

$env:Path = "C:\Users\user\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin;" + $env:Path
gcloud services enable discoveryengine.googleapis.com --project=$Project | Out-Null
try {
  gcloud auth application-default set-quota-project $Project 2>$null | Out-Null
} catch {}

$Token = gcloud auth print-access-token
$Headers = @{
  Authorization = "Bearer $Token"
  'Content-Type' = 'application/json'
  'X-Goog-User-Project' = $Project
}
$Base = "https://discoveryengine.googleapis.com/v1/projects/$Project/locations/global/collections/default_collection"

Write-Host "Ensuring data store $DataStoreId..."
try {
  Invoke-RestMethod -Uri "$Base/dataStores/$DataStoreId" -Headers $Headers -Method GET | Out-Null
  Write-Host '  exists'
} catch {
  $body = @{
    displayName = 'Resumora Video Search'
    industryVertical = 'GENERIC'
    solutionTypes = @('SOLUTION_TYPE_SEARCH')
    contentConfig = 'NO_CONTENT'
  } | ConvertTo-Json
  Invoke-RestMethod -Uri "$Base/dataStores?dataStoreId=$DataStoreId" -Method POST -Headers $Headers -Body $body | Out-Null
  Write-Host '  created'
}

Write-Host "Ensuring engine $EngineId..."
try {
  Invoke-RestMethod -Uri "$Base/engines/$EngineId" -Headers $Headers -Method GET | Out-Null
  Write-Host '  exists'
} catch {
  $engineBody = @{
    displayName = 'Resumora Video Search App'
    solutionType = 'SOLUTION_TYPE_SEARCH'
    searchEngineConfig = @{ searchTier = 'SEARCH_TIER_STANDARD' }
    dataStoreIds = @($DataStoreId)
  } | ConvertTo-Json -Depth 6
  Invoke-RestMethod -Uri "$Base/engines?engineId=$EngineId" -Method POST -Headers $Headers -Body $engineBody | Out-Null
  Write-Host '  created'
}

Write-Host "Importing Firestore $Collection..."
$importBody = @{
  firestoreSource = @{
    projectId = $Project
    databaseId = '(default)'
    collectionId = $Collection
    gcsStagingDir = $Staging
  }
  reconciliationMode = 'INCREMENTAL'
  autoGenerateIds = $true
} | ConvertTo-Json -Depth 10
$op = Invoke-RestMethod -Uri "$Base/dataStores/$DataStoreId/branches/default_branch/documents:import" `
  -Method POST -Headers $Headers -Body $importBody
Write-Host "  operation: $($op.name)"
Write-Host 'Done. Poll operation until done=true, then GET /api/video/search?q=interview'
