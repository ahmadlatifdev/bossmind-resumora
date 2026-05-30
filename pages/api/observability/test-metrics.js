/**
 * Observability smoke test — emits sample CloudWatch metrics (fail-open).
 * GET /api/observability/test-metrics
 * Optional header: x-bossmind-obs-secret (matches BOSSMIND_ORCHESTRATION_SECRET when set)
 */
const { withObservableApi } = require("../../../lib/observability/sentry-api");

async function testMetricsHandler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false });
  }

  const secret = process.env.BOSSMIND_ORCHESTRATION_SECRET;
  if (secret) {
    const provided = req.headers["x-bossmind-obs-secret"];
    if (provided !== secret) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
  }

  let cloudwatch;
  try {
    cloudwatch = require("../../../lib/observability/cloudwatch");
  } catch (e) {
    return res.status(200).json({ ok: true, cloudwatch: false, message: "cloudwatch module unavailable" });
  }

  const start = Date.now();
  await cloudwatch.recordResumeParsingLatency(42, { model: "test", status: "ok" });
  await cloudwatch.recordResumeParsingSuccess({ model: "test" });
  await cloudwatch.recordSentryError({ status: "test" });
  await cloudwatch.recordDeepSeekTokenUsage(128, { model: "deepseek-chat", status: "ok" });
  await cloudwatch.recordApiCall({
    route: "/api/observability/test-metrics",
    status: 200,
    latencyMs: Date.now() - start,
    method: "GET",
  });

  return res.status(200).json({
    ok: true,
    namespace: process.env.CLOUDWATCH_NAMESPACE ?? "BossMind/Resumora",
    region: process.env.AWS_REGION ?? "us-east-1",
    sentry: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN),
    xray: process.env.AWS_XRAY_SDK_ENABLED === "true",
    otel: Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT),
    ts: Date.now(),
  });
}

export default withObservableApi(testMetricsHandler, {
  route: "/api/observability/test-metrics",
});
