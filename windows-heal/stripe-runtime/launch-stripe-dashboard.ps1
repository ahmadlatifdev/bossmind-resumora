# BossMind isolated Stripe dashboard session (separate from main Chrome profiles).
$iso = "D:\\BossMind\\resumora-fresh\\windows-heal\\stripe-runtime\\chrome-user-data"
$chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
if (-not (Test-Path $chrome)) { Write-Error "Chrome not found"; exit 1 }
Start-Process $chrome @(
  "--user-data-dir=$iso",
  "--no-first-run",
  "--disable-sync",
  "--disable-extensions",
  "https://dashboard.stripe.com/"
)
