export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    try {
      const { ensureProjectEnv } = await import("./lib/shared/ensure-project-env.js");
      ensureProjectEnv();
      const { bootstrapProductionRuntime } = await import("./lib/shared/production-runtime-bootstrap.js");
      bootstrapProductionRuntime();
    } catch (e) {
      console.error("[resumora-runtime-bootstrap]", e);
    }
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
