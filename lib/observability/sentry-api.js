const LOG_PREFIX = "[observability/sentry-api]";

function loadSentry() {
  try {
    return require("@sentry/nextjs");
  } catch (error) {
    console.error(LOG_PREFIX, "failed to load @sentry/nextjs", error);
    return null;
  }
}

function loadCloudWatch() {
  try {
    return require("./cloudwatch");
  } catch (error) {
    console.error(LOG_PREFIX, "failed to load cloudwatch module", error);
    return null;
  }
}

/**
 * Wrap a Pages Router API handler with Sentry + CloudWatch observability.
 * Fail-open: telemetry errors are logged and never block the request path.
 *
 * @param {import('next').NextApiHandler} handler
 * @param {{ route?: string; project?: string }} [options]
 * @returns {import('next').NextApiHandler}
 */
function withObservableApi(handler, options = {}) {
  return async function observableHandler(req, res) {
    const start = Date.now();
    const route = options.route ?? req.url?.split("?")[0] ?? "unknown";
    const project = options.project ?? process.env.BOSSMIND_PROJECT ?? "resumora";

    try {
      const result = await handler(req, res);

      try {
        const cloudwatch = loadCloudWatch();
        if (cloudwatch?.recordApiCall) {
          await cloudwatch.recordApiCall({
            route,
            status: res.statusCode || 200,
            latencyMs: Date.now() - start,
            project,
            method: req.method,
          });
        }
      } catch (telemetryError) {
        console.error(LOG_PREFIX, "recordApiCall failed", telemetryError);
      }

      return result;
    } catch (error) {
      try {
        const Sentry = loadSentry();
        Sentry?.captureException?.(error);
      } catch (sentryError) {
        console.error(LOG_PREFIX, "Sentry.captureException failed", sentryError);
      }

      try {
        const cloudwatch = loadCloudWatch();
        if (cloudwatch?.recordApiCall) {
          await cloudwatch.recordApiCall({
            route,
            status: 500,
            latencyMs: Date.now() - start,
            project,
            method: req.method,
          });
        }
        if (cloudwatch?.recordSentryError) {
          await cloudwatch.recordSentryError({ project, status: "error" });
        }
      } catch (telemetryError) {
        console.error(LOG_PREFIX, "error telemetry failed", telemetryError);
      }

      if (res.headersSent) {
        throw error;
      }

      return res.status(500).json({ error: "Internal server error" });
    }
  };
}

module.exports = { withObservableApi };
