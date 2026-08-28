/**
 * Firebase HTTPS webhook — verify signature, enqueue, return 200 immediately.
 */
const path = require('path');
const { onRequest } = require('firebase-functions/v2/https');
const { enqueueStripeEvent, getQueueStats } = require('./lib/stripeWebhookQueue');
const { processStripeEvent } = require('./lib/stripeEventProcessor');

function loadEnvFiles() {
  try {
    require('dotenv').config({ path: path.join(__dirname, '.env') });
    require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  } catch (_) {
    /* optional */
  }
}

loadEnvFiles();

let stripeClient = null;
function getStripe() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return null;
  if (!stripeClient) {
    const Stripe = require('stripe');
    stripeClient = new Stripe(secret, { apiVersion: '2024-11-20.acacia' });
  }
  return stripeClient;
}

function registerStripeWebhook(exports) {
  exports.stripeWebhook = onRequest(
    {
      region: 'us-central1',
      cors: false,
      timeoutSeconds: 60,
      memory: '512MiB',
    },
    async (req, res) => {
      if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
      }

      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      const stripe = getStripe();
      if (!webhookSecret || !stripe) {
        res.status(500).send('Stripe webhook not configured');
        return;
      }

      const sig = req.headers['stripe-signature'];
      if (!sig) {
        res.status(400).send('Missing Stripe-Signature header');
        return;
      }

      let event;
      try {
        const rawBody = req.rawBody || req.body;
        event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
      } catch (err) {
        console.error('[stripeWebhook] signature verification failed', err.message);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
      }

      const result = enqueueStripeEvent(event, {
        onProcess: async (evt) => processStripeEvent(evt, stripe),
      });

      res.status(200).json({
        received: true,
        eventId: event.id,
        type: event.type,
        ...result,
        queue: getQueueStats(),
      });
    }
  );
}

module.exports = { registerStripeWebhook };
