import { loadStripe } from '@stripe/stripe-js';
import {
  getStripePublishableKey,
  getStripePriceIdForPlan,
  getStripePaymentLinkForPlan,
  getPlanById,
  getExpectedCentsForPlan,
  isStripeTestMode,
} from './plans.js';

let stripePromise = null;

export function getStripe() {
  const pk = getStripePublishableKey();
  if (!pk) {
    return Promise.reject(
      new Error('Checkout is temporarily unavailable. Please contact support.')
    );
  }
  if (!stripePromise) {
    stripePromise = loadStripe(pk);
  }
  return stripePromise;
}

/**
 * Start checkout for a selected plan (sandbox-safe).
 *
 * Priority:
 * 1) Amount-matched Payment Link (works even when Cloud Functions IAM blocks /api)
 * 2) Checkout Session API with planId + verified priceId + expectedCents
 */
export async function startStripeCheckoutForPlan(planId) {
  const plan = getPlanById(planId);
  if (!plan) {
    throw new Error(`Unknown plan: ${planId}`);
  }

  const priceId = getStripePriceIdForPlan(planId);
  const expectedCents = getExpectedCentsForPlan(planId);
  const origin = window.location.origin;
  const paymentLink = getStripePaymentLinkForPlan(planId);

  // Payment Links are the reliable sandbox path while createCheckoutSession is IAM-blocked (403).
  if (paymentLink) {
    window.location.assign(paymentLink);
    return {
      redirected: true,
      planId,
      priceId,
      via: 'payment_link',
      expectedCents,
      testMode: isStripeTestMode(),
    };
  }

  if (!priceId) {
    throw new Error(
      `Checkout unavailable for plan "${planId}" (expected ${plan.priceLabel}). Please contact support.`
    );
  }

  const endpoints = [
    '/api/create-checkout-session',
    'https://us-central1-resumora-live.cloudfunctions.net/createCheckoutSession',
    'https://createcheckoutsession-lip26fm72a-uc.a.run.app',
  ];

  let payload = null;
  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'omit',
        body: JSON.stringify({
          planId,
          priceId,
          expectedCents,
          successUrl: `${origin}/pricing?checkout=success&plan=${encodeURIComponent(planId)}`,
          cancelUrl: `${origin}/pricing?checkout=canceled&plan=${encodeURIComponent(planId)}`,
        }),
      });
      payload = await res.json().catch(() => ({}));
      if (res.ok) break;
      lastError = payload.error || `Checkout session failed (${res.status})`;
      payload = null;
    } catch (err) {
      lastError = err?.message || 'Network error creating checkout session';
      payload = null;
    }
  }

  if (payload?.url) {
    window.location.assign(payload.url);
    return {
      redirected: true,
      planId,
      priceId,
      sessionId: payload.sessionId || null,
      via: 'session_url',
    };
  }

  if (payload?.sessionId) {
    const stripe = await getStripe();
    if (!stripe) throw new Error('Checkout failed to initialize.');
    const { error } = await stripe.redirectToCheckout({ sessionId: payload.sessionId });
    if (error) throw new Error(error.message || 'Checkout redirect failed.');
    return {
      redirected: true,
      planId,
      priceId,
      sessionId: payload.sessionId,
      via: 'redirectToCheckout',
    };
  }

  throw new Error(
    lastError || `Checkout unavailable for plan "${planId}" (expected ${plan.priceLabel}).`
  );
}
