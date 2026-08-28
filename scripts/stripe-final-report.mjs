/**
 * Final Stripe performance stack report (no secret values).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import Stripe from 'stripe';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
dotenv.config({ path: path.join(root, '.env'), quiet: true });
dotenv.config({ path: path.join(root, '.env.local'), quiet: true });

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const fnPkg = JSON.parse(fs.readFileSync(path.join(root, 'functions', 'package.json'), 'utf8'));

function keyStatus(name, value) {
  if (!value) return 'MISSING';
  if (String(value).includes('PLACEHOLDER')) return 'PLACEHOLDER';
  return 'SET';
}

const secret = process.env.STRIPE_SECRET_KEY || '';
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

const files = [
  'server/stripe/index.ts',
  'functions/stripeWebhook.js',
  'functions/lib/stripeWebhookQueue.js',
  'functions/lib/stripeEventProcessor.js',
  'functions/lib/stripeDunning.js',
  'functions/lib/stripeCheckoutOptimizations.js',
  'functions/lib/stripeRetryConfig.js',
  'scripts/apply-checkout-optimizations.ts',
  'scripts/stress-test.ts',
  'scripts/ensure-stripe-env.mjs',
  'src/billing/retry-config.ts',
  'tests/stripe-validation.test.ts',
];

const report = {
  timestamp: new Date().toISOString(),
  sdkVersions: {
    rootStripe: pkg.dependencies?.stripe || pkg.devDependencies?.stripe,
    functionsStripe: fnPkg.dependencies?.stripe,
    express: pkg.devDependencies?.express,
    pQueue: pkg.devDependencies?.['p-queue'],
    bullmq: pkg.devDependencies?.bullmq,
  },
  environment: {
    STRIPE_SECRET_KEY: keyStatus('STRIPE_SECRET_KEY', secret),
    STRIPE_WEBHOOK_SECRET: keyStatus('STRIPE_WEBHOOK_SECRET', webhookSecret),
    PORT: process.env.PORT || '3000',
    REDIS_URL: keyStatus('REDIS_URL', process.env.REDIS_URL),
    RESEND_API_KEY: keyStatus('RESEND_API_KEY', process.env.RESEND_API_KEY),
  },
  filesCreated: files.filter((f) => fs.existsSync(path.join(root, f))),
  billingFiles: [
    'functions/billingEndpoints.js',
    'functions/lib/serviceDelivery.js',
    'functions/lib/refundEngine.js',
    'functions/lib/emailTemplates.js',
    'src/pages/AccountPage.tsx',
    'src/lib/billingApi.js',
    'tests/full-e2e.test.ts',
    'scripts/schema/service-delivery.sql',
  ].filter((f) => fs.existsSync(path.join(root, f))),
  productionWebhookPath: 'https://resumora.net/api/webhook (Firebase rewrite → stripeWebhook)',
  localWebhookPath: `http://localhost:${process.env.PORT || 3000}/webhook`,
  billingEndpoints: [
    'GET /api/refund-preview',
    'POST /api/cancel-subscription',
    'POST /api/service-event',
    'GET /api/refunds',
  ],
  registeredEndpoints: [],
  placeholdersUsed: [],
};

if (report.environment.STRIPE_SECRET_KEY === 'PLACEHOLDER') report.placeholdersUsed.push('STRIPE_SECRET_KEY');
if (report.environment.STRIPE_WEBHOOK_SECRET === 'PLACEHOLDER') report.placeholdersUsed.push('STRIPE_WEBHOOK_SECRET');

if (secret && !secret.includes('PLACEHOLDER')) {
  const stripe = new Stripe(secret, { apiVersion: '2024-11-20.acacia' });
  try {
    const endpoints = await stripe.webhookEndpoints.list({ limit: 20 });
    report.registeredEndpoints = endpoints.data.map((e) => ({
      id: e.id,
      url: e.url,
      status: e.status || 'unknown',
    }));
  } catch (err) {
    report.registeredEndpoints = [
      { id: 'error', url: err instanceof Error ? err.message : 'list failed', status: 'error' },
    ];
  }
}

console.log('\n========== STRIPE PERFORMANCE STACK REPORT ==========\n');
console.log(JSON.stringify(report, null, 2));
console.log('\n--- MANUAL DASHBOARD CHECKLIST (< 2 min) ---');
console.log('1. Dashboard > Payments > Analytics > Optimization → Authorization Boost ON');
console.log('2. Dashboard > Billing > Revenue Recovery → Smart Retries ON, Extended (45 days)');
console.log('3. Dashboard > Checkout Settings → verify Dynamic Payment Methods + Adaptive Pricing Active');
console.log('\n=====================================================\n');
