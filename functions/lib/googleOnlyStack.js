/**
 * Google-only stack consolidation (Resumora).
 *
 * Hosting: Firebase Hosting → client-resumora-live / resumora.net (NOT Vercel).
 * API: Firebase Functions gen2 → Cloud Run us-central1.
 * Secrets: GCP Secret Manager via defineSecret / process.env injection.
 * Cron: Firebase onSchedule + optional Cloud Scheduler HTTP mirrors (scripts/create-gcp-scheduler.mjs).
 * AI: Vertex AI in us-central1 (preferred) with Gemini Developer API fallback.
 * Payments: Stripe only; keys solely from Secret Manager on Cloud Run.
 *
 * Forbidden: Vercel, Netlify, Cloudflare Pages/Workers as host, Railway, Render.
 */
'use strict';

module.exports = {
  REGION: 'us-central1',
  HOSTING_SITE: 'client-resumora-live',
  PUBLIC_ORIGIN: 'https://resumora.net',
  SECRET_NAMES: Object.freeze([
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'ADMIN_REFUND_PASSWORD',
    'GEMINI_API_KEY',
  ]),
  NON_SECRET_ENV: Object.freeze([
    'CHECKOUT_SESSION_PREFIX',
    'STRIPE_PRICE_BASIC',
    'STRIPE_PRICE_BALANCED',
    'STRIPE_PRICE_PROFESSIONAL_TIER',
    'STRIPE_PRICE_ADVANCED',
    'GCP_PROJECT',
    'GCLOUD_PROJECT',
    'VERTEX_AI',
    'GOOGLE_GENAI_USE_VERTEXAI',
    'VERTEX_LOCATION',
    'GEMINI_MODEL',
  ]),
};
