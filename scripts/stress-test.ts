/**
 * Stress test: 150 concurrent signed webhook deliveries against local /webhook.
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Stripe from 'stripe';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
dotenv.config({ path: path.join(root, '.env'), quiet: true });
dotenv.config({ path: path.join(root, '.env.local'), quiet: true });

const PORT = Number(process.env.PORT || 3000);
const webhookSecret =
  process.env.STRIPE_WEBHOOK_SECRET || 'whsec_PLACEHOLDER_REPLACE_WITH_REAL_SECRET';
const target = `http://127.0.0.1:${PORT}/webhook`;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  apiVersion: '2024-11-20.acacia',
});

function buildEvent(index: number): Stripe.Event {
  return {
    id: `evt_stress_${Date.now()}_${index}`,
    object: 'event',
    api_version: '2024-11-20.acacia',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: `pi_stress_${index}`,
        object: 'payment_intent',
        amount: 2900,
        currency: 'usd',
        status: 'succeeded',
      },
    },
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type: 'payment_intent.succeeded',
  } as Stripe.Event;
}

async function deliver(index: number) {
  const event = buildEvent(index);
  const payload = JSON.stringify(event);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });

  const res = await fetch(target, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': header },
    body: payload,
  });

  const text = await res.text();
  return { index, status: res.status, ok: res.ok, body: text.slice(0, 120) };
}

async function main() {
  const total = 150;
  const started = Date.now();
  const results = await Promise.all(Array.from({ length: total }, (_, i) => deliver(i)));
  const elapsed = Date.now() - started;

  const ok = results.filter((r) => r.ok).length;
  const rateLimited = results.filter((r) => r.status === 429).length;
  const failed = results.filter((r) => !r.ok);

  console.log('=== Webhook Stress Test ===');
  console.log(
    JSON.stringify(
      {
        target,
        total,
        ok,
        rateLimited,
        failed: failed.length,
        elapsedMs: elapsed,
        sampleFailures: failed.slice(0, 5),
      },
      null,
      2
    )
  );

  if (rateLimited > 0 || ok < total * 0.95) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
