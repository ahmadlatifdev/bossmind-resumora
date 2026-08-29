/**
 * Stripe secrets via Firebase Secret Manager (Gen2).
 * Do not put STRIPE_* keys in functions/.env — Cloud Run secret/plain overlap breaks deploy.
 */
const { defineSecret } = require('firebase-functions/params');

const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');

const stripeApiSecrets = [stripeSecretKey];
const stripeWebhookSecrets = [stripeSecretKey, stripeWebhookSecret];

function getStripeClient() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return null;
  const Stripe = require('stripe');
  return new Stripe(secret, { apiVersion: '2024-11-20.acacia' });
}

module.exports = {
  stripeSecretKey,
  stripeWebhookSecret,
  stripeApiSecrets,
  stripeWebhookSecrets,
  getStripeClient,
};
