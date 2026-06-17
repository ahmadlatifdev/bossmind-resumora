# Fix bossmind-resumora Firebase deploy blockers (run in PowerShell)
$ErrorActionPreference = "Stop"
$ProjectId = "key-journal-378204"
$Bucket = "bossmind-storage-10gb"
$Owner = "privategate777@gmail.com"
$Repo = "C:\Users\user\bossmind-resumora"

$gcloud = "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
if (-not (Test-Path $gcloud)) { $gcloud = "gcloud" }

# 1) Parent package.json breaks Vite (../package.json syntax error)
$badParent = "C:\Users\user\package.json"
if (Test-Path $badParent) {
    $first = Get-Content $badParent -TotalCount 1 -ErrorAction SilentlyContinue
    if ($first -match '^\s*#') {
        $bak = "C:\Users\user\package.json.corrupt.bak"
        Move-Item $badParent $bak -Force
        Write-Host "Moved corrupt parent package.json -> $bak" -ForegroundColor Yellow
    }
}

Set-Location $Repo

# 2) Wrong Firebase account (info@elegancyart.com has no access to key-journal-378204)
Write-Host "`n=== Firebase accounts ===" -ForegroundColor Cyan
firebase login:list 2>&1
$fbList = firebase login:list 2>&1 | Out-String
if ($fbList -match "info@elegancyart.com" -or $fbList -notmatch $Owner) {
    Write-Host "Logging out wrong Firebase account(s)..." -ForegroundColor Yellow
    firebase logout 2>&1 | Out-Null
    Write-Host @"

LOGIN REQUIRED — Firebase (owner account):
  firebase login --no-localhost
  -> Open URL in browser, sign in as $Owner, paste verification code.

"@ -ForegroundColor Yellow
}

# 3) gcloud owner account
Write-Host "=== gcloud accounts ===" -ForegroundColor Cyan
& $gcloud auth list 2>&1
$gcList = & $gcloud auth list 2>&1 | Out-String
if ($gcList -notmatch "\*\s+$Owner") {
    Write-Host @"

LOGIN REQUIRED — gcloud (owner account):
  gcloud auth login $Owner --no-launch-browser
  -> Open URL, sign in as $Owner, paste verification code.
  gcloud config set account $Owner
  gcloud config set project $ProjectId

"@ -ForegroundColor Yellow
} else {
    & $gcloud config set account $Owner | Out-Null
    & $gcloud config set project $ProjectId | Out-Null
}

# 4) Build (skip firebase init — firebase.json already exists)
Write-Host "`n=== npm build ===" -ForegroundColor Cyan
npm install
npm run build
if (-not (Test-Path dist)) { throw "dist/ missing after build" }
Write-Host "Build OK: dist/" -ForegroundColor Green

# 5) Deploy only if authenticated as owner
$fbAfter = firebase login:list 2>&1 | Out-String
$gcAfter = & $gcloud auth list 2>&1 | Out-String
if ($fbAfter -notmatch $Owner) {
    Write-Host "STOP: Complete Firebase login above, then re-run: .\FIX-DEPLOY.ps1" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== Firebase Hosting deploy ===" -ForegroundColor Cyan
firebase deploy --only hosting --project $ProjectId

Write-Host "`n=== GCS bucket ===" -ForegroundColor Cyan
$bucketUri = "gs://$Bucket"
$probe = & $gcloud storage buckets describe $bucketUri 2>&1
if ($LASTEXITCODE -ne 0) {
    & $gcloud storage buckets create $bucketUri --project=$ProjectId --location=us-central1 --uniform-bucket-level-access
}
Write-Host "Bucket: $bucketUri" -ForegroundColor Green
Write-Host "Live URL: https://${ProjectId}.web.app" -ForegroundColor Green
