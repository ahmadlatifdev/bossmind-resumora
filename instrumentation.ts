export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    try {
      const g = await import("./lib/marketing/stripe-pricing-guard.js");
      g.runStripePricingBootCheck?.();
    } catch (e) {
      console.error("[stripe-pricing-guard]", e);
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
