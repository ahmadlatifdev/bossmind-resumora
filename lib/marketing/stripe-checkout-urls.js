/**
 * Stripe Checkout / Payment Link success redirect — always land on /studio (not Stripe host page).
 */
function normalizeBaseUrl(value) {
  return String(value || "")
    .trim()
    .replace(/\/$/, "");
}

function getStripeSuccessBaseUrl() {
  return normalizeBaseUrl(
    process.env.RESUMORA_STRIPE_SUCCESS_BASE_URL ||
      "https://bossmind-resumora-web.onrender.com" ||
      process.env.NEXT_PUBLIC_SITE_URL
  );
}

/** Stripe replaces {CHECKOUT_SESSION_ID} on redirect. */
function getStudioCheckoutSuccessUrl() {
  const base = getStripeSuccessBaseUrl();
  return `${base}/studio?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
}

function getStudioCheckoutCancelUrl(requestOrigin) {
  const base = requestOrigin ? normalizeBaseUrl(requestOrigin) : getStripeSuccessBaseUrl();
  return `${base}/cancel`;
}

function paymentLinkAfterCompletion() {
  return {
    type: "redirect",
    redirect: {
      url: getStudioCheckoutSuccessUrl(),
    },
  };
}

module.exports = {
  getStripeSuccessBaseUrl,
  getStudioCheckoutSuccessUrl,
  getStudioCheckoutCancelUrl,
  paymentLinkAfterCompletion,
};
