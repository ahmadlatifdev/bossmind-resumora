# BossMind Harness — end-of-session checkpoint
param(
    [string]$Summary = "session checkpoint",
    [string]$Status = "in-progress"
)

Write-Host "=== Committing harness checkpoint ===" -ForegroundColor Cyan
git add .
git commit --trailer "Co-authored-by: Cursor <cursoragent@cursor.com>" -m "harness: $Summary"
git push origin main
Write-Host "=== Checkpoint pushed. Update HARNESS_STATE.json next. ===" -ForegroundColor Green
