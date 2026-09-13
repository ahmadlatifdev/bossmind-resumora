param(
    [Parameter(Mandatory=$true)][string]$VideoPath,
    [string]$OutputName = ""
)

$PROJECT = "resumora-live"
$LOCATION = "us-central1"
$BUCKET = "resumora-videos"

if (-not (Test-Path $VideoPath)) { Write-Host "File not found: $VideoPath" -ForegroundColor Red; exit 1 }
if (-not $OutputName) { $OutputName = [System.IO.Path]::GetFileNameWithoutExtension($VideoPath) }

$fileName = [System.IO.Path]::GetFileName($VideoPath)
Write-Host "`n[1/2] Uploading $fileName..." -ForegroundColor Cyan
gcloud storage cp $VideoPath "gs://$BUCKET/input/$fileName"

Write-Host "`n[2/2] Creating transcode job for $OutputName..." -ForegroundColor Cyan
gcloud transcoder jobs create `
  --location=$LOCATION `
  --input-uri="gs://$BUCKET/input/$fileName" `
  --output-uri="gs://$BUCKET/output/$OutputName/" `
  --template-id=interview-hls-template

Write-Host "`nDone. Output will appear at:" -ForegroundColor Green
Write-Host "  gs://$BUCKET/output/$OutputName/master.m3u8" -ForegroundColor Yellow
Write-Host "`nCheck progress in 2-3 minutes with:" -ForegroundColor Cyan
Write-Host "  gcloud storage ls gs://$BUCKET/output/$OutputName/ -r" -ForegroundColor White
