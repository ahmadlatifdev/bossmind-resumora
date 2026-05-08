import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ valid: false });
  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    res.status(200).json({ valid: session.payment_status === 'paid' });
  } catch {
    res.status(200).json({ valid: false });
  }
}
