# Attach CloudWatch observability policy to IAM user bossmind-resumora-storage
# Region: us-east-1

$PolicyFile = Join-Path $PSScriptRoot "bossmind-resumora-cloudwatch-policy.json"
$PolicyName = "BossMind-Resumora-CloudWatch-Observability"
$UserName = "bossmind-resumora-storage"

Write-Host "Creating/updating IAM policy: $PolicyName" -ForegroundColor Cyan

$PolicyArn = aws iam create-policy `
  --policy-name $PolicyName `
  --policy-document "file://$PolicyFile" `
  --query "Policy.Arn" `
  --output text 2>$null

if (-not $PolicyArn) {
  $AccountId = aws sts get-caller-identity --query Account --output text
  $PolicyArn = "arn:aws:iam::${AccountId}:policy/$PolicyName"
  aws iam create-policy-version `
    --policy-arn $PolicyArn `
    --policy-document "file://$PolicyFile" `
    --set-as-default | Out-Null
  Write-Host "Updated existing policy: $PolicyArn" -ForegroundColor Yellow
} else {
  Write-Host "Created policy: $PolicyArn" -ForegroundColor Green
}

aws iam attach-user-policy --user-name $UserName --policy-arn $PolicyArn
Write-Host "Attached to user: $UserName" -ForegroundColor Green
Write-Host "Verify: npm run observability:dashboard && npm run observability:alarms" -ForegroundColor Cyan
