import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    environment:
      process.env.BOSSMIND_DEPLOY_ENV ??
      process.env.RAILWAY_ENVIRONMENT_NAME ??
      process.env.RENDER_SERVICE_NAME ??
      process.env.NODE_ENV,
  });
}
