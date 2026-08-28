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

const STUDIO_SUCCESS_URL =
  'https://client-resumora-live.web.app/studio?session_id={CHECKOUT_SESSION_ID}';
const CHECKOUT_CANCEL_URL = 'https://resumora.net/pricing';

/** Firebase Hosting rewrite + direct Cloud Functions URL (no Render, no Cloud Run alias). */
const CHECKOUT_ENDPOINTS = [
  '/api/create-checkout-session',
  'https://us-central1-resumora-live.cloudfunctions.net/createCheckoutSession',
];

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
 * Prefer Firebase Cloud Function Checkout Session so success/cancel URLs stay on Firebase.
 * Payment Links are last-resort only (may still have legacy Stripe Dashboard redirects).
 * @param {string} planId
 * @param {{ firebaseUID?: string, email?: string }} [opts]
 */
export async function startStripeCheckoutForPlan(planId, opts = {}) {
  const plan = getPlanById(planId);
  if (!plan) {
    throw new Error(`Unknown plan: ${planId}`);
  }

  const priceId = getStripePriceIdForPlan(planId);
  const expectedCents = getExpectedCentsForPlan(planId);
  const paymentLink = getStripePaymentLinkForPlan(planId);
  const firebaseUID = String(opts.firebaseUID || '').trim();
  const email = String(opts.email || '').trim();

  if (!priceId && !paymentLink) {
    throw new Error(
      `Checkout unavailable for plan "${planId}" (expected ${plan.priceLabel}). Please contact support.`
    );
  }

  let payload = null;
  let lastError = null;

  if (priceId) {
    for (const endpoint of CHECKOUT_ENDPOINTS) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          credentials: 'omit',
          body: JSON.stringify({
            planId,
            priceId,
            expectedCents,
            successUrl: STUDIO_SUCCESS_URL,
            cancelUrl: CHECKOUT_CANCEL_URL,
            ...(firebaseUID ? { firebaseUID, uid: firebaseUID } : {}),
            ...(email ? { customerEmail: email } : {}),
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

  // Last resort: Payment Link (update Stripe Dashboard after_completion if it still hits Render)
  if (paymentLink) {
    console.warn(
      '[checkout] Falling back to Payment Link. Confirm Stripe Dashboard redirect is not onrender.com.'
    );
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

  throw new Error(
    lastError || `Checkout unavailable for plan "${planId}" (expected ${plan.priceLabel}).`
  );
}
