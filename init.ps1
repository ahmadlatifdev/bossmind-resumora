# BossMind Harness Initialiser — run at the start of every session
Write-Host "=== BossMind Harness Init ===" -ForegroundColor Cyan

Write-Host "`n[git status]" -ForegroundColor Yellow
git status --short

Write-Host "`n[Current state]" -ForegroundColor Yellow
Get-Content HARNESS_STATE.json -Raw

Write-Host "`n[Last 5 progress entries]" -ForegroundColor Yellow
Get-Content HARNESS_PROGRESS.md -TotalCount 25

Write-Host "`n=== Init complete. Paste this output into Cursor. ===" -ForegroundColor Green
