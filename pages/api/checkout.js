import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
    });
  }

  try {
    const { priceId } = req.body;

    if (!priceId) {
      return res.status(400).json({
        error: 'Missing priceId',
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],

      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],

      mode: 'payment',

      success_url: `${req.headers.origin}/success?session_id={CHECKOUT_SESSION_ID}`,

      cancel_url: `${req.headers.origin}/cancel`,
    });

    return res.status(200).json({
      id: session.id,
    });
  } catch (error) {
    console.error('Stripe Checkout Error:', error);

    return res.status(500).json({
      error: error.message || 'Internal Server Error',
    });
  }
}