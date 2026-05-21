/**
 * Single-call post-checkout bootstrap — delegates to activation engine.
 */
const { runActivationEngine } = require("./activation-engine");
const {
  buildLuxuryStages,
  activeConciergeMessage,
  progressPercent,
} = require("./activation-stages");

async function bootstrapClientCheckout(actor, { sessionId = null, lang = "en" } = {}) {
  const pipeline = await runActivationEngine(actor, sessionId, { lang, maxAttempts: 2 });
  const activationFlags = pipeline.activation || {
    paymentConfirmed: pipeline.fulfillmentOk === true,
    planActivated: pipeline.fulfillmentOk === true,
    workspaceReady: pipeline.hasAccess === true,
    uploadsUnlocked: pipeline.hasAccess === true,
    generationReady: pipeline.hasAccess === true,
    interviewToolkitReady: pipeline.planId === "essential_advanced",
  };
  const luxuryStages = buildLuxuryStages(activationFlags, 0, lang);

  return {
    signedIn: pipeline.signedIn,
    email: pipeline.email || null,
    supportEmail: process.env.RESUMORA_SUPPORT_EMAIL || "support@resumora.net",
    hasAccess: pipeline.hasAccess === true,
    needsSignIn: pipeline.needsSignIn === true,
    stripeCheckoutEmail: pipeline.stripeCheckoutEmail || null,
    activation: activationFlags,
    luxuryStages,
    conciergeMessage: activeConciergeMessage(luxuryStages, lang),
    progressPercent: pipeline.hasAccess ? 100 : progressPercent(activationFlags, 0),
    preload: pipeline.preload || { studio: "/studio" },
    planId: pipeline.planId || null,
    displayName: pipeline.displayName || null,
    plans: pipeline.plans || [],
    plansCount: pipeline.plansCount || 0,
    fulfillmentOk: pipeline.fulfillmentOk === true,
    activationStatus: pipeline.activationStatus,
    activationComplete: pipeline.activationComplete === true,
    activationSuccess: pipeline.activationSuccess === true,
    redirectTo: pipeline.redirectTo || "/studio",
  };
}

module.exports = { bootstrapClientCheckout };
