import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
    });
  }

  try {
    const {
      priceId,
      planId,
      planName,
      planPrice,
      utm_source: utmSource,
      utm_medium: utmMedium,
      utm_campaign: utmCampaign,
    } = req.body || {};

    if (!priceId) {
      return res.status(400).json({
        error: 'Missing priceId',
      });
    }

    const metaSlice = (v) => String(v ?? '').slice(0, 500);

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

      metadata: {
        plan_id: metaSlice(planId),
        plan_name: metaSlice(planName),
        plan_price: metaSlice(planPrice),
        utm_source: metaSlice(utmSource),
        utm_medium: metaSlice(utmMedium),
        utm_campaign: metaSlice(utmCampaign),
      },
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