/**
 * Stripe secrets via GCP Secret Manager (Firebase Functions Gen2 / Cloud Run).
 * Do not put STRIPE_* keys in functions/.env — Cloud Run secret/plain overlap breaks deploy.
 * Google-only: values injected at runtime from Secret Manager — never Vercel env.
 */
const { defineSecret } = require('firebase-functions/params');
const { resolveSecret } = require('./gcpSecrets');

const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');

const stripeApiSecrets = [stripeSecretKey];
const stripeWebhookSecrets = [stripeSecretKey, stripeWebhookSecret];

function getStripeClient() {
  const secret = resolveSecret('STRIPE_SECRET_KEY', ['SECRET_STRIPE', 'STRIPE_API_KEY']);
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
