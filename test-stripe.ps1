Write-Host "Testing Stripe success/cancel flow..." -ForegroundColor Cyan
Write-Host "1. Make sure your server is running (npm start)"
Write-Host "2. Open browser to http://localhost:3000/stripe/success?session_id=test_123"
Write-Host "3. You should see success page"
Write-Host "4. Also test: http://localhost:3000/stripe/cancel"
Write-Host ""
Write-Host "To fully test with Stripe, set environment variables:"
Write-Host "   `$env:STRIPE_SECRET_KEY='sk_test_...'"
Write-Host "   `$env:BASE_URL='http://localhost:3000'"
