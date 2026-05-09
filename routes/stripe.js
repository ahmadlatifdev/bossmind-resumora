const express = require('express');
const router = express.Router();

// Mock success page (no Stripe call)
router.get('/success', (req, res) => {
  const sessionId = req.query.session_id;
  if (sessionId) {
    res.send('<h1>Payment successful!</h1><p>Your account is now active. (Mock mode)</p>');
  } else {
    res.redirect('/cancel');
  }
});

// Mock cancel page
router.get('/cancel', (req, res) => {
  res.send('<h1>Payment cancelled</h1><p>No charge was made. Try again. (Mock mode)</p>');
});

// Optional: create-checkout endpoint (mock)
router.post('/create-checkout', (req, res) => {
  res.json({ url: '/stripe/success?session_id=mock_123' });
});

module.exports = router;
