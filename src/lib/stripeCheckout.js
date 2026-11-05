import { loadStripe } from '@stripe/stripe-js';
import { auth } from './firebase';
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
 * Start checkout for a selected plan.
 *
 * Priority:
 * 1) Checkout Session API with planId + verified priceId + expectedCents + firebaseUid
 * 2) Amount-matched Payment Link — ONLY in explicit test mode (never in live production)
 */
export async function startStripeCheckoutForPlan(planId) {
  const plan = getPlanById(planId);
  if (!plan) {
    throw new Error(`Unknown plan: ${planId}`);
  }

  const priceId = getStripePriceIdForPlan(planId);
  const expectedCents = getExpectedCentsForPlan(planId);
  const origin = window.location.origin;
  const firebaseUid = auth.currentUser?.uid || null;

  if (!priceId) {
    throw new Error(
      `Checkout unavailable for plan "${planId}" (expected ${plan.priceLabel}). Please contact support.`
    );
  }

  const endpoints = [
    '/api/create-checkout-session',
    'https://us-central1-resumora-live.cloudfunctions.net/createCheckoutSession',
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
          firebaseUid,
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

  // Fall back to a Payment Link ONLY in explicit test mode (never in live production).
  const paymentLink = getStripePaymentLinkForPlan(planId);
  if (paymentLink && isStripeTestMode()) {
    window.location.assign(paymentLink);
    return {
      redirected: true,
      planId,
      priceId,
      via: 'payment_link',
      expectedCents,
      testMode: true,
    };
  }

  throw new Error(
    lastError || `Checkout unavailable for plan "${planId}" (expected ${plan.priceLabel}).`
  );
}
