const { syncDatabaseEnvAliases, resolveDatabaseUrl } = require("./database-url");
const { auditStripeEnv } = require("../marketing/stripe-env-audit");

function bootstrapProductionRuntime() {
  syncDatabaseEnvAliases();
  const db = resolveDatabaseUrl();
  const stripe = auditStripeEnv();

  const warnings = [];
  if (!db.url) {
    warnings.push("NEON_DATABASE_URL missing — registration, sessions, entitlements offline");
  }
  if (!stripe.checkoutReady) {
    warnings.push("Stripe checkout not fully configured");
  }

  if (warnings.length && process.env.NODE_ENV === "production") {
    for (const w of warnings) {
      console.warn(`[resumora-runtime] ${w}`);
    }
  }

  return {
    databaseConfigured: Boolean(db.url),
    databaseSource: db.source,
    stripeCheckoutReady: stripe.checkoutReady,
    stripeMode: stripe.sandboxLiveConsistent?.mode || null,
    warnings,
  };
}

module.exports = { bootstrapProductionRuntime };
