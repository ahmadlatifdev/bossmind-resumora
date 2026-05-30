import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  const initOptions: Sentry.NodeOptions = {
    dsn,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.5),
    environment:
      process.env.SENTRY_ENVIRONMENT ??
      process.env.BOSSMIND_DEPLOY_ENV ??
      process.env.RAILWAY_ENVIRONMENT_NAME ??
      process.env.RENDER_SERVICE_NAME ??
      process.env.NODE_ENV,
  };

  try {
    const { nodeProfilingIntegration } = require("@sentry/profiling-node");
    initOptions.integrations = [nodeProfilingIntegration()];
    initOptions.profilesSampleRate = Number(
      process.env.SENTRY_PROFILES_SAMPLE_RATE ?? 0.5,
    );
  } catch {
    /* profiling optional — fail open */
  }

  Sentry.init(initOptions);
  console.log("[sentry] server initialized");
}
