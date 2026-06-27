# Fail fast if Firebase project is not locked to resumora-live
$ErrorActionPreference = "Stop"
$lockPath = Join-Path (Split-Path $PSScriptRoot -Parent) "firebase-deploy-lock.json"
$lock = Get-Content $lockPath -Raw | ConvertFrom-Json
$active = (firebase use 2>&1 | Out-String).Trim()
if ($active -ne $lock.firebase_project_id) {
    Write-Error "Firebase project must be $($lock.firebase_project_id). Active: $active"
}
foreach ($blocked in $lock.blocked_project_ids) {
    if ($active -eq $blocked) {
        Write-Error "Blocked Firebase project: $blocked"
    }
}
Write-Host "Firebase deploy lock OK: $active -> $($lock.client_hosting_site)" -ForegroundColor Green
