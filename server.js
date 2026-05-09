const express = require('express');
const Stripe = require('stripe');

const app = express();
const port = 3000;

// Stripe initialization (uses environment variable STRIPE_SECRET_KEY)
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Home route
app.get('/', (req, res) => {
  res.send(`
    <h1>Resumora</h1>
    <button id="checkoutBtn">Subscribe $10/month</button>
    <script>
      document.getElementById('checkoutBtn').onclick = async () => {
        const response = await fetch('/create-checkout-session', { method: 'POST' });
        const session = await response.json();
        window.location.href = session.url;
      };
    </script>
  `);
});

// Create Stripe Checkout session
app.post('/create-checkout-session', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: 'Resumora Pro' },
          unit_amount: 1000, // $10.00
        },
        quantity: 1,
      }],
      mode: 'subscription',
      success_url: `http://localhost:${port}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `http://localhost:${port}/cancel`,
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Success page
app.get('/success', async (req, res) => {
  const sessionId = req.query.session_id;
  if (!sessionId) return res.send('Missing session ID.');

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status === 'paid') {
      // Here you would update your database: e.g., set user subscription active
      res.send(`
        <h1>✅ Payment successful!</h1>
        <p>Your subscription is active. Session ID: ${sessionId}</p>
        <a href="/">Go home</a>
      `);
    } else {
      res.redirect('/cancel');
    }
  } catch (err) {
    res.send(`Error verifying payment: ${err.message}`);
  }
});

// Cancel page
app.get('/cancel', (req, res) => {
  res.send(`
    <h1>❌ Payment cancelled</h1>
    <p>No charge was made. You can try again.</p>
    <a href="/">Back to home</a>
  `);
});

app.listen(port, () => {
  console.log(`Resumora running at http://localhost:${port}`);
});
