/**
 * Register or update Stripe webhook endpoint via SDK (idempotent).
 * Usage: STRIPE_WEBHOOK_PUBLIC_URL=https://... node scripts/register-stripe-webhook.mjs
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Stripe from 'stripe';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
dotenv.config({ path: path.join(root, '.env'), quiet: true });
dotenv.config({ path: path.join(root, '.env.local'), quiet: true });

const secret = process.env.STRIPE_SECRET_KEY;
const url =
  process.env.STRIPE_WEBHOOK_PUBLIC_URL ||
  process.env.STRIPE_LISTEN_FORWARD_URL ||
  '';

if (!secret) {
  console.error('Missing STRIPE_SECRET_KEY');
  process.exit(1);
}
if (!url) {
  console.log(JSON.stringify({ skipped: true, reason: 'STRIPE_WEBHOOK_PUBLIC_URL not set' }));
  process.exit(0);
}

const stripe = new Stripe(secret, { apiVersion: '2024-11-20.acacia' });
const enabledEvents = [
  'payment_intent.succeeded',
  'checkout.session.completed',
  'customer.subscription.updated',
  'invoice.payment_failed',
  'invoice.payment_succeeded',
];

const existing = await stripe.webhookEndpoints.list({ limit: 100 });
const match = existing.data.find((e) => e.url === url);

let endpoint;
if (match) {
  endpoint = await stripe.webhookEndpoints.update(
    match.id,
    { enabled_events: enabledEvents, disabled: false },
    { idempotencyKey: `webhook_update_${match.id}` }
  );
} else {
  endpoint = await stripe.webhookEndpoints.create(
    { url, enabled_events: enabledEvents, description: 'Resumora cursor_hands_free v2' },
    { idempotencyKey: `webhook_create_${Buffer.from(url).toString('base64url').slice(0, 40)}` }
  );
}

console.log(JSON.stringify({ id: endpoint.id, url: endpoint.url, status: endpoint.status }, null, 2));
