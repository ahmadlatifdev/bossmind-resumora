# Prefer Node >=22.22 for Resumora / Hermes
$dir = 'C:\Users\user\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.22_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v22.23.2-win-x64'
if (Test-Path "$dir\node.exe") {
  $env:Path = "$dir;$env:Path"
  Write-Host "Using $((& "$dir\node.exe" -v)) from $dir"
} else {
  Write-Error 'Pinned Node 22.23.2 directory missing. Re-run winget install OpenJS.NodeJS.22 --scope user'
}
